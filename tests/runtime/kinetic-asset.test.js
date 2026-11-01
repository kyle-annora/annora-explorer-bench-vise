import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyKineticAsset } from '../../scripts/verify-kinetic.mjs';

test('Kinetic 01 retains source animation, connected motion, mesh identity and local crease data', async () => {
  const report = await verifyKineticAsset();
  assert.equal(report.meshes, 107);
  assert.equal(report.animationSeconds, 4);
  assert.equal(report.sampledPoses, 961);
  assert(report.maximumPinGapMm < .01);
  assert(Math.abs(report.strokeMm - 70) < .0001);
});
