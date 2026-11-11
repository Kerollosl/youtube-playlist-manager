import { runWatchLaterSync, watchLaterStatus } from './watch-later-worker.js';
import { youtubeCommand } from './youtube-api.js';
import { youtubeRefresh } from './youtube-view.js';
import { saveJob, archiveJob, hydrateJobs } from './job-store.js';
import { measure, newTimings } from './timings.js';
import { assertAccount, exactItems, copyItems, removeItems, assertCopied, counts, reorderPlan, sortPlan, reorderItems } from './operations.js';

let busy = false;
let running = null;
let timingWrites = Promise.resolve();
let lastEditAt = 0;
const validPlaylist = id => typeof id === 'string' && /^[A-Za-z0-9_-]{2,128}$/.test(id);
const validVideo = id => typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id);
function read(tabId, playlistId, pickerVideoId, expectedFingerprint, timings, stage = 'load') {
  return measure(timings, stage, () => readPlaylist(tabId, playlistId, pickerVideoId, expectedFingerprint));
}
async function readPlaylist(tabId, playlistId, pickerVideoId, expectedFingerprint) {
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
  return [queue, activeJob, ...history].flatMap(job => [job?.probeVideoId, ...(job?.items || []).map(item => item.videoId)]).find(validVideo);
}

async function api(tabId, command, timings) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url?.startsWith('https://www.youtube.com/')) throw new Error('Open a YouTube tab first.');
  if (command.type === 'edit') {
    const wait = Math.max(0, 600 - (Date.now() - lastEditAt));
    if (wait) await measure(timings, 'throttle', () => new Promise(resolve => setTimeout(resolve, wait)));
    lastEditAt = Date.now();
  }
  const results = await measure(timings, 'edit', () => chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: youtubeCommand, args: [command] }));
  const result = results[0]?.result;
  if (!result?.ok) throw new Error(result?.error || 'YouTube returned no usable result.');
  return result;
}

async function save(job) {
  job.updatedAt = Date.now();
  job.stopRequested = running?.jobId === job.id && running.stopRequested || job.stopRequested || false;
  await measure(job.timings, 'storage', () => saveJob(chrome.storage.local, job));
}

async function archive(job) {
  const { queue } = await chrome.storage.local.get('queue');
  const clearCut = job.phase === 'completed' && job.kind === 'move' && queue?.kind === 'move' && queue.sourceId === job.sourceId && JSON.stringify(queue.items.map(item => item.setVideoId)) === JSON.stringify(job.items.map(item => item.setVideoId));
  await measure(job.timings, 'storage', () => archiveJob(chrome.storage.local, job, clearCut));
}

async function run(message) {
  if (message.type === 'PERFORMANCE') return { entries: (await chrome.storage.local.get('performanceLog')).performanceLog || [] };
  if (message.type === 'STOP') {
    if (!running || !message.jobId || running.jobId !== message.jobId) throw new Error('That operation is no longer running.');
    running.stopRequested = true;
    await chrome.storage.local.set({ stopRequest: { jobId: message.jobId, requestedAt: Date.now() } });
    return { stopping: true };
  }
  if (message.type === 'SYNC_VIEW') {
    if (busy) throw new Error('Wait for the current operation to finish.');
    busy = true;
    const timings = newTimings();
    try {
      const stored = await chrome.storage.local.get(['activeJob', 'history']);
      const record = [stored.activeJob, ...(stored.history || [])].find(job => job?.id === message.jobId);
      if (!record) return { updated: false };
      const [job] = await hydrateJobs(chrome.storage.local, [record]);
      if (job.fingerprint !== message.expectedFingerprint) return { updated: false };
      const before = [job.removalBefore, job.sourceBefore, job.targetBefore].find(snapshot => snapshot?.playlistId === message.playlistId);
      if (!before) return { updated: false };
      const after = await read(message.tabId, message.playlistId, job.items?.[0]?.videoId, job.fingerprint, timings);
      const results = await measure(timings, 'view', () => chrome.scripting.executeScript({ target: { tabId: message.tabId }, world: 'MAIN', func: youtubeRefresh, args: [{ before, after }] }));
      return { updated: results[0]?.result?.updated === true, snapshot: after };
    } finally { busy = false; await recordTimings(timings, 'view', 'checked'); }
  }
  if (message.type === 'READ') {
    if (!validPlaylist(message.playlistId)) throw new Error('Enter a valid playlist URL or ID.');
    if (message.pickerVideoId !== undefined && !validVideo(message.pickerVideoId)) throw new Error('Invalid video ID for playlist lookup.');
    const timings = newTimings();
    try { return await read(message.tabId, message.playlistId, message.pickerVideoId || await savedProbe(), undefined, timings); }
    finally { await recordTimings(timings, 'read', 'checked'); }
  }
  if (message.type === 'PLAYLISTS') return api(message.tabId, { type: 'playlists', videoId: message.videoId || await savedProbe() });
  if (message.type === 'STATUS') {
    if (message.detailed) {
      const stored = await chrome.storage.local.get(['activeJob', 'history', 'queue']);
      const [activeJob, ...history] = await hydrateJobs(chrome.storage.local, [stored.activeJob, ...(stored.history || [])]);
      return { ...stored, activeJob, history, busy };
    }
    const stored = await chrome.storage.local.get(['activeJob', 'queue', 'historyCount']);
    const summary = job => {
      if (!job) return job;
      const { sourceBefore, targetBefore, removalBefore, desiredIds, ...rest } = job;
      const title = snapshot => snapshot ? { playlistId: snapshot.playlistId, title: snapshot.title } : null;
      return { ...rest, sourceBefore: title(sourceBefore), targetBefore: title(targetBefore) };
    };
    [stored.activeJob] = await hydrateJobs(chrome.storage.local, [stored.activeJob], ['items']);
    const historyCount = stored.historyCount ?? (await chrome.storage.local.get('history')).history?.length ?? 0;
    return { activeJob: summary(stored.activeJob), queue: summary(stored.queue), historyCount, busy };
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
    const account = await api(message.tabId, { type: 'account' });
    const items = message.items.map((item, index) => ({ setVideoId: `link-${index}`, videoId: item.videoId, title: String(item.title || '').slice(0,500) }));
    const queue = { id: crypto.randomUUID(), kind: 'copy', sourceId: null, fingerprint: account.fingerprint, items, sourceBefore: null, savedAt: Date.now() };
    await chrome.storage.local.set({ queue });
    return { queue };
  }
  if (message.type === 'DISMISS') {
    if (busy) throw new Error('Wait for the current step to finish.');
    busy = true;
    try {
      let { activeJob } = await chrome.storage.local.get('activeJob');
      [activeJob] = await hydrateJobs(chrome.storage.local, [activeJob]);
      if (message.jobId && message.jobId !== activeJob?.id) throw new Error('The saved operation changed.');
      if (activeJob) { activeJob.phase = 'stopped'; await archive(activeJob); }
      return {};
    } finally { busy = false; }
  }
  if (busy) throw new Error('An operation is already running.');
  busy = true;
  let job;
  const timings = newTimings();
  running = { jobId: null, stopRequested: false };
  try {
    const { activeJob, queue } = await measure(timings, 'storage', async () => {
      const stored = await chrome.storage.local.get(['activeJob', 'queue']);
      const [activeJob] = await hydrateJobs(chrome.storage.local, [stored.activeJob]);
      return { ...stored, activeJob };
    });
    if (activeJob) running.jobId = activeJob.id;
    if (message.type === 'CHECK_OPERATION') {
      if (!activeJob || !['copy', 'move'].includes(activeJob.kind)) throw new Error('There is no saved copy or move to check.');
      if (message.jobId && message.jobId !== activeJob.id) throw new Error('The saved operation changed.');
      if (activeJob.removed?.length || ['remove', 'remove_batch'].includes(activeJob.intent?.kind)) throw new Error('Removal already started. Review the saved operation.');
      const destination = await read(message.tabId, activeJob.targetId, activeJob.items[0]?.videoId, activeJob.fingerprint, timings);
      assertCopied(activeJob, destination);
      const actual = counts(destination.items), baseline = counts(activeJob.targetBefore.items), added = counts(activeJob.items);
      if (Object.entries(added).some(([id, count]) => (actual[id] || 0) !== (baseline[id] || 0) + count)) throw new Error('Conflicting destination counts. Review the saved operation.');
      // Assign only after verification so failed checks leave the saved job untouched.
      job = activeJob; job.timings = timings; job.stopRequested = false;
      job.copied = job.items.map(item => item.setVideoId);
      job.intent = null;
      delete job.error;
      job.phase = job.kind === 'move' ? 'ready_to_remove' : 'completed';
      if (job.kind === 'move') await save(job);
      else await archive(job);
      return { job };
    }
    if (message.type === 'FINISH_MOVE') {
      if (activeJob?.phase !== 'ready_to_remove' || activeJob.kind !== 'move' || message.jobId !== activeJob.id) throw new Error('There is no verified move to finish.');
      job = activeJob; job.timings = timings; job.stopRequested = false;
      const [source, destination] = await Promise.all([
        read(message.tabId, job.sourceId, job.items[0]?.videoId, job.fingerprint, timings),
        read(message.tabId, job.targetId, job.items[0]?.videoId, job.fingerprint, timings),
      ]);
      assertAccount(source, job.fingerprint);
      assertCopied(job, destination);
      if (!source.editable) throw new Error('The source playlist is not editable.');
      job.phase = 'removing';
      await save(job);
      await removeItems(job, makeIO(message.tabId, job), destination, source);
      job.phase = 'completed';
      await archive(job);
      return { job };
    }
    // A stopped copy cannot remove originals. Preserve it in history when an
    // independently reviewed delete starts; never bypass an unfinished move.
    const archiveStoppedCopy = message.type === 'REMOVE' && activeJob?.kind === 'copy' && activeJob.phase === 'interrupted';
    if (activeJob && !archiveStoppedCopy) throw new Error('Review or stop the saved operation before starting another.');
    if (!['PASTE', 'TRANSFER', 'REMOVE', 'SORT', 'REORDER'].includes(message.type)) throw new Error('Unsupported command.');
    if (message.type === 'TRANSFER' && message.pickerVideoId !== undefined && !validVideo(message.pickerVideoId)) throw new Error('Invalid video ID for playlist lookup.');
    const pasted = message.type === 'PASTE';
    if (pasted && !queue) throw new Error('Copy or cut videos first.');
    if (pasted && message.expectedQueueId !== queue.id) throw new Error('The saved selection changed. Review Paste again.');
    const sourceId = pasted ? queue.sourceId : message.playlistId;
    const kind = message.type === 'REMOVE' ? 'remove' : message.type === 'SORT' ? 'sort' : message.type === 'REORDER' ? 'reorder' : pasted ? queue.kind : message.kind === 'move' ? 'move' : 'copy';
    let source = null;
    let prefetchedTarget = null;
    let items;
    let fingerprint;
    if (pasted && kind === 'copy') {
      // Copy is a durable list of links; originals do not need to remain present.
      items = structuredClone(queue.items);
      fingerprint = queue.fingerprint;
    } else {
      if (!validPlaylist(sourceId)) throw new Error('No valid source playlist.');
      if (message.type === 'TRANSFER' && validVideo(message.pickerVideoId)) {
        if (!validPlaylist(message.targetId) || message.targetId === sourceId) throw new Error('Choose a different destination playlist.');
        // Both preflights are fresh reads. Wait for both to settle before
        // releasing the operation lock, even if one fails its account checks.
        const results = await Promise.allSettled([
          read(message.tabId, sourceId, undefined, message.expectedFingerprint, timings),
          read(message.tabId, message.targetId, message.pickerVideoId, message.expectedFingerprint, timings)
        ]);
        const failure = results.find(result => result.status === 'rejected');
        if (failure) throw failure.reason;
        [source, prefetchedTarget] = results.map(result => result.value);
      } else {
        source = await read(message.tabId, sourceId, undefined, pasted ? queue.fingerprint : message.expectedFingerprint, timings);
      }
      assertAccount(source, pasted ? queue.fingerprint : message.expectedFingerprint);
      fingerprint = source.fingerprint;
      items = exactItems(pasted ? queue.items.map(item => item.setVideoId) : message.keys, source);
      if (pasted && items.some((item, i) => item.videoId !== queue.items[i].videoId)) throw new Error('Saved source videos changed.');
      if (['move', 'remove', 'sort', 'reorder'].includes(kind) && !source.editable) throw new Error('The source playlist is not editable.');
      if (['sort', 'reorder'].includes(kind) && !source.canReorder) throw new Error('YouTube does not allow this playlist to be reordered.');
    }
    let placement;
    if (kind === 'reorder') {
      if (JSON.stringify(message.expectedOrder) !== JSON.stringify(source.items.map(item => item.setVideoId))) throw new Error('The playlist order changed. Refresh and choose the position again.');
      placement = reorderPlan(source, message.keys, message.position, message.beforeId);
    }
    if (kind === 'sort') {
      if (message.expectedOrder !== undefined && JSON.stringify(message.expectedOrder) !== JSON.stringify(source.items.map(item => item.setVideoId))) throw new Error('The playlist order changed. Review sorting again.');
      placement = sortPlan(source, message.keys, message.sortBy, message.descending);
    }
    if (archiveStoppedCopy) await archive({ ...activeJob, phase: 'stopped' });
    job = { id: crypto.randomUUID(), kind, sourceId, fingerprint, sourceBefore: source || queue?.sourceBefore, items, copied: [], removed: [], intent: null, phase: 'starting', createdAt: Date.now(), timings };
    running.jobId = job.id;
    if (kind === 'copy' || kind === 'move') {
      if (!validPlaylist(message.targetId) || message.targetId === sourceId) throw new Error('Choose a different destination playlist.');
      const target = prefetchedTarget || await read(message.tabId, message.targetId, items[0]?.videoId, fingerprint, timings);
      assertAccount(target, fingerprint);
      if (!target.editable) throw new Error('The destination playlist is not editable.');
      job.targetId = message.targetId;
      job.targetBefore = target;
      job.phase = 'copying';
      await save(job);
      await copyItems(job, makeIO(message.tabId, job));
      if (kind === 'move') { job.phase = 'ready_to_remove'; await save(job); }
      else { job.phase = 'completed'; await archive(job); }
    } else if (kind === 'remove') {
      job.phase = 'removing';
      await save(job);
      await removeItems(job, makeIO(message.tabId, job));
      job.phase = 'completed';
      await archive(job);
    } else if (kind === 'reorder') {
      job.phase = 'reordering';
      await save(job);
      await reorderItems(job, placement, makeIO(message.tabId, job));
      job.phase = 'completed';
      await archive(job);
    } else {
      // Sorting is occurrence-based and never removes any video.
      job.items = placement.items;
      job.sortBy = message.sortBy; job.descending = message.descending ?? true; job.sortPlacement = placement.placement;
      job.phase = 'sorting';
      await save(job);
      await reorderItems(job, placement, makeIO(message.tabId, job));
      job.phase = 'completed';
      await archive(job);
    }
    return { job };
  } catch (error) {
    if (job && (await chrome.storage.local.get('activeJob')).activeJob?.id === job.id) {
      job.phase = error.code === 'STOPPED' ? 'stopped' : 'interrupted'; job.error = error.message; await save(job);
      if (error.code === 'STOPPED') return { job, stopped: true };
      error.jobId = job.id;
    }
    throw error;
  } finally {
    running = null; busy = false;
    await recordTimings(timings, job?.kind || message.type.toLowerCase(), job?.phase || 'failed');
  }
}

async function recordTimings(timings, kind, phase) {
  timings.elapsedMs = Date.now() - timings.startedAt;
  const entry = structuredClone({ ...timings, kind, phase });
  timingWrites = timingWrites.then(async () => {
    try {
      const { performanceLog = [] } = await chrome.storage.local.get('performanceLog');
      await chrome.storage.local.set({ performanceLog: [entry, ...performanceLog].slice(0, 20) });
    } catch { /* Optional metrics must never change a verified mutation outcome. */ }
  });
  await timingWrites;
}

function makeIO(tabId, job) {
  return {
    beforeBatch: async () => {
      if (running?.stopRequested) throw Object.assign(new Error('Stopped after the last verified batch. Completed changes are saved.'), { code: 'STOPPED' });
    },
    wait: ms => measure(job.timings, 'verification_wait', () => new Promise(resolve => setTimeout(resolve, ms))),
    read: playlistId => read(tabId, playlistId, job.items[0]?.videoId, job.fingerprint, job.timings, 'verification'),
    edit: (playlistId, action) => api(tabId, { type: 'edit', playlistId, action, expectedFingerprint: job.fingerprint }, job.timings),
    editBatch: (playlistId, actions) => api(tabId, { type: 'edit', playlistId, actions, expectedFingerprint: job.fingerprint }, job.timings),
    save,
  };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.tab || !sender.url?.startsWith('https://www.youtube.com/')) return;
  if (message?.type === 'STYLES') {
    fetch(chrome.runtime.getURL('src/ui.css')).then(response => response.text()).then(css => respond({ ok: true, css })).catch(() => respond({ ok: false }));
    return true;
  }
  // One-click Watch Later sync from the in-page menu (no config UI). Same engine as the panel's "Sync now".
  if (message?.type === 'WL_QUICK_SYNC') {
    runWatchLaterSync().then(result => respond({ ok: true, ...result })).catch(error => respond({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'WL_SYNC_STATUS') {
    watchLaterStatus().then(status => respond({ ok: true, ...status })).catch(error => respond({ ok: false, error: error.message }));
    return true;
  }
  // Sender identity determines the tab; webpage data cannot redirect an operation.
  const allowed = ['STOP', 'PERFORMANCE', 'SYNC_VIEW', 'READ', 'PLAYLISTS', 'STATUS', 'QUEUE', 'QUEUE_LINKS', 'DISMISS', 'FINISH_MOVE', 'CHECK_OPERATION', 'PASTE', 'TRANSFER', 'REMOVE', 'SORT', 'REORDER'];
  if (!message || !allowed.includes(message.type)) { respond({ ok: false, error: 'Unsupported action.' }); return; }
  run({ ...message, tabId: sender.tab.id }).then(result => respond({ ...result, ok: true })).catch(error => respond({ ok: false, error: error.message, jobId: error.jobId }));
  return true;
});
