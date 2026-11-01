import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildSilhouetteGeometry } from '../fixtures/latch/linework.js';
import { buildContourSegments, packContourSegments, contourRecord, encodeOctNormal, decodeOctNormal } from '../../src/explorer/assembly-linework-data.js';
import { createAssemblyLinework, PartTransformPalette, ASSEMBLY_LINE_WIDTHS } from '../../src/explorer/assembly-linework.js';

function fixture() {
  const geometry = new THREE.BoxGeometry(1, 2, 3), source = new THREE.EdgesGeometry(geometry, 35), sourceArray = source.attributes.position.array;
  const edges = sourceArray.buffer.slice(sourceArray.byteOffset, sourceArray.byteOffset + sourceArray.byteLength);
  const contours = buildContourSegments(geometry), packed = packContourSegments(geometry, contours);
  const meshes = ['selected', 'neighbor', 'hidden'].map(name => { const mesh = new THREE.Mesh(geometry); mesh.name = name; return mesh; });
  const edgeRecord = { byteOffset: 0, vertexCount: sourceArray.length / 3, segmentCount: sourceArray.length / 6 };
  const contour = { byteOffset: 0, segmentCount: contours.length / 12 };
  const edgeMetadata = { meshes: Object.fromEntries(meshes.map(mesh => [mesh.name, edgeRecord])) };
  const silhouetteMetadata = { contours: { format: 'uint32-oct16-le', bytesPerSegment: 16 }, meshes: Object.fromEntries(meshes.map(mesh => [mesh.name, contour])) };
  return { meshes, edgeBuffer: edges, edgeMetadata, silhouetteBuffer: packed, silhouetteMetadata, camera: new THREE.PerspectiveCamera() };
}

test('offline contour candidates preserve the approved latch algorithm and exclude triangle diagonals', () => {
  for (const source of [new THREE.BoxGeometry(), new THREE.CylinderGeometry(1, 1, 2, 16), new THREE.PlaneGeometry(2, 2).toNonIndexed()]) {
    const before = source.attributes.position.array.slice(), actual = buildContourSegments(source), reference = buildSilhouetteGeometry(source);
    const positions = reference.attributes.position, normalA = reference.attributes.edgeNormalA, normalB = reference.attributes.edgeNormalB;
    assert.equal(actual.length / 12, reference.userData.segmentCount);
    for (let i = 0; i < actual.length / 12; i++) {
      assert.deepEqual(Array.from(actual.subarray(i * 12, i * 12 + 6)), Array.from(positions.array.subarray(i * 6, i * 6 + 6)));
      assert.deepEqual(Array.from(actual.subarray(i * 12 + 6, i * 12 + 9)), Array.from(normalA.array.subarray(i * 6, i * 6 + 3)));
      assert.deepEqual(Array.from(actual.subarray(i * 12 + 9, i * 12 + 12)), Array.from(normalB.array.subarray(i * 6, i * 6 + 3)));
    }
    assert.deepEqual(source.attributes.position.array, before);
    if (source.type === 'BoxGeometry') assert.equal(actual.length / 12, 12);
  }
});

test('compact endpoint indices retain exact positions and oct16 normal error stays bounded', () => {
  const source = new THREE.SphereGeometry(1, 32, 16), segments = buildContourSegments(source), buffer = packContourSegments(source, segments);
  const compact = contourRecord(buffer, { byteOffset: 0, segmentCount: segments.length / 12 });
  assert.equal(buffer.byteLength, segments.length / 12 * 16);
  for (let i = 0; i < compact.count; i++) for (let end = 0; end < 2; end++) {
    const index = compact.indices[i * 4 + end], start = i * 12 + end * 3;
    assert.deepEqual([source.attributes.position.getX(index), source.attributes.position.getY(index), source.attributes.position.getZ(index)], Array.from(segments.subarray(start, start + 3)));
    const normal = decodeOctNormal(compact.normals[i * 8 + 4 + end * 2], compact.normals[i * 8 + 5 + end * 2]);
    const normalStart = i * 12 + 6 + end * 3;
    assert.ok(Math.hypot(...normal.map((value, axis) => value - segments[normalStart + axis])) < .0001);
  }
  for (const normal of [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, -1, 0]]) assert.deepEqual(decodeOctNormal(...encodeOctNormal(...normal)), normal);
  assert.throws(() => contourRecord(buffer, { byteOffset: buffer.byteLength, segmentCount: 1 }), /exceeds/);
});

test('palette transforms preserve nonuniform mirrored normals and skip unchanged uploads', () => {
  const parent = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry()); mesh.name = 'part'; parent.add(mesh);
  parent.position.set(3, -2, 1); parent.rotation.set(.4, -.6, .2); parent.scale.set(2, 3, -.5);
  mesh.position.set(.7, .2, -.3); mesh.rotation.set(.1, .2, -.8); mesh.scale.set(.3, 1.2, .5);
  const palette = new PartTransformPalette([mesh]), state = { active: new Set(['part']), highlighted: new Set(['part']), filled: new Set(['part']), renderStyle: 'flat' };
  assert.equal(palette.sync(state).paletteUploads, 1);
  assert.deepEqual(Array.from(palette.data.slice(0, 16)), mesh.matrixWorld.elements.map(Math.fround));
  const expected = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  for (let column = 0; column < 3; column++) for (let row = 0; row < 3; row++) assert.equal(palette.data[16 + column * 4 + row], Math.fround(expected.elements[column * 3 + row]));
  assert.deepEqual(Array.from(palette.data.slice(28, 32)), [1, 1, 1, 1]);
  assert.equal(palette.sync(state).dirty, false); assert.equal(palette.uploads, 1);
  mesh.position.x += .2; assert.equal(palette.sync(state).paletteUploads, 2);
  parent.updateMatrixWorld(true); mesh.updateWorldMatrix = () => { throw new Error('Unexpected redundant world traversal'); };
  assert.equal(palette.sync({ ...state, worldMatricesUpdated: true }).dirty, false);
  palette.dispose();
});

test('scope, faint context, emphasis and explicit flat fill remain independent per part', () => {
  const { meshes } = fixture(), palette = new PartTransformPalette(meshes);
  const result = palette.sync({ active: new Set(['selected']), context: new Set(['neighbor']), highlighted: new Set(['selected', 'neighbor']), filled: new Set(['selected', 'neighbor']), renderStyle: 'flat', perPartAlpha: new Map([['selected', .75], ['neighbor', .06]]) });
  assert.deepEqual(Array.from(palette.data.slice(28, 32)), [.75, 1, 1, 1]);
  assert.deepEqual(Array.from(palette.data.slice(60, 64)), [Math.fround(.06), 0, 0, 0]);
  assert.deepEqual(Array.from(palette.data.slice(92, 96)), [0, 0, 0, 0]);
  assert.equal(result.activePartCount, 1); assert.equal(result.contextPartCount, 1); assert.equal(result.flatPartCount, 1);
  palette.sync({ active: new Set(['selected']), highlighted: new Set(['selected']), filled: new Set(['selected']), renderStyle: 'linework' });
  assert.equal(palette.data[31], 0); palette.dispose();
});

test('batched scene uses one shared depth mesh and two ribbon batches without changing source geometry', async () => {
  const input = fixture(), original = input.meshes[0].geometry.attributes.position.array.slice();
  let sourceDisposed = false; input.meshes[0].geometry.addEventListener('dispose', () => { sourceDisposed = true; });
  const runtime = await createAssemblyLinework(input), { pass } = runtime;
  assert.equal(pass.enabled, false); assert.equal(pass.needsSwap, false);
  assert.equal(pass.depthScene.children.length, 1); assert.equal(pass.flatScene.children.length, 1); assert.equal(pass.lineScene.children.length, 2);
  assert.equal(runtime.stats.lineBatchCount, 2); assert.equal(runtime.stats.edgeSegments, 36); assert.equal(runtime.stats.silhouetteSegments, 36);
  assert.equal(pass.depthScene.children[0].geometry.index.count, input.meshes[0].geometry.index.count * 3);
  assert.equal(pass.flatScene.children[0].geometry, pass.depthScene.children[0].geometry);
  for (const line of pass.lineScene.children) { assert.equal(line.geometry.instanceCount, 36); assert.equal(line.frustumCulled, false); assert.equal(line.material.depthWrite, false); }
  assert.match(pass.depthScene.children[0].material.vertexShader, /partState\.y<0\.5/);
  const contours = pass.lineScene.children[1]; assert.equal(contours.geometry.attributes.edgeNormalA.normalized, true);
  assert.ok(contours.geometry.attributes.edgeNormalA.array instanceof Int16Array);
  const creases = pass.lineScene.children[0];
  // Context has no surface depth. Keep its silhouette cues, but exclude crease
  // bundles whose hidden overlapping segments would accumulate into white spots.
  assert.match(creases.material.vertexShader, /if\(partState\.x<=0\.001 \|\| partState\.y<0\.5\)/);
  assert.match(creases.material.fragmentShader, /if\(partState\.x<=0\.001 \|\| partState\.y<0\.5\) discard/);
  assert.match(contours.material.vertexShader, /partState\.y<0\.5/);
  assert.match(contours.material.fragmentShader, /partState\.y<0\.5/);
  runtime.resize(800, 500, 1.5);
  assert.deepEqual(contours.material.uniforms.resolution.value.toArray(), [1200, 750]);
  assert.equal(contours.material.uniforms.lineWidth.value, ASSEMBLY_LINE_WIDTHS.contour * 1.5);
  runtime.resize(390, 844, 2);
  assert.deepEqual(contours.material.uniforms.resolution.value.toArray(), [780, 1688]);
  assert.equal(contours.material.uniforms.lineWidth.value, ASSEMBLY_LINE_WIDTHS.contour * .75 * 2);
  assert.equal(creases.material.uniforms.lineWidth.value, ASSEMBLY_LINE_WIDTHS.crease * .75 * 2);
  assert.equal(pass.contextScene.children[0].material.uniforms.lineWidth.value, contours.material.uniforms.lineWidth.value);
  runtime.resize(800, 500, 1.5);
  assert.equal(contours.material.uniforms.lineWidth.value, ASSEMBLY_LINE_WIDTHS.contour * 1.5);
  runtime.sync({ active: new Set(['selected']), filled: new Set(['selected']), renderStyle: 'flat', accent: '#ff6840' });
  assert.equal(pass.drawFlat, true); assert.equal(runtime.stats.flatPartCount, 1);
  assert.deepEqual(input.meshes[0].geometry.attributes.position.array, original);
  runtime.dispose(); runtime.dispose(); assert.equal(sourceDisposed, false);
});

test('context contours share geometry and cap overlap brightness before active fill and lines', async () => {
  const runtime = await createAssemblyLinework(fixture()), pass = runtime.pass;
  const context = pass.contextScene.children[0], active = pass.lineScene.children[1];
  assert.equal(context.geometry, active.geometry);
  assert.equal(context.material.depthWrite, false); assert.equal(context.material.depthTest, true);
  assert.equal(context.material.blending, THREE.CustomBlending);
  assert.equal(context.material.blendEquation, THREE.MaxEquation); assert.equal(context.material.blendEquationAlpha, THREE.MaxEquation);
  assert.equal(context.material.blendSrc, THREE.OneFactor); assert.equal(context.material.blendDst, THREE.OneFactor);
  assert.match(context.material.vertexShader, /partState\.y>0\.5/);
  assert.match(context.material.fragmentShader, /mix\(vec3\(27\.0\/255\.0\),color,partState\.x\*coverage\)/);
  assert.equal(pass.drawContext, false);
  runtime.sync({ active: new Set(['selected']), context: new Set(['neighbor']), perPartAlpha: new Map([['selected', 1], ['neighbor', .06]]) });
  assert.equal(pass.drawContext, true); assert.equal(runtime.stats.lineBatchCount, 3);
  // MAX compositing uses the greatest resolved coverage, not repeated source-over.
  // Ten thousand overlapping lines at six percent cannot exceed one fully covered line.
  const background = 27 / 255, white = 245 / 255, cap = background + (white - background) * .06;
  let pixel = background;
  for (let i = 0; i < 10000; i++) pixel = Math.max(pixel, background + (white - background) * .06 * (i % 11) / 10);
  assert.ok(Math.abs(pixel - cap) < 1e-12); assert.ok(pixel < 41 / 255);
  runtime.sync({ active: new Set(['selected']) }); assert.equal(pass.drawContext, false); assert.equal(runtime.stats.lineBatchCount, 2);
  runtime.dispose();
});

test('linework pass clears stale surfaces, draws flat only when requested and restores renderer state on failure', async () => {
  const runtime = await createAssemblyLinework(fixture()), calls = [], previousTarget = {}, previousColor = new THREE.Color('#123456');
  let target = previousTarget, color = previousColor.clone(), alpha = .4;
  const renderer = {
    autoClear: true, getRenderTarget: () => target, setRenderTarget: value => { target = value; },
    getClearAlpha: () => alpha, getClearColor: out => out.copy(color), setClearColor: (value, opacity) => { color.copy(value); alpha = opacity; },
    clear: (...values) => calls.push(['clear', ...values]), render: scene => calls.push(['render', scene])
  };
  runtime.pass.render(renderer, {}, {});
  assert.deepEqual(calls[0], ['clear', true, true, false]); assert.equal(calls.filter(call => call[0] === 'render').length, 2);
  assert.equal(target, previousTarget); assert.equal(renderer.autoClear, true); assert.deepEqual(color, previousColor); assert.equal(alpha, .4);
  runtime.sync({ active: new Set(['selected']), filled: new Set(['selected']), renderStyle: 'flat' }); calls.length = 0;
  runtime.pass.render(renderer, {}, {}); assert.equal(calls.filter(call => call[0] === 'render').length, 3);
  runtime.sync({ active: new Set(['selected']), context: new Set(['neighbor']), filled: new Set(['selected']), renderStyle: 'flat' }); calls.length = 0;
  runtime.pass.render(renderer, {}, {});
  assert.deepEqual(calls.filter(call => call[0] === 'render').map(call => call[1]), [runtime.pass.depthScene, runtime.pass.contextScene, runtime.pass.flatScene, runtime.pass.lineScene]);
  renderer.render = () => { throw new Error('Renderer interrupted'); };
  assert.throws(() => runtime.pass.render(renderer, {}, {}), /interrupted/);
  assert.equal(target, previousTarget); assert.equal(renderer.autoClear, true); assert.deepEqual(color, previousColor); assert.equal(alpha, .4);
  runtime.dispose();
});

test('invalid or interrupted preparation fails without disposing caller-owned geometry', async () => {
  const input = fixture();
  await assert.rejects(createAssemblyLinework({ ...input, silhouetteMetadata: { ...input.silhouetteMetadata, contours: { format: 'float32-le' } } }), /format/);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(createAssemblyLinework({ ...input, signal: aborted.signal }), { name: 'AbortError' });
  const interrupted = new AbortController();
  await assert.rejects(createAssemblyLinework({ ...input, signal: interrupted.signal, onProgress: () => interrupted.abort() }), { name: 'AbortError' });
  assert.ok(input.meshes[0].geometry.attributes.position.array.length > 0);
  input.edgeMetadata.meshes.selected.byteOffset = input.edgeBuffer.byteLength;
  await assert.rejects(createAssemblyLinework(input), /crease/);
});
