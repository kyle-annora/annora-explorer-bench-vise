import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = { matchMedia: () => ({ matches: false }) };
const { AssemblyScene } = await import('../../src/explorer/scene.js');

test('benchmark accepts a prepared package without optional source statistics', () => {
  let report;
  const scene = {
    ready: true, benchmark: { active: false, begin(value) { report = value; } }, mode: 'explore', renderStyle: 'engineering', metadata: {}, model: { id: 'generic-model' }, rootId: 'root', callbacks: {}, meshes: new Map(), outline: {},
    setScope() {}, applyFraction() {}, emitOperation() {}, fit() {}, syncLinePresentation() {}, layoutRegion: () => ({ width: 800, height: 600 }),
    renderer: { getPixelRatio: () => 1, domElement: { width: 800, height: 600 } }, cameraMotion: { values: [0, 0, 10] }, controls: { enabled: true }, invalidate() {},
  };
  AssemblyScene.prototype.startBenchmark.call(scene);
  assert.equal(report.modelId, 'generic-model'); assert.equal(report.modelStats.edgeBytes, 0); assert.equal(scene.controls.enabled, false); assert.deepEqual(scene.benchmarkBase, [0, 0, 10]);
});
