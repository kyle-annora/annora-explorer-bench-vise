import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, PerspectiveCamera, Spherical, Vector3 } from 'three';
import { DampedMotion, nearestAngle, fitProjectedPoints } from '../../src/explorer/motion.js';
import { viewingRegion } from '../../src/explorer/viewing-region.js';

const close = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
};
const advance = (motion, seconds, hz) => {
  for (let frame = 0; frame < Math.round(seconds * hz); frame++) motion.step(1 / hz);
};

test('camera and pose damping agrees at 30, 60 and 120 Hz, including a moving retarget', () => {
  const samples = [30, 60, 120].map(hz => {
    const motion = new DampedMotion([0, -4, 12], .21, 1e-10);
    motion.to([5, 2, 3]);
    advance(motion, .2, hz);
    const first = [...motion.values];
    motion.to([-2, 9, 7]);
    advance(motion, .3, hz);
    return [...first, ...motion.values, ...motion.velocity];
  });
  for (const sample of samples.slice(1)) sample.forEach((value, i) => close(value, samples[0][i]));
});

test('reversing a moving pose preserves its displayed position and momentum, then settles exactly', () => {
  const motion = new DampedMotion([0, 2], .18);
  motion.to([1, -6]);
  advance(motion, .1, 60);
  const position = [...motion.values], velocity = [...motion.velocity];
  assert.ok(velocity.some(value => Math.abs(value) > .1), 'The reversal must happen during motion');
  motion.to([0, 2]);
  assert.deepEqual(motion.values, position, 'A new intent must not teleport the current pose');
  assert.deepEqual(motion.velocity, velocity, 'A new intent must not restart motion from rest');
  motion.step(1 / 100000);
  motion.values.forEach((value, i) => close(value, position[i], .001));
  advance(motion, 3, 60);
  assert.deepEqual(motion.values, [0, 2]);
  assert.deepEqual(motion.velocity, [0, 0]);
  assert.equal(motion.active, false);
  assert.equal(motion.step(1 / 60), false, 'Settled motion stops requesting updates');
});

test('repeated identical targets do not restart an in-flight move', () => {
  const motion = new DampedMotion([0]);
  motion.to([1]);
  advance(motion, .1, 60);
  const values = [...motion.values], velocity = [...motion.velocity];
  motion.to([1]);
  assert.deepEqual(motion.values, values);
  assert.deepEqual(motion.velocity, velocity);
  advance(motion, 2, 60);
  assert.deepEqual(motion.values, [1]);
});

test('immediate motion and manual takeover stop at an exact pose without residual drift', () => {
  const motion = new DampedMotion([0, 0, 0]);
  motion.to([4, 6, 8]);
  advance(motion, .1, 60);
  motion.to([-1, 2, 9], true);
  assert.deepEqual(motion.values, [-1, 2, 9]);
  assert.deepEqual(motion.velocity, [0, 0, 0]);
  assert.equal(motion.active, false);
  motion.to([8, 5, 2]);
  advance(motion, .1, 60);
  const displayed = [...motion.values];
  motion.stop();
  advance(motion, 1, 120);
  assert.deepEqual(motion.values, displayed);
  assert.deepEqual(motion.target, displayed);
  assert.deepEqual(motion.velocity, [0, 0, 0]);
});

test('nearest-angle navigation crosses the azimuth seam by the short arc', () => {
  const radians = degrees => degrees * Math.PI / 180;
  close(nearestAngle(radians(-179), radians(179)), radians(181));
  close(nearestAngle(radians(179), radians(-179)), radians(-181));
  for (const current of [-8 * Math.PI, -3, 0, 3, 9 * Math.PI]) {
    for (const destination of [-3, -.1, 0, 2.9]) {
      const resolved = nearestAngle(destination, current);
      assert.ok(Math.abs(resolved - current) <= Math.PI + 1e-12);
      close(Math.sin(resolved), Math.sin(destination));
      close(Math.cos(resolved), Math.cos(destination));
    }
  }
});

test('spherical motion with logarithmic distance travels around, rather than through, the subject', () => {
  const motion = new DampedMotion([0, Math.PI / 2, Math.log(6)], .22);
  motion.to([nearestAngle(Math.PI, 0), Math.PI / 2, Math.log(9)]);
  const local = new Vector3();
  for (let frame = 0; frame < 240; frame++) {
    motion.step(1 / 120);
    const [theta, phi, logRadius] = motion.values;
    local.setFromSpherical(new Spherical(Math.exp(logRadius), phi, theta));
    assert.ok(local.length() >= 6 - 1e-9, 'An opposite-side transition must stay outside the subject');
    assert.ok(local.length() <= 9 + 1e-9);
    assert.ok(local.toArray().every(Number.isFinite));
  }
  assert.ok(local.z < -8.99, 'The camera reaches the other side');
});

function assertProjectedFit(points, direction, viewport, insets) {
  const region = viewingRegion(viewport.width, viewport.height, insets);
  const { center, distance } = fitProjectedPoints(points, direction, 15, viewport.width / viewport.height, region, viewport);
  const camera = new PerspectiveCamera(15, viewport.width / viewport.height, .01, 1000);
  camera.position.copy(center).addScaledVector(direction.clone().normalize(), distance);
  camera.lookAt(center);
  camera.setViewOffset(viewport.width, viewport.height, region.offsetX, region.offsetY, viewport.width, viewport.height);
  camera.updateMatrixWorld();
  const middleX = insets.left + region.width / 2, middleY = insets.top + region.height / 2;
  let bindingFraction = 0;
  for (const point of points) {
    const projected = point.clone().project(camera);
    const x = (projected.x + 1) * viewport.width / 2;
    const y = (1 - projected.y) * viewport.height / 2;
    const occupiedX = Math.abs(x - middleX) / (region.width / 2);
    const occupiedY = Math.abs(y - middleY) / (region.height / 2);
    bindingFraction = Math.max(bindingFraction, occupiedX, occupiedY);
    assert.ok(occupiedX <= .94000001, `Point exceeds horizontal clear region: ${occupiedX}`);
    assert.ok(occupiedY <= .94000001, `Point exceeds vertical clear region: ${occupiedY}`);
    assert.ok(projected.z > -1 && projected.z < 1, 'Geometry remains in front of the camera');
  }
  close(bindingFraction, .94, 1e-8);
  return { center, distance };
}

test('projected component bounds fill 94% of the clear region across desktop and mobile panels', () => {
  const points = [new Vector3(-2, -1, -.5), new Vector3(2.5, -.8, 0), new Vector3(-1, 3, .8), new Vector3(1, 2, 1.1)];
  const original = points.map(point => point.toArray());
  for (const [viewport, insets] of [
    [{ width: 1440, height: 900 }, { left: 260, right: 280, top: 80, bottom: 90 }],
    [{ width: 1440, height: 900 }, { left: 260, right: 20, top: 80, bottom: 90 }],
    [{ width: 390, height: 844 }, { left: 12, right: 12, top: 130, bottom: 190 }],
    [{ width: 844, height: 390 }, { left: 12, right: 230, top: 66, bottom: 100 }]
  ]) assertProjectedFit(points, new Vector3(.6, .3, 1), viewport, insets);
  assert.deepEqual(points.map(point => point.toArray()), original, 'Fitting must not alter source geometry');
});

test('diagonal assemblies fit their real bounds instead of empty union-box corners', () => {
  const points = [new Vector3(-3, -.2, -3), new Vector3(-3, .2, -3), new Vector3(3, -.2, 3), new Vector3(3, .2, 3)];
  const viewport = { width: 1440, height: 900 }, insets = { left: 250, right: 250, top: 80, bottom: 80 };
  const direction = new Vector3(1, 0, 1).normalize();
  const tight = assertProjectedFit(points, direction, viewport, insets);
  const bounds = new Box3().setFromPoints(points), corners = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) corners.push(new Vector3(x, y, z));
  const loose = fitProjectedPoints(corners, direction, 15, viewport.width / viewport.height, viewingRegion(viewport.width, viewport.height, insets), viewport);
  assert.ok(tight.distance < loose.distance * .4, 'Empty diagonal corners must not push the real assembly away');
});
