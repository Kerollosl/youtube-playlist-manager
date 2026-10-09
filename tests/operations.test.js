import test from 'node:test';
import assert from 'node:assert/strict';
import { linksText, copyItems, removeItems, assertCopied, assertComplete } from '../src/operations.js';
const a = { setVideoId: 'a', videoId: 'abcdefghijk', title: 'One' };
const b = { setVideoId: 'b', videoId: 'lmnopqrstuv', title: 'Two' };
const source = { playlistId: 'WL', fingerprint: 'account', complete: true, items: [a, b] };
const target = { playlistId: 'PLdest', fingerprint: 'account', complete: true, items: [] };
const job = () => ({ kind: 'move', sourceId: 'WL', targetId: 'PLdest', fingerprint: 'account', items: [a, b], sourceBefore: structuredClone(source), targetBefore: structuredClone(target), copied: [], removed: [] });
function memoryIO(options = {}) {
  const states = { WL: structuredClone(source), PLdest: structuredClone(target) };
  const calls = [];
  const checkpoints = [];
  let count = 0;
  return { states, calls, checkpoints,
    wait: async () => {},
    read: async id => structuredClone(states[id]),
    save: async job => { if (options.failSave) throw new Error('storage quota'); checkpoints.push(structuredClone(job)); },
    editBatch: async (id, actions) => {
      calls.push({ id, actions: structuredClone(actions) });
      for (const action of actions) {
        count++;
        if (options.failSecond && count === 2) throw new Error('network');
        if (action.action === 'ACTION_ADD_VIDEO') states[id].items.push({ videoId: action.addedVideoId, setVideoId: `added-${count}` });
        else states[id].items = states[id].items.filter(item => item.setVideoId !== action.setVideoId);
      }
      if (options.lostReply) throw new Error('response lost');
    }
  };
}
test('plain text links have no tracking, titles, bullets, or playlist parameters', () => {
  assert.equal(linksText([a, b]), 'https://www.youtube.com/watch?v=abcdefghijk\nhttps://www.youtube.com/watch?v=lmnopqrstuv');
});
test('copy phase never removes originals and journals intent before each write', async () => {
  const io = memoryIO(); const op = job();
  await copyItems(op, io);
  assert.equal(io.states.WL.items.length, 2);
  assert.equal(io.states.PLdest.items.length, 2);
  assert.deepEqual(io.calls[0].actions.map(action => action.action), ['ACTION_ADD_VIDEO', 'ACTION_ADD_VIDEO']);
  assert.equal(io.calls.length, 1);
  assert.equal(io.checkpoints[0].intent.kind, 'add_batch');
  assert.equal(io.checkpoints[0].copied.length, 0);
  await removeItems(op, io);
  assert.equal(io.states.WL.items.length, 0);
  assert.equal(io.states.PLdest.items.length, 2);
  assert.equal(io.calls.length, 2);
  assert.equal(io.calls[1].actions.length, 2);
});
test('partial batch ambiguity leaves every original and prevents move removal', async () => {
  const io = memoryIO({ failSecond: true }); const op = job();
  await assert.rejects(copyItems(op, io), /changed unexpectedly/);
  assert.equal(io.states.WL.items.length, 2);
  await assert.rejects(removeItems(op, io), /missing/);
  assert.ok(io.calls.every(call => call.actions.every(action => action.action === 'ACTION_ADD_VIDEO')));
});
test('lost mutation response is reconciled by exact count, without blind retry', async () => {
  const io = memoryIO({ lostReply: true }); const op = job();
  await copyItems(op, io);
  assert.equal(io.calls.length, 1);
  assert.equal(io.states.WL.items.length, 2);
});
test('existing video presence is insufficient proof of a new copy', () => {
  const op = job(); op.targetBefore.items = [structuredClone(a)];
  const result = { ...target, items: [a, b] };
  assert.throws(() => assertCopied(op, result), /missing/);
});
test('a destination deletion or account switch prevents source removal', async () => {
  const io = memoryIO(); const op = job(); await copyItems(op, io);
  io.states.PLdest.items.pop();
  await assert.rejects(removeItems(op, io), /missing/);
  assert.equal(io.states.WL.items.length, 2);
  io.states.PLdest.fingerprint = 'other-account';
  await assert.rejects(removeItems(op, io), /account changed/);
});
test('storage failure happens before any network mutation', async () => {
  const io = memoryIO({ failSave: true });
  await assert.rejects(copyItems(job(), io), /storage quota/);
  assert.equal(io.calls.length, 0);
});
test('incomplete playlist errors identify the failed list and reader reason', () => {
  assert.throws(() => assertComplete({ title: 'Empty destination', complete: false,
    warnings: ['Unsupported empty playlist format.'] }), /Empty destination.*Unsupported empty playlist format/);
});

test('delayed copy visibility is verified with read-only retries and one add', async () => {
  const io = memoryIO(), op = job(); op.items = [a];
  const realRead = io.read, waits = [], editBatch = io.editBatch;
  let staleReads = 0;
  io.editBatch = async (...args) => { await editBatch(...args); staleReads = 3; };
  io.read = async id => {
    if (id === 'PLdest' && staleReads > 0) { staleReads--; return structuredClone(target); }
    return realRead(id);
  };
  io.wait = async ms => waits.push(ms);
  await copyItems(op, io);
  assert.deepEqual(waits, [250, 500, 1000]);
  assert.equal(op.verification.attempts, 4);
  assert.equal(io.calls.length, 1);
  assert.deepEqual(op.copied, ['a']);
  assert.equal(io.states.WL.items.length, 2);
});
test('a delayed copy with a lost acknowledgement is not added twice', async () => {
  const io = memoryIO({ lostReply: true }), op = job(); op.items = [a];
  const realRead = io.read, editBatch = io.editBatch;
  let staleReads = 0;
  io.editBatch = async (...args) => { try { await editBatch(...args); } finally { staleReads = 2; } };
  io.read = async id => id === 'PLdest' && staleReads-- > 0 ? structuredClone(target) : realRead(id);
  await copyItems(op, io);
  assert.equal(io.calls.length, 1);
  assert.deepEqual(op.copied, ['a']);
});
test('unchanged copy results stop after bounded reads and retain the intent and originals', async () => {
  const io = memoryIO(), op = job(); op.items = [a];
  io.editBatch = async (id, actions) => io.calls.push({ id, actions });
  const waits = []; io.wait = async ms => waits.push(ms);
  await assert.rejects(copyItems(op, io), /batch could not be verified after 5 checks/);
  assert.equal(io.calls.length, 1);
  assert.deepEqual(waits, [250, 500, 1000, 2000]);
  assert.equal(op.intent.kind, 'add_batch');
  assert.equal(op.copied.length, 0);
  assert.equal(io.states.WL.items.length, 2);
});
test('a conflicting copy count or account change does not get masked by retries', async () => {
  for (const variant of ['duplicate', 'account']) {
    const io = memoryIO(), op = job(); op.items = [a];
    const editBatch = io.editBatch; let waits = 0;
    io.wait = async () => waits++;
    io.editBatch = async (...args) => {
      await editBatch(...args);
      if (variant === 'duplicate') io.states.PLdest.items.push({ ...a, setVideoId: 'unexpected' });
      else io.states.PLdest.fingerprint = 'other-account';
    };
    await assert.rejects(copyItems(op, io), variant === 'duplicate' ? /changed unexpectedly/ : /account changed/);
    assert.equal(waits, 0);
    assert.equal(io.calls.length, 1);
    assert.equal(io.states.WL.items.length, 2);
  }
});

test('up to fifty videos use one mutation request and one verification read', async () => {
  const io = memoryIO(), op = job();
  op.items = Array.from({ length: 50 }, (_, index) => ({ setVideoId: `set-${index}`, videoId: `${String(index).padStart(11, '0')}` }));
  let targetReads = 0;
  const read = io.read;
  io.read = async id => { if (id === 'PLdest') targetReads++; return read(id); };
  await copyItems(op, io);
  assert.equal(io.calls.length, 1);
  assert.equal(io.calls[0].actions.length, 50);
  assert.equal(targetReads, 1);
  assert.equal(op.copied.length, 50);
});

test('multiple copy batches verify cumulative duplicate counts without replay', async () => {
  const io = memoryIO(), op = job();
  op.items = Array.from({ length: 51 }, (_, index) => ({ ...a, setVideoId: `set-${index}` }));
  io.states.PLdest.items = [{ ...a, setVideoId: 'existing' }];
  op.targetBefore = structuredClone(io.states.PLdest);
  await copyItems(op, io);
  assert.deepEqual(io.calls.map(call => call.actions.length), [50, 1]);
  assert.equal(io.states.PLdest.items.length, 52);
  assert.equal(op.copied.length, 51);
});

test('multiple removal batches verify the cumulative remaining occurrence order', async () => {
  const io = memoryIO(), op = job(); op.kind = 'remove';
  op.items = Array.from({ length: 51 }, (_, index) => ({ ...a, setVideoId: `set-${index}` }));
  io.states.WL.items = [b, ...op.items]; op.sourceBefore = structuredClone(io.states.WL);
  await removeItems(op, io);
  assert.deepEqual(io.calls.map(call => call.actions.length), [50, 1]);
  assert.deepEqual(io.states.WL.items, [b]);
  assert.equal(op.removed.length, 51);
});

test('move checks destination copies again before the next removal batch', async () => {
  const io = memoryIO(), op = job();
  op.items = Array.from({ length: 51 }, (_, index) => ({ ...a, setVideoId: `set-${index}` }));
  io.states.WL.items = structuredClone(op.items); op.sourceBefore = structuredClone(io.states.WL);
  await copyItems(op, io);
  const editBatch = io.editBatch;
  io.editBatch = async (id, actions) => {
    await editBatch(id, actions);
    if (id === 'WL') io.states.PLdest.items.pop();
  };
  await assert.rejects(removeItems(op, io), /destination copy is missing/);
  assert.equal(io.states.WL.items.length, 1);
  assert.equal(op.removed.length, 50);
  assert.equal(io.calls.filter(call => call.id === 'WL').length, 1);
});

test('partial removal stops after one request and preserves its uncertain journal', async () => {
  const io = memoryIO({ failSecond: true }), op = job(); op.kind = 'remove';
  await assert.rejects(removeItems(op, io), /network/);
  assert.equal(io.calls.length, 1);
  assert.deepEqual(io.states.WL.items, [b]);
  assert.equal(op.intent.kind, 'remove_batch');
  assert.deepEqual(op.removed, []);
});
