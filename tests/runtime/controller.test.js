import test from 'node:test';
import assert from 'node:assert/strict';
import { ExplorerController, EXPLORER_PROTOCOL } from '../../src/explorer/controller.js';
import { TOUR_CATALOG } from '../fixtures/baseline-catalog.js';
import { TourPlayer } from '../../src/explorer/tour-player.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(done => setImmediate(done));
const camera = () => ({ position: [2, 3, 8], target: [0, 0, 0], up: [0, 1, 0], projection: { kind: 'perspective', verticalFovDegrees: 42, zoom: 1, offsetX: 14, offsetY: 8 }, viewport: { width: 1200, height: 800 }, layoutKey: 'test-layout' });

function fixture({ operation = true, ready = true, enabled = {} } = {}) {
  const model = { id: operation ? 'kinetic-01' : 'apollo', packageId: operation ? 'kinetic' : 'apollo-hatch', revision: 'sha256:known-revision', rootId: 'root', capabilities: { operation }, operationClipId: operation ? 'Animation' : null, defaultDirection: [.3, .2, 1] };
  model.tour = TOUR_CATALOG[model.id];
  const nodes = new Map([
    ['root', { id: 'root', title: 'Whole machine', type: 'assembly', parent: null, children: ['a', 'b'], meshNames: ['m1', 'm2'] }],
    ['a', { id: 'a', title: 'Drive group', type: 'system', parent: 'root', children: ['part'], meshNames: ['m1'] }],
    ['part', { id: 'part', title: 'Part', type: 'component', parent: 'a', children: [], meshNames: ['m1'] }],
    ['b', { id: 'b', title: 'Other group', type: 'system', parent: 'root', children: [], meshNames: ['m2'] }],
  ]);
  const calls = [], pendingStyles = new Map();
  const scene = {
    ready, mode: 'explore', scopeId: 'root', selectedId: 'root', isolated: false, fraction: 0, explosionTarget: 0, renderStyle: 'engineering', quality: 'balanced', effectiveQuality: 'balanced', movingMeshes: [],
    operationConfig: operation ? { clip: 'Animation' } : null, operationState: { available: operation, playing: false, progress: 0, speed: 1, followCamera: false },
    meshes: new Map([['m1', { name: 'm1' }], ['m2', { name: 'm2' }]]),
    camera: { position: { clone: () => ({ set: (...value) => value }) } }, styleGeneration: 0,
    getOperationState() { return { ...this.operationState, mode: this.mode, scopeId: this.scopeId, selectedId: this.selectedId, isolated: this.isolated }; },
    setSelected(id) { calls.push(['select', id]); this.selectedId = id; },
    setScope(id) { calls.push(['scope', id]); this.scopeId = this.selectedId = id; this.mode = 'explore'; this.operationState.playing = false; this.active = nodes.get(id).meshNames.map(name => this.meshes.get(name)); },
    setIsolated(value) { this.isolated = value; }, focusSelected() { calls.push(['focus', this.selectedId]); }, fitMeshes(meshes) { calls.push(['frame', meshes.map(mesh => mesh.name)]); },
    setMode(mode) { this.mode = mode; if (mode === 'operate') { this.scopeId = this.selectedId = 'root'; this.isolated = false; this.fraction = this.explosionTarget = 0; this.operationState.playing = false; this.operationState.progress = 0; } if (mode === 'explore') this.fraction = this.explosionTarget = 0; if (mode === 'explode') this.fraction = this.explosionTarget = 1; },
    explode(value, animate, mode) { calls.push(['explode', value, animate]); this.fraction = this.explosionTarget = value; this.mode = mode || (value > 0 || this.mode === 'explode' ? 'explode' : 'explore'); },
    async setRenderStyle(style) { const generation = ++this.styleGeneration; if (pendingStyles.has(style)) await pendingStyles.get(style).promise; if (this.styleGeneration !== generation) return false; this.renderStyle = style; return true; },
    prepareEdges: async () => {},
    setPlaybackProgress(progress) { this.setMode('operate'); this.operationState.progress = progress; this.operationState.playing = false; },
    setPlaybackSpeed(speed) { this.operationState.speed = speed; }, setFollowCamera(enabled) { this.operationState.followCamera = enabled; },
    togglePlayback() { if (this.operationState.progress >= 1) this.operationState.progress = 0; this.operationState.playing = !this.operationState.playing; },
    emitOperation() {}, invalidate() {},
    async whenSettled(options) { calls.push(['wait', options.settle]); if (options.signal?.aborted) throw options.signal.reason; },
    cancelPresentationRequest({ render, motion }) { calls.push(['cancel', render, motion]); if (render) ++this.styleGeneration; if (motion) this.cameraMotion = null; },
    setQuality(value) { this.quality = this.effectiveQuality = value; }, captureCameraView: camera,
    restoreCameraView(value) { calls.push(['restore-camera', value]); },
  };
  scene.active = [...scene.meshes.values()];
  scene.operationPlayer = { state: () => scene.operationState, pause: () => { scene.operationState.playing = false; } };
  const tourData = TOUR_CATALOG[model.id], player = new TourPlayer(tourData);
  const tour = {
    tour: tourData, player, active: false, pending: false,
    async start() { this.active = true; player.start(); return true; }, pause(reason) { player.pause(reason); }, resume() { player.resume(); },
    jump(action, value) { player.seek(action === 'chapter' ? tourData.chapters[value].start + tourData.chapters[value].previewAt : value); },
    interact() { calls.push(['takeover']); player.pause('takeover'); },
    async exit() { this.active = false; player.stop(); }, cancelPending() { this.pending = false; calls.push(['cancel-tour']); },
  };
  let disposed = 0, theme = 'ember';
  const controller = new ExplorerController({ model, instanceId: 'test-instance', enabled, port: { getScene: () => scene, getTour: () => tour, getHierarchy: () => ({ nodes }), getTheme: () => ({ id: theme, revision: '1' }), setTheme: id => { theme = id; }, dispose: () => { disposed++; scene.ready = false; } } });
  controller.setLifecycle('loading'); if (ready) controller.setLifecycle('ready');
  let serial = 0;
  const command = (method, params = {}, requestId = `test-${++serial}`) => controller.request({ requestId, method, params });
  return { controller, model, scene, tour, nodes, command, calls, pendingStyles, disposed: () => disposed };
}

test('discovery works during loading; unsupported Apollo operation differs from unavailable Kinetic', async () => {
  const apollo = fixture({ operation: false, ready: false });
  const kinetic = fixture({ ready: false });
  const initialRevision = apollo.controller.stateRevision;
  assert.equal((await apollo.command('getState')).payload.result.lifecycle, 'loading');
  assert.equal((await apollo.command('getCapabilities')).payload.result.operation.supported, false);
  assert.equal(kinetic.controller.getCapabilities().operation.supported, true);
  assert.equal(kinetic.controller.getCapabilities().operation.available, false);
  assert.equal(apollo.controller.stateRevision, initialRevision, 'queries do not increment presentation revision');
  assert.equal((await apollo.command('select', { nodeId: 'a' })).payload.error.code, 'NOT_READY');
  assert.equal(apollo.scene.selectedId, 'root');
});

test('selection, focus and framing have independent scope semantics', async () => {
  const f = fixture();
  await f.command('select', { nodeId: 'part' });
  assert.equal(f.scene.scopeId, 'root'); assert.equal(f.scene.selectedId, 'part'); assert.equal(f.calls.some(call => call[0] === 'focus'), false);
  await f.command('focus', { nodeId: 'a' });
  assert.equal(f.scene.scopeId, 'a'); assert.equal(f.scene.isolated, false);
  const frame = await f.command('frame', { nodeId: 'b' });
  assert.equal(frame.payload.error.code, 'UNSUPPORTED_ACTION'); assert.equal(f.scene.scopeId, 'a');
  await f.command('select', { nodeId: 'part' });
  await f.command('frame', { nodeId: 'part' }); assert.equal(f.scene.selectedId, 'part');
  await f.command('isolate', { nodeId: 'part' }); assert.equal(f.scene.scopeId, 'part'); assert.equal(f.scene.isolated, true);
  await f.command('isolate', { nodeId: null }); assert.equal(f.scene.scopeId, 'part'); assert.equal(f.scene.isolated, false);
});

test('unsupported modes, invalid values and hidden content do not mutate the view', async () => {
  const f = fixture({ operation: false });
  assert.equal((await f.command('playOperation')).payload.error.code, 'UNSUPPORTED_ACTION');
  assert.equal((await f.command('setMode', { mode: 'operate' })).payload.error.code, 'UNSUPPORTED_ACTION');
  for (const progress of [-1, 2, '0.2']) assert.equal((await f.command('setExplosion', { progress })).payload.error.code, 'INVALID_ARGUMENT');
  assert.equal(f.scene.mode, 'explore');
  await f.command('isolate', { nodeId: 'part' });
  assert.equal((await f.command('setExplosion', { progress: 1 })).payload.error.code, 'UNSUPPORTED_ACTION');
  assert.equal(f.scene.fraction, 0);
});

test('latest rendering request wins, retry attaches, and each original request has one terminal event', async () => {
  const f = fixture(), barrier = deferred(), events = [];
  f.pendingStyles.set('linework', barrier); f.controller.subscribe(event => events.push(event));
  const first = f.command('setRenderStyle', { style: 'linework' }, 'render-1');
  const retry = f.command('setRenderStyle', { style: 'linework' }, 'render-1'); assert.equal(first, retry);
  // Both are queued in the same turn: an older command must never cancel a newer queued intent.
  const second = f.command('setRenderStyle', { style: 'flat' }, 'render-2');
  assert.equal((await first).payload.status, 'cancelled'); assert.equal((await second).payload.status, 'completed');
  barrier.resolve(); await tick(); assert.equal(f.scene.renderStyle, 'flat');
  assert.equal(events.filter(event => event.type === 'commandResult' && event.requestId === 'render-1').length, 1);
  assert.equal((await f.command('setRenderStyle', { style: 'linework' }, 'render-1')).payload.status, 'cancelled');
  assert.equal((await f.command('setRenderStyle', { style: 'engineering' }, 'render-1')).payload.error.code, 'INVALID_REQUEST');
  assert.equal(events.every(event => event.protocolVersion === EXPLORER_PROTOCOL), true);
});

test('visitor takeover cancels a host transition and pauses a tour without resuming it', async () => {
  const f = fixture(), barrier = deferred();
  f.scene.whenSettled = ({ signal }) => new Promise((resolve, reject) => { barrier.promise.then(resolve); signal.addEventListener('abort', () => reject(signal.reason), { once: true }); });
  const pending = f.command('focus', { nodeId: 'a' }); await tick();
  f.controller.takeover(); const result = await pending;
  assert.equal(result.payload.status, 'cancelled'); assert.equal(result.payload.reason, 'user-takeover');
  f.scene.whenSettled = async () => {};
  await f.command('startTour', { tourId: f.tour.tour.id });
  await f.command('select', { nodeId: 'a' });
  assert.equal(f.tour.player.state().status, 'paused'); assert.equal(f.tour.player.state().reason, 'takeover');
  assert.equal(f.tour.active, true); barrier.resolve();
});

test('play operation resumes source time and does not wait for its cycle to end', async () => {
  const f = fixture();
  await f.command('seekOperation', { progress: .4 });
  const result = await f.command('playOperation');
  assert.equal(result.payload.result.status, 'playing'); assert.equal(f.scene.operationState.progress, .4);
  assert.equal(f.calls.at(-1)[1], false);
  await f.command('pauseOperation'); assert.equal(f.scene.operationState.playing, false);
  assert.equal((await f.command('setOperationSpeed', { speed: 2 })).payload.error.code, 'INVALID_ARGUMENT');
});

test('bookmarks are JSON, revision pinned, and restore paused pose and camera without theme reset', async () => {
  const f = fixture();
  await f.command('seekOperation', { progress: .62 });
  const result = await f.command('captureView'), bookmark = result.payload.result;
  assert.equal(result.payload.status, 'completed'); assert.equal(bookmark.operation.status, 'paused'); assert.deepEqual(JSON.parse(JSON.stringify(bookmark)), bookmark);
  const invalid = structuredClone(bookmark); invalid.model.revision = 'other';
  const callCount = f.calls.length;
  assert.equal((await f.command('restoreView', { bookmark: invalid })).payload.error.code, 'INCOMPATIBLE_VIEW'); assert.equal(f.calls.length, callCount);
  await f.command('setTheme', { themeId: 'arc-cyan' }); await f.command('seekOperation', { progress: .1 });
  assert.equal((await f.command('restoreView', { bookmark })).payload.status, 'completed');
  assert.equal(f.scene.operationState.progress, .62); assert.equal(f.scene.operationState.playing, false);
  assert.equal(f.controller.getState().appearance.theme.id, 'arc-cyan');
  assert.deepEqual(f.calls.findLast(call => call[0] === 'restore-camera')[1], bookmark.camera);
});

test('edited camera bookmarks reject unstable planes, unsupported roll and oversized coordinates before mutation', async () => {
  const f = fixture(), bookmark = (await f.command('captureView')).payload.result;
  for (const edit of [
    value => { value.camera.position = [...value.camera.target]; },
    value => { value.camera.up = [2, 3, 8]; },
    value => { value.camera.up = [1, 0, 0]; },
    value => { value.camera.position[0] = 1e10; },
    value => { value.camera.projection.zoom = 1e10; },
  ]) {
    const modified = structuredClone(bookmark); edit(modified);
    const before = f.calls.length;
    assert.equal((await f.command('restoreView', { bookmark: modified })).payload.status, 'failed');
    assert.equal(f.calls.length, before);
  }
});

test('exit during tour preparation cancels the pending start without a late activation', async () => {
  const f = fixture(), barrier = deferred();
  f.tour.start = async ({ signal }) => { f.tour.pending = true; await barrier.promise; if (signal.aborted) return false; f.tour.pending = false; f.tour.active = true; f.tour.player.start(); return true; };
  const starting = f.command('startTour', { tourId: f.tour.tour.id }); await tick();
  const exit = await f.command('exitTour');
  assert.equal(exit.payload.status, 'completed'); assert.equal((await starting).payload.status, 'cancelled');
  barrier.resolve(); await tick(); assert.equal(f.tour.active, false); assert.equal(f.tour.pending, false);
});

test('selection and appearance changes take control from a preparing tour before its late commit', async () => {
  for (const [method, params] of [['select', { nodeId: 'part' }], ['setTheme', { themeId: 'arc-cyan' }], ['setQuality', { profile: 'performance' }]]) {
    const f = fixture(), barrier = deferred();
    f.tour.start = async ({ signal }) => {
      f.tour.pending = true; await barrier.promise;
      if (signal.aborted) return false;
      f.tour.pending = false; f.tour.active = true; f.scene.setSelected('root'); f.tour.player.start(); return true;
    };
    const starting = f.command('startTour', { tourId: f.tour.tour.id }); await tick();
    assert.equal((await f.command(method, params)).payload.status, 'completed');
    assert.equal((await starting).payload.status, 'cancelled');
    barrier.resolve(); await tick();
    assert.equal(f.tour.active, false); assert.equal(f.tour.pending, false);
    if (method === 'select') assert.equal(f.scene.selectedId, 'part');
    if (method === 'setTheme') assert.equal(f.controller.getState().appearance.theme.id, 'arc-cyan');
    if (method === 'setQuality') assert.equal(f.scene.quality, 'performance');
  }
});

test('selection preserves an independent pending rendering change', async () => {
  const f = fixture(), barrier = deferred(); f.pendingStyles.set('flat', barrier);
  const rendering = f.command('setRenderStyle', { style: 'flat' }, 'rendering'); await tick();
  await f.command('select', { nodeId: 'part' });
  assert.equal(f.controller.getState().busy.some(item => item.requestId === 'rendering'), true);
  barrier.resolve(); assert.equal((await rendering).payload.status, 'completed');
  assert.equal(f.scene.selectedId, 'part'); assert.equal(f.scene.renderStyle, 'flat');
});

test('camera damping, benchmark control and detached intermediate source poses cannot be bookmarked', async () => {
  const f = fixture();
  f.scene.isSettled = () => !f.scene.controlsMoving && !f.scene.benchmark?.active && !f.scene.operationState.playing;
  for (const [field, value] of [['controlsMoving', true], ['benchmark', { active: true }], ['presentationPoseDetached', true]]) {
    f.scene[field] = value;
    assert.equal((await f.command('captureView')).payload.error.code, 'BUSY_STATE');
    f.scene[field] = field === 'benchmark' ? { active: false } : false;
  }
  assert.equal((await f.command('captureView')).payload.status, 'completed');
});

test('active tour, playing source motion and in-flight style preparation cannot produce unstable bookmarks', async () => {
  const f = fixture();
  await f.command('playOperation'); assert.equal((await f.command('captureView')).payload.error.code, 'BUSY_STATE');
  await f.command('pauseOperation'); await f.command('startTour', { tourId: f.tour.tour.id });
  await f.command('pauseTour'); assert.equal((await f.command('captureView')).payload.error.code, 'BUSY_STATE');
  await f.command('exitTour');
  const barrier = deferred(); f.pendingStyles.set('flat', barrier);
  const preparation = f.command('setRenderStyle', { style: 'flat' }, 'preparation'); await tick();
  assert.equal((await f.command('captureView')).payload.error.code, 'BUSY_STATE');
  await f.command('cancel', { requestId: 'preparation' }); assert.equal((await preparation).payload.status, 'cancelled'); barrier.resolve();
});

test('chapter descriptors and chapter seeks preserve authoring semantics including reduced motion', async () => {
  const f = fixture();
  const tour = (await f.command('getTour', { tourId: f.tour.tour.id })).payload.result;
  assert.equal(tour.chapters[1].previewAt, f.tour.tour.chapters[1].previewAt);
  f.tour.player.reducedMotion = true;
  await f.command('startTour', { tourId: tour.id });
  const chapter = tour.chapters[1];
  await f.command('goToTourChapter', { chapterId: chapter.id });
  assert.equal(f.tour.player.state().time, chapter.start + chapter.previewAt);
  assert.equal(f.tour.player.state().settled, true);
  await f.command('resumeTour'); assert.equal(f.tour.player.state().status, 'paused');
  assert.equal((await f.command('goToTourChapter', { chapterId: 'missing' })).payload.error.code, 'UNKNOWN_CHAPTER');
});

test('capability restrictions cannot enable unsupported features', async () => {
  const f = fixture({ operation: false, enabled: { operation: true, renderStyles: ['engineering'], modes: ['explore', 'operate'], tours: false } });
  assert.deepEqual(f.controller.getCapabilities().modes.enabled, ['explore']);
  assert.equal((await f.command('setRenderStyle', { style: 'flat' })).payload.error.code, 'UNSUPPORTED_ACTION');
  assert.equal(f.controller.getCapabilities().tours.available, false);
  const disabled = fixture({ enabled: { operation: false, themes: ['ember'], qualityProfiles: ['performance'] } });
  assert.equal((await disabled.command('setMode', { mode: 'operate' })).payload.error.code, 'UNSUPPORTED_ACTION');
  assert.equal((await disabled.command('seekOperation', { progress: .3 })).payload.error.code, 'UNSUPPORTED_ACTION');
  assert.equal((await disabled.command('setTheme', { themeId: 'arc-cyan' })).payload.error.code, 'UNSUPPORTED_ACTION');
  assert.equal((await disabled.command('setQuality', { profile: 'quality' })).payload.error.code, 'UNSUPPORTED_ACTION');
});

test('disposal cancels pending work, releases once, and future mutations fail', async () => {
  const f = fixture(), barrier = deferred(), events = [];
  f.controller.subscribe(event => events.push(event)); f.pendingStyles.set('linework', barrier);
  const pending = f.command('setRenderStyle', { style: 'linework' }); await tick();
  assert.equal((await f.command('dispose')).payload.status, 'completed');
  assert.equal((await pending).payload.reason, 'disposed'); f.controller.dispose(); assert.equal(f.disposed(), 1);
  barrier.resolve(); await tick(); assert.equal(f.scene.renderStyle, 'engineering');
  assert.equal((await f.command('focus', { nodeId: 'a' })).payload.error.code, 'DISPOSED');
  assert.equal(events.filter(event => event.type === 'disposed').length, 1);
  assert.equal(events.findLast(event => event.type === 'commandResult').payload.status, 'completed');
});

test('malformed or executable parameter shapes are rejected before side effects', async () => {
  const f = fixture();
  for (const params of [{ progress: NaN }, { progress: .2, url: 'https://untrusted.invalid/' }, { progress: () => 1 }]) {
    const result = await f.command('setExplosion', params); assert.equal(result.payload.status, 'failed');
  }
  assert.equal(f.scene.fraction, 0);
  const object = { progress: .2 }; object.self = object;
  assert.equal((await f.command('setExplosion', object)).payload.error.code, 'INVALID_REQUEST');
});
