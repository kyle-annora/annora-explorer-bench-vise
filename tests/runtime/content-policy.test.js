import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHierarchy, createOffsets } from '../../src/explorer/model-state.js';
import { materialSpec } from '../../src/explorer/appearance.js';
import { MODEL_CATALOG } from '../fixtures/baseline-catalog.js';
import { contentRevision } from '../fixtures/content-revision.mjs';

test('an unrelated package may reuse Apollo-like names without acquiring Apollo behavior', () => {
  const metadata = {
    root: { id: 'hatch', title: 'Independent fixture' },
    groups: [{ id: 'latches', meshNames: ['one'] }],
    parts: [{ id: 'part', meshName: 'one', group: 'latches', sourceName: 'Body1:1.003', center: [0, 0, 0], explode: [0, 0, 2] }],
  };
  const { root, nodes } = buildHierarchy(metadata);
  assert.equal(root.title, 'Independent fixture');
  assert.equal(root.description, undefined);
  assert.deepEqual(createOffsets(metadata.parts, nodes, root.id, 1).get('one'), [0, 0, 2]);
  assert.equal(materialSpec({ ...metadata.parts[0], sourceMaterial: 'Brushed steel' }).family, 'satin');
  assert.equal(materialSpec({ group: 'gearbox', sourceMaterial: 'Brushed steel' }).family, 'satin');
  assert.throws(() => buildHierarchy({ ...metadata, root: undefined }), /root identity/);
});

for (const model of Object.values(MODEL_CATALOG)) {
  test(`${model.id}: public revision identifies exact prepared content and authored policy`, async () => {
    assert.equal(model.packageId, model.id);
    assert.equal(model.revision, await contentRevision(model));
    assert.notEqual(model.revision, await contentRevision({ ...model, normalizeWidth: model.normalizeWidth + .1 }));
  });
}
