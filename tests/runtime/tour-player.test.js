import test from 'node:test';
import assert from 'node:assert/strict';
import { TourPlayer } from '../../src/explorer/tour-player.js';
import { TOUR_CATALOG, sampleTour } from '../fixtures/baseline-catalog.js';

const example = { duration: 6, chapters: [{ id: 'first', duration: 2 }, { id: 'second', duration: 3 }, { id: 'third', duration: 1 }] };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('a tour requires explicit start and completes once without looping', () => {
  const player = new TourPlayer(example);
  assert.equal(player.state().status, 'idle');
  assert.equal(player.tick(0), false); player.tick(500); near(player.state().time, 0);
  player.start(); player.tick(0);
  for (let ms = 500; ms <= 6500; ms += 500) player.tick(ms);
  assert.equal(player.state().status, 'completed'); near(player.state().time, 6);
  assert.equal(player.state().index, 2); assert.equal(player.tick(7000), false);
  player.resume(); assert.equal(player.state().status, 'completed');
  player.replay(); assert.equal(player.state().status, 'playing'); near(player.state().time, 0);
});

test('pause and takeover retain position and resume establish a fresh clock', () => {
  const player = new TourPlayer(example);
  player.start(); player.tick(100); player.tick(600); near(player.state().time, .5);
  player.pause('takeover'); player.tick(1200);
  assert.equal(player.state().reason, 'takeover'); near(player.state().time, .5);
  player.resume(); player.tick(10000); near(player.state().time, .5);
  player.tick(10500); near(player.state().time, 1);
  player.stop(); assert.equal(player.state().status, 'idle'); near(player.state().time, 0);
});

test('hiding pauses the explanation and returning never silently resumes', () => {
  const player = new TourPlayer(example);
  player.start(); player.tick(0); player.tick(200);
  player.setVisibility(true); player.tick(50000);
  assert.equal(player.state().status, 'paused'); assert.equal(player.state().reason, 'hidden');
  player.resume(); assert.equal(player.state().status, 'paused'); near(player.state().time, .2);
  player.setVisibility(false); player.tick(90000); near(player.state().time, .2);
  assert.equal(player.state().status, 'paused');
  player.resume(); player.tick(100000); player.tick(100500); near(player.state().time, .7);
});

test('stalled frames, backwards timestamps and invalid timestamps cannot jump a chapter', () => {
  const player = new TourPlayer(example);
  player.start(); player.tick(0); player.tick(200); player.tick(5000); near(player.state().time, .2);
  player.tick(5200); near(player.state().time, .4);
  player.tick(5100); near(player.state().time, .4);
  player.tick(NaN); player.tick(5400); near(player.state().time, .4);
  player.tick(5500); near(player.state().time, .5);
});

test('chapter jumps are exact, paused and reversible; seek is in seconds', () => {
  const player = new TourPlayer(example);
  player.start(); player.next();
  assert.equal(player.state().status, 'paused'); assert.equal(player.state().index, 1); near(player.state().time, 2);
  player.next(); assert.equal(player.state().index, 2); near(player.state().time, 5);
  player.previous(); near(player.state().time, 2);
  player.seek(4.75); assert.equal(player.state().index, 1); near(player.state().time, 4.75);
  player.seek(Infinity); near(player.state().time, 4.75);
  player.seek(-10); near(player.state().time, 0);
  player.previous(); near(player.state().time, 0);
  player.seek(99); assert.equal(player.state().status, 'completed'); near(player.state().progress, 1);
});

test('reduced motion presents settled chapters without autoplay or a moving operation', () => {
  const tour = TOUR_CATALOG['kinetic-01'];
  const player = new TourPlayer(tour, { reducedMotion: true });
  player.start(); assert.equal(player.state().status, 'paused'); assert.equal(player.state().reason, 'reduced-motion');
  player.tick(0); player.tick(500); near(player.state().time, 0);
  player.next(); let state = player.state();
  assert.equal(state.settled, true);
  near(sampleTour(tour, state.time, { settled: state.settled }).explosion, .62);
  player.seek(tour.chapters[4].start); state = player.state();
  near(sampleTour(tour, state.time, { settled: state.settled }).operationProgress, .25);
  player.resume(); assert.equal(player.state().status, 'paused');
  player.seek(tour.chapters[5].start); player.next(); assert.equal(player.state().status, 'completed');
});

test('invalid timelines fail before the renderer receives ambiguous chapter timing', () => {
  for (const tour of [null, { chapters: [] }, { duration: 0, chapters: [{ duration: 0 }] }, { duration: 3, chapters: [{ duration: 1 }] }]) {
    assert.throws(() => new TourPlayer(tour), TypeError);
  }
});
