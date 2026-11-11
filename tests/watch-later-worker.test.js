import test from 'node:test';
import assert from 'node:assert/strict';
import { KEYS } from '../src/watch-later.js';

let listener;
const data = { [KEYS.inProgress]: true, [KEYS.sources]: [] };
const base = 'chrome-extension://test-extension/';
globalThis.chrome = {
  runtime: {
    id: 'test-extension', getURL: path => base + path,
    onMessage: { addListener: fn => { listener = fn; } },
    sendMessage: async () => {}
  },
  storage: { local: {
    get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, structuredClone(data[key])])),
    set: async update => Object.assign(data, structuredClone(update))
  } },
  tabs: { query: async () => [{ id: 7 }] },
  scripting: { executeScript: async request => request.files ? [] : [{ result: { ok: true, playlists: [], truncated: false } }] }
};
const { runWatchLaterSync } = await import('../src/watch-later-worker.js');
const send = (sender, type) => new Promise(resolve => {
  assert.equal(listener({ type }, sender, resolve), true, 'Keep the response channel alive until completion');
});
const sender = { id: chrome.runtime.id, url: base + 'src/popup.html' };

test('a worker restart clears the stale running flag before accepting sync', async () => {
  assert.equal((await send(sender, 'WL_STATUS')).running, false);
  assert.equal((await runWatchLaterSync()).needsSources, true);
  assert.equal(data[KEYS.inProgress], false);
});

test('action popup and embedded extension frame both receive actual sync completion', async () => {
  for (const context of [sender, { ...sender, url: sender.url + '?embed=1&theme=dark', tab: { id: 7 }, frameId: 3 }]) {
    const result = await send(context, 'WL_START_SYNC');
    assert.equal(result.ok, true);
    assert.equal(result.needsSources, true);
    assert.equal(data[KEYS.inProgress], false);
  }
});

test('embedded configuration can load the library', async () => {
  const result = await send({ ...sender, url: sender.url + '?embed=1', tab: { id: 7 } }, 'WL_LOAD_LIBRARY');
  assert.equal(result.ok, true);
  assert.deepEqual(result.playlists, []);
});

test('web pages, content scripts, and lookalike extension URLs cannot drive the panel worker', () => {
  for (const untrusted of [
    { ...sender, id: 'another-extension' },
    { ...sender, url: 'https://www.youtube.com/playlist?list=WL', tab: { id: 7 } },
    { ...sender, url: sender.url + '.spoof' },
    { ...sender, url: 'https://example.com/' }
  ]) {
    let responded = false;
    assert.equal(listener({ type: 'WL_START_SYNC' }, untrusted, () => { responded = true; }), undefined);
    assert.equal(responded, false);
  }
});
