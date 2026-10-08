import test from 'node:test';
import assert from 'node:assert/strict';
let listener;
let data = {};
let edits = [];
let fingerprints = 'account-a';
const item = { setVideoId: 'one', videoId: 'abcdefghijk', title: 'One', index: 0, durationSeconds: 90, channel: 'Channel' };
let playlists;
const clone = value => structuredClone(value);
function reset() {
  data = {}; edits = []; fingerprints = 'account-a';
  playlists = {
    WL: { playlistId: 'WL', complete: true, editable: true, canReorder: true, fingerprint: fingerprints, items: [clone(item)] },
    PLtarget: { playlistId: 'PLtarget', complete: true, editable: true, fingerprint: fingerprints, items: [] }
  };
}
globalThis.chrome = {
  runtime: { id: 'test-extension', onMessage: { addListener: fn => { listener = fn; } } },
  action: { onClicked: { addListener: () => {} } },
  tabs: { get: async id => ({ id, url: 'https://www.youtube.com/playlist?list=WL' }) },
  storage: { local: {
    get: async keys => Object.fromEntries((typeof keys === 'string' ? [keys] : keys).map(key => [key, clone(data[key])])),
    set: async update => { data = { ...data, ...clone(update) }; }
  } },
  scripting: { executeScript: async ({ args: [command] }) => {
    if (command.type === 'read') return [{ result: { ok: true, ...clone(playlists[command.playlistId]), fingerprint: fingerprints } }];
    if (command.type === 'playlists') return [{ result: { ok: true, fingerprint: fingerprints, playlists: [] } }];
    assert.equal(command.expectedFingerprint, fingerprints);
    edits.push(clone(command));
    if (command.action.action === 'ACTION_ADD_VIDEO') playlists[command.playlistId].items.push({ ...item, videoId: command.action.addedVideoId, setVideoId: `new-${edits.length}` });
    else if (command.action.action === 'ACTION_REMOVE_VIDEO') playlists[command.playlistId].items = playlists[command.playlistId].items.filter(entry => entry.setVideoId !== command.action.setVideoId);
    return [{ result: { ok: true } }];
  } }
};
await import('../src/background.js');
const sender = { id: 'test-extension', url: 'https://www.youtube.com/playlist?list=WL', tab: { id: 7 } };
const send = message => new Promise(resolve => listener(message, sender, resolve));

test('cut queues durable entries without issuing mutations', async () => {
  reset();
  const result = await send({ type: 'QUEUE', kind: 'move', playlistId: 'WL', keys: ['one'], expectedFingerprint: fingerprints });
  assert.equal(result.ok, true);
  assert.equal(data.queue.items[0].setVideoId, 'one');
  assert.equal(data.queue.sourceBefore.items.length, 1);
  assert.equal(edits.length, 0);
});
test('paste cut selection verifies copies and leaves source pending explicit finish', async () => {
  reset();
  await send({ type: 'QUEUE', kind: 'move', playlistId: 'WL', keys: ['one'], expectedFingerprint: fingerprints });
  const pasted = await send({ type: 'PASTE', targetId: 'PLtarget', expectedQueueId: data.queue.id });
  assert.equal(pasted.ok, true);
  assert.equal(data.activeJob.phase, 'ready_to_remove');
  assert.equal(playlists.WL.items.length, 1);
  assert.equal(playlists.PLtarget.items.length, 1);
  const finish = await send({ type: 'FINISH_MOVE', jobId: data.activeJob.id });
  assert.equal(finish.ok, true);
  assert.equal(data.queue, null);
  assert.equal(playlists.WL.items.length, 0);
  assert.equal(playlists.PLtarget.items.length, 1);
});
test('account switch after review prevents direct operation before any edits', async () => {
  reset(); fingerprints = 'account-b';
  const result = await send({ type: 'TRANSFER', playlistId: 'WL', keys: ['one'], expectedFingerprint: 'account-a', kind: 'move', targetId: 'PLtarget' });
  assert.equal(result.ok, false);
  assert.match(result.error, /account changed/);
  assert.equal(edits.length, 0);
});
test('copy clipboard remains usable when original entries disappear', async () => {
  reset();
  await send({ type: 'QUEUE', kind: 'copy', playlistId: 'WL', keys: ['one'], expectedFingerprint: fingerprints });
  playlists.WL.items = [];
  const result = await send({ type: 'PASTE', targetId: 'PLtarget', expectedQueueId: data.queue.id });
  assert.equal(result.ok, true);
  assert.equal(playlists.PLtarget.items[0].videoId, item.videoId);
});
test('interrupted persisted job blocks a fresh operation rather than replaying blindly', async () => {
  reset(); data.activeJob = { id: 'interrupted', phase: 'copying' };
  const result = await send({ type: 'TRANSFER', playlistId: 'WL', keys: ['one'], expectedFingerprint: fingerprints, targetId: 'PLtarget' });
  assert.equal(result.ok, false);
  assert.match(result.error, /saved operation/);
  assert.equal(edits.length, 0);
});
test('page selection can be saved and pasted without any removal source', async () => {
  reset();
  const queued = await send({ type: 'QUEUE_LINKS', kind: 'copy', items: [{ videoId: item.videoId, title: item.title }] });
  assert.equal(queued.ok, true);
  assert.equal(data.queue.sourceId, null);
  const pasted = await send({ type: 'PASTE', targetId: 'PLtarget', expectedQueueId: data.queue.id });
  assert.equal(pasted.ok, true);
  assert.equal(playlists.PLtarget.items.length, 1);
  assert.ok(edits.every(edit => edit.action.action === 'ACTION_ADD_VIDEO'));
});

 test('paste refuses a different clipboard than the one reviewed', async () => {
  reset();
  await send({ type: 'QUEUE', kind: 'copy', playlistId: 'WL', keys: ['one'], expectedFingerprint: fingerprints });
  const reviewedId = data.queue.id;
  await send({ type: 'QUEUE', kind: 'copy', playlistId: 'WL', keys: ['one'], expectedFingerprint: fingerprints });
  const result = await send({ type: 'PASTE', targetId: 'PLtarget', expectedQueueId: reviewedId });
  assert.equal(result.ok, false);
  assert.match(result.error, /selection changed/);
  assert.equal(edits.length, 0);
});
