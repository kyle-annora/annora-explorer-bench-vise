import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { loadBinary } from '../../src/explorer/asset-load.js';

const rawUrl = 'https://assets.example.test/apollo-hatch.glb';
const gzipUrl = rawUrl + '.gz';
const original = Uint8Array.from({ length: 4096 }, (_, index) => (index * 29 + index % 13) % 256);
const compressed = gzipSync(original);

function replaceGlobal(t, name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  t.after(() => descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name]);
}
function streamedResponse(bytes) {
  const third = Math.ceil(bytes.byteLength / 3);
  return new Response(new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < bytes.byteLength; offset += third) controller.enqueue(bytes.slice(offset, offset + third));
      controller.close();
    }
  }), { headers: { 'content-length': String(bytes.byteLength) } });
}
function assertProgress(progress) {
  assert(progress.length >= 4, 'Every network chunk and completion should update progress.');
  assert(progress.slice(0, -1).every(value => value > 0 && value < 1));
  assert.equal(progress.at(-1), 1);
  assert(progress.every((value, index) => index === 0 || value >= progress[index - 1]));
}

test('gzip streaming reconstructs exact binary bytes and measures transport progress', async t => {
  assert.equal(typeof DecompressionStream, 'function', 'This test requires native gzip stream support.');
  const requested = [], progress = [];
  replaceGlobal(t, 'fetch', async url => { requested.push(url); return streamedResponse(compressed); });
  const result = await loadBinary(rawUrl, gzipUrl, value => progress.push(value));
  assert.deepEqual(new Uint8Array(result), original);
  assert.deepEqual(requested, [gzipUrl]);
  assertProgress(progress);
  assert.equal(progress[0], Math.ceil(compressed.byteLength / 3) / compressed.byteLength, 'Progress uses compressed transport size, not decoded model size.');
});

test('without DecompressionStream the loader fetches the raw model and still reports progress', async t => {
  const requested = [], progress = [];
  replaceGlobal(t, 'DecompressionStream', undefined);
  replaceGlobal(t, 'fetch', async url => { requested.push(url); return streamedResponse(original); });
  const result = await loadBinary(rawUrl, gzipUrl, value => progress.push(value));
  assert.deepEqual(new Uint8Array(result), original);
  assert.deepEqual(requested, [rawUrl]);
  assertProgress(progress);
});

test('HTTP asset failures surface once instead of retrying or silently switching transports', async t => {
  const requested = [], progress = [];
  replaceGlobal(t, 'fetch', async url => { requested.push(url); return new Response(null, { status: 404 }); });
  await assert.rejects(loadBinary(rawUrl, gzipUrl, value => progress.push(value)), /Model asset unavailable \(404\)/);
  assert.deepEqual(requested, [gzipUrl]);
  assert.deepEqual(progress, []);
});

test('one interrupted fetch retries the selected transport and resets progress before recovery', async t => {
  const requested = [], progress = [];
  replaceGlobal(t, 'fetch', async url => {
    requested.push(url);
    if (requested.length === 1) throw new TypeError('Failed to fetch');
    return streamedResponse(compressed);
  });
  const result = await loadBinary(rawUrl, gzipUrl, value => progress.push(value));
  assert.deepEqual(new Uint8Array(result), original);
  assert.deepEqual(requested, [gzipUrl, gzipUrl]);
  assert.equal(progress[0], 0);
  assertProgress(progress.slice(1));
});

test('corrupt compressed data is an asset error and does not trigger a network retry', async t => {
  let attempts = 0;
  replaceGlobal(t, 'fetch', async () => { attempts++; return streamedResponse(original); });
  await assert.rejects(loadBinary(rawUrl, gzipUrl));
  assert.equal(attempts, 1);
});

test('a browser-decoded gzip response is not decompressed twice or measured against compressed length', async t => {
  const requested = [], progress = [];
  replaceGlobal(t, 'fetch', async url => {
    requested.push(url);
    const response = streamedResponse(original);
    response.headers.set('content-encoding', 'gzip');
    response.headers.set('content-length', String(compressed.byteLength));
    return response;
  });
  const result = await loadBinary(rawUrl, gzipUrl, value => progress.push(value));
  assert.deepEqual(new Uint8Array(result), original);
  assert.deepEqual(requested, [gzipUrl]);
  assertProgress(progress);
  assert(progress.slice(0, -1).every(value => value === .4), 'Decoded chunks must use indeterminate progress instead of compressed Content-Length.');
});

test('a bodyless response reconstructs and decompresses its arrayBuffer fallback', async t => {
  const requested = [], progress = [];
  let bufferReads = 0;
  replaceGlobal(t, 'fetch', async url => {
    requested.push(url);
    return {
      ok: true,
      status: 200,
      body: null,
      headers: new Headers({ 'content-length': String(compressed.byteLength) }),
      async arrayBuffer() {
        bufferReads++;
        return compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength);
      }
    };
  });
  const result = await loadBinary(rawUrl, gzipUrl, value => progress.push(value));
  assert.deepEqual(new Uint8Array(result), original);
  assert.deepEqual(requested, [gzipUrl]);
  assert.equal(bufferReads, 1);
  assert(progress.length >= 2);
  assert(progress.slice(0, -1).every(value => value > 0 && value < 1));
  assert.equal(progress.at(-1), 1);
});
