/** Original Annora bench-vise study. MIT, Copyright (c) 2026 Annora.
 * Reproducible geometry and authored kinematics; no external model or solver.
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const here = new URL('./', import.meta.url);
const duration = 5.5, stroke = .048, lead = .012;
const groups = {
  base: { title: 'Base and mounting', description: 'The fixed foundation and four mounting ears.', explode: [0, -.055, 0] },
  'fixed-jaw': { title: 'Fixed jaw', description: 'A fixed support and replaceable steel contact plate.', explode: [-.06, .055, 0] },
  'moving-jaw': { title: 'Moving jaw', description: 'The carriage translates along the guideways without rotating.', explode: [.05, .07, 0] },
  'lead-screw': { title: 'Lead screw and nut', description: 'A rotating, translating spindle passes through a stationary nut. The thread is illustrative.', explode: [.035, .015, .09] },
  handle: { title: 'Handle', description: 'The tommy bar rotates with the spindle and travels with the moving jaw.', explode: [.12, .015, 0] },
  guides: { title: 'Guideways', description: 'Two fixed steel ways align the translating carriage.', explode: [0, .025, -.085] },
};
const materials = Object.fromEntries(Object.entries({
  structure: ['Cast satin', '#9fa7b1', .55, .48],
  satin: ['Satin silver', '#b8bec7', .62, .47],
  machined: ['Dark machined', '#5c626a', .74, .32],
  polished: ['Bright hardware', '#e1e5e9', .85, .2],
  bronze: ['Bronze bearing', '#b79a64', .7, .34],
  polymer: ['Dark end caps', '#292c30', 0, .76],
}).map(([id, [name, color, metalness, roughness]]) => [id, Object.assign(new THREE.MeshStandardMaterial({ color, metalness, roughness }), { name })]));

const root = new THREE.Group(); root.name = 'BenchVise';
const carriage = new THREE.Group(); carriage.name = 'CarriageTravel'; root.add(carriage);
const spindle = new THREE.Group(); spindle.name = 'SpindleRotation'; spindle.position.set(0, .055, 0); carriage.add(spindle);
const parts = {}, meshes = [];
const title = name => name.split('_').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
function cleanTriangles(geometry) {
  const position = geometry.attributes.position, count = geometry.index?.count || position.count;
  const valid = [], a = new THREE.Vector3(), b = a.clone(), c = a.clone();
  for (let i = 0; i < count; i += 3) {
    const indices = [0, 1, 2].map(k => geometry.index ? geometry.index.getX(i + k) : i + k);
    a.fromBufferAttribute(position, indices[0]); b.fromBufferAttribute(position, indices[1]); c.fromBufferAttribute(position, indices[2]);
    if (b.sub(a).cross(c.sub(a)).length() > 2e-15) valid.push(...indices);
  }
  if (valid.length === count) return geometry;
  const clean = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const values = valid.flatMap(index => Array.from(attribute.array.slice(index * attribute.itemSize, (index + 1) * attribute.itemSize)));
    clean.setAttribute(name, new THREE.BufferAttribute(new attribute.array.constructor(values), attribute.itemSize, attribute.normalized));
  }
  geometry.dispose(); return clean;
}
function mesh(name, geometry, position, group, finish = 'satin', parent = root, rotation = null) {
  geometry = cleanTriangles(geometry);
  geometry.clearGroups(); geometry.computeBoundingBox(); geometry.normalizeNormals();
  const object = new THREE.Mesh(geometry, materials[finish]); object.name = name;
  object.position.fromArray(position); if (rotation) object.rotation.set(...rotation);
  object.userData = { origin: 'Original Annora geometry', illustrative: true };
  parent.add(object); meshes.push(object);
  parts[name] = { id: name.replaceAll('_', '-'), title: title(name), finishFamily: finish, explode: [...groups[group].explode] };
  (groups[group].meshNames ??= []).push(name); return object;
}
function block(x, y, z, bevel = .0015) {
  const radius = Math.min(bevel, x / 6, y / 6, z / 6);
  const shape = new THREE.Shape();
  shape.moveTo(-x / 2 + radius, -y / 2 + radius); shape.lineTo(x / 2 - radius, -y / 2 + radius);
  shape.lineTo(x / 2 - radius, y / 2 - radius); shape.lineTo(-x / 2 + radius, y / 2 - radius); shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: z - 2 * radius, bevelEnabled: true, bevelThickness: radius, bevelSize: radius, bevelSegments: 1, steps: 1 });
  geometry.center(); return geometry;
}
function cylinder(radius, length, sides = 28, axis = 'x') {
  const geometry = new THREE.CylinderGeometry(radius, radius, length, sides, 1);
  if (axis === 'x') geometry.rotateZ(Math.PI / 2); if (axis === 'z') geometry.rotateX(Math.PI / 2);
  return geometry;
}
function ring(outer, inner, length, axis = 'x', sides = 36, innerSides = 36) {
  const shape = new THREE.Shape(), hole = new THREE.Path();
  for (let i = 0; i <= sides; i++) { const a = i * Math.PI * 2 / sides; i ? shape.lineTo(Math.cos(a) * outer, Math.sin(a) * outer) : shape.moveTo(outer, 0); }
  for (let i = 0; i <= innerSides; i++) { const a = -i * Math.PI * 2 / innerSides; i ? hole.lineTo(Math.cos(a) * inner, Math.sin(a) * inner) : hole.moveTo(inner, 0); }
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, steps: 1 }); geometry.center();
  if (axis === 'x') geometry.rotateY(Math.PI / 2); if (axis === 'y') geometry.rotateX(Math.PI / 2);
  return geometry;
}
function socket(name, position, group, parent = root, axis = 'y', radius = .005) {
  return mesh(name, ring(radius, radius * .48, radius * .8, axis, 24, 6), position, group, 'machined', parent);
}

mesh('base_plinth', block(.265, .018, .145, .003), [0, .011, 0], 'base', 'structure');
for (const [i, x, z] of [[1, -.103, -.079], [2, -.103, .079], [3, .103, -.079], [4, .103, .079]]) {
  mesh(`mounting_ear_${i}`, ring(.019, .007, .014, 'y'), [x, .009, z], 'base', 'structure');
  mesh(`mounting_washer_${i}`, ring(.009, .0053, .0018, 'y'), [x, .017, z], 'base', 'polished');
  socket(`mounting_bolt_${i}`, [x, .021, z], 'base', root, 'y', .0065);
}
mesh('fixed_jaw_body', block(.042, .079, .124, .003), [-.076, .059, 0], 'fixed-jaw', 'structure');
mesh('fixed_jaw_plate', block(.008, .041, .145, .0008), [-.051, .1, 0], 'fixed-jaw', 'machined');
mesh('fixed_jaw_shoulder', block(.055, .012, .134, .001), [-.081, .084, 0], 'fixed-jaw', 'satin');
for (let i = 0; i < 4; i++) socket(`fixed_plate_screw_${i + 1}`, [-.046, .09 + Math.floor(i / 2) * .02, (i % 2 ? 1 : -1) * .051], 'fixed-jaw', root, 'x', .0038);
mesh('fixed_nameplate', block(.029, .016, .0012, .0003), [-.076, .066, .0628], 'fixed-jaw', 'bronze');
for (const [i, x] of [[1, -.088], [2, -.064]]) socket(`nameplate_rivet_${i}`, [x, .066, .064], 'fixed-jaw', root, 'z', .0015);

mesh('moving_jaw_body', block(.038, .075, .124, .003), [.059, .061, 0], 'moving-jaw', 'structure', carriage);
mesh('moving_jaw_plate', block(.008, .041, .145, .0008), [.036, .1, 0], 'moving-jaw', 'machined', carriage);
for (let i = 0; i < 4; i++) socket(`moving_plate_screw_${i + 1}`, [.031, .09 + Math.floor(i / 2) * .02, (i % 2 ? 1 : -1) * .051], 'moving-jaw', carriage, 'x', .0038);
mesh('moving_carriage_bridge', block(.072, .012, .12, .001), [.057, .034, 0], 'moving-jaw', 'satin', carriage);
for (const [i, z] of [[1, -.045], [2, .045]]) mesh(`carriage_shoe_${i}`, block(.071, .01, .019, .0006), [.057, .025, z], 'moving-jaw', 'bronze', carriage);
mesh('front_bearing_housing', ring(.021, .012, .027, 'x'), [.09, .055, 0], 'moving-jaw', 'satin', carriage);
mesh('bearing_insert', ring(.013, .0106, .029, 'x'), [.09, .055, 0], 'moving-jaw', 'bronze', carriage);
mesh('thrust_washer', ring(.017, .011, .002, 'x'), [.105, .055, 0], 'moving-jaw', 'polished', carriage);

mesh('spindle_core', cylinder(.009, .217), [.0055, 0, 0], 'lead-screw', 'machined', spindle);
class Thread extends THREE.Curve {
  getPoint(t, target = new THREE.Vector3()) {
    const x = -.099 + .204 * t, angle = x / lead * Math.PI * 2;
    return target.set(x, .0102 * Math.cos(angle), .0102 * Math.sin(angle));
  }
}
mesh('spindle_helical_thread', new THREE.TubeGeometry(new Thread(), 544, .00135, 4, false), [0, 0, 0], 'lead-screw', 'polished', spindle);
mesh('spindle_rear_tip', cylinder(.0075, .009), [-.1075, 0, 0], 'lead-screw', 'polished', spindle);
mesh('stationary_nut', ring(.021, .0115, .028, 'x', 6, 32), [-.079, .055, 0], 'lead-screw', 'bronze');
mesh('nut_retainer', ring(.025, .0125, .004, 'x', 6, 32), [-.096, .055, 0], 'lead-screw', 'machined');
for (const [i, z] of [[1, -.018], [2, .018]]) socket(`nut_retainer_screw_${i}`, [-.099, .055, z], 'lead-screw', root, 'x', .003);

mesh('handle_hub', cylinder(.018, .037), [.131, 0, 0], 'handle', 'machined', spindle);
mesh('handle_bar', cylinder(.006, .16, 24, 'z'), [.142, 0, 0], 'handle', 'polished', spindle);
for (const [i, z] of [[1, -.086], [2, .086]]) {
  mesh(`handle_end_cap_${i}`, new THREE.SphereGeometry(.0115, 20, 12), [.142, 0, z], 'handle', 'machined', spindle);
  mesh(`handle_stop_ring_${i}`, cylinder(.0078, .004, 24, 'z'), [.142, 0, z * .88], 'handle', 'polished', spindle);
}
for (const [side, z] of [[1, -.045], [2, .045]]) {
  mesh(`guideway_${side}`, block(.235, .009, .016, .0006), [0, .022, z], 'guides', 'polished');
  for (const [end, x] of [[1, -.116], [2, .116]]) {
    mesh(`guide_stop_${side}_${end}`, block(.012, .013, .023, .0007), [x, .025, z], 'guides', 'machined');
    socket(`guide_stop_screw_${side}_${end}`, [x, .034, z], 'guides', root, 'y', .0038);
  }
}

// One screw lead creates one carriage relation. Closing and opening reverse
// together. No force/contact simulation or machining tolerance is implied.
const smooth = t => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
function closure(time) {
  if (time < .25) return 0;
  if (time < 2.25) return smooth((time - .25) / 2);
  if (time < 2.9) return 1;
  if (time < 4.9) return 1 - smooth((time - 2.9) / 2);
  return 0;
}
const times = [], translation = [], rotation = [], axis = new THREE.Vector3(1, 0, 0);
for (let i = 0; i <= 330; i++) {
  const time = duration * i / 330, fraction = closure(time), travel = -stroke * fraction;
  times.push(time); translation.push(travel, 0, 0);
  rotation.push(...new THREE.Quaternion().setFromAxisAngle(axis, travel / lead * Math.PI * 2).toArray());
}
const clip = new THREE.AnimationClip('ViseOpenClose', duration, [
  new THREE.VectorKeyframeTrack('CarriageTravel.position', times, translation),
  new THREE.QuaternionKeyframeTrack('SpindleRotation.quaternion', times, rotation),
]);
if (!clip.validate()) throw new Error('Invalid authored clip.');
root.updateMatrixWorld(true);

const direction = [.95, 1.1, 1.55], cam = (focusId = 'bench-vise', explosion = 0, view = direction) => ({ focusId, direction: view, explosion, scale: 1 });
const chapter = (id, label, titleText, seconds, extra = {}) => ({ id, label, title: titleText, duration: seconds, previewAt: 1.5, caption: '', scopeId: 'bench-vise', selectedId: 'bench-vise', highlightIds: [], renderStyle: 'engineering', explosion: [0, 0], camera: cam(), annotations: [], cues: [], ...extra });
const tour = { id: 'bench-vise', title: 'How a screw advances a jaw', chapters: [
  chapter('whole', 'Whole', 'One controlled axis.', 6, { cues: [{ at: .7, id: 'jaw', highlightIds: ['moving-jaw'] }, { at: 1.1, id: 'purpose', caption: 'A hand-operated screw moves one jaw toward the other.' }] }),
  chapter('assemblies', 'Assemblies', 'Read the assembly.', 10, { renderStyle: 'linework', explosion: [0, .6], transitionStart: .5, transition: 1.6, camera: cam('bench-vise', .6), cues: [
    { at: 2.4, id: 'fixed', renderStyle: 'flat', highlightIds: ['base', 'fixed-jaw'], caption: 'The base and fixed jaw stay in place.' },
    { at: 5.3, id: 'travel', highlightIds: ['moving-jaw'], caption: 'The moving jaw rides along two guideways.' },
    { at: 7.5, id: 'drive', highlightIds: ['lead-screw', 'handle'], caption: 'The handle drives a threaded spindle.' },
  ] }),
  chapter('drive', 'Drive', 'Rotation meets translation.', 10, { renderStyle: 'linework', explosion: [.6, 0], transition: 1.5, camera: cam('bench-vise', .6), cues: [
    { at: 1.8, id: 'focus', scopeId: 'lead-screw', selectedId: 'lead-screw', camera: cam('lead-screw', 0, [.3, .9, 1.7]) },
    { at: 3, id: 'nut', renderStyle: 'flat', highlightIds: ['stationary-nut'], caption: 'The nut stays fixed in the body.', annotations: [{ nodeId: 'stationary-nut', label: 'Fixed nut' }] },
    { at: 6, id: 'screw', highlightIds: ['spindle-helical-thread'], caption: 'Turning the screw advances it through that nut.', annotations: [{ nodeId: 'spindle-helical-thread', label: 'Lead screw' }] },
  ] }),
  chapter('motion', 'Motion', 'Watch the relation.', 26, { renderStyle: 'linework', previewAt: 2, settledAt: 8, camera: cam('bench-vise', 0, [.4, 1.1, 1.7]), operation: { clipName: 'ViseOpenClose', sourceDuration: duration, settledProgress: .4, passes: [
    { id: 'coached', start: 1.5, duration: 14.5, keyframes: [{ at: 0, progress: 0 }, { at: 6, progress: 2.25 / duration }, { at: 8, progress: 2.9 / duration }, { at: 14.5, progress: 1 }] },
    { id: 'continuous', start: 18, duration: 6.5, keyframes: [{ at: 0, progress: 0 }, { at: 6.5, progress: 1 }] },
  ] }, cues: [
    { at: .6, id: 'input', renderStyle: 'flat', highlightIds: ['handle'], caption: 'Turn the handle.', annotations: [{ nodeId: 'handle', label: 'Rotary input', motion: 'rotate' }] },
    { at: 4, id: 'output', highlightIds: ['moving-jaw'], caption: 'The jaw advances. The guides keep it aligned.', annotations: [{ nodeId: 'moving-jaw', label: 'Linear travel', motion: 'linear' }] },
    { at: 8.2, id: 'reverse', caption: 'Reverse the turn to open the jaw again.' },
    { at: 16, id: 'release', renderStyle: 'engineering', highlightIds: [], caption: 'Now watch the complete open–close cycle.', annotations: [] },
    { at: 24.6, id: 'limit', caption: 'Authored motion illustrates the relationship, not clamping force.' },
  ] }),
  chapter('return', 'Explore', 'Take it from here.', 8, { cues: [{ at: .9, id: 'handoff', caption: 'Select a component. Follow its place in the assembly.' }] }),
] };
let timeline = 0; for (const item of tour.chapters) { item.start = timeline; timeline += item.duration; item.end = timeline; } tour.duration = timeline;

const definition = {
  schemaVersion: 1, id: 'bench-vise', rootId: 'bench-vise', title: 'Precision bench vise', shortTitle: 'Bench vise',
  provenance: { author: 'Annora', license: 'MIT', attribution: 'Original Annora bench-vise study · MIT · 2026', description: 'Original procedural geometry and authored screw-to-jaw motion created for the Annora Explorer template.', note: 'Illustrative rigid-body kinematics. Not manufacturer CAD, a force simulation, or manufacturing guidance. Display finishes and separation offsets are explanatory.' },
  licenseFile: 'LICENSE', view: { direction, normalizedWidth: 4.4, labels: ['Overview', 'Reverse'] }, creaseAngle: 35,
  groups: Object.entries(groups).map(([id, group]) => ({ id, ...group })), parts,
  operation: { clipName: clip.name, duration, stages: [
    { at: 0, title: 'Open position', description: 'The jaw starts open. The base, nut and guideways remain fixed.', nodeId: 'base' },
    { at: .25 / duration, title: 'Closing travel', description: 'The handle and spindle turn together while the moving jaw translates.', nodeId: 'lead-screw' },
    { at: 2.25 / duration, title: 'Closed position', description: 'The authored motion pauses before reversal; no clamping force is calculated.', nodeId: 'moving-jaw' },
    { at: 2.9 / duration, title: 'Opening travel', description: 'Reversing the spindle returns the jaw along the same guideways.', nodeId: 'handle' },
    { at: 4.9 / duration, title: 'Return to start', description: 'The source assembly returns to its exact starting pose.', nodeId: 'bench-vise' },
  ] }, tour: 'authored-tour.json',
};

// The browser exporter only needs Blob reads for this texture-free GLB.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result = value; this.onload?.({ target: this }); this.onloadend?.({ target: this }); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(value => { this.result = `data:${blob.type};base64,${Buffer.from(value).toString('base64')}`; this.onloadend?.({ target: this }); }); }
};
const glb = Buffer.from(await new GLTFExporter().parseAsync(root, { binary: true, animations: [clip], onlyVisible: true, trs: true }));
const decoded = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
const loaded = []; decoded.scene.traverse(node => { if (node.isMesh) loaded.push(node); });
if (loaded.length !== meshes.length || new Set(loaded.map(item => item.name)).size !== loaded.length) throw new Error('Mesh identity did not round-trip.');
let triangles = 0, minimumTriangleArea = Infinity; const a = new THREE.Vector3(), b = a.clone(), c = a.clone();
for (const item of loaded) {
  const geometry = item.geometry; triangles += (geometry.index?.count || geometry.attributes.position.count) / 3;
  if (![...geometry.attributes.position.array].every(Number.isFinite)) throw new Error(`Non-finite geometry: ${item.name}`);
  for (let i = 0; i < (geometry.index?.count || geometry.attributes.position.count); i += 3) {
    const at = k => geometry.index ? geometry.index.getX(i + k) : i + k;
    a.fromBufferAttribute(geometry.attributes.position, at(0)); b.fromBufferAttribute(geometry.attributes.position, at(1)); c.fromBufferAttribute(geometry.attributes.position, at(2));
    minimumTriangleArea = Math.min(minimumTriangleArea, b.sub(a).cross(c.sub(a)).length() / 2);
  }
}
if (!(minimumTriangleArea > 1e-15)) throw new Error('Degenerate geometry survived export.');
const mixer = new THREE.AnimationMixer(decoded.scene), action = mixer.clipAction(decoded.animations[0]); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
let maximumTravelError = 0, maximumRotationError = 0;
for (let i = 0; i <= 660; i++) {
  const time = duration * i / 660; mixer.setTime(time); decoded.scene.updateMatrixWorld(true);
  const t = decoded.scene.getObjectByName('CarriageTravel').position.x, q = decoded.scene.getObjectByName('SpindleRotation').quaternion;
  const expected = new THREE.Quaternion().setFromAxisAngle(axis, t / lead * Math.PI * 2);
  maximumTravelError = Math.max(maximumTravelError, Math.abs(t + stroke * closure(time)));
  maximumRotationError = Math.max(maximumRotationError, 1 - Math.abs(q.clone().normalize().dot(expected)));
}
if (maximumTravelError > .00001 || maximumRotationError > 1e-8) throw new Error(`Authored lead relationship failed readback: travel=${maximumTravelError}, rotation=${maximumRotationError}.`);
mixer.stopAllAction(); mixer.uncacheRoot(decoded.scene);
const metrics = { model: 'bench-vise', author: 'Annora', license: 'MIT', meshes: loaded.length, groups: Object.keys(groups).length, triangles, minimumTriangleAreaSquareMeters: minimumTriangleArea, sourceBytes: glb.length, sha256: createHash('sha256').update(glb).digest('hex'), animation: { name: clip.name, durationSeconds: duration, tracks: clip.tracks.length, keysPerTrack: times.length, verifiedSamples: 661, travelMeters: stroke, illustrativeLeadMetersPerTurn: lead, closingTurns: stroke / lead, maxTravelErrorMeters: maximumTravelError, maxQuaternionDotError: maximumRotationError } };
await writeFile(new URL('model.glb', here), glb);
await writeFile(new URL('import-definition.json', here), JSON.stringify(definition, null, 2) + '\n');
await writeFile(new URL('authored-tour.json', here), JSON.stringify(tour, null, 2) + '\n');
await writeFile(new URL('source-metrics.json', here), JSON.stringify(metrics, null, 2) + '\n');
console.log(JSON.stringify(metrics, null, 2));
