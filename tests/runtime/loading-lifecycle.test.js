import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBinary } from '../../src/explorer/asset-load.js';
import { retryNetworkLoad, abortable } from '../../src/explorer/network-load.js';

const abortError = error => error?.name === 'AbortError';
function replace(t, key, value) {
  const previous = globalThis[key]; globalThis[key] = value;
  t.after(() => { globalThis[key] = previous; });
}

test('pre-aborted transport never fetches or retries', async t => {
  const owner = new AbortController(); owner.abort(); let calls = 0;
  replace(t, 'fetch', () => { calls++; });
  await assert.rejects(loadBinary('/model', null, () => calls++, { signal: owner.signal }), abortError);
  assert.equal(calls, 0);
});

test('an aborted network failure cannot retry or reset progress', async () => {
  const owner = new AbortController(); let attempts = 0, retries = 0;
  await assert.rejects(retryNetworkLoad(async () => { attempts++; owner.abort(); throw new TypeError('Failed to fetch'); }, () => retries++, { signal: owner.signal }), abortError);
  assert.equal(attempts, 1); assert.equal(retries, 0);
});

test('aborting streamed data cancels the source and prevents completion progress', async t => {
  const owner = new AbortController(), progress = []; let cancelled = false;
  replace(t, 'fetch', async (_url, options) => {
    assert.equal(options.signal, owner.signal);
    return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); },
      cancel() { cancelled = true; }
    }), { headers: { 'content-length': '9' } });
  });
  await assert.rejects(loadBinary('/model', null, value => { progress.push(value); owner.abort(); }, { signal: owner.signal }), abortError);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(progress, [1 / 3]); assert.equal(cancelled, true);
});

test('a cancelled waiter settles immediately and observes a late shared rejection', async () => {
  const owner = new AbortController(); let fail;
  const shared = new Promise((_resolve, reject) => { fail = reject; });
  const waiting = abortable(shared, owner.signal); owner.abort();
  await assert.rejects(waiting, abortError);
  fail(new Error('Late optional asset failure'));
  await new Promise(resolve => setImmediate(resolve));
});
