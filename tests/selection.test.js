import test from 'node:test';
import assert from 'node:assert/strict';
import { Selection, duplicateOccurrences, removalPlan } from '../src/selection.js';

const first = { key: 'occurrence-a', setVideoId: 'occurrence-a', videoId: 'video-a', title: 'First' };
const duplicate = { ...first, key: 'occurrence-b', setVideoId: 'occurrence-b' };
const other = { key: 'occurrence-c', setVideoId: 'occurrence-c', videoId: 'video-b' };
const playlist = { playlistId: 'WL', complete: true, items: [first, duplicate, other] };

test('selection survives row unloading and rerendering', () => {
  const selection = new Selection('WL');
  selection.toggle(first);
  selection.reconcile('WL', []);
  assert.deepEqual(selection.snapshot().items, [first]);
  selection.reconcile('WL', [{ ...first, title: 'Updated' }]);
  assert.equal(selection.snapshot().items[0].title, 'Updated');
});

test('navigation clears selection instead of targeting another playlist', () => {
  const selection = new Selection('WL');
  selection.toggle(first);
  selection.reconcile('PL-other', [first]);
  assert.equal(selection.snapshot().items.length, 0);
});

test('snapshots cannot accidentally expand a reviewed selection', () => {
  const selection = new Selection('WL');
  selection.toggle(first);
  const preview = selection.snapshot();
  selection.toggle(other);
  preview.items[0].title = 'Modified copy';
  assert.equal(preview.items.length, 1);
  assert.equal(selection.snapshot().items[0].title, 'First');
});

test('duplicates preserve the first occurrence', () => {
  assert.deepEqual(duplicateOccurrences(playlist.items), [duplicate]);
});

test('removal targets only the chosen occurrence of a repeated video', () => {
  const plan = removalPlan({ playlistId: 'WL', items: [duplicate] }, playlist);
  assert.deepEqual(plan.actions, [{ action: 'ACTION_REMOVE_VIDEO', setVideoId: 'occurrence-b' }]);
  assert.equal(plan.backup.items.length, 3);
  assert.equal(plan.count, 1);
});

test('removal fails closed for incomplete or stale playlist data', () => {
  const selection = { playlistId: 'WL', items: [first] };
  assert.throws(() => removalPlan(selection, { ...playlist, complete: false }), /complete/);
  assert.throws(() => removalPlan(selection, { ...playlist, playlistId: 'PL-other' }), /changed/);
  assert.throws(() => removalPlan(selection, { ...playlist, items: [other] }), /changed/);
  assert.throws(() => removalPlan({ ...selection, items: [{ ...first, setVideoId: null }] }, playlist), /unique/);
  assert.throws(() => removalPlan({ ...selection, items: [first, first] }, playlist), /unique/);
  assert.throws(() => removalPlan({ ...selection, items: [] }, playlist), /at least one/);
  assert.throws(() => removalPlan(selection, { ...playlist, items: [first, first] }), /ambiguous/);
});
