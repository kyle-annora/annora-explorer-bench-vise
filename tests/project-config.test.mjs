import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { loadProject, safeURL, validateProjectShape } from '../scripts/lib/project-config.mjs';

const configuration = () => ({ schemaVersion: 1, id: 'client-fixture', title: 'Independent machine', description: 'A prepared rigid assembly.', brand: { name: 'CLIENT', product: 'EXPLORER', homeUrl: './', accent: '#ff6840' }, defaultModel: 'sample-machine', features: { explode: true, operation: false, tour: false, themes: true, quality: true, renderStyles: ['engineering'] }, models: [{ manifest: 'content/sample/manifest.json' }] });
function glb() {
  const source = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'Housing', mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }] };
  const json = Buffer.from(JSON.stringify(source).padEnd(Math.ceil(JSON.stringify(source).length / 4) * 4, ' ')), binary = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer), header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + binary.length, 8); header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16); binHeader.writeUInt32LE(binary.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, json, binHeader, binary]);
}
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'explorer-config-')); t.after(() => rm(root, { recursive: true, force: true })); await mkdir(path.join(root, 'content/sample'), { recursive: true });
  const project = configuration(), manifest = { schemaVersion: 1, id: 'sample-machine', rootId: 'assembly', title: 'Sample machine', shortTitle: 'Sample', assets: { model: 'model.glb', metadata: 'metadata.json', license: 'LICENSE.txt' }, view: { direction: [1, 1, 1], normalizedWidth: 4.4, labels: ['Front', 'Rear'], facts: [{ label: 'Travel', value: '20 mm' }] }, provenance: { author: 'Fixture author', license: 'MIT', attribution: 'Fixture author, MIT.', description: 'A known rigid source fixture.', note: 'Illustrative finish.' } };
  const metadata = { root: { id: 'assembly', title: 'Machine' }, groups: [{ id: 'body', title: 'Body', meshNames: ['Housing'] }], parts: [{ id: 'housing', group: 'body', meshName: 'Housing', center: [0, 0, 0] }] };
  const save = async () => { await writeFile(path.join(root, 'project.config.json'), JSON.stringify(project)); await writeFile(path.join(root, 'content/sample/manifest.json'), JSON.stringify(manifest)); await writeFile(path.join(root, 'content/sample/metadata.json'), JSON.stringify(metadata)); };
  await writeFile(path.join(root, 'content/sample/model.glb'), glb()); await writeFile(path.join(root, 'content/sample/LICENSE.txt'), 'MIT fixture license.'); await save(); return { root, project, manifest, metadata, save };
}

test('a project with a new model identity loads without builtin model code or a source website', async t => {
  const f = await fixture(t), result = await loadProject(f.root);
  assert.equal(result.project.defaultModel, 'sample-machine'); assert.equal(result.models.length, 1); assert.equal(result.models[0].runtime.rootId, 'assembly'); assert.equal(result.models[0].runtime.sourceUrl, null);
  assert.deepEqual(result.models[0].runtime.facts, [{ label: 'Travel', value: '20 mm' }]); assert.match(result.models[0].revision, /^sha256:[a-f0-9]{64}$/);
});
test('revision fingerprints exact license, model and presentation input', async t => {
  const f = await fixture(t), first = (await loadProject(f.root)).models[0].revision;
  f.manifest.view.facts[0].value = '30 mm'; await f.save(); const second = (await loadProject(f.root)).models[0].revision; assert.notEqual(first, second);
  await writeFile(path.join(f.root, 'content/sample/LICENSE.txt'), 'MIT fixture license, revised notice.'); assert.notEqual(second, (await loadProject(f.root)).models[0].revision);
});
test('unknown project fields, missing default model and incomplete linework fail clearly', async t => {
  assert.throws(() => validateProjectShape({ ...configuration(), backend: {} }), /backend is not supported/);
  const f = await fixture(t); f.project.defaultModel = 'missing'; await f.save(); await assert.rejects(loadProject(f.root), /defaultModel/);
  f.project.defaultModel = 'sample-machine'; f.project.features.renderStyles.push('linework'); await f.save(); await assert.rejects(loadProject(f.root), /enabled line treatments require/);
});
test('unsafe home/source URLs are rejected and relative links remain usable', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', '//other.test/logo', '../outside', 'https://user:password@example.com/', './%2e%2e/out', 'https:\\example.com']) assert.throws(() => safeURL(url));
  for (const url of ['./', './products/', '/machines/', 'https://example.com/about']) assert.equal(safeURL(url), url);
  assert.throws(() => safeURL('./source', 'source', { relative: false }));
});
test('repository containment rejects outside paths and symlink escapes', async t => {
  const f = await fixture(t); f.manifest.assets.model = '../../../outside.glb'; await f.save(); await assert.rejects(loadProject(f.root), /escapes the repository/);
  const outside = await mkdtemp(path.join(tmpdir(), 'explorer-outside-')); t.after(() => rm(outside, { recursive: true, force: true })); await writeFile(path.join(outside, 'model.glb'), glb()); await symlink(path.join(outside, 'model.glb'), path.join(f.root, 'content/sample/external.glb'));
  f.manifest.assets.model = 'external.glb'; await f.save(); await assert.rejects(loadProject(f.root), /symlink outside/);
});
test('package assets and tours cannot expose other repository files through paths or symlinks', async t => {
  const f = await fixture(t); await writeFile(path.join(f.root, '.env'), 'TEST_ONLY=not-a-real-secret');
  f.manifest.assets.license = '../../.env'; await f.save(); await assert.rejects(loadProject(f.root), /assets.license escapes its model package directory/);
  await symlink(path.join(f.root, '.env'), path.join(f.root, 'content/sample/linked-license.txt')); f.manifest.assets.license = 'linked-license.txt'; await f.save(); await assert.rejects(loadProject(f.root), /assets.license escapes its model package directory/);
  f.manifest.assets.license = 'LICENSE.txt'; f.manifest.tour = '../../.env'; await f.save(); await assert.rejects(loadProject(f.root), /Tour file escapes its model package directory/);
  f.manifest.tour = 'linked-license.txt'; await f.save(); await assert.rejects(loadProject(f.root), /Tour file escapes its model package directory/);
});
test('metadata must match source mesh identity, root and authored operating clip', async t => {
  const f = await fixture(t); f.manifest.rootId = 'other'; await f.save(); await assert.rejects(loadProject(f.root), /Root identity differs/);
  f.manifest.rootId = 'assembly'; f.metadata.parts[0].meshName = 'Unknown'; f.metadata.groups[0].meshNames = ['Unknown']; await f.save(); await assert.rejects(loadProject(f.root), /mesh Unknown is absent/);
  f.metadata.parts[0].meshName = 'Housing'; f.metadata.groups[0].meshNames = ['Housing']; f.metadata.operation = { clipName: 'MissingClip', duration: 2 }; await f.save(); await assert.rejects(loadProject(f.root), /operating clip MissingClip is absent/);
});
test('compressed assets must expand to their exact declared source', async t => {
  const f = await fixture(t); f.manifest.assets.compressedModel = 'model.glb.gz'; await writeFile(path.join(f.root, 'content/sample/model.glb.gz'), gzipSync(glb())); await f.save(); await loadProject(f.root);
  await writeFile(path.join(f.root, 'content/sample/model.glb.gz'), gzipSync(Buffer.from('different source'))); await assert.rejects(loadProject(f.root), /does not match model/);
});
test('local brand images are contained and only supported image formats are accepted', async t => {
  const f = await fixture(t); f.project.brand.logo = 'logo.svg'; await writeFile(path.join(f.root, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>'); await f.save(); assert.equal((await loadProject(f.root)).project.brand.logoFile, await realpath(path.join(f.root, 'logo.svg')));
  f.project.brand.logo = 'project.config.json'; await f.save(); await assert.rejects(loadProject(f.root), /Brand logo must be/);
});
test('authored tours reject dangling components before publishing a project', async t => {
  const f = await fixture(t); f.manifest.tour = 'tour.json'; await f.save(); await writeFile(path.join(f.root, 'content/sample/tour.json'), JSON.stringify({ id: 'sample-tour', title: 'Tour', duration: 5, chapters: [{ id: 'intro', title: 'Start', caption: 'Inspect the housing.', start: 0, end: 5, duration: 5, transitionStart: 0, settledAt: 1, previewAt: 2, scopeId: 'missing', selectedId: 'housing', renderStyle: 'engineering', highlightIds: [], annotations: [], camera: { direction: [1, 1, 1], focusId: 'assembly' }, explosion: [0, 0] }] }));
  await assert.rejects(loadProject(f.root), /unknown component: missing/);
});
test('presentation policy rejects invalid offsets, finish families and unknown nodes', async t => {
  const f = await fixture(t); f.manifest.presentationPolicy = { explosion: { rootVectors: { body: [0, 'up', 1] } } }; await f.save(); await assert.rejects(loadProject(f.root), /bounded finite numbers/);
  f.manifest.presentationPolicy = { finishes: { eligibleSources: [], groups: { body: { family: 'made-up', basis: 'A finish.' } } } }; await f.save(); await assert.rejects(loadProject(f.root), /Unknown presentation finish family/);
  f.manifest.presentationPolicy = { navigationIcons: { missing: 'cube' } }; await f.save(); await assert.rejects(loadProject(f.root), /unknown component: missing/);
});
test('line assets must match their source model and contain bounded per-mesh ranges', async t => {
  const f = await fixture(t), hash = bytes => createHash('sha256').update(bytes).digest('hex'), bytes = Buffer.alloc(24);
  f.manifest.assets.edges = 'edges.bin'; f.manifest.assets.edgeMetadata = 'edges.json'; await f.save(); await writeFile(path.join(f.root, 'content/sample/edges.bin'), bytes);
  const records = { schemaVersion: 1, source: { sha256: 'wrong-source' }, edges: { sha256: hash(bytes) }, meshes: { Housing: { byteOffset: 0, segmentCount: 1, vertexCount: 2 } } };
  const save = () => writeFile(path.join(f.root, 'content/sample/edges.json'), JSON.stringify(records)); await save(); await assert.rejects(loadProject(f.root), /different model asset/);
  records.source.sha256 = hash(glb()); records.meshes.Housing.segmentCount = 2; await save(); await assert.rejects(loadProject(f.root), /invalid edges range/);
  records.meshes.Housing.segmentCount = 1; await save(); await loadProject(f.root);
});
