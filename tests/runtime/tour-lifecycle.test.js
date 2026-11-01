import test from 'node:test';
import assert from 'node:assert/strict';
import { GuidedTour } from '../../src/explorer/tour-ui.js';
import { TOUR_CATALOG } from '../fixtures/baseline-catalog.js';

class Element extends EventTarget {
  constructor() { super(); this.children = []; this.dataset = {}; this.style = { setProperty() {} }; this.attributes = new Map(); this.hidden = true; this.textContent = ''; this.added = 0; this.removed = 0; this.classList = { add() {}, remove() {} }; }
  addEventListener(...args) { this.added++; return super.addEventListener(...args); }
  removeEventListener(...args) { this.removed++; return super.removeEventListener(...args); }
  querySelector(selector) { this.descendants ??= new Map(); if (!this.descendants.has(selector)) this.descendants.set(selector, new Element()); return this.descendants.get(selector); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  contains(node) { return node === this || this.children.includes(node); }
  focus() {}
}
function setup(t, prepareEdges, extra = {}) {
  const document = new Element(), elements = new Map(), motion = new Element(); motion.matches = false;
  document.body = new Element(); document.getElementById = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  document.createElement = () => new Element();
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  globalThis.document = document; globalThis.matchMedia = () => motion;
  t.after(() => Object.assign(globalThis, previous));
  const calls = [];
  const scene = { ready: true, prepareEdges, capturePresentation() { calls.push('capture'); }, cancelPresentationRequest() { calls.push('cancel'); }, pausePresentation() { calls.push('pause'); }, leaveTour() { calls.push('leave'); }, restorePresentation: async () => true, refitLayout() { calls.push('refit'); } };
  const tour = new GuidedTour({ scene, model: { id: 'kinetic-01', tour: TOUR_CATALOG['kinetic-01'] }, captureNavigation() { calls.push('navigation'); }, restoreNavigation() { calls.push('restore'); }, syncScene() { calls.push('sync'); }, closeOverlays() {}, ...extra });
  return { tour, scene, document, motion, elements, calls };
}

test('disposing while tour preparation waits removes listeners and cannot start late', async t => {
  let ready; const fixture = setup(t, () => new Promise(resolve => { ready = resolve; }));
  const { tour, elements, document, motion, calls } = fixture;
  const start = tour.start(); assert.equal(tour.pending, true);
  tour.dispose(); assert.equal(await start, false); tour.dispose();
  elements.get('tour-start').querySelector('span').textContent = 'Replacement instance';
  ready(); await Promise.resolve();
  assert.equal(tour.active, false); assert.equal(tour.pending, false); assert.deepEqual(calls, ['cancel']);
  assert.equal(elements.get('tour-start').querySelector('span').textContent, 'Replacement instance');
  assert.equal(document.added, document.removed); assert.equal(motion.added, motion.removed);
  for (const element of elements.values()) assert.equal(element.added, element.removed);
  for (const chapter of elements.get('tour-chapters').children) assert.equal(chapter.added, chapter.removed);
  document.dispatchEvent(new Event('visibilitychange')); motion.dispatchEvent(new Event('change'));
  assert.equal(tour.active, false);
});

test('cancelling a pending start allows a later request without the stale finally changing its UI', async t => {
  const ready = []; const { tour, elements } = setup(t, () => new Promise(resolve => ready.push(resolve)));
  const first = tour.start(); tour.cancelPending(); assert.equal(await first, false);
  const second = tour.start(); ready[0](); await Promise.resolve();
  assert.equal(tour.pending, true); assert.equal(elements.get('tour-start').disabled, true);
  tour.dispose(); assert.equal(await second, false); ready[1]();
});

test('disposing during exit restoration prevents navigation and UI commits', async t => {
  const { tour, scene, calls } = setup(t, async () => {}); let restore;
  scene.restorePresentation = () => new Promise(resolve => { restore = resolve; });
  tour.active = true; tour.snapshot = {}; tour.navigation = {};
  const exit = tour.exit(); tour.dispose(); assert.equal(await exit, false);
  restore(true); await Promise.resolve();
  assert(!calls.includes('restore')); assert(!calls.includes('sync')); assert(!calls.includes('refit'));
  assert(calls.includes('cancel'));
});

test('DOM transport actions route through the injected command boundary', async t => {
  const commands = []; const { tour, elements } = setup(t, async () => {}, { command(method, params) { commands.push({ method, params }); } });
  elements.get('tour-start').dispatchEvent(new Event('click'));
  elements.get('tour-next').dispatchEvent(new Event('click'));
  elements.get('tour-explore').dispatchEvent(new Event('click'));
  assert.equal(commands[0].method, 'startTour'); assert.equal(commands[0].params.tourId, tour.tour.id);
  assert.deepEqual(commands[1], { method: 'goToTourChapter', params: { chapterId: tour.tour.chapters[1].id } });
  assert.deepEqual(commands[2], { method: 'exitTour', params: { restore: false } });
  tour.dispose();
});

test('a cancelled replay seek cannot restart playback after a newer intent', async t => {
  const commands = []; let resolve;
  const { tour, elements } = setup(t, async () => {}, { command(method) { commands.push(method); return new Promise(done => { resolve = done; }); } });
  tour.active = true;
  elements.get('tour-replay').dispatchEvent(new Event('click'));
  resolve({ payload: { status: 'cancelled' } }); await Promise.resolve();
  assert.deepEqual(commands, ['seekTour']);
  elements.get('tour-replay').dispatchEvent(new Event('click'));
  tour.intent++;
  resolve({ payload: { status: 'completed' } }); await Promise.resolve();
  assert.deepEqual(commands, ['seekTour', 'seekTour']);
  tour.dispose();
});
