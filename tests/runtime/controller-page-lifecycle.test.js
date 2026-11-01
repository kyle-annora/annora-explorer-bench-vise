import test from 'node:test';
import assert from 'node:assert/strict';
import { createPageLifecycle } from '../../src/explorer/controller/page-lifecycle.js';
import { OperationPlayer } from '../../src/explorer/operation-player.js';
import { TourPlayer } from '../../src/explorer/tour-player.js';

function fixture({ activeTour = false, loading = false } = {}) {
  const counts = { disposed: 0, bridgeDisposed: 0, invalidated: 0, cancelledFrames: [] };
  let lifecycle = loading ? 'loading' : 'ready';
  const controller = { getState: () => ({ lifecycle }), setEnvironment(value) { this.environment = { ...this.environment, ...value }; }, dispose() { lifecycle = 'disposed'; counts.disposed++; } };
  const operationPlayer = new OperationPlayer({ duration: 4 }); operationPlayer.seek(.4); operationPlayer.play({ once: true, restart: false });
  const player = new TourPlayer({ duration: 60, chapters: [{ id: 'whole', duration: 60 }] });
  const scene = loading ? undefined : { operationPlayer, raf: 17, lastFrame: 1000, invalidate() { counts.invalidated++; } };
  const tour = loading ? undefined : { player, active: activeTour, pause(reason) { player.pause(reason); scene.raf = 18; } };
  if (activeTour) { player.start(); player.tick(1000); player.tick(1500); }
  const handler = createPageLifecycle({ controller, getScene: () => scene, getTour: () => tour, disposeBridge: () => counts.bridgeDisposed++, isHidden: () => false, cancelFrame: id => counts.cancelledFrames.push(id) });
  return { controller, scene, tour, operationPlayer, handler, counts };
}

test('history cache retains the renderer and UI, pauses tour, and returns with explicit continuation', () => {
  const f = fixture({ activeTour: true }), time = f.tour.player.state().time;
  f.handler.hide({ persisted: true });
  assert.equal(f.counts.disposed, 0); assert.equal(f.counts.bridgeDisposed, 0);
  assert.equal(f.tour.player.state().status, 'paused'); assert.equal(f.tour.player.state().time, time);
  assert.equal(f.scene.raf, null); assert.deepEqual(f.counts.cancelledFrames, [18]);
  f.handler.show({ persisted: true });
  assert.equal(f.tour.player.state().status, 'paused'); assert.equal(f.tour.player.state().time, time);
  assert.equal(f.scene.lastFrame, null); assert.equal(f.counts.invalidated, 1); assert.equal(f.controller.environment.visible, true);
});

test('manual source playback preserves its phase across cached history without counting hidden time', () => {
  const f = fixture(), phase = f.operationPlayer.state().progress;
  f.operationPlayer.tick(1000); f.handler.hide({ persisted: true });
  assert.equal(f.operationPlayer.state().playing, true); assert.equal(f.operationPlayer.state().suspended, true);
  f.operationPlayer.tick(1500); assert.equal(f.operationPlayer.state().progress, phase);
  f.handler.show({ persisted: true }); f.operationPlayer.tick(100000);
  assert.equal(f.operationPlayer.state().progress, phase); assert.equal(f.operationPlayer.state().suspended, false);
});

test('ordinary navigation disposes; retained loading documents can safely return', () => {
  const normal = fixture(); normal.handler.hide({ persisted: false }); normal.handler.show({ persisted: true });
  assert.equal(normal.counts.disposed, 1); assert.equal(normal.counts.bridgeDisposed, 1); assert.equal(normal.counts.invalidated, 0);
  const loading = fixture({ loading: true }); loading.handler.hide({ persisted: true }); loading.handler.show({ persisted: true });
  assert.equal(loading.counts.disposed, 0); assert.equal(loading.controller.getState().lifecycle, 'loading');
});
