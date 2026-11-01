import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveBudget, BenchmarkRecorder, QUALITY_PROFILES, renderPixelRatio, serializeBenchmark } from '../../src/explorer/performance.js';

function harness() {
  let time = 0;
  const document = new EventTarget();
  document.hidden = false;
  const recorder = new BenchmarkRecorder({ now: () => time, document, PerformanceObserver: null });
  return { recorder, document, tick(value, data) { time = value; recorder.frame(value, data); } };
}

test('scripted motion reports frame percentiles, CPU submission and total-pass counters separately', () => {
  const { recorder, tick } = harness();
  recorder.begin({ mode: 'engineering', quality: 'balanced', modelStats: { meshCount: 801, triangles: 784877 } });
  for (let i = 0; i <= 100; i++) tick(i * 20, { moving: true, renderMs: 3, drawCalls: 1608, triangles: 1569754, phase: 'orbit' });
  const report = recorder.finish();
  assert.equal(report.status, 'completed');
  assert.equal(report.scenario, 'apollo-standard-v2');
  assert.equal(report.scope, 'Current browser and complete selected assembly');
  assert.equal(report.durationMs, 2000);
  assert.equal(report.frames.motionIntervals, 100);
  assert.equal(report.frames.medianFps, 50);
  assert.equal(report.frames.frameIntervalMs.p95, 20);
  assert.equal(report.cpuRenderSubmissionMs.p95, 3);
  assert.equal(report.drawCallsPerRenderedFrame.mean, 1608);
  assert.equal(report.trianglesPerRenderedFrame.mean, 1569754);
  assert.equal(report.model.triangles, 784877);
  assert.equal(report.phases.orbit.count, 100);
  assert.equal(report.longTasks.count, null);
});

test('idle gaps do not inflate motion frame intervals; null render timing does not count as drawing', () => {
  const { recorder, tick } = harness(); recorder.begin();
  tick(0, { moving: true, renderMs: 2 });
  tick(16, { moving: true, renderMs: 2 });
  tick(1000, { moving: false });
  tick(2000, { moving: true, renderMs: 2 });
  tick(2016, { moving: true, renderMs: 2 });
  const report = recorder.finish();
  assert.equal(report.frames.observedTicks, 5);
  assert.equal(report.frames.rendered, 4);
  assert.equal(report.frames.motionIntervals, 2);
  assert.equal(report.frames.frameIntervalMs.max, 16);
  assert.equal(report.frames.enoughSamples, false);
});

test('slow frames remain visible and duplicate, reversed or nonfinite timestamps are ignored', () => {
  const { recorder, tick } = harness(); recorder.begin();
  tick(0, { moving: true }); tick(20, { moving: true });
  tick(20, { moving: true }); tick(10, { moving: true });
  recorder.frame(NaN, { moving: true });
  tick(120, { moving: true });
  const report = recorder.finish();
  assert.equal(report.frames.observedTicks, 3);
  assert.equal(report.frames.over50Ms, 1);
  assert.equal(report.frames.frameIntervalMs.p95, 100);
});

test('switching away cancels a run rather than reporting hidden-page throttling as device performance', () => {
  const { recorder, tick, document } = harness(); recorder.begin();
  tick(0, { moving: true }); tick(16, { moving: true });
  document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
  tick(5000, { moving: true });
  assert.equal(recorder.active, false);
  assert.equal(recorder.finish().status, 'cancelled');
  assert.equal(recorder.lastReport.reason, 'page-hidden');
  assert.equal(recorder.lastReport.frames.motionIntervals, 1);
});

test('context export excludes identity, addresses, URLs and arbitrary extra fields', () => {
  const { recorder } = harness();
  recorder.begin({
    mode: 'https://private.invalid', quality: 'unsupported', url: 'private', userAgent: 'private',
    viewport: { width: 1200, height: 800, pixelRatio: 1.25, deviceName: 'private' },
    modelStats: { meshCount: 20, triangles: 10000, privateName: 'private' },
    loadMetrics: { modelFetchMs: 65, firstInteractiveMs: 250, secret: 'private', edgeParseMs: Infinity }
  });
  recorder.recordLoadMetric('firstTechnicalMs', 4.123);
  recorder.recordLoadMetric('private', 123);
  const report = recorder.finish(), json = serializeBenchmark(report);
  assert.equal(report.mode, 'mixed'); assert.equal(report.quality, 'balanced');
  assert.deepEqual(report.viewport, { width: 1200, height: 800, pixelRatio: 1.25 });
  assert.deepEqual(report.loading, { modelFetchMs: 65, firstInteractiveMs: 250, firstTechnicalMs: 4.12 });
  assert.equal(json.includes('private'), false);
  assert.throws(() => serializeBenchmark(null), /required/);
});

test('long tasks are restricted to the run and pending observer records are flushed on finish', () => {
  let time = 100, observer;
  class FakeObserver {
    static supportedEntryTypes = ['longtask'];
    constructor(callback) { this.callback = callback; this.records = []; observer = this; }
    observe() {}
    takeRecords() { return this.records; }
    disconnect() { this.disconnected = true; }
  }
  const recorder = new BenchmarkRecorder({ now: () => time, document: null, PerformanceObserver: FakeObserver });
  recorder.begin();
  observer.callback({ getEntries: () => [{ startTime: 50, duration: 70 }, { startTime: 120, duration: 60 }] });
  observer.records = [{ startTime: 200, duration: 90 }];
  time = 300;
  const report = recorder.finish();
  assert.deepEqual(report.longTasks, { supported: true, count: 2, maxMs: 90, totalMs: 150 });
  assert.equal(observer.disconnected, true);
});

test('new runs reset old samples and cancelling cannot produce a successful result', () => {
  const { recorder, tick } = harness();
  recorder.begin(); tick(0, { moving: true }); tick(20, { moving: true });
  recorder.begin({ mode: 'technical', quality: 'performance' });
  tick(30, { moving: true }); tick(60, { moving: true });
  const report = recorder.cancel('user-input');
  assert.equal(report.status, 'cancelled'); assert.equal(report.reason, 'user-input');
  assert.equal(report.frames.motionIntervals, 1); assert.equal(report.frames.frameIntervalMs.p50, 30);
  assert.equal(recorder.finish(), report);
});

test('quality presets reduce GPU-facing resolution while leaving interaction policy outside rendering tiers', () => {
  const { performance: light, balanced, quality } = QUALITY_PROFILES;
  assert.ok(light.maxPixels < balanced.maxPixels && balanced.maxPixels < quality.maxPixels);
  assert.equal(light.aoScale, 0); assert.equal(balanced.aoScale, .5); assert.equal(quality.aoScale, 1);
  assert.equal(Object.isFrozen(balanced), true);
  assert.equal(Object.hasOwn(light, 'disablePicking'), false);
});

test('all render styles keep bounded pixel cost with sharper line sampling on small HiDPI displays', () => {
  const phone = { width: 390, height: 844, devicePixelRatio: 3 };
  assert.equal(renderPixelRatio({ ...phone, renderStyle: 'engineering' }), 1.25);
  for (const renderStyle of ['linework', 'flat', 'technical']) {
    assert.equal(renderPixelRatio({ ...phone, renderStyle }), 2);
    assert.equal(renderPixelRatio({ ...phone, renderStyle, quality: 'performance' }), 1);
  }
  for (const quality of Object.keys(QUALITY_PROFILES)) {
    for (const renderStyle of ['engineering', 'linework', 'flat']) {
      for (const [width, height] of [[390, 844], [1440, 900], [3840, 2160], [7680, 4320]]) {
        const ratio = renderPixelRatio({ width, height, devicePixelRatio: 3, quality, renderStyle });
        assert.ok(Math.floor(width * ratio) * Math.floor(height * ratio) <= QUALITY_PROFILES[quality].maxPixels);
        assert.ok(ratio > 0 && ratio <= 3);
      }
    }
  }
  const desktop = { width: 1440, height: 900, devicePixelRatio: 2 };
  assert.equal(renderPixelRatio({ ...desktop, renderStyle: 'engineering' }), renderPixelRatio({ ...desktop, renderStyle: 'linework' }));
});

test('render resolution falls back safely and cannot supersample a normal-DPR screen', () => {
  const viewport = { width: 390, height: 844, devicePixelRatio: 1 };
  assert.equal(renderPixelRatio({ ...viewport, renderStyle: 'flat' }), 1);
  assert.equal(renderPixelRatio({ ...viewport, renderStyle: 'invalid', quality: 'invalid', devicePixelRatio: 3 }), 1.25);
  for (const value of [0, -1, NaN, Infinity, '2']) {
    assert.equal(renderPixelRatio({ renderStyle: 'linework', width: value, height: value, devicePixelRatio: value }), 1);
  }
});

test('rendering reports preserve model identity and distinguish treatments from the standard motion scenario', () => {
  const { recorder, tick } = harness();
  for (const modelId of ['apollo', 'kinetic-01']) {
    for (const renderStyle of ['engineering', 'linework', 'flat']) {
      recorder.begin({ modelId, renderStyle, mode: renderStyle, loadMetrics: { firstLineworkMs: 12, firstFlatMs: 15, linePreparationMs: 40 } });
      tick(0, { moving: true, renderMs: 2, phase: 'orbit' });
      tick(20, { moving: true, renderMs: 2, phase: 'orbit' });
      const report = recorder.finish();
      assert.equal(report.modelId, modelId);
      assert.equal(report.scenario, `${modelId}-standard-v2`);
      assert.equal(report.renderStyle, renderStyle);
      assert.equal(report.mode, renderStyle);
      assert.equal(report.phases.orbit.count, 1);
      assert.deepEqual(report.loading, { firstLineworkMs: 12, firstFlatMs: 15, linePreparationMs: 40 });
    }
  }
});

test('legacy technical reports remain readable and arbitrary style/context values are excluded', () => {
  const { recorder } = harness();
  recorder.begin({ mode: 'technical' });
  const legacy = recorder.finish();
  assert.equal(legacy.mode, 'technical');
  assert.equal(legacy.renderStyle, 'linework');
  recorder.begin({ mode: 'material' });
  assert.equal(recorder.finish().renderStyle, 'engineering');
  recorder.begin({ modelId: 'https://private.invalid', mode: 'private', renderStyle: 'private' });
  const clean = recorder.finish();
  assert.equal(clean.modelId, 'apollo');
  assert.equal(clean.renderStyle, null);
  assert.equal(clean.mode, 'mixed');
  assert.equal(serializeBenchmark(clean).includes('private'), false);
});

test('batched line costs count submitted primitives separately from source geometry and idle frames', () => {
  const { recorder, tick } = harness();
  recorder.begin({ renderStyle: 'linework', modelStats: { meshCount: 801, edgeSegments: 407181, silhouetteSegments: 600000, lineBytes: 4096, surfaceBytes: 2048, paletteBytes: 102528, lineBatchCount: 3, activePartCount: 20, contextPartCount: 61, flatPartCount: 20, secret: 'private' } });
  tick(0, { moving: true, renderMs: 2, drawCalls: 3, triangles: 1800000, lines: 100 });
  tick(20, { moving: true, renderMs: 2, drawCalls: 3, triangles: 1800000, lines: 200 });
  tick(40, { moving: false, triangles: 9999999, lines: 9000 });
  const report = recorder.finish();
  assert.equal(report.linesPerRenderedFrame.count, 2);
  assert.equal(report.linesPerRenderedFrame.mean, 150);
  assert.equal(report.trianglesPerRenderedFrame.mean, 1800000);
  assert.deepEqual(report.model, { meshCount: 801, edgeSegments: 407181, silhouetteSegments: 600000, lineBytes: 4096, surfaceBytes: 2048, paletteBytes: 102528, lineBatchCount: 3, activePartCount: 20, contextPartCount: 61, flatPartCount: 20 });
  assert.equal(serializeBenchmark(report).includes('private'), false);
  recorder.begin();tick(60, { moving: true, renderMs: 2 });
  assert.equal(recorder.finish().linesPerRenderedFrame.count, 0);
});


test('adaptive quality requires 90 moving frames and at least 60 sustained slow intervals', () => {
  const budget = new AdaptiveBudget();
  for (let i = 0; i < 30; i++) assert.equal(budget.observe(16.7, true), false);
  for (let i = 0; i < 59; i++) assert.equal(budget.observe(40, true), false);
  assert.equal(budget.observe(40, true), true);
  assert.equal(budget.reduced, true);

  const mostlySmooth = new AdaptiveBudget();
  for (let i = 0; i < 31; i++) assert.equal(mostlySmooth.observe(16.7, true), false);
  for (let i = 0; i < 59; i++) assert.equal(mostlySmooth.observe(40, true), false);
  assert.equal(mostlySmooth.reduced, false, 'An insufficiently slow window must not lower quality');
});

test('idle gaps break sustained-motion evidence rather than accumulating unrelated slow interactions', () => {
  const budget = new AdaptiveBudget();
  for (let cycle = 0; cycle < 4; cycle++) {
    for (let i = 0; i < 89; i++) assert.equal(budget.observe(40, true), false);
    assert.equal(budget.observe(1000, false), false);
  }
  assert.equal(budget.reduced, false);
  for (let i = 0; i < 89; i++) assert.equal(budget.observe(40, true), false);
  assert.equal(budget.observe(40, true), true, 'A subsequent uninterrupted slow interval can still reduce quality');
});

test('startup spikes and invalid timings cannot cause an adaptive reduction', () => {
  for (const spike of [1001, Infinity, NaN, 0, -1]) {
    const budget = new AdaptiveBudget();
    for (let i = 0; i < 89; i++) assert.equal(budget.observe(40, true), false);
    assert.equal(budget.observe(spike, true), false);
    for (let i = 0; i < 89; i++) assert.equal(budget.observe(16.7, true), false);
    assert.equal(budget.reduced, false);
  }
  const ordinary = new AdaptiveBudget();
  for (let i = 0; i < 90; i++) assert.equal(ordinary.observe(i === 30 ? 400 : i === 60 ? 850 : 16.7, true), false);
  assert.equal(ordinary.reduced, false, 'Two isolated compilation spikes are not sustained load');
});

test('adaptive reduction occurs only once until explicitly reset and never oscillates back automatically', () => {
  const budget = new AdaptiveBudget();
  for (let i = 0; i < 89; i++) assert.equal(budget.observe(45, true), false);
  assert.equal(budget.observe(45, true), true);
  for (let i = 0; i < 360; i++) assert.equal(budget.observe(i < 180 ? 16.7 : 45, true), false);
  assert.equal(budget.reduced, true);
  budget.reset();
  assert.equal(budget.reduced, false);
  for (let i = 0; i < 89; i++) assert.equal(budget.observe(45, true), false);
  assert.equal(budget.observe(45, true), true);
});


test('sustained very slow moving frames still reduce quality instead of being discarded as startup stalls', () => {
  for (const interval of [250, 400, 1000]) {
    const budget = new AdaptiveBudget();
    for (let i = 0; i < 89; i++) assert.equal(budget.observe(interval, true), false);
    assert.equal(budget.observe(interval, true), true, `${interval} ms sustained motion`);
  }
});
