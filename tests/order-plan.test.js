import test from 'node:test';
import assert from 'node:assert/strict';
import { orderPlan, reorderItems } from '../src/operations.js';
const source = ids => ({ playlistId: 'WL', complete: true, fingerprint: 'account', items: ids.map(id => ({ setVideoId: id, videoId: 'abcdefghijk' })) });
function apply(ids, actions) {
  for (const action of actions) {
    const [id] = ids.splice(ids.indexOf(action.setVideoId), 1);
    ids.splice(action.movedSetVideoIdPredecessor ? ids.indexOf(action.movedSetVideoIdPredecessor) + 1 : 0, 0, id);
  }
  return ids;
}
// Independent quadratic LCS oracle for the minimum number of entry moves.
function minimumMoves(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return a.length - dp[a.length][b.length];
}
function* permutations(ids) {
  if (!ids.length) { yield []; return; }
  for (let i = 0; i < ids.length; i++) for (const rest of permutations([...ids.slice(0, i), ...ids.slice(i + 1)])) yield [ids[i], ...rest];
}
test('every permutation through six entries is exact and uses the minimum moves', () => {
  for (let n = 0; n <= 6; n++) {
    const ids = Array.from({ length: n }, (_, i) => `entry-${i}`);
    for (const desired of permutations(ids)) {
      const plan = orderPlan(source(ids), desired);
      assert.deepEqual(apply([...ids], plan.actions), desired);
      assert.equal(plan.actions.length, minimumMoves(ids, desired));
    }
  }
});
test('unchanged order needs no edits; a rotated list needs only one', () => {
  const initial = source(['a', 'b', 'c', 'd']);
  assert.equal(orderPlan(initial, ['a', 'b', 'c', 'd']).actions.length, 0);
  assert.equal(orderPlan(initial, ['b', 'c', 'd', 'a']).actions.length, 1);
});
test('reject incomplete, missing, unknown, and duplicate occurrences', () => {
  const initial = source(['a', 'b']);
  for (const desired of [['a'], ['a', 'a'], ['a', 'c'], null]) assert.throws(() => orderPlan(initial, desired));
  assert.throws(() => orderPlan({ ...initial, complete: false }, ['a', 'b']));
});
test('reversing 101 duplicate-video occurrences uses two writes and two verification reads', async () => {
  const ids = Array.from({ length: 101 }, (_, i) => `entry-${i}`), before = source(ids), desired = [...ids].reverse();
  let current = [...ids], reads = 0; const writes = [], checkpoints = [];
  const job = { sourceId: 'WL', fingerprint: 'account', sourceBefore: before };
  await reorderItems(job, orderPlan(before, desired), {
    save: async value => checkpoints.push(structuredClone(value)),
    editBatch: async (_, actions) => { writes.push(actions.length); current = apply(current, actions); },
    read: async () => { reads++; return source(current); },
  });
  assert.deepEqual(current, desired); assert.deepEqual(writes, [50, 50]); assert.equal(reads, 2);
  assert.equal(job.plannedMoves, 100); assert.equal(job.reordered.length, 100);
  assert.equal(checkpoints.length, 4); assert.equal(checkpoints[0].intent.kind, 'reorder_batch');
});
