export const videoUrl = id => `https://www.youtube.com/watch?v=${id}`;
export const linksText = items => items.map(item => videoUrl(item.videoId)).join('\n');
export const counts = items => items.reduce((out, item) => {
  out[item.videoId] = (out[item.videoId] || 0) + 1;
  return out;
}, Object.create(null));
const BATCH_SIZE = 50;
const chunks = items => Array.from({ length: Math.ceil(items.length / BATCH_SIZE) }, (_, index) => items.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE));
const wait = (io, ms) => (io.wait || (delay => new Promise(resolve => setTimeout(resolve, delay))))(ms);
async function editBatch(io, playlistId, actions) {
  if (io.editBatch) return io.editBatch(playlistId, actions);
  for (const action of actions) await io.edit(playlistId, action);
}

export function assertComplete(snapshot) {
  if (snapshot?.complete !== true) {
    const name = snapshot?.title || snapshot?.playlistId || 'this playlist';
    const reason = snapshot?.warnings?.[0] || 'YouTube did not return a complete playlist.';
    throw new Error(`Could not fully read ${name}. ${reason} No further changes were made. Check playlist reader details for more information.`);
  }
  if (!snapshot.fingerprint) throw new Error('Cannot identify the YouTube account.');
  const ids = snapshot.items.map(item => item.setVideoId);
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error('Missing or ambiguous playlist occurrence IDs. Changes are disabled.');
}

export function assertAccount(snapshot, expected) {
  assertComplete(snapshot);
  if (snapshot.fingerprint !== expected) throw new Error('The YouTube account changed. Operation stopped.');
}

export function exactItems(keys, snapshot) {
  assertComplete(snapshot);
  if (!Array.isArray(keys) || !keys.length || new Set(keys).size !== keys.length) throw new Error('Select one or more distinct playlist entries.');
  const byId = new Map(snapshot.items.map(item => [item.setVideoId, item]));
  return keys.map(key => {
    const item = byId.get(key);
    if (!item) throw new Error('The selection changed. Reload and select again.');
    return structuredClone(item);
  });
}

export function assertCopied(job, destination) {
  assertAccount(destination, job.fingerprint);
  if (destination.playlistId !== job.targetId) throw new Error('The destination changed.');
  const actual = counts(destination.items);
  const baseline = counts(job.targetBefore.items);
  const added = counts(job.items);
  for (const [videoId, count] of Object.entries(added)) {
    if ((actual[videoId] || 0) < (baseline[videoId] || 0) + count) {
      throw new Error('A destination copy is missing. Source videos will be kept.');
    }
  }
}

export function reorderPlan(snapshot, keys, position, beforeId) {
  const selected = new Set(exactItems(keys, snapshot).map(item => item.setVideoId));
  const moving = snapshot.items.filter(item => selected.has(item.setVideoId));
  const remaining = snapshot.items.filter(item => !selected.has(item.setVideoId));
  let index;
  if (position === 'top') index = 0;
  else if (position === 'bottom') index = remaining.length;
  else if (position === 'before') {
    index = remaining.findIndex(item => item.setVideoId === beforeId);
    if (index < 0) throw new Error('Choose an unselected video as the placement target.');
  } else throw new Error('Choose top, bottom, or a playlist position.');
  const desired = [...remaining.slice(0, index), ...moving, ...remaining.slice(index)];
  const current = snapshot.items.map(item => item.setVideoId), actions = [];
  let predecessor = remaining[index - 1]?.setVideoId;
  for (const item of moving) {
    const from = current.indexOf(item.setVideoId);
    if ((from === 0 ? undefined : current[from - 1]) !== predecessor) {
      actions.push({ action: 'ACTION_MOVE_VIDEO_AFTER', setVideoId: item.setVideoId,
        ...(predecessor ? { movedSetVideoIdPredecessor: predecessor } : {}) });
      current.splice(from, 1);
      current.splice(predecessor ? current.indexOf(predecessor) + 1 : 0, 0, item.setVideoId);
    }
    predecessor = item.setVideoId;
  }
  return { actions, desiredIds: desired.map(item => item.setVideoId) };
}

export async function reorderItems(job, plan, io) {
  let current = job.sourceBefore.items.map(item => item.setVideoId);
  const videos = new Map(job.sourceBefore.items.map(item => [item.setVideoId, item.videoId]));
  job.reordered = [];
  job.desiredIds = plan.desiredIds;
  for (const batch of chunks(plan.actions)) {
    const expected = [...current];
    for (const action of batch) {
      expected.splice(expected.indexOf(action.setVideoId), 1);
      expected.splice(action.movedSetVideoIdPredecessor ? expected.indexOf(action.movedSetVideoIdPredecessor) + 1 : 0, 0, action.setVideoId);
    }
    job.intent = { kind: 'reorder_batch', setVideoIds: batch.map(action => action.setVideoId), batchSize: batch.length };
    await io.save(job);
    let mutationError;
    try { await editBatch(io, job.sourceId, batch); }
    catch (error) { mutationError = error; }
    let verified = false;
    for (const [attempt, delay] of [0, 250, 500, 1000, 2000].entries()) {
      if (delay) await wait(io, delay);
      const after = await io.read(job.sourceId);
      assertAccount(after, job.fingerprint);
      if (after.playlistId !== job.sourceId) throw new Error('The source playlist changed.');
      if (after.items.length !== videos.size || after.items.some(item => videos.get(item.setVideoId) !== item.videoId)) throw new Error('Playlist membership changed. Reordering stopped.');
      const actual = after.items.map(item => item.setVideoId);
      job.verification = { attempts: attempt + 1, batchSize: batch.length, completed: job.reordered.length, checkedAt: Date.now() };
      if (JSON.stringify(actual) === JSON.stringify(expected)) { verified = true; break; }
      if (JSON.stringify(actual) !== JSON.stringify(current)) break;
    }
    if (!verified) throw new Error(mutationError?.message || 'Playlist order could not be verified. Reordering stopped.');
    current = expected;
    job.reordered.push(...batch.map(action => action.setVideoId));
    job.intent = null;
    await io.save(job);
  }
  if (JSON.stringify(current) !== JSON.stringify(plan.desiredIds)) throw new Error('Final playlist order could not be verified.');
}

export async function copyItems(job, io) {
  const baseline = counts(job.targetBefore.items);
  let processed = 0;
  for (const batch of chunks(job.items)) {
    const beforeAdded = counts(job.items.slice(0, processed));
    const expectedAdded = counts(job.items.slice(0, processed + batch.length));
    const actions = batch.map(item => ({ action: 'ACTION_ADD_VIDEO', addedVideoId: item.videoId }));
    job.intent = { kind: 'add_batch', videoIds: batch.map(item => item.videoId), batchSize: batch.length };
    await io.save(job);
    let mutationError;
    try { await editBatch(io, job.targetId, actions); }
    catch (error) { mutationError = error; }
    let observed = Object.create(null);
    const delays = [0, 250, 500, 1000, 2000];
    for (const [attempt, delay] of delays.entries()) {
      if (delay) await wait(io, delay);
      const after = await io.read(job.targetId);
      assertAccount(after, job.fingerprint);
      if (after.playlistId !== job.targetId) throw new Error('The destination changed.');
      const actual = counts(after.items);
      const ids = Object.keys(expectedAdded);
      const exact = ids.every(id => (actual[id] || 0) === (baseline[id] || 0) + expectedAdded[id]);
      const unchanged = ids.every(id => (actual[id] || 0) === (baseline[id] || 0) + (beforeAdded[id] || 0));
      observed = Object.fromEntries(ids.map(id => [id, actual[id] || 0]));
      job.verification = { attempts: attempt + 1, batchSize: batch.length, completed: processed,
        expected: Object.fromEntries(ids.map(id => [id, (baseline[id] || 0) + expectedAdded[id]])), observed, checkedAt: Date.now() };
      if (exact) break;
      if (!unchanged) throw new Error('Destination counts changed unexpectedly. Stopped; no source videos were removed.');
    }
    const verified = Object.entries(job.verification.expected).every(([id, expected]) => observed[id] === expected);
    if (!verified) {
      throw new Error(mutationError?.message || `Copy batch could not be verified after ${job.verification.attempts} checks. Stopped; no source videos were removed.`);
    }
    processed += batch.length;
    job.copied.push(...batch.map(item => item.setVideoId));
    job.intent = null;
    await io.save(job);
  }
}

export async function removeItems(job, io, verifiedDestination, verifiedSource = job.sourceBefore) {
  assertAccount(verifiedSource, job.fingerprint);
  if (verifiedSource.playlistId !== job.sourceId) throw new Error('The source playlist changed.');
  const current = exactItems(job.items.map(item => item.setVideoId), verifiedSource);
  if (current.some((item, index) => item.videoId !== job.items[index].videoId)) throw new Error('A source entry changed. Stopped; review the playlist.');
  if (job.kind === 'move') job.removalBefore = verifiedSource;
  const original = verifiedSource.items;
  let processed = 0;
  for (const batch of chunks(job.items)) {
    if (job.kind === 'move') assertCopied(job, processed === 0 && verifiedDestination ? verifiedDestination : await io.read(job.targetId));
    const beforeRemoved = new Set(job.items.slice(0, processed).map(item => item.setVideoId));
    const removed = new Set(job.items.slice(0, processed + batch.length).map(item => item.setVideoId));
    const beforeIds = original.filter(item => !beforeRemoved.has(item.setVideoId)).map(item => item.setVideoId);
    const expectedIds = original.filter(item => !removed.has(item.setVideoId)).map(item => item.setVideoId);
    const actions = batch.map(item => ({ action: 'ACTION_REMOVE_VIDEO', setVideoId: item.setVideoId }));
    job.intent = { kind: 'remove_batch', setVideoIds: batch.map(item => item.setVideoId), batchSize: batch.length };
    await io.save(job);
    let mutationError;
    try { await editBatch(io, job.sourceId, actions); }
    catch (error) { mutationError = error; }
    let verified = false;
    for (const [attempt, delay] of [0, 250, 500, 1000, 2000].entries()) {
      if (delay) await wait(io, delay);
      const after = await io.read(job.sourceId);
      assertAccount(after, job.fingerprint);
      if (after.playlistId !== job.sourceId) throw new Error('The source playlist changed.');
      const actualIds = after.items.map(entry => entry.setVideoId);
      job.verification = { attempts: attempt + 1, batchSize: batch.length, completed: processed,
        expectedItems: expectedIds.length, observedItems: actualIds.length, checkedAt: Date.now() };
      if (JSON.stringify(actualIds) === JSON.stringify(expectedIds)) { verified = true; break; }
      if (JSON.stringify(actualIds) !== JSON.stringify(beforeIds)) break;
    }
    if (!verified) throw new Error(mutationError?.message || 'Removal batch did not match the reviewed playlist. Stopped.');
    processed += batch.length;
    job.removed.push(...batch.map(item => item.setVideoId));
    job.intent = null;
    await io.save(job);
  }
}
