import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { materialSpec as sharedMaterialSpec, FINISHES, technicalSpec } from '../../src/explorer/appearance.js';
import { materialSpec as approvedLatchFinish, PALETTES } from '../fixtures/latch/appearance.js';
import { CLIENT_THEMES, resolveTheme, themeRoles } from '../../src/explorer/themes.js';

import { APOLLO_POLICY } from '../fixtures/apollo-policy.js';
const materialSpec = record => sharedMaterialSpec(record, APOLLO_POLICY);

const metadata = JSON.parse(fs.readFileSync(new URL('../../content/models/apollo/metadata.json', import.meta.url)));
const glb = fs.readFileSync(new URL('../../content/models/apollo/apollo-hatch.glb', import.meta.url));
const asset = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
const sourceMaterials = new Map(asset.nodes.filter(node => node.mesh !== undefined).map(node => [node.name,
  asset.materials[asset.meshes[node.mesh].primitives[0].material].name]));
const recordFor = part => ({ ...part, sourceMaterial: sourceMaterials.get(part.meshName) });
const channels = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const luminance = rgb => rgb.reduce((sum, channel, i) => {
  const value = channel / 255, linear = value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  return sum + linear * [.2126, .7152, .0722][i];
}, 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);

test('every actual source mesh receives a finite finish without changing its source identity', () => {
  const families = new Set();
  for (const part of metadata.parts) {
    const record = Object.freeze(recordFor(part));
    const finish = materialSpec(record); families.add(finish.family);
    assert.equal(finish.sourceMaterial, sourceMaterials.get(part.meshName));
    assert.equal(finish.illustrative, true);
    assert.match(finish.color, /^#[a-f0-9]{6}$/);
    for (const value of [finish.metalness, finish.roughness]) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
    assert.deepEqual(materialSpec(record), finish);
  }
  assert.deepEqual([...families].sort(), Object.keys(FINISHES).sort());
});

test('all fifteen latch assemblies preserve the approved body, block and hardware treatment', () => {
  const latches = metadata.groups.find(group => group.id === 'latches').children;
  assert.equal(latches.length, 15);
  for (const latch of latches) {
    const parts = metadata.parts.filter(part => latch.meshNames.includes(part.meshName));
    assert.equal(parts.length, 20);
    const families = parts.map(part => materialSpec(recordFor(part)).family);
    assert.equal(families.filter(family => family === 'machined').length, 1, latch.id);
    assert.equal(families.filter(family => family === 'polished').length, 7, latch.id);
    assert.equal(families.filter(family => family === 'satin').length, 12, latch.id);
  }
  const reviewed = metadata.parts.filter(part => part.subgroup === 'latch-body1-1-003');
  for (const part of reviewed) {
    const actual = materialSpec(recordFor(part));
    const approved = approvedLatchFinish('Brushed steel', part.meshName);
    for (const field of ['family', 'label', 'color', 'metalness', 'roughness']) assert.equal(actual[field], approved[field], `${part.meshName}: ${field}`);
  }
});

test('non-steel source categories retain distinct finishes and are not overwritten by group curation', () => {
  const expected = { 'Polymer and seals': 'polymer', 'Window glass': 'glass', 'Bronze bearing': 'bronze', 'Release indicator': 'indicator', 'Polished steel': 'polished' };
  for (const [sourceMaterial, family] of Object.entries(expected)) {
    for (const group of ['latches', 'gearbox', 'shell', 'linkages']) {
      assert.equal(materialSpec({ group, sourceName: 'Body1:1.003', sourceMaterial }).family, family);
    }
  }
  assert.equal(materialSpec({ sourceMaterial: 'Brushed steel', group: 'gearbox' }).family, 'machined');
  assert.equal(materialSpec({ sourceMaterial: 'Brushed steel', group: 'linkages', sourceName: 'Body1:1.003' }).family, 'satin');
});

test('unknown source records remain neutral and technical mode cannot erase the engineering definitions', () => {
  for (const input of [null, {}, { sourceMaterial: '__proto__' }, { sourceMaterial: 'constructor' }, { sourceMaterial: 'Unknown' }]) {
    assert.equal(materialSpec(input).family, 'satin');
  }
  const before = JSON.stringify(FINISHES), technical = technicalSpec();
  technical.color = '#ffffff';
  assert.equal(JSON.stringify(FINISHES), before);
  assert.equal(technicalSpec().color, '#15171b');
});

test('the approved ten fluorescent presets retain Ember and raw renderer colors without gamma styling', () => {
  assert.deepEqual(CLIENT_THEMES, PALETTES);
  assert.equal(resolveTheme().id, 'ember');
  for (const theme of CLIENT_THEMES) {
    const roles = themeRoles(theme);
    assert.equal(roles.outline, theme.accent);
    const expected = channels(theme.accent).map(channel => { const c = channel / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
    expected.forEach((value, i) => assert.ok(Math.abs(value - roles.outlineLinear[i]) < 1e-9));
  }
});

test('accent content remains readable on both normal and selected presentation surfaces', () => {
  for (const theme of [...CLIENT_THEMES, resolveTheme('custom', '#000000'), resolveTheme('custom', '#190818')]) {
    const roles = themeRoles(theme), accent = channels(roles.accent), text = channels(roles.content);
    for (const panel of ['#211e24', '#2b292b'].map(channels)) for (const alpha of [0, .10, .16]) {
      const background = accent.map((c, i) => c * alpha + panel[i] * (1 - alpha));
      assert.ok(contrast(text, background) >= 4.5, `${theme.id} / ${alpha}`);
    }
  }
});
