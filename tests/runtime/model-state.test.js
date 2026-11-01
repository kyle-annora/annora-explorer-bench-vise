import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ancestors, buildHierarchy, childForMesh, createOffsets, positionAt } from '../../src/explorer/model-state.js';

import { APOLLO_POLICY } from '../fixtures/apollo-policy.js';

const metadata = JSON.parse(readFileSync(new URL('../../content/models/apollo/metadata.json', import.meta.url), 'utf8'));
const { root, nodes } = buildHierarchy(metadata, APOLLO_POLICY);
const meshNames = metadata.parts.map(part => part.meshName);
const sorted = values => [...values].sort();

test('every source mesh appears once in the root and once as a component leaf', () => {
  assert.equal(meshNames.length, metadata.stats.meshCount);
  assert.equal(new Set(meshNames).size, meshNames.length);
  assert.deepEqual(sorted(root.meshNames), sorted(meshNames));
  const leaves = [...nodes.values()].filter(node => node.type === 'component');
  assert.equal(leaves.length, meshNames.length);
  assert.deepEqual(sorted(leaves.flatMap(node => node.meshNames)), sorted(meshNames));
  for (const leaf of leaves) assert.equal(leaf.meshNames.length, 1, leaf.id);
});

test('the hierarchy is connected, acyclic, and each child belongs to exactly one parent', () => {
  const visited = new Set();
  function visit(node) {
    assert.ok(!visited.has(node.id), `Duplicate or cyclic node: ${node.id}`);
    visited.add(node.id);
    assert.equal(new Set(node.children).size, node.children.length, node.id);
    for (const childId of node.children) {
      const child = nodes.get(childId);
      assert.ok(child, `Missing child: ${childId}`);
      assert.equal(child.parent, node.id, childId);
      visit(child);
    }
  }
  visit(root);
  assert.equal(visited.size, nodes.size, 'No orphan nodes');
});

test('children partition each assembly without missing or overlapping pick targets', () => {
  for (const node of nodes.values()) {
    if (!node.children.length) continue;
    const childMeshes = node.children.flatMap(id => nodes.get(id).meshNames);
    assert.equal(new Set(childMeshes).size, childMeshes.length, `Overlapping children: ${node.id}`);
    assert.deepEqual(sorted(childMeshes), sorted(node.meshNames), `Incomplete branch: ${node.id}`);
  }
});

test('every source mesh drills through immediate children to its own leaf and back', () => {
  for (const meshName of meshNames) {
    let current = root;
    const walked = [root.id];
    while (current.children.length) {
      const next = childForMesh(nodes, current.id, meshName);
      assert.ok(current.children.includes(next.id), `${meshName} is stuck at ${current.id}`);
      current = next;
      walked.push(current.id);
      assert.ok(walked.length <= 8, 'Unexpected hierarchy cycle or depth');
    }
    assert.deepEqual(current.meshNames, [meshName]);
    assert.deepEqual(ancestors(nodes, current.id).map(node => node.id), walked);
    assert.equal(childForMesh(nodes, current.id, meshName).id, current.id);
  }
});

test('explosion offsets cover every mesh with finite, deterministic three-dimensional vectors', () => {
  for (const node of nodes.values()) {
    if (node.type === 'component') continue;
    const offsets = createOffsets(metadata.parts, nodes, node.id, .1, APOLLO_POLICY);
    assert.deepEqual(sorted(offsets.keys()), sorted(meshNames));
    for (const [name, offset] of offsets) {
      assert.equal(offset.length, 3, `${node.id}/${name}`);
      assert.ok(offset.every(Number.isFinite), `${node.id}/${name}`);
    }
    assert.deepEqual(offsets, createOffsets(metadata.parts, nodes, node.id, .1, APOLLO_POLICY));
  }
});

test('exploding a branch keeps contextual meshes outside that branch assembled', () => {
  for (const node of nodes.values()) {
    if (node.id === root.id || node.type === 'component') continue;
    const included = new Set(node.meshNames);
    const offsets = createOffsets(metadata.parts, nodes, node.id, .1, APOLLO_POLICY);
    for (const part of metadata.parts) {
      if (included.has(part.meshName)) continue;
      assert.deepEqual(offsets.get(part.meshName), [0, 0, 0], `Context moved in ${node.id}: ${part.meshName}`);
    }
  }
});

test('interrupted, reversed, and scope-switched explosion always returns exactly to source pose', () => {
  const sourceBefore = JSON.stringify(metadata);
  const sequence = [['hatch', 1], ['hatch', .31], ['handle', .72], ['latches', .15], ['hatch', .93], ['hatch', 0]];
  const offsetMaps = new Map(sequence.map(([scopeId]) => [scopeId, createOffsets(metadata.parts, nodes, scopeId, .1, APOLLO_POLICY)]));
  for (const part of metadata.parts) {
    const base = Object.freeze([...part.center]);
    for (const [scopeId, fraction] of sequence) {
      const offset = offsetMaps.get(scopeId).get(part.meshName);
      const before = [...offset];
      const position = positionAt(base, offset, fraction);
      assert.ok(position.every(Number.isFinite), `${scopeId}/${part.meshName}`);
      assert.deepEqual(positionAt(base, offset, 0), base, `Reassembly drift: ${part.meshName}`);
      assert.deepEqual(offset, before, 'Position interpolation mutated offsets');
    }
  }
  assert.equal(JSON.stringify(metadata), sourceBefore, 'Source model state changed');
});

test('individual components cannot explode and animation overshoot is clamped', () => {
  const leaf = [...nodes.values()].find(node => node.type === 'component');
  const offsets = createOffsets(metadata.parts, nodes, leaf.id, .1, APOLLO_POLICY);
  for (const offset of offsets.values()) assert.deepEqual(offset, [0, 0, 0]);
  const base = [2, -3, 4], offset = [-.8, .2, 1.5];
  assert.deepEqual(positionAt(base, offset, -.001), base);
  assert.deepEqual(positionAt(base, offset, 1.001), positionAt(base, offset, 1));
});
