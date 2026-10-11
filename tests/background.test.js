import test from 'node:test';
import assert from 'node:assert/strict';
let listener;
let data = {};
let edits = [];
let reads = [];
let mutationRequests = [];
let fingerprints = 'account-a';
const item = { setVideoId: 'one', videoId: 'abcdefghijk', title: 'One', index: 0, durationSeconds: 90, channel: 'Channel' };
let playlists;
let readResult;
const clone = value => structuredClone(value);
function reset() {
  data = {}; edits = []; reads = []; mutationRequests = []; fingerprints = 'account-a'; readResult = null;
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
    mutationRequests.push(clone(command));
    for (const action of command.actions || [command.action]) {
      edits.push({ ...clone(command), action });
      if (action.action === 'ACTION_ADD_VIDEO') playlists[command.playlistId].items.push({ ...item, videoId: action.addedVideoId, setVideoId: `new-${edits.length}` });
      else if (action.action === 'ACTION_REMOVE_VIDEO') playlists[command.playlistId].items = playlists[command.playlistId].items.filter(entry => entry.setVideoId !== action.setVideoId);
      else if (action.action === 'ACTION_MOVE_VIDEO_AFTER') {
        const items = playlists[command.playlistId].items;
        const from = items.findIndex(entry => entry.setVideoId === action.setVideoId);
        const [moved] = items.splice(from, 1);
        const predecessor = items.findIndex(entry => entry.setVideoId === action.movedSetVideoIdPredecessor);
        items.splice(predecessor + 1, 0, moved);
      }
    }
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
  assert.equal(mutationRequests.length, 1);
  assert.ok(reads.filter(read => read.playlistId === 'PLtarget').every(read => read.pickerVideoId === item.videoId));
  const finish = await send({ type: 'FINISH_MOVE', jobId: data.activeJob.id });
  assert.equal(finish.ok, true);
  assert.equal(data.queue, null);
  assert.equal(playlists.WL.items.length, 0);
  assert.equal(playlists.PLtarget.items.length, 1);
  assert.equal(mutationRequests.length, 2);
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
  assert.equal(reads.filter(read => read.playlistId === 'PLtarget').length, 3);
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

test('fifty removals use one mutation request and one verification read', async () => {
  reset();
  playlists.WL.items = Array.from({ length: 50 }, (_, index) => ({
    ...item, setVideoId: `set-${index}`, videoId: String(index).padStart(11, '0'), title: `Video ${index}`
  }));
  const result = await send({ type: 'REMOVE', playlistId: 'WL', keys: playlists.WL.items.map(entry => entry.setVideoId), expectedFingerprint: fingerprints });
  assert.equal(result.ok, true);
  assert.equal(playlists.WL.items.length, 0);
  assert.equal(mutationRequests.length, 1);
  assert.equal(mutationRequests[0].actions.length, 50);
  assert.equal(reads.filter(read => read.playlistId === 'WL').length, 2);
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
  assert.equal(data.activeJob.intent.kind, 'add_batch');
  assert.equal(reads.filter(read => read.playlistId === 'PLtarget').length, 4);
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
for (const problem of ['wrong job', 'removal started', 'batch removal started', 'extra copies']) test(`copy recheck rejects ${problem}`, async () => {
  reset(); pendingCopy('move'); playlists.PLtarget.items.push({ ...item, setVideoId: 'copy-one' });
  if (problem === 'removal started') data.activeJob.intent = { kind: 'remove', setVideoId: 'one' };
  if (problem === 'batch removal started') data.activeJob.intent = { kind: 'remove_batch', setVideoIds: ['one'], batchSize: 1 };
  if (problem === 'extra copies') playlists.PLtarget.items.push({ ...item, setVideoId: 'copy-two' });
  const original = clone(data.activeJob);
  const result = await send({ type: 'CHECK_OPERATION', jobId: problem === 'wrong job' ? 'different' : 'pending' });
  assert.equal(result.ok, false); assert.deepEqual(data.activeJob, original); assert.equal(edits.length, 0);
 });

test('finish move uses the current source snapshot and preserves newly added videos', async () => {
  reset();
  const copied = await send({ type: 'TRANSFER', kind: 'move', playlistId: 'WL', keys: ['one'], expectedFingerprint: fingerprints, targetId: 'PLtarget' });
  assert.equal(copied.ok, true);
  playlists.WL.items.unshift({ ...item, setVideoId: 'unrelated', videoId: 'lmnopqrstuv' });
  const result = await send({ type: 'FINISH_MOVE', jobId: copied.job.id });
  assert.equal(result.ok, true);
  assert.deepEqual(playlists.WL.items.map(entry => entry.setVideoId), ['unrelated']);
  assert.equal(data.history[0].sourceBefore.items.length, 1);
  assert.equal(data.history[0].removalBefore.items.length, 2);
});

for (const change of ['missing', 'replaced']) test(`finish move stops before mutation when a source occurrence is ${change}`, async () => {
  reset();
  const copied = await send({ type: 'TRANSFER', kind: 'move', playlistId: 'WL', keys: ['one'], expectedFingerprint: fingerprints, targetId: 'PLtarget' });
  if (change === 'missing') playlists.WL.items = [];
  else playlists.WL.items[0].videoId = 'lmnopqrstuv';
  const result = await send({ type: 'FINISH_MOVE', jobId: copied.job.id });
  assert.equal(result.ok, false);
  assert.match(result.error, /selection changed|source entry changed/);
  assert.equal(mutationRequests.length, 1);
  assert.equal(data.activeJob.removed.length, 0);
});

test('reorder selection uses one batch, keeps all occurrences, and archives the backup', async () => {
  reset();
  playlists.WL.items = ['first', 'second', 'third', 'fourth'].map(setVideoId => ({ ...item, setVideoId }));
  const expectedOrder = playlists.WL.items.map(entry => entry.setVideoId);
  const result = await send({ type: 'REORDER', playlistId: 'WL', keys: ['fourth', 'second'], expectedFingerprint: fingerprints, expectedOrder, position: 'top' });
  assert.equal(result.ok, true);
  assert.deepEqual(playlists.WL.items.map(entry => entry.setVideoId), ['second', 'fourth', 'first', 'third']);
  assert.equal(mutationRequests.length, 1);
  assert.equal(mutationRequests[0].actions.length, 2);
  assert.equal(reads.length, 2);
  assert.equal(data.activeJob, null);
  assert.deepEqual(data.history[0].sourceBefore.items.map(entry => entry.setVideoId), expectedOrder);
});

for (const problem of ['stale order', 'not editable', 'cannot reorder', 'selected target', 'account']) test(`reorder rejects ${problem} before any request`, async () => {
  reset(); playlists.WL.items.push({ ...item, setVideoId: 'two' });
  const args = { type: 'REORDER', playlistId: 'WL', keys: ['one'], expectedFingerprint: fingerprints, expectedOrder: ['one', 'two'], position: 'bottom' };
  if (problem === 'stale order') args.expectedOrder.reverse();
  if (problem === 'not editable') playlists.WL.editable = false;
  if (problem === 'cannot reorder') playlists.WL.canReorder = false;
  if (problem === 'selected target') { args.position = 'before'; args.beforeId = 'one'; }
  if (problem === 'account') args.expectedFingerprint = 'different';
  const result = await send(args);
  assert.equal(result.ok, false);
  assert.equal(mutationRequests.length, 0);
  assert.equal(data.activeJob, undefined);
});

test('sort batches a reverse playlist and keeps every duplicate occurrence', async () => {
  reset();
  playlists.WL.items = Array.from({ length: 101 }, (_, index) => ({ ...item, setVideoId: `entry-${index}`, title: String(100 - index).padStart(3, '0') }));
  const keys = playlists.WL.items.map(entry => entry.setVideoId);
  const result = await send({ type: 'SORT', playlistId: 'WL', keys, expectedFingerprint: fingerprints, sortBy: 'title' });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(playlists.WL.items.map(entry => entry.setVideoId), [...keys].reverse());
  assert.deepEqual(mutationRequests.map(request => request.actions.length), [50, 50]);
  assert.equal(reads.length, 3); // fresh source + one exact verification per batch
  assert.equal(data.history[0].sourceBefore.items.length, 101);
  assert.equal(data.history[0].phase, 'completed');
});
test('already sorted playlist completes without mutation or redundant reread', async () => {
  reset();
  const result = await send({ type: 'SORT', playlistId: 'WL', keys: ['one'], expectedFingerprint: fingerprints, sortBy: 'title' });
  assert.equal(result.ok, true, result.error); assert.equal(edits.length, 0); assert.equal(reads.length, 1);
});
test('routine status omits immutable backups; detailed recovery keeps their exact contents', async () => {
  reset();
  const backup = { ...playlists.WL, items: Array.from({ length: 1000 }, (_, i) => ({ ...item, setVideoId: `entry-${i}` })) };
  data.activeJob = { id: 'saved', kind: 'copy', phase: 'interrupted', items: [item], sourceBefore: backup, targetBefore: backup, desiredIds: backup.items.map(entry => entry.setVideoId) };
  data.queue = { items: [item], sourceBefore: backup };
  data.history = Array.from({ length: 10 }, () => clone(data.activeJob)); data.historyCount = 10;
  const compact = await send({ type: 'STATUS' }), full = await send({ type: 'STATUS', detailed: true });
  assert.equal(compact.historyCount, 10); assert.equal(compact.history, undefined);
  assert.equal(compact.activeJob.sourceBefore.items, undefined);
  assert.equal(compact.queue.items.length, 1);
  assert.deepEqual(full.activeJob.sourceBefore, backup);
  assert.deepEqual(full.history[0].targetBefore, backup);
  assert.ok(JSON.stringify(compact).length < JSON.stringify(full).length / 100);
  assert.deepEqual(data.activeJob.sourceBefore, backup);
});
test('natural descending sort preserves the source order of equal titles', async () => {
  reset();
  playlists.WL.items = ['Episode 2', 'episode 2', 'Episode 10', 'Episode 1'].map((title, index) => ({ ...item, title, setVideoId: `entry-${index}` }));
  const result = await send({ type: 'SORT', playlistId: 'WL', keys: playlists.WL.items.map(entry => entry.setVideoId), expectedFingerprint: fingerprints, sortBy: 'title', descending: true });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(playlists.WL.items.map(entry => entry.setVideoId), ['entry-2', 'entry-0', 'entry-1', 'entry-3']);
});
