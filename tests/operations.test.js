import test from 'node:test';
import assert from 'node:assert/strict';
import { linksText, copyItems, removeItems, assertCopied, assertComplete } from '../src/operations.js';
const a = { setVideoId: 'a', videoId: 'abcdefghijk', title: 'One' };
const b = { setVideoId: 'b', videoId: 'lmnopqrstuv', title: 'Two' };
const source = { playlistId: 'WL', fingerprint: 'account', complete: true, items: [a, b] };
const target = { playlistId: 'PLdest', fingerprint: 'account', complete: true, items: [] };
const job = () => ({ kind: 'move', sourceId: 'WL', targetId: 'PLdest', fingerprint: 'account', items: [a, b], targetBefore: structuredClone(target), copied: [], removed: [] });
function memoryIO(options = {}) {
  const states = { WL: structuredClone(source), PLdest: structuredClone(target) };
  const calls = [];
  const checkpoints = [];
  let count = 0;
  return { states, calls, checkpoints,
    wait: async () => {},
    read: async id => structuredClone(states[id]),
    save: async job => { if (options.failSave) throw new Error('storage quota'); checkpoints.push(structuredClone(job)); },
    edit: async (id, action) => {
      calls.push({ id, action }); count++;
      if (options.failSecond && count === 2) throw new Error('network');
      if (action.action === 'ACTION_ADD_VIDEO') states[id].items.push({ videoId: action.addedVideoId, setVideoId: `added-${count}` });
      else states[id].items = states[id].items.filter(item => item.setVideoId !== action.setVideoId);
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
  assert.ok(io.calls.every(call => call.action.action === 'ACTION_ADD_VIDEO'));
  assert.equal(io.checkpoints[0].intent.kind, 'add');
  assert.equal(io.checkpoints[0].copied.length, 0);
  await removeItems(op, io);
  assert.equal(io.states.WL.items.length, 0);
  assert.equal(io.states.PLdest.items.length, 2);
});
test('partial copy failure leaves every original and prevents move removal', async () => {
  const io = memoryIO({ failSecond: true }); const op = job();
  await assert.rejects(copyItems(op, io), /network/);
  assert.equal(io.states.WL.items.length, 2);
  await assert.rejects(removeItems(op, io), /missing/);
  assert.ok(io.calls.every(call => call.action.action === 'ACTION_ADD_VIDEO'));
});
test('lost mutation response is reconciled by exact count, without blind retry', async () => {
  const io = memoryIO({ lostReply: true }); const op = job();
  await copyItems(op, io);
  assert.equal(io.calls.length, 2);
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
  const realRead = io.read, waits = [], edit = io.edit;
  let staleReads = 0;
  io.edit = async (...args) => { await edit(...args); staleReads = 3; };
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
  const realRead = io.read, edit = io.edit;
  let staleReads = 0;
  io.edit = async (...args) => { try { await edit(...args); } finally { staleReads = 2; } };
  io.read = async id => id === 'PLdest' && staleReads-- > 0 ? structuredClone(target) : realRead(id);
  await copyItems(op, io);
  assert.equal(io.calls.length, 1);
  assert.deepEqual(op.copied, ['a']);
});
test('unchanged copy results stop after bounded reads and retain the intent and originals', async () => {
  const io = memoryIO(), op = job(); op.items = [a];
  io.edit = async (id, action) => io.calls.push({ id, action });
  const waits = []; io.wait = async ms => waits.push(ms);
  await assert.rejects(copyItems(op, io), /5 checks.*expected 1 copies, found 0/);
  assert.equal(io.calls.length, 1);
  assert.deepEqual(waits, [250, 500, 1000, 2000]);
  assert.equal(op.intent.kind, 'add');
  assert.equal(op.copied.length, 0);
  assert.equal(io.states.WL.items.length, 2);
});
test('a conflicting copy count or account change does not get masked by retries', async () => {
  for (const variant of ['duplicate', 'account']) {
    const io = memoryIO(), op = job(); op.items = [a];
    const edit = io.edit; let waits = 0;
    io.wait = async () => waits++;
    io.edit = async (...args) => {
      await edit(...args);
      if (variant === 'duplicate') io.states.PLdest.items.push({ ...a, setVideoId: 'unexpected' });
      else io.states.PLdest.fingerprint = 'other-account';
    };
    await assert.rejects(copyItems(op, io), variant === 'duplicate' ? /expected 1 copies, found 2/ : /account changed/);
    assert.equal(waits, 0);
    assert.equal(io.calls.length, 1);
    assert.equal(io.states.WL.items.length, 2);
  }
});

test('a stale final browse is rechecked without repeating a verified add', async () => {
  const io = memoryIO(), op = job(); op.items = [a];
  const read = io.read; let targetReads = 0;
  io.read = async id => {
    if (id === 'PLdest' && ++targetReads === 3) return structuredClone(target);
    return read(id);
  };
  await copyItems(op, io);
  assert.equal(op.finalVerification.attempts, 2);
  assert.equal(io.calls.length, 1);
  assert.equal(io.states.WL.items.length, 2);
});
