import test from 'node:test';
import assert from 'node:assert/strict';
import { youtubeRefresh } from '../src/youtube-view.js';
const ids = ['a', 'b', 'c'];
async function fixture() {
  const config = { INNERTUBE_CONTEXT: { user: {} }, SESSION_INDEX: 0, DATASYNC_ID: 'account' };
  globalThis.window = { ytcfg: { get: key => config[key] } };
  globalThis.location = { pathname: '/playlist', href: 'https://www.youtube.com/playlist?list=WL' };
  const seed = JSON.stringify(['0', '', 'account']);
  const fingerprint = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed))).toString('hex');
  const before = { playlistId: 'WL', complete: true, fingerprint, items: ids.map(setVideoId => ({ setVideoId, videoId: 'abcdefghijk' })) };
  const list = { data: { contents: before.items.map(item => ({ playlistVideoRenderer: { ...item, navigationEndpoint: { watchEndpoint: { index: 0 }, commandMetadata: { webCommandMetadata: { url: '/watch?v=abcdefghijk&list=WL&index=1' } } } } })) },
    getClientRects: () => [1], closest: () => null,
    set(path, value) { assert.equal(path, 'data.contents'); this.data.contents = value; },
    querySelectorAll() { return this.data.contents.map(entry => ({ data: entry.playlistVideoRenderer, querySelector: () => ({ href: 'https://www.youtube.com' + entry.playlistVideoRenderer.navigationEndpoint.commandMetadata.webCommandMetadata.url }) })); }
  };
  const header = { data: { numVideosText: { runs: [{ text: '3' }, { text: ' videos' }] } }, getClientRects: () => [1], closest: () => null,
    set(path, value) { assert.equal(path, 'data.numVideosText'); this.data.numVideosText = value; }
  };
  globalThis.document = { querySelectorAll: selector => selector === 'ytd-playlist-video-list-renderer' ? [list] : [header] };
  return { before, list, header, config, after: { ...before, items: [before.items[2], before.items[0], before.items[1]] } };
}
test('native reorder changes the model and indices while preserving duplicate occurrences', async () => {
  const { before, after, list } = await fixture();
  assert.equal((await youtubeRefresh({ before, after })).updated, true);
  assert.deepEqual(list.data.contents.map(entry => entry.playlistVideoRenderer.setVideoId), ['c', 'a', 'b']);
  assert.deepEqual(list.data.contents.map(entry => entry.playlistVideoRenderer.navigationEndpoint.watchEndpoint.index), [0, 1, 2]);
});
test('native removal updates both rows and recognized header count', async () => {
  const { before, list, header } = await fixture();
  assert.equal((await youtubeRefresh({ before, after: { ...before, items: [before.items[1]] } })).updated, true);
  assert.equal(list.data.contents.length, 1);
  assert.deepEqual(header.data.numVideosText.runs, [{ text: '1' }, { text: ' video' }]);
});
for (const reason of ['partial list', 'unknown model', 'account changed', 'navigation', 'unknown count', 'new entry', 'changed video', 'stale DOM']) test(`view falls back without overwriting on ${reason}`, async () => {
  const { before, after, list, header, config } = await fixture();
  if (reason === 'partial list') list.data.contents.pop();
  if (reason === 'unknown model') list.set = null;
  if (reason === 'account changed') config.DATASYNC_ID = 'other';
  if (reason === 'navigation') location.href = 'https://www.youtube.com/playlist?list=PLother';
  if (reason === 'unknown count') { after.items.pop(); delete header.data.numVideosText; }
  if (reason === 'new entry') after.items.push({ setVideoId: 'new', videoId: 'lmnopqrstuv' });
  if (reason === 'changed video') after.items[0] = { ...after.items[0], videoId: 'lmnopqrstuv' };
  if (reason === 'stale DOM') list.querySelectorAll = () => [];
  const original = structuredClone(list.data.contents);
  assert.equal((await youtubeRefresh({ before, after })).updated, false);
  assert.deepEqual(list.data.contents, original);
});
test('already updated native models still require correct visible navigation indices', async () => {
  const { before, after, list } = await fixture();
  list.data.contents = after.items.map(item => ({ playlistVideoRenderer: { ...item, navigationEndpoint: { commandMetadata: { webCommandMetadata: { url: '/watch?v=abcdefghijk&list=WL&index=1' } } } } }));
  assert.equal((await youtubeRefresh({ before, after })).updated, false);
});
