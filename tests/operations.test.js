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
