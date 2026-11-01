import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOUR_CATALOG, sampleTour } from '../fixtures/baseline-catalog.js';
import { MODEL_CATALOG } from '../fixtures/baseline-catalog.js';
import { buildHierarchy } from '../../src/explorer/model-state.js';

const metadata = {
  apollo: JSON.parse(readFileSync(new URL('../../content/models/apollo/metadata.json', import.meta.url))),
  'kinetic-01': JSON.parse(readFileSync(new URL('../../content/models/kinetic-01/metadata.json', import.meta.url))),
};
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

for (const [id, tour] of Object.entries(TOUR_CATALOG)) {
  test(`${id}: six chapters total sixty seconds with bounded, ordered cues and usable inspection previews`, () => {
    assert.equal(tour.chapters.length, 6); assert.equal(tour.duration, 60);
    let end = 0;
    for (const chapter of tour.chapters) {
      near(chapter.start, end); end = chapter.end;
      assert.ok(chapter.previewAt >= 0 && chapter.previewAt < chapter.duration);
      let last = -1;
      for (const cue of chapter.cues) {
        assert.ok(cue.at > last && cue.at < chapter.duration); last = cue.at;
      }
      const preview = sampleTour(tour, chapter.start + chapter.previewAt);
      assert.ok(preview.caption.length > 0, `${chapter.id}: a paused chapter needs an explanation`);
      assert.equal(preview.index, tour.chapters.indexOf(chapter));
    }
    near(end, tour.duration);
  });

  test(`${id}: all sampled identities and poses stay valid, with one highlight and compact copy`, () => {
    const { nodes } = buildHierarchy(metadata[id], MODEL_CATALOG[id].presentationPolicy);
    for (let t = 0; t <= tour.duration; t += .05) {
      for (const settled of [false, true]) {
        const frame = sampleTour(tour, t, { settled });
        for (const nodeId of [frame.scopeId, frame.selectedId, frame.camera.focusId, ...frame.highlightIds, ...frame.annotations.map(a => a.nodeId)]) {
          assert.ok(nodes.has(nodeId), `${id} at ${t}: unknown node ${nodeId}`);
        }
        assert.ok(frame.camera.direction.every(Number.isFinite)); assert.ok(frame.camera.scale >= 1);
        assert.ok(frame.explosion >= 0 && frame.explosion <= 1);
        assert.ok(frame.chapterProgress >= 0 && frame.chapterProgress <= 1);
        assert.ok(frame.title.length <= 26); assert.ok(frame.caption.length <= 80);
        assert.ok(frame.annotations.length <= 2); assert.ok(frame.highlightIds.length <= 1);
        if (frame.operationProgress !== null) {
          assert.equal(frame.explosion, 0); assert.equal(frame.scopeId, 'kinetic-01');
          assert.ok(frame.operationProgress >= 0 && frame.operationProgress <= 1);
        }
        for (const annotation of frame.annotations.filter(a => a.motion)) {
          assert.ok(['rotate', 'linear'].includes(annotation.motion));
          assert.deepEqual(frame.highlightIds, [annotation.nodeId]);
        }
      }
    }
  });

  test(`${id}: cue sampling is deterministic under reverse seek and does not expose shared mutable frame values`, () => {
    const chapter = tour.chapters[2], time = chapter.start + chapter.previewAt;
    const expected = sampleTour(tour, time), changed = sampleTour(tour, time);
    changed.camera.direction[0] = 999; changed.highlightIds.push('invalid'); changed.annotations[0].label = 'changed';
    sampleTour(tour, tour.duration); sampleTour(tour, 0);
    assert.deepEqual(sampleTour(tour, time), expected); assert.deepEqual(sampleTour(id, time), expected);
    const forward = Array.from({ length: tour.duration * 4 + 1 }, (_, index) => sampleTour(tour, index / 4));
    for (let index = forward.length - 1; index >= 0; index--) assert.deepEqual(sampleTour(tour, index / 4), forward[index]);
    assert.equal(sampleTour(tour, tour.duration).index, 5);
    assert.equal(sampleTour(tour, -1).time, 0); assert.equal(sampleTour(tour, Infinity).time, 0);
  });

  test(`${id}: camera establishment precedes its first highlight and caption`, () => {
    for (const chapter of tour.chapters) {
      const initial = sampleTour(tour, chapter.start);
      assert.equal(initial.caption, ''); assert.deepEqual(initial.highlightIds, []);
      const firstCaption = chapter.cues.find(cue => cue.caption);
      const captionFrame = sampleTour(tour, chapter.start + firstCaption.at);
      assert.ok(captionFrame.caption.length);
      assert.equal(sampleTour(tour, chapter.start + firstCaption.at - .001).caption, '');
      const firstHighlight = chapter.cues.find(cue => cue.highlightIds?.length);
      if (firstHighlight) assert.ok(firstCaption.at > firstHighlight.at);
    }
  });

  test(`${id}: scope changes follow reassembly and the ending restores the whole engineering model`, () => {
    for (const chapter of tour.chapters) {
      for (const cue of chapter.cues.filter(cue => cue.scopeId)) {
        const before = sampleTour(tour, chapter.start + cue.at - .001);
        const after = sampleTour(tour, chapter.start + cue.at);
        assert.equal(before.explosion, 0); assert.equal(after.explosion, 0); assert.equal(after.scopeId, cue.scopeId);
      }
    }
    const initial = sampleTour(tour, 0), final = sampleTour(tour, tour.duration);
    assert.equal(final.scopeId, initial.scopeId); assert.equal(final.selectedId, initial.selectedId);
    assert.equal(final.explosion, 0); assert.equal(final.operationProgress, null);
    assert.equal(final.technical, false); assert.deepEqual(final.camera, initial.camera);
  });
}

test('Kinetic begins source motion at 24.5 seconds and completes two retained source cycles', () => {
  const tour = TOUR_CATALOG['kinetic-01'], cycle = tour.chapters.find(chapter => chapter.operation);
  assert.equal(cycle.start, 23); assert.equal(cycle.operation.clipName, metadata['kinetic-01'].operation.clipName);
  assert.equal(cycle.operation.sourceDuration, metadata['kinetic-01'].operation.duration);
  assert.equal(cycle.operation.passes.length, 2);
  assert.equal(sampleTour(tour, 24.5).operationProgress, 0);
  assert.ok(sampleTour(tour, 24.6).operationProgress > 0);
  for (const pass of cycle.operation.passes) {
    near(pass.keyframes[0].progress, 0); near(pass.keyframes.at(-1).progress, 1);
    near(pass.keyframes.at(-1).at, pass.duration);
    for (const point of pass.keyframes) {
      const frame = sampleTour(tour, cycle.start + pass.start + point.at);
      near(frame.operationProgress, point.progress); assert.equal(frame.operationPass, pass.id);
    }
  }
  assert.equal(sampleTour(tour, cycle.start - .001).operationProgress, null);
  assert.equal(sampleTour(tour, cycle.end).operationProgress, null);
});

test('the coached reversal holds exact source pose while the continuous pass has constant unbroken speed', () => {
  const tour = TOUR_CATALOG['kinetic-01'];
  for (const time of [36.5, 37, 37.99]) {
    const frame = sampleTour(tour, time); near(frame.operationProgress, .5); assert.equal(frame.operationHeld, true);
    assert.deepEqual(frame.highlightIds, ['carriage']);
  }
  assert.equal(sampleTour(tour, 38).operationHeld, false);
  for (const progress of [0, .125, .25, .5, .75, .999]) {
    const frame = sampleTour(tour, 45 + progress * 8);
    near(frame.operationProgress, progress); assert.equal(frame.operationHeld, false);
    assert.equal(frame.operationPass, 'continuous'); assert.deepEqual(frame.highlightIds, []); assert.deepEqual(frame.annotations, []);
    assert.equal(frame.caption, 'One turn. One out-and-back cycle.');
  }
  near(sampleTour(tour, 53).operationProgress, 1);
});

test('both operating passes keep one camera, scope and chapter key across all cues', () => {
  const tour = TOUR_CATALOG['kinetic-01'], first = sampleTour(tour, 23);
  for (let time = 23; time < 54; time += .125) {
    const frame = sampleTour(tour, time);
    assert.deepEqual(frame.camera, first.camera); assert.equal(frame.scopeId, first.scopeId);
    assert.equal(frame.key, first.key); assert.equal(frame.explosion, 0);
    assert.equal(frame.renderStyle, time < 23.4 ? 'linework' : time < 44 ? 'flat' : 'engineering');
  }
});

test('chapter previews resume from their real timestamp; reduced motion uses a meaningful fixed pose', () => {
  const tour = TOUR_CATALOG['kinetic-01'], cycle = tour.chapters[4];
  const preview = sampleTour(tour, cycle.start + cycle.previewAt);
  assert.equal(preview.caption, 'The crank turns.'); near(preview.operationProgress, 0);
  assert.deepEqual(sampleTour(tour, preview.time), preview);
  const settled = sampleTour(tour, cycle.start, { settled: true });
  near(settled.operationProgress, .25); assert.equal(settled.operationHeld, true);
  assert.equal(settled.caption, 'The rod transfers the motion.');
  const latch = TOUR_CATALOG.apollo.chapters[4];
  near(sampleTour(TOUR_CATALOG.apollo, latch.start, { settled: true }).explosion, .48);
});

test('Apollo remains structural and never fabricates source operation', () => {
  assert.equal(metadata.apollo.operation, undefined);
  const tour = TOUR_CATALOG.apollo;
  assert.equal(tour.chapters.some(chapter => chapter.operation), false);
  for (let time = 0; time <= tour.duration; time += .25) assert.equal(sampleTour(tour, time).operationProgress, null);
});

for (const id of Object.keys(TOUR_CATALOG)) {
  test(`${id}: rendering is explicit, pure and flat views retain exact highlighted groups`, () => {
    const seen = new Set();
    for (let t=0;t<=60;t+=.05) {
      const frame=sampleTour(id,t);seen.add(frame.renderStyle);
      assert.ok(['engineering','linework','flat'].includes(frame.renderStyle));
      assert.equal(frame.technical,frame.renderStyle!=='engineering');
      if(frame.renderStyle==='flat')assert.equal(frame.highlightIds.length,1);
    }
    assert.deepEqual([...seen].sort(),['engineering','flat','linework']);
    assert.equal(sampleTour(id,60).renderStyle,'engineering');
  });
}
