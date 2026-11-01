import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DampedMotion } from '../../src/explorer/motion.js';
import { OperationPlayer } from '../../src/explorer/operation-player.js';
globalThis.window = { matchMedia: () => ({ matches: false }) };
const { AssemblyScene } = await import('../../src/explorer/scene.js');
const isAbort = error => error?.name === 'AbortError';

function sceneFixture() {
  const scene = Object.create(AssemblyScene.prototype), calls = [];
  const record = name => () => calls.push(name);
  Object.assign(scene, {
    abort: new AbortController(), model: { id: 'test', modelUrl: '/model.glb' }, callbacks: {}, loadMetrics: {}, meshes: new Map(), edges: new Map(), movingMeshes: new Set(), active: [], contextMeshes: [],
    operationPlayer: new OperationPlayer({ duration: 2 }), separationMotion: new DampedMotion([0]), fraction: 0,
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(15, 1, .05, 150), controls: { target: new THREE.Vector3(), dispose: record('controls'), update: () => false },
    mount: { clientWidth: 800, clientHeight: 600 }, resizeObserver: { disconnect: record('observer') },
    composer: { passes: [], dispose: record('composer') }, environmentTarget: { dispose: record('environment') },
    renderer: { dispose: record('renderer'), forceContextLoss: record('context'), domElement: { remove: record('canvas') } },
    raf: null, benchmark: { active: false }, invalidate: record('invalidate'), defaultDirection: new THREE.Vector3(0,0,1)
  });
  scene.camera.position.set(0, 0, 10);
  return { scene, calls };
}
function replace(t, target, key, value) { const old = target[key]; target[key] = value; t.after(() => { target[key] = old; }); }

test('settle promises use submitted frame evidence, support playing transport and abort cleanly', async () => {
  const { scene } = sceneFixture(); scene.operationPlayer.play();
  let done = false;
  const frame = scene.whenSettled({ settle: false }).then(() => { done = true; });
  scene.flushSettledWaiters(); await Promise.resolve(); assert.equal(done, false);
  scene.renderCount = 1; scene.flushSettledWaiters(); await frame; assert.equal(done, true);
  scene.cameraMotion = new DampedMotion([0]); scene.cameraMotion.to([1]);
  const owner = new AbortController(); const pending = scene.whenSettled({ signal: owner.signal });
  owner.abort(); await assert.rejects(pending, isAbort); assert.equal(scene.settleWaiters.size, 0);
  scene.operationPlayer.pause(); scene.cameraMotion.stop();
  const settled = scene.whenSettled(); scene.renderCount++; scene.flushSettledWaiters(); await settled;
});

test('dispose rejects pending frame waiters, pauses source operation and is idempotent', async () => {
  const { scene, calls } = sceneFixture(); scene.operationPlayer.play();
  scene.operationSampler = { dispose() { calls.push('sampler'); } };
  const pending = scene.whenSettled(); scene.dispose(); scene.dispose();
  await assert.rejects(pending, isAbort); assert.equal(scene.operationPlayer.playing, false);
  assert.equal(scene.abort.signal.aborted, true); assert.equal(scene.settleWaiters.size, 0);
  for (const operation of ['observer', 'controls', 'sampler', 'composer', 'environment', 'renderer', 'context', 'canvas']) assert.equal(calls.filter(item => item === operation).length, 1);
  const before = scene.operationPlayer.state(); scene.playOneCycle(); scene.togglePlayback(); scene.setPlaybackProgress(.8); scene.setPlaybackSpeed(2); scene.resetOperation();
  assert.deepEqual(scene.operationPlayer.state(), before);
});

test('disposing during model fetch aborts without parsing or publishing progress', async t => {
  const { scene } = sceneFixture(); let resolve, fetchSignal, parses = 0; const progress = [];
  replace(t, globalThis, 'fetch', (_url, { signal }) => { fetchSignal = signal; return new Promise(done => { resolve = done; }); });
  replace(t, GLTFLoader.prototype, 'parseAsync', async () => { parses++; });
  const loading = scene.load(undefined, value => progress.push(value)); scene.dispose();
  await assert.rejects(loading, isAbort); assert.equal(fetchSignal.aborted, true);
  resolve(new Response(new Uint8Array([1, 2]))); await Promise.resolve();
  assert.equal(parses, 0); assert.deepEqual(progress, []); assert.equal(scene.ready, undefined);
});

test('an uninterruptible glTF parse disposes its late result without committing scene state', async t => {
  const { scene } = sceneFixture(); let resolveParse, entered;
  const parsing = new Promise(resolve => { entered = resolve; });
  replace(t, globalThis, 'fetch', async () => new Response(new Uint8Array([1, 2])));
  replace(t, GLTFLoader.prototype, 'parseAsync', () => { entered(); return new Promise(resolve => { resolveParse = resolve; }); });
  const loading = scene.load(); await parsing; scene.dispose();
  let geometries = 0, materials = 0;
  const root = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); root.add(mesh);
  mesh.geometry.addEventListener('dispose', () => geometries++); mesh.material.addEventListener('dispose', () => materials++);
  resolveParse({ scene: root, animations: [] }); await loading;
  assert.equal(geometries, 1); assert.equal(materials, 1); assert.equal(scene.sourceRoot, undefined); assert.equal(scene.ready, undefined); assert.equal(scene.loadMetrics.modelParseMs, undefined);
});

test('render cancellation invalidates pending style without touching camera motion', async () => {
  const { scene } = sceneFixture(); let ready;
  scene.renderStyle = 'engineering'; scene.cancelBenchmark = () => {};
  scene.prepareEdges = () => new Promise(resolve => { ready = resolve; });
  scene.cameraMotion = new DampedMotion([0]); scene.cameraMotion.to([1]);
  const pending = scene.setRenderStyle('linework'); scene.cancelPresentationRequest({ motion: false }); ready();
  assert.equal(await pending, false); assert.equal(scene.cameraMotion.active, true); assert.equal(scene.renderStyle, 'engineering');
});

test('camera bookmarks are plain independent data and restore exact layout or refit a changed one', () => {
  const { scene } = sceneFixture(); scene.offsetX = 20; scene.offsetY = -5;
  const view = scene.captureCameraView(); assert.deepEqual(JSON.parse(JSON.stringify(view)), view);
  view.position[0] = 3; assert.equal(scene.camera.position.x, 0);
  let exact, fitted;
  scene.moveCamera = (...args) => { exact = args; }; scene.fitMeshes = (...args) => { fitted = args; };
  assert.equal(scene.restoreCameraView(view, { animate: false }), true); assert(exact); assert.equal(fitted, undefined);
  assert.deepEqual(exact[3], { offsetX: 20, offsetY: -5 });
  scene.mount.clientWidth = 390; scene.restoreCameraView(view); assert(fitted);
  assert.equal(scene.restoreCameraView({ ...view, position: [NaN, 0, 0] }), false);
});

test('owned source textures and shared geometry are released once across display/source roots', () => {
  const { scene } = sceneFixture(); let geometryCount = 0, textureCount = 0, imageCount = 0;
  const geometry = new THREE.BoxGeometry(), texture = new THREE.Texture({ close() { imageCount++; } });
  geometry.addEventListener('dispose', () => geometryCount++); texture.addEventListener('dispose', () => textureCount++);
  scene.sourceRoot = new THREE.Group(); scene.sourceRoot.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, normalMap: texture })));
  scene.scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()));
  scene.dispose(); scene.dispose();
  assert.equal(geometryCount, 1); assert.equal(textureCount, 1); assert.equal(imageCount, 1);
});

test('optional line preparation aborts promptly and delayed metadata cannot publish state', async t => {
  const { scene } = sceneFixture(); let resolveMetadata, entered;
  const metadataRead = new Promise(resolve => { entered = resolve; });
  scene.model.silhouetteMetadataUrl = '/contours.json'; scene.model.silhouettesUrl = '/contours.bin';
  scene.edgeBuffer = new ArrayBuffer(0); scene.edgeMetadata = {};
  scene.loadContourBinary = async () => new ArrayBuffer(0);
  const statuses = []; scene.callbacks.edgeStatus = state => statuses.push(state);
  replace(t, globalThis, 'fetch', async () => ({ ok: true, json: () => { entered(); return new Promise(resolve => { resolveMetadata = resolve; }); } }));
  const pending = scene.prepareEdges(); await metadataRead; scene.dispose();
  await assert.rejects(pending, isAbort); resolveMetadata({});
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(statuses, []); assert.equal(scene.lineRuntime, undefined); assert.equal(scene.loadMetrics.edgeFetchMs, undefined);
});

test('a camera command may settle while source motion plays but still waits for its transition', async () => {
  const { scene } = sceneFixture(); scene.operationPlayer.play();
  scene.cameraMotion = new DampedMotion([0]); scene.cameraMotion.to([1]);
  const result = scene.whenSettled({ ignorePlayback: true }); let completed = false; result.then(() => { completed = true; });
  scene.renderCount = 1; scene.flushSettledWaiters(); await Promise.resolve(); assert.equal(completed, false);
  scene.cameraMotion.stop(); scene.flushSettledWaiters(); await result;
  assert.equal(scene.operationPlayer.playing, true); assert.equal(scene.isSettled(), false); assert.equal(scene.isSettled({ ignorePlayback: true }), true);
});

test('bookmark projection zoom is respected by both ordinary and tour refitting', () => {
  const { scene } = sceneFixture(), mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1)); mesh.name = 'part';
  mesh.userData = { base: [0, 0, 0], pose: new DampedMotion([0, 0, 0]), fitCorners: [new THREE.Vector3(-.5, -.5, 0), new THREE.Vector3(.5, .5, 0)] };
  scene.meshes.set(mesh.name, mesh); scene.nodes = new Map([['root', { meshNames: ['part'] }]]); scene.offsets = new Map([['part', [0, 0, 0]]]);
  const distances = []; scene.moveCamera = (_center, _direction, distance) => distances.push(distance);
  const frame = { scopeId: 'root', camera: { direction: [0, 0, 1] } };
  for (const zoom of [1, 2]) {
    scene.camera.zoom = zoom; scene.camera.updateProjectionMatrix();
    scene.fitMeshes([mesh], false); scene.tourCameraKey = null; scene.fitTourCamera(frame, false);
  }
  assert(Math.abs(distances[1] - distances[0]) < 1e-10);
  assert(Math.abs(distances[2] / distances[0] - 2) < 1e-10);
  assert(Math.abs(distances[3] / distances[1] - 2) < 1e-10);
});
