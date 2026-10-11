import test from 'node:test';
import assert from 'node:assert/strict';
import { sortPlan } from '../src/operations.js';

const snapshot = values => ({ complete: true, playlistId: 'WL', fingerprint: 'account', items: values.map((value, index) => ({ setVideoId: `entry-${index}`, videoId: 'abcdefghijk', title: value, channel: value, durationSeconds: Number(value) || 0 })) });
const keys = (...indices) => indices.map(index => `entry-${index}`);

test('consecutive selection sorts within its original positions, descending by default', () => {
  const before = snapshot(['Untouched first', 'Episode 2', 'Episode 10', 'Episode 1', 'Untouched last']);
  const plan = sortPlan(before, keys(3, 1, 2), 'title');
  assert.deepEqual(plan.desiredIds, keys(0, 2, 1, 3, 4));
  assert.equal(plan.placement, 'in_place');
  assert.deepEqual(plan.items.map(item => item.setVideoId), keys(2, 1, 3));
  assert.ok(plan.actions.every(action => keys(1, 2, 3).includes(action.setVideoId)));
  assert.deepEqual(before.items.map(item => item.setVideoId), keys(0, 1, 2, 3, 4));
});

test('scattered selection sorts to the top and preserves every other occurrence in order', () => {
  const before = snapshot(['Unselected Z', 'B', 'Unselected A', 'C', 'A', 'Unselected M']);
  const plan = sortPlan(before, keys(4, 1, 3), 'title');
  assert.deepEqual(plan.desiredIds, keys(3, 1, 4, 0, 2, 5));
  assert.equal(plan.placement, 'top');
  assert.equal(new Set(plan.desiredIds).size, before.items.length);
});

test('a scattered selection already sorted still moves to the top', () => {
  const plan = sortPlan(snapshot(['Other', 'C', 'Other', 'B', 'A']), keys(1, 3, 4), 'title');
  assert.deepEqual(plan.desiredIds, keys(1, 3, 4, 0, 2));
});

test('equal values stay in source order, including duplicate videos selected in reverse click order', () => {
  const plan = sortPlan(snapshot(['Other', 'Episode 2', 'episode 2', 'EPISODE 2', 'Other']), keys(3, 1, 2), 'title');
  assert.deepEqual(plan.desiredIds, keys(0, 1, 2, 3, 4));
  assert.equal(plan.actions.length, 0);
});

for (const sortBy of ['title', 'channel', 'duration']) test(`${sortBy} supports explicit ascending and default descending for a full playlist`, () => {
  const before = snapshot(['2', '10', '1']);
  assert.deepEqual(sortPlan(before, keys(0, 1, 2), sortBy).desiredIds, keys(1, 0, 2));
  assert.deepEqual(sortPlan(before, keys(0, 1, 2), sortBy, false).desiredIds, keys(2, 0, 1));
});

test('a single selected occurrence stays at its original position', () => {
  const plan = sortPlan(snapshot(['C', 'A', 'B']), keys(1), 'title');
  assert.deepEqual(plan.desiredIds, keys(0, 1, 2));
  assert.equal(plan.actions.length, 0);
});

test('invalid selections, sort fields, and incomplete snapshots fail before planning moves', () => {
  const before = snapshot(['A', 'B']);
  for (const selected of [[], keys(0, 0), keys(3), null]) assert.throws(() => sortPlan(before, selected, 'title'));
  assert.throws(() => sortPlan({ ...before, complete: false }, keys(0), 'title'));
  assert.throws(() => sortPlan(before, keys(0), 'unsupported'));
  assert.throws(() => sortPlan(before, keys(0), 'title', 'descending'));
});
