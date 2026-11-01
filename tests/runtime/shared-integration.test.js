import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Box3, Matrix4, Object3D, Vector3 } from 'three';
import { MODEL_CATALOG, resolveModel, validatePackage } from '../fixtures/baseline-catalog.js';
import { buildHierarchy, createOffsets } from '../../src/explorer/model-state.js';
import { createNavigation, selectNode, enterScope, toggleBranch } from '../../src/explorer/navigation-state.js';
import { SourceAnimationPose } from '../../src/explorer/operation-player.js';
import { loadKineticAsset, sha256 } from '../../scripts/kinetic-asset.mjs';

const metadataFor = async model => JSON.parse(await readFile(model.metadataUrl, 'utf8'));
const matrixClose = (actual, expected, tolerance = 1e-10) => actual.elements.forEach((value, i) => assert(Math.abs(value - expected.elements[i]) < tolerance, `Matrix element ${i}: ${value} / ${expected.elements[i]}`));
const typedHash = array => sha256(Buffer.from(array.buffer, array.byteOffset, array.byteLength));

test('both shipped content packages resolve identities and finite offsets through one hierarchy API', async () => {
  for (const model of Object.values(MODEL_CATALOG)) {
    const metadata = await metadataFor(model);
    assert.equal(validatePackage(metadata, model), true);
    const hierarchy = buildHierarchy(metadata, model.presentationPolicy);
    assert.equal(hierarchy.root.id, model.rootId);
    assert.equal(hierarchy.root.meshNames.length, metadata.parts.length);
    for (const part of metadata.parts) {
      const node = hierarchy.nodes.get(part.id), parent = hierarchy.nodes.get(node.parent);
      assert.deepEqual(node.meshNames, [part.meshName]);
      assert(parent.meshNames.includes(part.meshName));
    }
    for (const node of hierarchy.nodes.values()) {
      const offsets = createOffsets(metadata.parts, hierarchy.nodes, node.id, 13.5, model.presentationPolicy);
      assert.equal(offsets.size, metadata.parts.length);
      for (const [name, offset] of offsets) {
        assert.equal(offset.length, 3);assert(offset.every(Number.isFinite));
        if (!node.meshNames.includes(name) || node.type === 'component') assert.deepEqual(offset, [0, 0, 0]);
      }
    }
  }
});

test('unknown model URL values cannot resolve inherited object properties', () => {
  for (const id of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', '', null, undefined, 'missing-model']) assert.equal(resolveModel(id), MODEL_CATALOG.apollo);
  assert.equal(resolveModel('kinetic-01'), MODEL_CATALOG['kinetic-01']);
});

test('import validation rejects contradictory identity, motion and membership data', async () => {
  const model = MODEL_CATALOG['kinetic-01'], source = await metadataFor(model);
  const corrupt = mutate => { const metadata = structuredClone(source);mutate(metadata);assert.throws(() => validatePackage(metadata, model)); };
  corrupt(metadata => { metadata.parts[0].meshName = ' '; });
  corrupt(metadata => { metadata.parts[0].explode = [0, Infinity, 0]; });
  corrupt(metadata => { metadata.operation.duration = Infinity; });
  corrupt(metadata => { metadata.groups[0].meshNames.push(metadata.groups[1].meshNames[0]); });
  corrupt(metadata => { metadata.groups[0].children = [{ id: 'foreign-child', meshNames: [metadata.groups[1].meshNames[0]] }]; });
  corrupt(metadata => { metadata.groups[0].children = [{ id: 'first-child', meshNames: [metadata.groups[0].meshNames[0]] }, { id: 'second-child', meshNames: [metadata.groups[0].meshNames[0]] }]; });
});

test('selection retains assembly context until inspection is explicitly requested', async () => {
  const metadata = await metadataFor(MODEL_CATALOG['kinetic-01']);
  const { root, nodes } = buildHierarchy(metadata, MODEL_CATALOG['kinetic-01'].presentationPolicy);
  const initial = createNavigation(root.id);
  const selected = selectNode(initial, nodes, 'carriage');
  assert.equal(selected.scopeId, root.id);assert.equal(selected.selectedId, 'carriage');
  const expanded = toggleBranch(selected, nodes, 'carriage');
  assert.equal(expanded.scopeId, root.id);assert(expanded.expanded.has('carriage'));
  const entered = enterScope(expanded, nodes, 'carriage');
  assert.equal(entered.scopeId, 'carriage');assert.equal(entered.isolated, false);
  const part = metadata.parts.find(item => item.group === 'carriage');
  const selectedPart = selectNode(entered, nodes, part.id);
  assert.equal(selectedPart.scopeId, 'carriage');assert.equal(selectedPart.selectedId, part.id);
  const returned = enterScope({ ...selectedPart, isolated: true }, nodes, root.id);
  assert.equal(returned.scopeId, root.id);assert.equal(returned.selectedId, root.id);assert.equal(returned.isolated, false);
  assert.equal(selectNode(returned, nodes, 'unknown'), returned);
});

test('actual authored hierarchy can reach the endpoint, scrub backward and restore all source transforms', async () => {
  const { gltf, meshes } = await loadKineticAsset();
  const restMatrices = new Map();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(object => restMatrices.set(object, { matrix: object.matrix.clone(), world: object.matrixWorld.clone(), parent: object.parent }));
  const sourceArrays = meshes.flatMap(mesh => Object.values(mesh.geometry.attributes).map(attribute => ({ array: attribute.array, hash: typedHash(attribute.array) })));
  for (const track of gltf.animations[0].tracks) sourceArrays.push({ array: track.times, hash: typedHash(track.times) }, { array: track.values, hash: typedHash(track.values) });
  const sourceJson = JSON.stringify(gltf.parser.json);
  const sampler = new SourceAnimationPose(gltf.scene, gltf.animations[0]);
  for (const progress of [0, 1, .25, .9, .5, .05, .75]) {
    sampler.sample(progress);
    const theta = 2 * Math.PI * progress;
    const expectedPin = new Vector3(-.09 + .035 * Math.cos(theta), .102, -.035 * Math.sin(theta));
    const expectedSlider = new Vector3(expectedPin.x + Math.sqrt(.11 ** 2 - expectedPin.z ** 2), .102, 0);
    assert(gltf.scene.getObjectByName('Crank_Pin').getWorldPosition(new Vector3()).distanceTo(expectedPin) < 1e-5);
    assert(gltf.scene.getObjectByName('Slider_Pin').getWorldPosition(new Vector3()).distanceTo(expectedSlider) < 1e-5);
  }
  sampler.restore();
  for (const [object, rest] of restMatrices) {
    matrixClose(object.matrix, rest.matrix);matrixClose(object.matrixWorld, rest.world);
    assert.equal(object.parent, rest.parent, 'Sampling must never flatten or reparent the source assembly.');
  }
  for (const { array, hash } of sourceArrays) assert.equal(typedHash(array), hash, 'Sampling must not edit source geometry or animation arrays.');
  assert.equal(JSON.stringify(gltf.parser.json), sourceJson);
  sampler.sample(.25);sampler.dispose();
  for (const [object, rest] of restMatrices) matrixClose(object.matrixWorld, rest.world);
});

test('flat display solids and technical lines can retain all inherited animated transforms and normalization', async () => {
  const { gltf, meshes } = await loadKineticAsset();
  const bounds = new Box3().setFromObject(gltf.scene), center = bounds.getCenter(new Vector3());
  const scale = 4.4 / bounds.getSize(new Vector3()).x;
  const normalization = new Matrix4().makeScale(scale, scale, scale).multiply(new Matrix4().makeTranslation(-center.x, -center.y, -center.z));
  const sampler = new SourceAnimationPose(gltf.scene, gltf.animations[0], normalization);
  const edgeMetadata = JSON.parse(await readFile(MODEL_CATALOG['kinetic-01'].edgeMetadataUrl, 'utf8'));
  const edgeBytes = await readFile(MODEL_CATALOG['kinetic-01'].edgesUrl);
  const matrix = new Matrix4(), display = new Object3D(), line = new Object3D();
  for (const progress of [0, .125, .25, .5, .75, 1, .25]) {
    sampler.sample(progress);
    for (const source of meshes) {
      sampler.matrixFor(source, matrix).decompose(display.position, display.quaternion, display.scale);
      display.updateMatrixWorld(true);matrixClose(display.matrixWorld, matrix);
      line.position.copy(display.position);line.quaternion.copy(display.quaternion);line.scale.copy(display.scale);line.updateMatrixWorld(true);
      const range = edgeMetadata.meshes[source.name];
      if (range.vertexCount) {
        const localPoint = new Vector3(...[0, 1, 2].map(component => edgeBytes.readFloatLE(range.byteOffset + component * 4)));
        const expected = localPoint.clone().applyMatrix4(source.matrixWorld).applyMatrix4(normalization);
        assert(localPoint.clone().applyMatrix4(line.matrixWorld).distanceTo(expected) < 1e-9, `Technical line lost parent transform: ${source.name}`);
      }
    }
  }
  sampler.dispose();
});
