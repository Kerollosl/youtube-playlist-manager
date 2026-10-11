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
