import test from 'node:test';
import assert from 'node:assert/strict';
import { reorderPlan, reorderItems } from '../src/operations.js';

const entry = (setVideoId, videoId = 'abcdefghijk') => ({ setVideoId, videoId, title: setVideoId });
const source = items => ({ playlistId: 'WL', fingerprint: 'account', complete: true, editable: true, canReorder: true, items });
const ids = snapshot => snapshot.items.map(item => item.setVideoId);
function applyActions(snapshot, actions) {
  for (const action of actions) {
    assert.equal(action.action, 'ACTION_MOVE_VIDEO_AFTER');
    const from = snapshot.items.findIndex(item => item.setVideoId === action.setVideoId);
    assert.ok(from >= 0);
    const [moved] = snapshot.items.splice(from, 1);
    const predecessor = action.movedSetVideoIdPredecessor;
    const index = predecessor ? snapshot.items.findIndex(item => item.setVideoId === predecessor) : -1;
    if (predecessor) assert.ok(index >= 0);
    snapshot.items.splice(index + 1, 0, moved);
  }
}
function memoryIO(initial) {
  const state = structuredClone(initial), calls = [], checkpoints = [];
  return { state, calls, checkpoints, wait: async () => {},
    read: async () => structuredClone(state),
    save: async job => checkpoints.push(structuredClone(job)),
    editBatch: async (playlistId, actions) => {
      assert.equal(playlistId, initial.playlistId);
      calls.push(structuredClone(actions)); applyActions(state, actions);
    }
  };
}
const job = snapshot => ({ kind: 'reorder', sourceId: snapshot.playlistId, fingerprint: snapshot.fingerprint, sourceBefore: snapshot });

for (const [position, beforeId, expected] of [
  ['top', undefined, ['b', 'd', 'a', 'c', 'e']],
  ['bottom', undefined, ['a', 'c', 'e', 'b', 'd']],
  ['before', 'c', ['a', 'b', 'd', 'c', 'e']]
]) test(`selected occurrences move to ${position} in playlist order`, async () => {
  const initial = source(['a', 'b', 'c', 'd', 'e'].map(value => entry(value)));
  const plan = reorderPlan(initial, ['d', 'b'], position, beforeId), io = memoryIO(initial), op = job(initial);
  assert.deepEqual(plan.desiredIds, expected);
  await reorderItems(op, plan, io);
  assert.deepEqual(ids(io.state), expected);
  assert.equal(io.calls.length, 1);
  assert.equal(io.checkpoints[0].intent.kind, 'reorder_batch');
  assert.equal(op.intent, null);
  assert.equal(io.state.items.length, initial.items.length);
});

test('top move omits the predecessor and targets the exact duplicate occurrence', async () => {
  const initial = source([entry('first'), entry('other', 'lmnopqrstuv'), entry('duplicate')]);
  const plan = reorderPlan(initial, ['duplicate'], 'top'), io = memoryIO(initial);
  assert.deepEqual(plan.actions, [{ action: 'ACTION_MOVE_VIDEO_AFTER', setVideoId: 'duplicate' }]);
  await reorderItems(job(initial), plan, io);
  assert.deepEqual(ids(io.state), ['duplicate', 'first', 'other']);
});

test('unchanged order issues no request', async () => {
  const initial = source(['a', 'b', 'c'].map(value => entry(value))), io = memoryIO(initial);
  await reorderItems(job(initial), reorderPlan(initial, ['a', 'b'], 'top'), io);
  await reorderItems(job(initial), reorderPlan(initial, ['c', 'a', 'b'], 'bottom'), io);
  assert.equal(io.calls.length, 0);
});

test('invalid, selected, stale, or incomplete targets fail before edits', () => {
  const initial = source(['a', 'b', 'c'].map(value => entry(value)));
  assert.throws(() => reorderPlan(initial, ['b'], 'before', 'b'), /unselected/);
  assert.throws(() => reorderPlan(initial, ['b'], 'before', 'missing'), /unselected/);
  assert.throws(() => reorderPlan(initial, ['missing'], 'top'), /selection changed/);
  assert.throws(() => reorderPlan(initial, ['b'], 'unknown'), /Choose top/);
  assert.throws(() => reorderPlan({ ...initial, complete: false }, ['b'], 'top'), /fully read/);
});

test('moving almost every entry uses one boundary move', async () => {
  const initial = source([entry('anchor'), ...Array.from({ length: 51 }, (_, index) => entry(`entry-${index}`))]);
  const plan = reorderPlan(initial, initial.items.slice(1).map(item => item.setVideoId), 'top'), io = memoryIO(initial), op = job(initial);
  await reorderItems(op, plan, io);
  assert.deepEqual(io.calls.map(actions => actions.length), [1]);
  assert.deepEqual(ids(io.state), [...initial.items.slice(1).map(item => item.setVideoId), 'anchor']);
  assert.equal(op.reordered.length, 1);
});

test('interleaved selection requiring more than fifty moves uses verified bounded batches', async () => {
  const entries = Array.from({ length: 51 }, (_, index) => [entry(`anchor-${index}`), entry(`selected-${index}`)]).flat();
  const initial = source(entries), keys = entries.filter((_, index) => index % 2).map(item => item.setVideoId);
  const plan = reorderPlan(initial, keys, 'top'), io = memoryIO(initial), op = job(initial);
  await reorderItems(op, plan, io);
  assert.deepEqual(io.calls.map(actions => actions.length), [50, 1]);
  assert.deepEqual(ids(io.state), [...keys, ...entries.filter((_, index) => !(index % 2)).map(item => item.setVideoId)]);
  assert.equal(op.reordered.length, 51);
});

test('lost acknowledgement and stale reads verify without replaying a move', async () => {
  const initial = source(['a', 'b', 'c'].map(value => entry(value))), io = memoryIO(initial), op = job(initial);
  const editBatch = io.editBatch; let stale = 2;
  io.editBatch = async (...args) => { await editBatch(...args); throw new Error('Lost response'); };
  const read = io.read;
  io.read = async () => stale-- > 0 ? structuredClone(initial) : read();
  await reorderItems(op, reorderPlan(initial, ['c'], 'top'), io);
  assert.equal(io.calls.length, 1);
  assert.equal(op.verification.attempts, 3);
  assert.deepEqual(ids(io.state), ['c', 'a', 'b']);
});

for (const problem of ['partial', 'membership', 'account', 'wrong playlist', 'unchanged']) test(`reorder stops on ${problem} without replay`, async () => {
  const initial = source(['a', 'b', 'c', 'd'].map(value => entry(value))), io = memoryIO(initial), op = job(initial);
  const editBatch = io.editBatch;
  io.editBatch = async (playlistId, actions) => {
    if (problem === 'partial') return editBatch(playlistId, actions.slice(0, 1));
    if (problem === 'unchanged') { io.calls.push(actions); return; }
    await editBatch(playlistId, actions);
    if (problem === 'membership') io.state.items[0].videoId = 'lmnopqrstuv';
    if (problem === 'account') io.state.fingerprint = 'other';
    if (problem === 'wrong playlist') io.state.playlistId = 'PLother';
  };
  await assert.rejects(reorderItems(op, reorderPlan(initial, ['b', 'd'], 'top'), io), /stopped|changed/i);
  assert.equal(io.calls.length, 1);
  assert.equal(op.intent.kind, 'reorder_batch');
});

test('storage failure prevents any reorder request', async () => {
  const initial = source(['a', 'b'].map(value => entry(value))), io = memoryIO(initial);
  io.save = async () => { throw new Error('Storage full'); };
  await assert.rejects(reorderItems(job(initial), reorderPlan(initial, ['b'], 'top'), io), /Storage full/);
  assert.equal(io.calls.length, 0);
});
