import test from 'node:test';
import assert from 'node:assert/strict';
let listener;
let data = {};
let edits = [];
let reads = [];
let fingerprints = 'account-a';
const item = { setVideoId: 'one', videoId: 'abcdefghijk', title: 'One', index: 0, durationSeconds: 90, channel: 'Channel' };
let playlists;
let readResult;
const clone = value => structuredClone(value);
function reset() {
  data = {}; edits = []; reads = []; fingerprints = 'account-a'; readResult = null;
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
    if (command.type === 'read') { reads.push(clone(command)); return [{ result: readResult?.(command) ?? { ok: true, ...clone(playlists[command.playlistId]), fingerprint: fingerprints } }]; }
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
  assert.ok(reads.filter(read => read.playlistId === 'PLtarget').every(read => read.pickerVideoId === item.videoId));
  const finish = await send({ type: 'FINISH_MOVE', jobId: data.activeJob.id });
  assert.equal(finish.ok, true);
  assert.equal(data.queue, null);
  assert.equal(playlists.WL.items.length, 0);
  assert.equal(playlists.PLtarget.items.length, 1);
});
test('read-only diagnostics carry a selected video or durable saved probe without editing', async () => {
  reset();
  const selected = await send({ type: 'READ', playlistId: 'PLtarget', pickerVideoId: item.videoId });
  assert.equal(selected.ok, true);
  assert.equal(reads.at(-1).pickerVideoId, item.videoId);
  data.queue = { items: [item] };
  const saved = await send({ type: 'READ', playlistId: 'PLtarget' });
  assert.equal(saved.ok, true);
  assert.equal(reads.at(-1).pickerVideoId, item.videoId);
  const bad = await send({ type: 'READ', playlistId: 'PLtarget', pickerVideoId: 'invalid' });
  assert.equal(bad.ok, false);
  assert.equal(edits.length, 0);
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


test('post-add incomplete snapshot recovers without replaying the mutation', async () => {
  reset();
  let incomplete = 0;
  readResult = command => {
    if (command.playlistId === 'PLtarget' && edits.length && incomplete++ === 0) {
      return { ok: true, ...clone(playlists.PLtarget), complete: false, items: [] };
    }
  };
  const result = await send({ type: 'TRANSFER', playlistId: 'WL', keys: ['one'], expectedFingerprint: fingerprints, targetId: 'PLtarget' });
  assert.equal(result.ok, true);
  assert.equal(result.job.phase, 'completed');
  assert.equal(edits.length, 1);
  assert.equal(playlists.PLtarget.items.length, 1);
  assert.equal(playlists.WL.items.length, 1);
  assert.equal(reads.filter(read => read.playlistId === 'PLtarget').length, 5);
});

test('persistently incomplete source exhausts bounded reads and prevents removal', async () => {
  reset(); playlists.WL.complete = false;
  const result = await send({ type: 'REMOVE', playlistId: 'WL', keys: ['one'], expectedFingerprint: fingerprints });
  assert.equal(result.ok, false);
  assert.match(result.error, /Could not fully read/);
  assert.equal(reads.length, 3);
  assert.equal(edits.length, 0);
  assert.equal(playlists.WL.items.length, 1);
});

test('account switch on an incomplete retry stops immediately without edits', async () => {
  reset();
  readResult = command => ({ ok: true, ...clone(playlists[command.playlistId]), complete: false,
    fingerprint: reads.length === 1 ? 'account-a' : 'account-b' });
  const result = await send({ type: 'REMOVE', playlistId: 'WL', keys: ['one'], expectedFingerprint: fingerprints });
  assert.equal(result.ok, false);
  assert.match(result.error, /account changed/);
  assert.equal(reads.length, 2);
  assert.equal(edits.length, 0);
});

test('failed authentication read is not retried', async () => {
  reset(); readResult = () => ({ ok: false, error: 'Sign in again.' });
  const result = await send({ type: 'READ', playlistId: 'WL' });
  assert.equal(result.ok, false);
  assert.match(result.error, /Sign in again/);
  assert.equal(reads.length, 1);
});

test('remove requires editability and the exact reviewed occurrences', async () => {
  reset(); playlists.WL.editable = false;
  let result = await send({ type: 'REMOVE', playlistId: 'WL', keys: ['one'], expectedFingerprint: fingerprints });
  assert.equal(result.ok, false);
  assert.match(result.error, /not editable/);
  assert.equal(edits.length, 0);
  playlists.WL.editable = true;
  result = await send({ type: 'REMOVE', playlistId: 'WL', keys: ['missing'], expectedFingerprint: fingerprints });
  assert.equal(result.ok, false);
  assert.match(result.error, /selection changed/);
  assert.equal(edits.length, 0);
});


function pendingCopy(kind = 'copy') {
  data.activeJob = { id: 'pending', kind, sourceId: 'WL', targetId: 'PLtarget', fingerprint: fingerprints,
    items: [clone(item)], targetBefore: clone(playlists.PLtarget), copied: [], removed: [],
    phase: 'interrupted', error: 'Could not fully read', intent: { kind: 'add', videoId: item.videoId } };
}
for (const kind of ['copy', 'move']) {
  test(`read-only check reconciles a verified ${kind} without mutation`, async () => {
    reset(); pendingCopy(kind);
    playlists.PLtarget.items.push({ ...item, setVideoId: 'copied-one' });
    const result = await send({ type: 'CHECK_OPERATION' });
    assert.equal(result.ok, true);
    assert.equal(result.job.phase, kind === 'copy' ? 'completed' : 'ready_to_remove');
    assert.deepEqual(result.job.copied, ['one']);
    assert.equal(result.job.intent, null);
    assert.equal(result.job.error, undefined);
    assert.equal(edits.length, 0);
    assert.equal(playlists.WL.items.length, 1);
    if (kind === 'copy') {
      assert.equal(data.activeJob, null);
      assert.equal(data.history[0].phase, 'completed');
    } else assert.equal(data.activeJob.phase, 'ready_to_remove');
  });
}
for (const failure of ['missing copy', 'account mismatch', 'incomplete']) {
  test(`read-only check preserves saved job on ${failure}`, async () => {
    reset(); pendingCopy();
    const original = clone(data.activeJob);
    if (failure === 'account mismatch') fingerprints = 'account-b';
    if (failure === 'incomplete') playlists.PLtarget.complete = false;
    const result = await send({ type: 'CHECK_OPERATION' });
    assert.equal(result.ok, false);
    assert.deepEqual(data.activeJob, original);
    assert.equal(data.history, undefined);
    assert.equal(edits.length, 0);
  });
}

test('persistently incomplete post-add reads stop with one mutation and retained intent', async () => {
  reset();
  readResult = command => command.playlistId === 'PLtarget' && edits.length
    ? { ok: true, ...clone(playlists.PLtarget), complete: false, items: [] } : undefined;
  const result = await send({ type: 'TRANSFER', playlistId: 'WL', keys: ['one'], expectedFingerprint: fingerprints, targetId: 'PLtarget' });
  assert.equal(result.ok, false);
  assert.match(result.error, /Could not fully read/);
  assert.equal(edits.length, 1);
  assert.equal(playlists.PLtarget.items.length, 1);
  assert.equal(playlists.WL.items.length, 1);
  assert.equal(data.activeJob.phase, 'interrupted');
  assert.equal(data.activeJob.intent.kind, 'add');
  assert.equal(reads.filter(read => read.playlistId === 'PLtarget').length, 5);
});

for (const identity of ['missing account', 'wrong playlist']) {
  test(`incomplete read with ${identity} stops without retrying`, async () => {
    reset();
    readResult = () => ({ ok: true, ...clone(playlists.WL), complete: false,
      ...(identity === 'missing account' ? { fingerprint: '' } : { playlistId: 'PLother' }) });
    const result = await send({ type: 'READ', playlistId: 'WL' });
    assert.equal(result.ok, false);
    assert.match(result.error, identity === 'missing account' ? /Cannot identify/ : /playlist changed/);
    assert.equal(reads.length, 1);
    assert.equal(edits.length, 0);
  });
}

 test('reviewed delete archives an interrupted copy without losing its queue', async () => {
  reset(); pendingCopy(); data.queue = { id: 'saved-copy', kind: 'copy', items: [clone(item)] };
  const result = await send({ type: 'REMOVE', playlistId: 'WL', keys: ['one'], expectedFingerprint: fingerprints });
  assert.equal(result.ok, true); assert.equal(playlists.WL.items.length, 0);
  assert.equal(data.history[1].id, 'pending'); assert.equal(data.history[1].phase, 'stopped');
  assert.equal(data.queue.id, 'saved-copy'); assert.equal(edits.length, 1);
 });
 test('invalid delete preserves the interrupted copy unchanged', async () => {
  reset(); pendingCopy(); const original = clone(data.activeJob);
  const result = await send({ type: 'REMOVE', playlistId: 'WL', keys: ['missing'], expectedFingerprint: fingerprints });
  assert.equal(result.ok, false); assert.deepEqual(data.activeJob, original); assert.equal(edits.length, 0);
 });
 test('delete cannot bypass an unfinished move', async () => {
  reset(); pendingCopy('move');
  const result = await send({ type: 'REMOVE', playlistId: 'WL', keys: ['one'], expectedFingerprint: fingerprints });
  assert.equal(result.ok, false); assert.equal(edits.length, 0);
 });
 test('delete retries a stale read without replaying removal', async () => {
  reset(); const original = clone(playlists.WL); let stale = 0;
  readResult = command => command.playlistId === 'WL' && edits.length && stale++ < 2 ? { ok: true, ...original } : undefined;
  const result = await send({ type: 'REMOVE', playlistId: 'WL', keys: ['one'], expectedFingerprint: fingerprints });
  assert.equal(result.ok, true); assert.equal(edits.length, 1); assert.equal(playlists.WL.items.length, 0);
 });
 for (const problem of ['wrong job', 'removal started', 'extra copies']) test(`copy recheck rejects ${problem}`, async () => {
  reset(); pendingCopy('move'); playlists.PLtarget.items.push({ ...item, setVideoId: 'copy-one' });
  if (problem === 'removal started') data.activeJob.intent = { kind: 'remove', setVideoId: 'one' };
  if (problem === 'extra copies') playlists.PLtarget.items.push({ ...item, setVideoId: 'copy-two' });
  const original = clone(data.activeJob);
  const result = await send({ type: 'CHECK_OPERATION', jobId: problem === 'wrong job' ? 'different' : 'pending' });
  assert.equal(result.ok, false); assert.deepEqual(data.activeJob, original); assert.equal(edits.length, 0);
 });
