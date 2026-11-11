// Service-worker side of the Watch Later sync feature: popup messages, YouTube
// tab handling, and the saved-playlist picker data. Registered before the
// content-script listener in background.js (which stays the last listener).
import { youtubeCommand } from './youtube-api.js';
import { KEYS, createSync, fetchPlaylistEntries, addVideoInPage, readWatchLaterInPage } from './watch-later.js';

const MIN_DELAY_MS = 500;
const MAX_DELAY_MS = 1000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// innertube.js is also a MAIN-world content script; inject again for tabs opened
// before the extension loaded. It only defines globalThis.YTInnertube.
async function injectInnertube(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['src/innertube.js'] });
}

// Reuse an open YouTube tab; otherwise open a background tab and close it afterwards.
async function ensureYouTubeTab() {
  const [existing] = await chrome.tabs.query({ url: 'https://www.youtube.com/*', status: 'complete' });
  if (existing) { await injectInnertube(existing.id); return { tabId: existing.id, created: false }; }
  const tab = await chrome.tabs.create({ url: 'https://www.youtube.com', active: false });
  await new Promise(resolve => {
    const onUpdated = (tabId, info) => {
      if (tabId === tab.id && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(onUpdated); resolve(); }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
  await injectInnertube(tab.id);
  return { tabId: tab.id, created: true };
}

const inPage = async (tabId, func, args = []) => {
  const [injection] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func, args });
  return injection?.result;
};

const sync = createSync({
  storage: chrome.storage.local,
  fetchEntries: id => fetchPlaylistEntries(id),
  ensureTab: ensureYouTubeTab,
  closeTab: tabId => chrome.tabs.remove(tabId),
  readWatchLater: async tabId => (await inPage(tabId, readWatchLaterInPage)) ?? { ok: false, ids: [], error: 'No result from page.' },
  addVideo: async (tabId, videoId, fingerprint) => (await inPage(tabId, addVideoInPage, [videoId, fingerprint])) ?? { ok: false, status: 0, error: 'No result from page.' },
  now: () => Date.now(),
  pause: () => sleep(MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS)),
  emit: message => { chrome.runtime.sendMessage(message).catch(() => {}); }
});

// Runs one sync with the saved sources. Resolves { started, added, errors, aborted, error }.
// A restarted service worker cannot still be running its previous in-memory job.
// Await this write before accepting work so a stale flag cannot disable sync forever.
const ready = chrome.storage.local.set({ [KEYS.inProgress]: false });
export const runWatchLaterSync = async () => { await ready; return sync.runSync(); };
export const watchLaterStatus = async () => {
  await ready;
  const store = await chrome.storage.local.get(KEYS.inProgress);
  return { running: Boolean(store[KEYS.inProgress]) };
};

// Saved (Library) playlists plus the user's own playlists, merged by ID.
export async function loadLibrary() {
  const { tabId, created } = await ensureYouTubeTab();
  const warnings = [];
  try {
    const run = type => inPage(tabId, youtubeCommand, [{ type }]).catch(error => ({ ok: false, error: error.message }));
    const [library, own] = await Promise.all([run('library'), run('playlists')]);
    const byId = new Map();
    if (library?.ok) {
      for (const item of library.playlists) byId.set(item.id, { id: item.id, title: item.title, count: item.count || '', kind: 'saved' });
      if (library.truncated) warnings.push('Your library is very long; only the first pages were loaded. Add the rest by URL.');
    } else warnings.push(`Saved playlists could not be read (${library?.error || 'no result'}).`);
    if (own?.ok) {
      for (const item of own.playlists) {
        if (['WL', 'LL'].includes(item.id)) continue;
        const known = byId.get(item.id);
        if (known) known.kind = 'own';
        else byId.set(item.id, { id: item.id, title: item.title || item.id, count: '', kind: 'own' });
      }
    } else warnings.push(`Your own playlists could not be read (${own?.error || 'no result'}).`);
    if (!library?.ok && !own?.ok) throw new Error(`${library?.error || own?.error || 'YouTube returned no usable result.'} Open youtube.com signed in and try again.`);
    const playlists = [...byId.values()];
    const fetchedAt = Date.now();
    await chrome.storage.local.set({ [KEYS.library]: { fetchedAt, playlists } });
    return { playlists, warnings, fetchedAt };
  } finally {
    if (created) await chrome.tabs.remove(tabId).catch(() => {});
  }
}

// Nothing is in flight when the worker starts, so a stuck flag is stale.
const clearFlag = () => chrome.storage.local.set({ [KEYS.inProgress]: false });
chrome.runtime.onStartup?.addListener(clearFlag);
chrome.runtime.onInstalled?.addListener(clearFlag);

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // The popup may be an action popup, an extension tab, or an embedded extension
  // frame. Trust its exact extension URL; embedded frames also have sender.tab.
  if (sender.id !== chrome.runtime.id || sender.url?.split('?')[0] !== chrome.runtime.getURL('src/popup.html')) return;
  if (message?.type === 'WL_STATUS') {
    watchLaterStatus().then(status => respond({ ok: true, ...status })).catch(error => respond({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'WL_START_SYNC') {
    runWatchLaterSync().then(result => respond({ ok: true, ...result })).catch(error => respond({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'WL_LOAD_LIBRARY') {
    loadLibrary().then(result => respond({ ok: true, ...result })).catch(error => respond({ ok: false, error: error.message }));
    return true;
  }
});
