import test from 'node:test';
import assert from 'node:assert/strict';
import { featurePolicy, intersectCapabilities } from '../src/explorer/project-features.js';
import { openingTheme, preferenceNamespace } from '../src/explorer/project-brand.js';
import { ExplorerController } from '../src/explorer/controller.js';

const project = () => ({ id: 'own-project', brand: { accent: '#ff6840' }, features: { explode: false, operation: false, tour: true, themes: false, quality: false, renderStyles: ['engineering'] } });
const model = () => ({ id: 'machine', rootId: 'root', packageId: 'machine', revision: 'sha256:fixture', capabilities: { operation: true, renderStyles: ['engineering', 'linework', 'flat'] }, operationClipId: 'Motion', tour: { id: 'walkthrough', title: 'Tour', duration: 5, chapters: [{ renderStyle: 'engineering', explosion: [0, 1], operation: { clipName: 'Motion' } }] } });

test('a tour cannot introduce rendering, explosion or operation disabled by the project', () => {
  const p = project(), m = model(); assert.deepEqual(featurePolicy(p, m).tours, []);
  p.features.explode = true; p.features.operation = true; assert.deepEqual(featurePolicy(p, m).tours, ['walkthrough']);
  m.tour.chapters[0].cues = [{ renderStyle: 'flat' }]; assert.deepEqual(featurePolicy(p, m).tours, []);
  p.features.renderStyles.push('flat'); assert.deepEqual(featurePolicy(p, m).tours, ['walkthrough']); p.features.tour = false; assert.deepEqual(featurePolicy(p, m).tours, []);
});
test('host policy may narrow configured capabilities but cannot widen them', () => {
  const policy = featurePolicy(project(), model());
  const enabled = intersectCapabilities(policy, { operation: true, themes: true, modes: ['explore', 'explode', 'operate'], renderStyles: ['flat', 'engineering'], qualityProfiles: ['quality'], tours: ['walkthrough'] });
  assert.equal(enabled.operation, false); assert.equal(enabled.themes, false); assert.deepEqual(enabled.modes, ['explore']); assert.deepEqual(enabled.renderStyles, ['engineering']); assert.deepEqual(enabled.qualityProfiles, []); assert.deepEqual(enabled.tours, []);
});
test('host narrowing also disables tours that would restore a forbidden presentation', () => {
  const m = model(), p = project(); p.features.operation = p.features.explode = true; m.allowedCapabilities = featurePolicy(p, m);
  const controller = new ExplorerController({ model: m, port: {}, enabled: { modes: ['explore'] } });
  assert.equal(controller.getCapabilities().tours.enabled, false);
  m.tour.chapters[0] = { renderStyle: 'linework' }; p.features.renderStyles.push('linework'); m.allowedCapabilities = featurePolicy(p, m);
  const styles = new ExplorerController({ model: m, port: {}, enabled: { renderStyles: ['engineering'] } });
  assert.equal(styles.getCapabilities().tours.enabled, false);
});
test('disabled themes ignore URL and saved preferences; project preference keys are isolated', () => {
  const p = project(); assert.equal(openingTheme(p, new URLSearchParams('theme=custom&accent=%2300ff00'), { id: 'custom', accent: '#0000ff' }).accent, '#ff6840');
  assert.notEqual(preferenceNamespace(p), preferenceNamespace({ ...p, id: 'other-project' })); p.brand.accent = '#aa66ff'; assert.equal(openingTheme(p, new URLSearchParams(), null).accent, '#aa66ff');
});
test('the command boundary rejects every disabled feature even when a host requests it enabled', async () => {
  const m = model(); m.allowedCapabilities = featurePolicy(project(), m);
  const scene = { ready: true, mode: 'explore', scopeId: 'root', selectedId: 'root', fraction: 0, explosionTarget: 0, renderStyle: 'engineering', movingMeshes: [], operationConfig: { clip: 'Motion' }, getOperationState: () => ({ available: true, playing: false, progress: 0, speed: 1 }) };
  const controller = new ExplorerController({ model: m, port: { getScene: () => scene, getHierarchy: () => ({ nodes: new Map([['root', { id: 'root', children: [], meshNames: [] }]]) }) }, enabled: { operation: true, themes: true, renderStyles: ['engineering', 'linework', 'flat'], modes: ['explore', 'explode', 'operate'], qualityProfiles: ['quality'], tours: ['walkthrough'] } });
  controller.setLifecycle('loading'); controller.setLifecycle('ready'); let id = 0;
  for (const [method, params] of [['setMode', { mode: 'explode' }], ['setExplosion', { progress: 1 }], ['setMode', { mode: 'operate' }], ['playOperation', {}], ['seekOperation', { progress: .5 }], ['setRenderStyle', { style: 'flat' }], ['setTheme', { themeId: 'ember' }], ['setQuality', { profile: 'quality' }], ['startTour', { tourId: 'walkthrough' }]]) {
    const result = await controller.request({ requestId: `policy-${++id}`, method, params }); assert.equal(result.payload.error?.code, 'UNSUPPORTED_ACTION', method);
  }
});
