import test from 'node:test';
import assert from 'node:assert/strict';
import { saveJob, hydrateJobs, archiveJob } from '../src/job-store.js';
const clone = value => structuredClone(value);
function memory() {
  const data = {}, writes = [], removed = [];
  return { data, writes, removed,
    get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, clone(data[key])])),
    set: async update => { writes.push(clone(update)); Object.assign(data, clone(update)); },
    remove: async keys => { removed.push(...keys); keys.forEach(key => delete data[key]); }
  };
}
function job(id = 'job') {
  const items = Array.from({ length: 1000 }, (_, i) => ({ setVideoId: `entry-${i}`, videoId: 'abcdefghijk', title: `Video ${i}` }));
  return { id, kind: 'copy', items, sourceBefore: { playlistId: 'WL', items }, targetBefore: { playlistId: 'PLtarget', items }, copied: [], phase: 'copying' };
}
test('immutable backups and selection are written once; checkpoints are over 100 times smaller', async () => {
  const storage = memory(), operation = job();
  await saveJob(storage, operation);
  operation.copied.push('entry-0'); operation.intent = null;
  await saveJob(storage, operation);
  assert.equal(Object.keys(storage.writes[1]).length, 1);
  assert.ok(JSON.stringify(storage.writes[1]).length < JSON.stringify(storage.writes[0]).length / 100);
  const [restored] = await hydrateJobs(storage, [storage.data.activeJob]);
  assert.deepEqual(restored.sourceBefore, operation.sourceBefore);
  assert.deepEqual(restored.items, operation.items);
  assert.equal(storage.data.activeJob.items, undefined);
  assert.equal(storage.data.activeJob.sourceBefore.items, undefined);
});
test('worker restart hydrates every backup and a later removal baseline writes once', async () => {
  const storage = memory(); await saveJob(storage, job());
  const [restarted] = await hydrateJobs(storage, [storage.data.activeJob]);
  restarted.removalBefore = { playlistId: 'WL', items: [...restarted.items, { setVideoId: 'new', videoId: 'lmnopqrstuv' }] };
  await saveJob(storage, restarted); await saveJob(storage, restarted);
  assert.equal(Object.keys(storage.writes[1]).filter(key => key.startsWith('job-payload:')).length, 1);
  assert.deepEqual(Object.keys(storage.writes[2]), ['activeJob']);
  assert.equal((await hydrateJobs(storage, [storage.data.activeJob]))[0].removalBefore.items.length, 1001);
});
test('legacy inline records stay readable and migrate atomically on next checkpoint', async () => {
  const storage = memory(), legacy = job(); storage.data.activeJob = clone(legacy);
  const [restored] = await hydrateJobs(storage, [storage.data.activeJob]); assert.deepEqual(restored, legacy);
  await saveJob(storage, restored);
  assert.equal(storage.writes.length, 1);
  assert.deepEqual((await hydrateJobs(storage, [storage.data.activeJob]))[0].targetBefore, legacy.targetBefore);
});
test('missing immutable payload fails closed; failed write never installs references', async () => {
  const storage = memory(), operation = job();
  storage.set = async () => { throw new Error('Quota exceeded'); };
  await assert.rejects(saveJob(storage, operation), /Quota/);
  assert.equal(operation.payloadRefs, undefined);
  await assert.rejects(hydrateJobs(storage, [{ payloadRefs: { items: 'missing' } }]), /backup is missing/);
});
test('archive evicts only expired payloads after the compact history commits', async () => {
  const storage = memory();
  for (let index = 0; index < 11; index++) await archiveJob(storage, job(`job-${index}`), false);
  assert.equal(storage.data.history.length, 10); assert.equal(storage.data.historyCount, 10);
  assert.ok(storage.removed.every(key => key.startsWith('job-payload:job-0:')));
  assert.deepEqual((await hydrateJobs(storage, storage.data.history)).map(record => record.id), Array.from({ length: 10 }, (_, i) => `job-${10-i}`));
});
test('cleanup failure leaves the committed backup and history recoverable', async () => {
  const storage = memory(); storage.remove = async () => { throw new Error('Cleanup unavailable'); };
  for (let i = 0; i < 11; i++) await archiveJob(storage, job(`job-${i}`), false);
  assert.equal((await hydrateJobs(storage, storage.data.history)).length, 10);
});
