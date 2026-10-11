// Deterministic request budget; no live account, network, or wall-clock claims.
import { orderPlan, BATCH_SIZE } from '../src/operations.js';
for (const size of [100, 1000, 10000]) {
  const ids = Array.from({ length: size }, (_, i) => `entry-${i}`);
  const snapshot = { complete: true, playlistId: 'WL', fingerprint: 'benchmark', items: ids.map(setVideoId => ({ setVideoId, videoId: 'abcdefghijk' })) };
  for (const [name, desired] of [['unchanged', ids], ['rotate one', [...ids.slice(1), ids[0]]], ['reverse', [...ids].reverse()]]) {
    const start = performance.now(), plan = orderPlan(snapshot, desired), elapsed = performance.now() - start;
    const batches = Math.ceil(plan.actions.length / BATCH_SIZE);
    console.log(JSON.stringify({ entries: size, scenario: name, moves: plan.actions.length, editRequests: batches, playlistReads: 1 + batches, previousEditRequests: size - 1, previousPlaylistReads: 2 * size, plannerMs: Number(elapsed.toFixed(2)) }));
  }
}

// Serialized checkpoint bytes for a synthetic 1,000-entry operation.
const { saveJob } = await import('../src/job-store.js');
const records = [];
const storage = { set: async value => records.push(Buffer.byteLength(JSON.stringify(value))) };
const items = Array.from({ length: 1000 }, (_, index) => ({ setVideoId: `entry-${index}`, videoId: 'abcdefghijk', title: `Video ${index}` }));
const job = { id: 'benchmark', items, sourceBefore: { playlistId: 'WL', items }, targetBefore: { playlistId: 'PLtarget', items }, copied: [], phase: 'copying' };
await saveJob(storage, job); job.copied.push('entry-0'); await saveJob(storage, job);
console.log(JSON.stringify({ scenario: 'checkpoint storage', firstWriteBytes: records[0], nextCheckpointBytes: records[1], reductionPercent: Number((100 * (1 - records[1] / records[0])).toFixed(2)) }));
