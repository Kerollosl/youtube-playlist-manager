export const videoUrl = id => `https://www.youtube.com/watch?v=${id}`;
export const linksText = items => items.map(item => videoUrl(item.videoId)).join('\n');
export const counts = items => items.reduce((out, item) => {
  out[item.videoId] = (out[item.videoId] || 0) + 1;
  return out;
}, Object.create(null));

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

export async function copyItems(job, io) {
  for (const item of job.items) {
    const before = await io.read(job.targetId);
    assertAccount(before, job.fingerprint);
    const beforeCount = counts(before.items)[item.videoId] || 0;
    job.intent = { kind: 'add', videoId: item.videoId, beforeCount };
    await io.save(job); // Persist intent before network I/O.
    let mutationError;
    try { await io.edit(job.targetId, { action: 'ACTION_ADD_VIDEO', addedVideoId: item.videoId }); }
    catch (error) { mutationError = error; }
    // YouTube can acknowledge a write before the browse result reflects it.
    // Recheck reads only: replaying an add after an unknown result can duplicate it.
    let afterCount;
    const delays = [0, 250, 500, 1000, 2000];
    for (const [attempt, delay] of delays.entries()) {
      if (delay) await (io.wait || (ms => new Promise(resolve => setTimeout(resolve, ms))))(delay);
      const after = await io.read(job.targetId);
      assertAccount(after, job.fingerprint);
      if (after.playlistId !== job.targetId) throw new Error('The destination changed.');
      afterCount = counts(after.items)[item.videoId] || 0;
      job.verification = { attempts: attempt + 1, beforeCount, expectedCount: beforeCount + 1,
        observedCount: afterCount, checkedAt: Date.now() };
      await io.save(job);
      if (afterCount !== beforeCount) break; // Success or a conflicting count: never mask ambiguity.
    }
    if (afterCount !== beforeCount + 1) {
      throw new Error(mutationError?.message || `Copy could not be verified after ${job.verification.attempts} checks (expected ${beforeCount + 1} copies, found ${afterCount}). Stopped; no source videos were removed.`);
    }
    job.copied.push(item.setVideoId);
    job.intent = null;
    await io.save(job);
  }
  // A subsequent browse can also lag after the final item check. Recheck only
  // missing copies; account, identity and incomplete-read errors still stop at once.
  const baseline = counts(job.targetBefore.items), expected = counts(job.items);
  for (const [attempt, delay] of [0, 250, 500, 1000, 2000].entries()) {
    if (delay) await (io.wait || (ms => new Promise(resolve => setTimeout(resolve, ms))))(delay);
    const destination = await io.read(job.targetId);
    assertAccount(destination, job.fingerprint);
    if (destination.playlistId !== job.targetId) throw new Error('The destination changed.');
    const actual = counts(destination.items);
    const missingCopies = Object.entries(expected).filter(([id, count]) => (actual[id] || 0) < (baseline[id] || 0) + count)
      .map(([videoId, count]) => ({ videoId, expectedCount: (baseline[videoId] || 0) + count, observedCount: actual[videoId] || 0 }));
    job.finalVerification = { attempts: attempt + 1, missingCopies, checkedAt: Date.now() };
    await io.save(job);
    if (!missingCopies.length || attempt === 4) { assertCopied(job, destination); return; }
  }
}

export async function removeItems(job, io) {
  if (job.kind === 'move') assertCopied(job, await io.read(job.targetId));
  for (const item of job.items) {
    const before = await io.read(job.sourceId);
    assertAccount(before, job.fingerprint);
    const current = before.items.find(entry => entry.setVideoId === item.setVideoId);
    if (!current || current.videoId !== item.videoId) throw new Error('A source entry changed. Stopped; review the playlist.');
    if (job.kind === 'move') assertCopied(job, await io.read(job.targetId));
    job.intent = { kind: 'remove', setVideoId: item.setVideoId };
    await io.save(job);
    let mutationError;
    try { await io.edit(job.sourceId, { action: 'ACTION_REMOVE_VIDEO', setVideoId: item.setVideoId }); }
    catch (error) { mutationError = error; }
    const expected = before.items.filter(entry => entry.setVideoId !== item.setVideoId).map(entry => entry.setVideoId);
    const unchanged = JSON.stringify(before.items.map(entry => entry.setVideoId));
    let verified = false;
    for (const delay of [0, 250, 500, 1000, 2000]) {
      if (delay) await (io.wait || (ms => new Promise(resolve => setTimeout(resolve, ms))))(delay);
      const after = await io.read(job.sourceId);
      assertAccount(after, job.fingerprint);
      if (after.playlistId !== job.sourceId) throw new Error('The source playlist changed.');
      const actual = JSON.stringify(after.items.map(entry => entry.setVideoId));
      if (actual === JSON.stringify(expected)) { verified = true; break; }
      if (actual !== unchanged) break; // Conflicting change: do not mask it with retries.
    }
    if (!verified) throw new Error(mutationError?.message || 'Removal result did not match the reviewed entry. Stopped.');
    job.removed.push(item.setVideoId);
    job.intent = null;
    await io.save(job);
  }
}
