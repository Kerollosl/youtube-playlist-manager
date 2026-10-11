import test from 'node:test';
import assert from 'node:assert/strict';
import { removeItems, reorderItems, orderPlan } from '../src/operations.js';
for (const kind of ['remove', 'reorder']) test(`${kind} honors stop after verifying a batch, before journaling the next`, async () => {
  const source = { playlistId: 'WL', fingerprint: 'account', complete: true, items: Array.from({ length: 101 }, (_, i) => ({ setVideoId: `entry-${i}`, videoId: 'abcdefghijk' })) };
  const state = structuredClone(source), job = { kind, sourceId: 'WL', sourceBefore: source, items: source.items, fingerprint: 'account', removed: [] };
  let stop = false, writes = 0; const checkpoints = [];
  const io = {
    beforeBatch: async () => { if (stop) throw Object.assign(new Error('Stopped'), { code: 'STOPPED' }); },
    save: async op => checkpoints.push(structuredClone(op)),
    editBatch: async (_, actions) => {
      writes++;
      for (const action of actions) {
        const at = state.items.findIndex(item => item.setVideoId === action.setVideoId), [item] = state.items.splice(at, 1);
        if (kind === 'reorder') state.items.splice(action.movedSetVideoIdPredecessor ? state.items.findIndex(entry => entry.setVideoId === action.movedSetVideoIdPredecessor) + 1 : 0, 0, item);
      }
    },
    read: async () => { stop = true; return structuredClone(state); }
  };
  await assert.rejects(kind === 'remove' ? removeItems(job, io) : reorderItems(job, orderPlan(source, source.items.map(item => item.setVideoId).reverse()), io), { code: 'STOPPED' });
  assert.equal(writes, 1); assert.equal(job.intent, null);
  assert.equal((kind === 'remove' ? job.removed : job.reordered).length, 50);
  assert.equal(checkpoints.length, 2); assert.equal(checkpoints[1].intent, null);
});
