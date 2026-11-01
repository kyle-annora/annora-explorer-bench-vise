import test from 'node:test';
import assert from 'node:assert/strict';
import { retryNetworkLoad } from '../../src/explorer/network-load.js';

test('an interrupted model fetch retries once and resets visible progress', async () => {
  let attempts = 0, resets = 0;
  const result = await retryNetworkLoad(async () => {
    if (++attempts === 1) throw new TypeError('Failed to fetch');
    return 'loaded model';
  }, () => resets++);
  assert.equal(result, 'loaded model');
  assert.equal(attempts, 2);
  assert.equal(resets, 1);
});

test('persistent network failure stops after two attempts', async () => {
  let attempts = 0;
  await assert.rejects(retryNetworkLoad(async () => {
    attempts++;
    throw new TypeError('Load failed');
  }), /Load failed/);
  assert.equal(attempts, 2);
});

test('HTTP and model parsing errors are not retried', async () => {
  for (const error of [new Error('HTTP 404'), new SyntaxError('Invalid glTF'), new TypeError('Invalid geometry')]) {
    let attempts = 0;
    await assert.rejects(retryNetworkLoad(async () => { attempts++; throw error; }), e => e === error);
    assert.equal(attempts, 1);
  }
});
