import { youtubeCommand } from './youtube-api.js';
import { assertAccount, assertComplete, exactItems, copyItems, removeItems, assertCopied, counts, reorderPlan, reorderItems } from './operations.js';

let busy = false;
let lastEditAt = 0;
const validPlaylist = id => typeof id === 'string' && /^[A-Za-z0-9_-]{2,128}$/.test(id);
const validVideo = id => typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id);
async function read(tabId, playlistId, pickerVideoId, expectedFingerprint) {
  // Retry incomplete browse snapshots only; mutations and identity errors never retry.
  let fingerprint = expectedFingerprint;
  let snapshot;
  for (const delay of [0, 250, 750]) {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    snapshot = await api(tabId, { type: 'read', playlistId,
      ...(validVideo(pickerVideoId) ? { pickerVideoId } : {}) });
    if (snapshot.playlistId !== playlistId) throw new Error('The playlist changed. Operation stopped.');
    if (!snapshot.fingerprint) throw new Error('Cannot identify the YouTube account.');
    if (fingerprint !== undefined && snapshot.fingerprint !== fingerprint) throw new Error('The YouTube account changed. Operation stopped.');
    fingerprint = snapshot.fingerprint;
    if (snapshot.complete !== false) return snapshot;
  }
  return snapshot; // Existing completeness guards fail closed after the retry budget.
}

async function savedProbe() {
  const { queue, activeJob, history = [] } = await chrome.storage.local.get(['queue', 'activeJob', 'history']);
  return [queue, activeJob, ...history].flatMap(job => job?.items || []).find(item => validVideo(item.videoId))?.videoId;
}

async function api(tabId, command) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url?.startsWith('https://www.youtube.com/')) throw new Error('Open a YouTube tab first.');
  if (command.type === 'edit') {
    const wait = Math.max(0, 600 - (Date.now() - lastEditAt));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    lastEditAt = Date.now();
  }
  const results = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: youtubeCommand, args: [command] });
  const result = results[0]?.result;
  if (!result?.ok) throw new Error(result?.error || 'YouTube returned no usable result.');
  return result;
}

async function save(job) {
  job.updatedAt = Date.now();
  await chrome.storage.local.set({ activeJob: job });
}

async function archive(job) {
  const { history = [], queue } = await chrome.storage.local.get(['history', 'queue']);
  const clearCut = job.phase === 'completed' && job.kind === 'move' && queue?.kind === 'move' && queue.sourceId === job.sourceId && JSON.stringify(queue.items.map(item => item.setVideoId)) === JSON.stringify(job.items.map(item => item.setVideoId));
  await chrome.storage.local.set({ history: [structuredClone(job), ...history].slice(0, 10), activeJob: null, ...(clearCut ? { queue: null } : {}) });
}

async function run(message) {
  if (message.type === 'READ') {
    if (!validPlaylist(message.playlistId)) throw new Error('Enter a valid playlist URL or ID.');
    if (message.pickerVideoId !== undefined && !validVideo(message.pickerVideoId)) throw new Error('Invalid video ID for playlist lookup.');
    return read(message.tabId, message.playlistId, message.pickerVideoId || await savedProbe());
  }
  if (message.type === 'PLAYLISTS') return api(message.tabId, { type: 'playlists', videoId: message.videoId || await savedProbe() });
  if (message.type === 'STATUS') {
    const stored = await chrome.storage.local.get(['activeJob', 'history', 'queue']);
    return { ...stored, busy };
  }
  if (message.type === 'QUEUE') {
    const source = await read(message.tabId, message.playlistId, undefined, message.expectedFingerprint);
    assertAccount(source, message.expectedFingerprint);
    if (message.kind === 'move' && !source.editable) throw new Error('This source playlist cannot be changed.');
    const items = exactItems(message.keys, source);
    const queue = { id: crypto.randomUUID(), kind: message.kind === 'move' ? 'move' : 'copy', sourceId: source.playlistId, fingerprint: source.fingerprint, items, sourceBefore: source, savedAt: Date.now() };
    await chrome.storage.local.set({ queue });
    return { queue };
  }
  if (message.type === 'QUEUE_LINKS') {
    if (message.kind !== 'copy' || !Array.isArray(message.items) || !message.items.length || message.items.length > 5000 || message.items.some(item => !/^[A-Za-z0-9_-]{11}$/.test(item.videoId || ''))) throw new Error('Select valid videos to copy.');
    const account = await api(message.tabId, { type: 'playlists', videoId: message.items[0].videoId });
    const items = message.items.map((item, index) => ({ setVideoId: `link-${index}`, videoId: item.videoId, title: String(item.title || '').slice(0,500) }));
    const queue = { id: crypto.randomUUID(), kind: 'copy', sourceId: null, fingerprint: account.fingerprint, items, sourceBefore: null, savedAt: Date.now() };
    await chrome.storage.local.set({ queue });
    return { queue };
  }
  if (message.type === 'DISMISS') {
    if (busy) throw new Error('Wait for the current step to finish.');
    busy = true;
    try {
      const { activeJob } = await chrome.storage.local.get('activeJob');
      if (message.jobId && message.jobId !== activeJob?.id) throw new Error('The saved operation changed.');
      if (activeJob) { activeJob.phase = 'stopped'; await archive(activeJob); }
      return {};
    } finally { busy = false; }
  }
  if (busy) throw new Error('An operation is already running.');
  busy = true;
  let job;
  try {
    const { activeJob, queue } = await chrome.storage.local.get(['activeJob', 'queue']);
    if (message.type === 'CHECK_OPERATION') {
      if (!activeJob || !['copy', 'move'].includes(activeJob.kind)) throw new Error('There is no saved copy or move to check.');
      if (message.jobId && message.jobId !== activeJob.id) throw new Error('The saved operation changed.');
      if (activeJob.removed?.length || ['remove', 'remove_batch'].includes(activeJob.intent?.kind)) throw new Error('Removal already started. Review the saved operation.');
      const destination = await read(message.tabId, activeJob.targetId, activeJob.items[0]?.videoId, activeJob.fingerprint);
      assertCopied(activeJob, destination);
      const actual = counts(destination.items), baseline = counts(activeJob.targetBefore.items), added = counts(activeJob.items);
      if (Object.entries(added).some(([id, count]) => (actual[id] || 0) !== (baseline[id] || 0) + count)) throw new Error('Conflicting destination counts. Review the saved operation.');
      // Assign only after verification so failed checks leave the saved job untouched.
      job = activeJob;
      job.copied = job.items.map(item => item.setVideoId);
      job.intent = null;
      delete job.error;
      job.phase = job.kind === 'move' ? 'ready_to_remove' : 'completed';
      if (job.kind === 'move') await save(job);
      else await archive(job);
      return { job };
    }
    if (message.type === 'FINISH_MOVE') {
      job = activeJob;
      if (job?.phase !== 'ready_to_remove' || job.kind !== 'move' || message.jobId !== job.id) throw new Error('There is no verified move to finish.');
      const source = await read(message.tabId, job.sourceId, job.items[0]?.videoId, job.fingerprint);
      assertAccount(source, job.fingerprint);
      const destination = await read(message.tabId, job.targetId, job.items[0]?.videoId, job.fingerprint);
      assertCopied(job, destination);
      if (!source.editable) throw new Error('The source playlist is not editable.');
      job.phase = 'removing';
      await save(job);
      await removeItems(job, makeIO(message.tabId, job.fingerprint, job.items[0]?.videoId), destination, source);
      job.phase = 'completed';
      await archive(job);
      return { job };
    }
    // A stopped copy cannot remove originals. Preserve it in history when an
    // independently reviewed delete starts; never bypass an unfinished move.
    const archiveStoppedCopy = message.type === 'REMOVE' && activeJob?.kind === 'copy' && activeJob.phase === 'interrupted';
    if (activeJob && !archiveStoppedCopy) throw new Error('Review or stop the saved operation before starting another.');
    if (!['PASTE', 'TRANSFER', 'REMOVE', 'SORT', 'REORDER'].includes(message.type)) throw new Error('Unsupported command.');
    const pasted = message.type === 'PASTE';
    if (pasted && !queue) throw new Error('Copy or cut videos first.');
    if (pasted && message.expectedQueueId !== queue.id) throw new Error('The saved selection changed. Review Paste again.');
    const sourceId = pasted ? queue.sourceId : message.playlistId;
    const kind = message.type === 'REMOVE' ? 'remove' : message.type === 'SORT' ? 'sort' : message.type === 'REORDER' ? 'reorder' : pasted ? queue.kind : message.kind === 'move' ? 'move' : 'copy';
    let source = null;
    let items;
    let fingerprint;
    if (pasted && kind === 'copy') {
      // Copy is a durable list of links; originals do not need to remain present.
      items = structuredClone(queue.items);
      fingerprint = queue.fingerprint;
    } else {
      if (!validPlaylist(sourceId)) throw new Error('No valid source playlist.');
      source = await read(message.tabId, sourceId, undefined, pasted ? queue.fingerprint : message.expectedFingerprint);
      assertAccount(source, pasted ? queue.fingerprint : message.expectedFingerprint);
      fingerprint = source.fingerprint;
      items = exactItems(pasted ? queue.items.map(item => item.setVideoId) : message.keys, source);
      if (pasted && items.some((item, i) => item.videoId !== queue.items[i].videoId)) throw new Error('Saved source videos changed.');
      if (['move', 'remove', 'sort', 'reorder'].includes(kind) && !source.editable) throw new Error('The source playlist is not editable.');
      if (kind === 'sort' && items.length !== source.items.length) throw new Error('The playlist changed since the sort was reviewed. Refresh and try again.');
      if (['sort', 'reorder'].includes(kind) && !source.canReorder) throw new Error('YouTube does not allow this playlist to be reordered.');
    }
    let placement;
    if (kind === 'reorder') {
      if (JSON.stringify(message.expectedOrder) !== JSON.stringify(source.items.map(item => item.setVideoId))) throw new Error('The playlist order changed. Refresh and choose the position again.');
      placement = reorderPlan(source, message.keys, message.position, message.beforeId);
    }
    if (archiveStoppedCopy) await archive({ ...activeJob, phase: 'stopped' });
    job = { id: crypto.randomUUID(), kind, sourceId, fingerprint, sourceBefore: source || queue?.sourceBefore, items, copied: [], removed: [], intent: null, phase: 'starting', createdAt: Date.now() };
    if (kind === 'copy' || kind === 'move') {
      if (!validPlaylist(message.targetId) || message.targetId === sourceId) throw new Error('Choose a different destination playlist.');
      const target = await read(message.tabId, message.targetId, items[0]?.videoId, fingerprint);
      assertAccount(target, fingerprint);
      if (!target.editable) throw new Error('The destination playlist is not editable.');
      job.targetId = message.targetId;
      job.targetBefore = target;
      job.phase = 'copying';
      await save(job);
      await copyItems(job, makeIO(message.tabId, job.fingerprint, job.items[0]?.videoId));
      if (kind === 'move') { job.phase = 'ready_to_remove'; await save(job); }
      else { job.phase = 'completed'; await archive(job); }
    } else if (kind === 'remove') {
      job.phase = 'removing';
      await save(job);
      await removeItems(job, makeIO(message.tabId, job.fingerprint, job.items[0]?.videoId));
      job.phase = 'completed';
      await archive(job);
    } else if (kind === 'reorder') {
      job.phase = 'reordering';
      await save(job);
      await reorderItems(job, placement, makeIO(message.tabId, job.fingerprint, job.items[0]?.videoId));
      job.phase = 'completed';
      await archive(job);
    } else {
      // Sorting is occurrence-based and never removes any video.
      const desired = [...source.items];
      const compare = message.sortBy === 'duration' ? (a, b) => (a.durationSeconds || 0) - (b.durationSeconds || 0) : message.sortBy === 'channel' ? (a, b) => a.channel.localeCompare(b.channel) : (a, b) => a.title.localeCompare(b.title);
      desired.sort(compare);
      if (message.descending) desired.reverse();
      job.items = desired;
      job.phase = 'sorting';
      await save(job);
      // Moving each item after its predecessor makes the final sequence exact.
      // Leave desired[0] in place until subsequent moves bring it to the front.
      for (let i = 1; i < desired.length; i++) {
        const before = await read(message.tabId, sourceId, job.items[0]?.videoId, job.fingerprint);
        assertAccount(before, job.fingerprint);
        if (before.items.length !== source.items.length || source.items.some(item => !before.items.some(entry => entry.setVideoId === item.setVideoId && entry.videoId === item.videoId))) throw new Error('Playlist membership changed. Sorting stopped.');
        const action = { action: 'ACTION_MOVE_VIDEO_AFTER', setVideoId: desired[i].setVideoId, movedSetVideoIdPredecessor: desired[i - 1].setVideoId };
        job.intent = action;
        await save(job);
        await api(message.tabId, { type: 'edit', playlistId: sourceId, action, expectedFingerprint: job.fingerprint });
        const after = await read(message.tabId, sourceId, job.items[0]?.videoId, job.fingerprint);
        assertAccount(after, job.fingerprint);
        const position = after.items.findIndex(item => item.setVideoId === desired[i].setVideoId);
        if (position < 1 || after.items[position - 1].setVideoId !== desired[i - 1].setVideoId) throw new Error('Sort step could not be verified.');
        job.intent = null;
        await save(job);
      }
      const final = await read(message.tabId, sourceId, job.items[0]?.videoId, job.fingerprint);
      assertAccount(final, job.fingerprint);
      if (JSON.stringify(final.items.map(item => item.setVideoId)) !== JSON.stringify(desired.map(item => item.setVideoId))) throw new Error('Final sort order could not be verified.');
      job.phase = 'completed';
      await archive(job);
    }
    return { job };
  } catch (error) {
    if (job && (await chrome.storage.local.get('activeJob')).activeJob?.id === job.id) {
      job.phase = 'interrupted'; job.error = error.message; await save(job);
      error.jobId = job.id;
    }
    throw error;
  } finally { busy = false; }
}

function makeIO(tabId, expectedFingerprint, pickerVideoId) {
  return {
    read: playlistId => read(tabId, playlistId, pickerVideoId, expectedFingerprint),
    edit: (playlistId, action) => api(tabId, { type: 'edit', playlistId, action, expectedFingerprint }),
    editBatch: (playlistId, actions) => api(tabId, { type: 'edit', playlistId, actions, expectedFingerprint }),
    save,
  };
}

chrome.action.onClicked.addListener(tab => {
  if (tab.url?.startsWith('https://www.youtube.com/')) chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE' }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.tab || !sender.url?.startsWith('https://www.youtube.com/')) return;
  // Sender identity determines the tab; webpage data cannot redirect an operation.
  const allowed = ['READ', 'PLAYLISTS', 'STATUS', 'QUEUE', 'QUEUE_LINKS', 'DISMISS', 'FINISH_MOVE', 'CHECK_OPERATION', 'PASTE', 'TRANSFER', 'REMOVE', 'SORT', 'REORDER'];
  if (!message || !allowed.includes(message.type)) { respond({ ok: false, error: 'Unsupported action.' }); return; }
  run({ ...message, tabId: sender.tab.id }).then(result => respond({ ...result, ok: true })).catch(error => respond({ ok: false, error: error.message, jobId: error.jobId }));
  return true;
});
