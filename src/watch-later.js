// Watch Later sync, ported from the standalone youtube-watch-later-sync extension.
// New uploads of the playlists the user picked (read from YouTube's public RSS
// feeds) are added to Watch Later ("WL") through YouTube's private edit_playlist
// endpoint, running inside a real youtube.com tab so the page's own session
// signs the request. Sync is manual; nothing here schedules itself.
//
// Pure helpers (feed parsing, source list handling, sync decisions) are exported
// for unit tests. addVideoInPage and readWatchLaterInPage are serialized into the
// page: they must not close over anything in this file.

export const SOURCES_KEY = 'watchLaterSources';
export const KEYS = {
  sources: SOURCES_KEY,
  lastSync: 'wlLastSyncTimestamp',
  added: 'wlAddedVideoIds',
  fingerprint: 'wlAccountFingerprint',
  log: 'wlSyncLog',
  inProgress: 'wlSyncInProgress',
  lastAddedAt: 'wlLastAddedAt',
  library: 'wlLibraryCache'
};
export const MAX_LOG_ENTRIES = 50;
export const MAX_ADDED_IDS = 1000;
export const MAX_SOURCES = 500;
export const EXPORT_FORMAT = 'watch-later-sync-sources';

// --- Source list ---------------------------------------------------------

const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,128}$/;
const RESERVED = new Set(['WL', 'LL']);

export function extractPlaylistId(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: false, error: 'Enter a playlist URL or ID.' };
  if (!text.includes('://') && PLAYLIST_ID.test(text)) return { ok: true, id: text };
  try {
    const url = new URL(text);
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(url.hostname)) {
      return { ok: false, error: 'That is not a youtube.com link.' };
    }
    const list = url.searchParams.get('list');
    if (!list) return { ok: false, error: 'That URL has no ?list= parameter.' };
    if (!PLAYLIST_ID.test(list)) return { ok: false, error: 'That playlist cannot be synced (Watch Later, Liked videos and mixes are not supported).' };
    return { ok: true, id: list };
  } catch {
    return { ok: false, error: 'Not a playlist URL or ID.' };
  }
}

function cleanSource(entry) {
  const raw = typeof entry === 'string' ? { id: entry } : entry;
  if (!raw || typeof raw !== 'object') return null;
  const parsed = extractPlaylistId(raw.id ?? raw.url ?? '');
  if (!parsed.ok || RESERVED.has(parsed.id)) return null;
  const label = typeof raw.label === 'string' ? raw.label.trim().slice(0, 150) : '';
  const addedAt = Number.isFinite(raw.addedAt) ? raw.addedAt : 0;
  return { id: parsed.id, label, addedAt };
}

// Drops invalid entries and duplicates (first wins); a later duplicate may only
// supply a missing label.
export function normalizeSources(list) {
  const out = new Map();
  for (const entry of Array.isArray(list) ? list : []) {
    const source = cleanSource(entry);
    if (!source) continue;
    const existing = out.get(source.id);
    if (existing) { if (!existing.label && source.label) existing.label = source.label; continue; }
    if (out.size < MAX_SOURCES) out.set(source.id, source);
  }
  return [...out.values()];
}

export function exportSources(sources, now = Date.now()) {
  return JSON.stringify({
    format: EXPORT_FORMAT,
    version: 1,
    exportedAt: new Date(now).toISOString(),
    sources: normalizeSources(sources).map(({ id, label }) => ({ id, label }))
  }, null, 2);
}

// Accepts this extension's export, a bare array, or entries that are strings
// (IDs or URLs). Returns the valid sources and how many entries were ignored.
export function parseImport(text) {
  let data;
  try { data = JSON.parse(String(text)); } catch { return { ok: false, error: 'That file is not valid JSON.' }; }
  let list;
  if (Array.isArray(data)) list = data;
  else if (data && typeof data === 'object' && Array.isArray(data.sources)) {
    if (data.format !== undefined && data.format !== EXPORT_FORMAT) return { ok: false, error: 'That file is not a Watch Later sync list.' };
    list = data.sources;
  } else return { ok: false, error: 'That file has no sources list.' };
  const sources = normalizeSources(list);
  return { ok: true, sources, skipped: list.length - sources.length };
}

// Imported entries are added to the current list; existing labels are kept.
export function mergeSources(current, incoming, now = Date.now()) {
  const merged = normalizeSources([...current, ...incoming.map(source => ({ ...source, addedAt: source.addedAt || now }))]);
  return merged;
}

// Picker rows: loaded library playlists plus any chosen/manual sources that are
// not in the library, filtered by title or ID and sorted by title.
export function buildRows(library, sources, filter = '') {
  const chosen = new Set(sources.map(source => source.id));
  const rows = new Map();
  for (const item of library) rows.set(item.id, { id: item.id, title: item.title || item.id, count: item.count || '', kind: item.kind || 'saved' });
  for (const source of sources) if (!rows.has(source.id)) rows.set(source.id, { id: source.id, title: source.label || source.id, count: '', kind: 'manual' });
  const needle = String(filter).trim().toLowerCase();
  return [...rows.values()]
    .filter(row => !needle || row.title.toLowerCase().includes(needle) || row.id.toLowerCase().includes(needle))
    .map(row => ({ ...row, checked: chosen.has(row.id) }))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
}

// Ticks (or unticks) the given rows, keeping every other source untouched.
export function setChosen(sources, rows, checked, now = Date.now()) {
  const ids = new Set(rows.map(row => row.id));
  const kept = sources.filter(source => !ids.has(source.id));
  if (!checked) return kept;
  const existing = new Map(sources.map(source => [source.id, source]));
  return normalizeSources([...kept, ...rows.map(row => existing.get(row.id) || { id: row.id, label: row.title === row.id ? '' : row.title, addedAt: now })]);
}

// --- RSS parsing (service workers have no DOMParser) ----------------------

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeXmlEntities(text) {
  return text.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));/g, (match, dec, hex, name) => {
    if (name) return Object.hasOwn(XML_ENTITIES, name) ? XML_ENTITIES[name] : match;
    const code = dec !== undefined ? parseInt(dec, 10) : parseInt(hex, 16);
    if (!Number.isInteger(code) || code < 1 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return match;
    return String.fromCodePoint(code);
  });
}

export function parseAtomEntries(xmlText) {
  const entries = [];
  for (const block of xmlText.split('<entry>').slice(1)) {
    const entryXml = block.split('</entry>')[0];
    const videoId = entryXml.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    const published = entryXml.match(/<published>([^<]+)<\/published>/);
    const title = entryXml.match(/<title>([^<]*)<\/title>/);
    if (!videoId || !published) continue;
    const publishedMs = Date.parse(published[1]);
    if (Number.isNaN(publishedMs)) continue;
    entries.push({ videoId: videoId[1], publishedMs, title: title ? decodeXmlEntities(title[1]) : videoId[1] });
  }
  return entries;
}

export async function fetchPlaylistEntries(playlistId, fetchImpl = fetch) {
  const url = `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(playlistId)}`;
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseAtomEntries(await response.text());
}

// Sync decision: a video is new if it was published after the last sync and has
// not been confirmed added. Oldest first so Watch Later keeps publish order.
export function selectNewEntries(entries, lastSyncMs, addedIds) {
  return entries.filter(entry => entry.publishedMs > (lastSyncMs ?? 0) && !addedIds.has(entry.videoId));
}

// --- Page-side functions (serialized into a youtube.com tab) ----------------
// innertube.js must already be present in the page (globalThis.YTInnertube).

export function addVideoInPage(videoId, expectedFingerprint) {
  return (async () => {
    const IT = globalThis.YTInnertube;
    if (!IT) return { ok: false, status: 0, error: 'Helper script did not load.' };
    try {
      const get = name => window.ytcfg?.get?.(name);
      const sapisid = IT.getSapisid(document.cookie);
      if (!sapisid || get('LOGGED_IN') === false) return { ok: false, status: 0, error: 'Not signed in to YouTube.' };
      const context = IT.requireContext(get);
      const { accountIndex, delegated } = IT.accountIdentity(get);
      if (!expectedFingerprint || await IT.accountFingerprint(get) !== expectedFingerprint) {
        return { ok: false, status: 403, error: 'YouTube account changed. Sync stopped before adding.' };
      }
      const authorization = await IT.sapisidHashHeader(sapisid);
      const response = await IT.fetchWithBackoff(IT.endpointUrl(get, 'browse/edit_playlist'), {
        method: 'POST',
        credentials: 'include',
        headers: IT.buildHeaders({ get, context, authorization, accountIndex, delegated }),
        body: JSON.stringify({ context, actions: [{ action: 'ACTION_ADD_VIDEO', addedVideoId: videoId }], playlistId: 'WL' })
      });
      // A 200 is NOT proof of success: innertube answers 200 with an error payload.
      let data = null;
      try { data = await response.json(); } catch { /* non-JSON body: fall back to HTTP status */ }
      if (!response.ok) return { ok: false, status: response.status, error: data?.error?.message || `HTTP ${response.status}` };
      if (data?.error) return { ok: false, status: data.error.code || response.status, error: data.error.message || 'API returned an error' };
      if (data?.status && data.status !== 'STATUS_SUCCEEDED') return { ok: false, status: response.status, error: `API status ${data.status}` };
      return { ok: true, status: response.status };
    } catch (err) {
      return { ok: false, status: 0, error: err.message };
    }
  })();
}

// Reads the real Watch Later contents plus the signed-in account fingerprint, so
// the report is checked against YouTube's own state. Only IDs leave the page.
export function readWatchLaterInPage() {
  return (async () => {
    const IT = globalThis.YTInnertube;
    if (!IT) return { ok: false, ids: [], error: 'Helper script did not load.' };
    function collectVideoIds(node, out, depth) {
      if (!node || typeof node !== 'object' || depth > 40) return;
      if (Array.isArray(node)) { for (const item of node) collectVideoIds(item, out, depth + 1); return; }
      if (typeof node.videoId === 'string') out.add(node.videoId);
      for (const key of Object.keys(node)) collectVideoIds(node[key], out, depth + 1);
    }
    try {
      const get = name => window.ytcfg?.get?.(name);
      const sapisid = IT.getSapisid(document.cookie);
      if (!sapisid || get('LOGGED_IN') === false) return { ok: false, ids: [], error: 'Not signed in to YouTube.' };
      const context = IT.requireContext(get);
      const { accountIndex, delegated } = IT.accountIdentity(get);
      const fingerprint = await IT.accountFingerprint(get);
      const authorization = await IT.sapisidHashHeader(sapisid);
      const response = await IT.fetchWithBackoff(IT.endpointUrl(get, 'browse'), {
        method: 'POST',
        credentials: 'include',
        headers: IT.buildHeaders({ get, context, authorization, accountIndex, delegated }),
        body: JSON.stringify({ context, browseId: 'VLWL' })
      });
      if (!response.ok) return { ok: false, ids: [], fingerprint, error: `HTTP ${response.status}` };
      const data = await response.json();
      if (data?.error) return { ok: false, ids: [], fingerprint, error: data.error.message || 'API error' };
      const ids = new Set();
      collectVideoIds(data, ids, 0);
      return { ok: true, ids: Array.from(ids), fingerprint };
    } catch (err) {
      return { ok: false, ids: [], error: err.message };
    }
  })();
}

// --- Sync orchestration ------------------------------------------------------
// deps: storage {get,set}, fetchEntries(id), ensureTab() -> {tabId, created},
// closeTab(tabId), readWatchLater(tabId), addVideo(tabId, videoId), now(),
// pause() (rate-limit gap between adds), emit(message) (live popup updates).

export function createSync(deps) {
  const { storage } = deps;
  let running = false;
  const emit = message => { try { deps.emit?.(message); } catch { /* no popup listening */ } };

  async function appendLog(text, level = 'info') {
    const { [KEYS.log]: log = [] } = await storage.get(KEYS.log);
    const entry = { ts: deps.now(), text, level };
    await storage.set({ [KEYS.log]: [...log, entry].slice(-MAX_LOG_ENTRIES) });
    emit({ type: 'WL_PROGRESS', entry });
    return entry;
  }

  async function setState(inProgress, lastSyncTimestamp) {
    const update = { [KEYS.inProgress]: inProgress };
    if (lastSyncTimestamp !== undefined) update[KEYS.lastSync] = lastSyncTimestamp;
    await storage.set(update);
    emit({ type: 'WL_STATE', inProgress, lastSyncTimestamp });
  }

  const saveAdded = async addedIds => storage.set({ [KEYS.added]: Array.from(addedIds).slice(-MAX_ADDED_IDS) });

  async function runSync() {
    if (running) return { started: false };
    running = true;
    try {
      if ((await storage.get(KEYS.inProgress))[KEYS.inProgress]) {
        await appendLog('Sync already in progress, ignoring duplicate request.', 'muted');
        return { started: false };
      }
      const startedAt = deps.now();
      await setState(true);
      await appendLog('Sync started...');
      try {
        return await syncOnce(startedAt);
      } catch (err) {
        await appendLog(`Sync failed: ${err.message}`, 'error');
        await setState(false);
        return { started: true, error: err.message };
      }
    } finally { running = false; }
  }

  async function syncOnce(startedAt) {
    const stored = await storage.get([KEYS.sources, KEYS.lastSync, KEYS.added]);
    const sources = normalizeSources(stored[KEYS.sources]);
    const lastSync = stored[KEYS.lastSync] ?? 0;
    const addedIds = new Set(stored[KEYS.added] || []);

    if (!sources.length) {
      await appendLog('No playlists selected. Tick some playlists first.');
      await setState(false);
      return { started: true, added: 0, needsSources: true };
    }

    // Phase 1: fetch + parse every selected playlist's feed.
    const candidates = new Map();
    let skipped = 0, feedErrors = 0;
    for (const source of sources) {
      const label = source.label || source.id;
      await appendLog(`Checking playlist "${label}"...`);
      try {
        const entries = await deps.fetchEntries(source.id);
        const fresh = selectNewEntries(entries, lastSync, addedIds);
        skipped += entries.length - fresh.length;
        await appendLog(`Found ${fresh.length} new video(s) in "${label}" (of ${entries.length} in feed).`);
        // Defer filtering the durable added record until the current account is known.
        for (const entry of entries) if (!candidates.has(entry.videoId)) candidates.set(entry.videoId, entry);
      } catch (err) {
        feedErrors++;
        await appendLog(`Failed to fetch/parse playlist "${label}": ${err.message}`, 'error');
      }
    }

    let newVideos = Array.from(candidates.values()).sort((a, b) => a.publishedMs - b.publishedMs);
    await appendLog(`${newVideos.length} video(s) to check across all playlists.`);

    if (!newVideos.length) {
      await appendLog(feedErrors ? `Sync incomplete: ${feedErrors} playlist feed(s) failed. Try again later.` : `Sync complete: 0 added, ${skipped} skipped (already synced).`, feedErrors ? 'error' : 'info');
      await setState(false, feedErrors ? undefined : startedAt);
      return { started: true, added: 0, errors: feedErrors };
    }

    // Phase 2: adds run inside a YouTube tab; acquire one only when there is work.
    let added = 0, errors = feedErrors, aborted = false, verified = null, verificationFailed = false;
    const attempted = [];
    const { tabId, created } = await deps.ensureTab();
    try {
      // Read Watch Later BEFORE adding: skip what is already there, repair the record.
      const before = await deps.readWatchLater(tabId);
      if (!before.ok || !before.fingerprint) {
        await appendLog(`Could not verify Watch Later and its account (${before.error || 'account identity unavailable'}). Open YouTube signed in, then try again.`, 'error');
        aborted = true;
        newVideos = [];
      }
      let accountChanged = false;
      if (before.ok && before.fingerprint) {
        // addedVideoIds describes ONE account's Watch Later; a different account makes it meaningless.
        const previous = (await storage.get(KEYS.fingerprint))[KEYS.fingerprint];
        if (previous && previous !== before.fingerprint) {
          accountChanged = true;
          addedIds.clear();
          await storage.set({ [KEYS.added]: [] });
          await appendLog('A different YouTube account is signed in than on the last sync. The added-videos record was reset; videos will be added to the account that is signed in now.', 'muted');
        }
        await storage.set({ [KEYS.fingerprint]: before.fingerprint });
      }
      if (!aborted) {
        newVideos = selectNewEntries(newVideos, accountChanged ? 0 : lastSync, addedIds);
        const present = new Set(before.ids);
        const alreadyThere = newVideos.filter(video => present.has(video.videoId));
        if (alreadyThere.length) {
          await appendLog(`${alreadyThere.length} already in Watch Later - skipping and recording them.`, 'muted');
          for (const video of alreadyThere) addedIds.add(video.videoId);
          await saveAdded(addedIds);
          newVideos = newVideos.filter(video => !present.has(video.videoId));
        }
      }

      for (let i = 0; i < newVideos.length; i++) {
        const video = newVideos[i];
        emit({ type: 'WL_TICK', current: i + 1, total: newVideos.length, title: video.title });
        try {
          const result = await deps.addVideo(tabId, video.videoId, before.fingerprint);
          if (result.ok) {
            await appendLog(`Added: "${video.title}"`, 'success');
            added++;
            attempted.push(video.videoId);
            // Persist after each confirmed add: a worker can be terminated mid-run.
            addedIds.add(video.videoId);
            await saveAdded(addedIds);
          } else if (result.status === 401 || result.status === 403) {
            await appendLog(`Auth error (${result.status}) adding "${video.title}" - session may have expired. Stopping remaining adds.`, 'error');
            errors++;
            aborted = true;
            break;
          } else {
            await appendLog(`Could not add "${video.title}" (${result.error || 'HTTP ' + result.status}). Skipping.`, 'error');
            errors++;
          }
        } catch (err) {
          await appendLog(`Network error adding "${video.title}": ${err.message}. Skipping.`, 'error');
          errors++;
        }
        if (i < newVideos.length - 1 && !aborted) await deps.pause();
      }

      // Read Watch Later AFTER adding so the summary reports what YouTube holds.
      if (added > 0) {
        const after = await deps.readWatchLater(tabId);
        if (after.ok && after.fingerprint === before.fingerprint) {
          const present = new Set(after.ids);
          const landed = attempted.filter(id => present.has(id));
          verified = { landed: landed.length, attempted: attempted.length };
          if (landed.length < attempted.length) {
            for (const id of attempted.filter(id => !present.has(id))) addedIds.delete(id);
            await saveAdded(addedIds);
            await appendLog(`Verification: only ${landed.length} of ${attempted.length} are actually in Watch Later. The rest were un-recorded and will be retried.`, 'error');
          } else {
            await appendLog(`Verified all ${landed.length} in Watch Later.`, 'success');
          }
        } else {
          verificationFailed = true;
          errors++;
          await appendLog(`Could not verify the additions (${after.error || 'YouTube account changed'}). Last sync time is unchanged; recorded additions are kept to avoid replaying them.`, 'error');
        }
      }
    } finally {
      if (created) await deps.closeTab(tabId).catch(() => {}); // only close what we opened
    }

    const confirmedAdded = verified ? verified.landed : verificationFailed ? 0 : added;
    if (confirmedAdded > 0) await storage.set({ [KEYS.lastAddedAt]: deps.now() });

    if (aborted) {
      // Do not advance the clock: videos never attempted must stay inside the window.
      await appendLog(`Sync stopped early: ${added} added, ${errors} error(s). Last sync time left unchanged so the remaining videos are retried next time.`);
      await setState(false);
    } else if (errors > 0 || (verified && verified.landed < verified.attempted)) {
      const shortfall = verified ? verified.attempted - verified.landed : 0;
      const detail = shortfall ? `${added} added but ${shortfall} not found in Watch Later` : `${added} added, ${skipped} skipped`;
      await appendLog(`Sync finished with ${errors} error(s): ${detail}. Last sync time left unchanged so the affected videos are retried next time.`);
      await setState(false);
    } else {
      const suffix = verified ? ` (${verified.landed} verified in Watch Later)` : '';
      await appendLog(`Sync complete: ${added} added, ${skipped} skipped (already synced)${suffix}.`);
      await setState(false, startedAt);
    }
    const shortfall = verified ? verified.attempted - verified.landed : 0;
    return { started: true, added: confirmedAdded, errors: errors + shortfall, aborted };
  }

  return { runSync, appendLog };
}
