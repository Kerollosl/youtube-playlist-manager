// Popup: toggles multiselect on the current YouTube tab and manages the Watch
// Later sync sources. The service worker owns network and sync; this page only
// reads/writes chrome.storage.local and sends WL_* messages.
import { KEYS, buildRows, setChosen, normalizeSources, extractPlaylistId, exportSources, parseImport, mergeSources } from './watch-later.js';

const $ = id => document.getElementById(id);
let sources = [];
let library = [];
let running = false;
let requesting = false;
const params = new URLSearchParams(location.search);
const embedded = params.has('embed');
if (['light', 'dark'].includes(params.get('theme'))) document.documentElement.dataset.theme = params.get('theme');

// Embedded mode (shown as a mini window inside YouTube from the in-page menu): the page's own header
// carries the title, and the multiselect toggle is pointless because multiselect is already open.
if (embedded) {
  $('sel-h').closest('section').hidden = true;
  document.documentElement.classList.add('embed');
}

function showSettings(show) {
  $('settings').hidden = !show;
  $('settings-toggle').setAttribute('aria-expanded', String(show));
}
$('settings-toggle').addEventListener('click', () => showSettings($('settings').hidden));

if (embedded) {
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      parent.postMessage({ type: 'WL_CLOSE_PANEL' }, 'https://www.youtube.com');
    }
    if (event.key === 'Tab') {
      const nodes = [...document.querySelectorAll('button:not(:disabled),input:not(:disabled),summary')].filter(node => node.getClientRects().length);
      if ((event.shiftKey && document.activeElement === nodes[0]) || (!event.shiftKey && document.activeElement === nodes.at(-1))) {
        event.preventDefault();
        parent.postMessage({ type: 'WL_PANEL_FOCUS_CLOSE' }, 'https://www.youtube.com');
      }
    }
  });
  window.addEventListener('message', event => {
    if (event.source === parent && event.origin === 'https://www.youtube.com' && event.data?.type === 'WL_THEME' && ['light', 'dark'].includes(event.data.theme)) {
      document.documentElement.dataset.theme = event.data.theme;
    }
  });
}

// --- Multiselect toggle -------------------------------------------------------

async function activeYouTubeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url?.startsWith('https://www.youtube.com/') ? tab : null;
}

$('toggle').addEventListener('click', async () => {
  const tab = await activeYouTubeTab();
  if (!tab) { $('toggle-note').textContent = 'Open a YouTube tab first, then press this again.'; return; }
  try { await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE' }); window.close(); }
  catch { $('toggle-note').textContent = 'Reload the YouTube tab, then try again.'; }
});

// --- Picker ---------------------------------------------------------------------

function render() {
  const rows = buildRows(library, sources, $('filter').value);
  const list = $('list');
  list.replaceChildren(...rows.map(row => {
    const li = document.createElement('li');
    li.className = 'item';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = `pl-${row.id}`;
    box.checked = row.checked;
    box.addEventListener('change', () => commit(setChosen(sources, [row], box.checked)));
    const label = document.createElement('label');
    label.htmlFor = box.id;
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = row.title;
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = [{ saved: 'Saved', own: 'Yours', manual: 'Added by URL' }[row.kind], row.count].filter(Boolean).join(' · ');
    label.append(title, meta);
    li.append(box, label);
    return li;
  }));
  const empty = $('empty');
  empty.hidden = rows.length > 0;
  if (!rows.length) empty.textContent = library.length || sources.length ? 'No playlists match the filter.' : 'No playlists yet. Press Load my playlists (needs a signed-in YouTube) or add one by URL.';
  $('sync').disabled = running || requesting || sources.length === 0;
  $('sync').textContent = running || requesting ? 'Syncing…' : 'Sync now';
  $('source-count').textContent = sources.length ? `${sources.length} playlist${sources.length === 1 ? '' : 's'} selected` : 'Choose playlists to start syncing.';
}

async function commit(next) {
  sources = normalizeSources(next);
  await chrome.storage.local.set({ [KEYS.sources]: sources });
  render();
}

$('filter').addEventListener('input', render);
$('all').addEventListener('click', () => commit(setChosen(sources, buildRows(library, sources, $('filter').value), true)));
$('none').addEventListener('click', () => commit(setChosen(sources, buildRows(library, sources, $('filter').value), false)));

$('load').addEventListener('click', async () => {
  const button = $('load');
  button.disabled = true;
  $('load-note').textContent = 'Loading from YouTube...';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'WL_LOAD_LIBRARY' });
    if (!result?.ok) throw new Error(result?.error || 'No response from the extension.');
    library = result.playlists;
    $('load-note').textContent = [`${library.length} playlists loaded.`, ...result.warnings].join(' ');
    render();
  } catch (error) {
    $('load-note').textContent = error.message;
  } finally { button.disabled = false; }
});

$('add').addEventListener('submit', async event => {
  event.preventDefault();
  const error = $('add-error');
  error.hidden = true;
  const parsed = extractPlaylistId($('add-input').value);
  if (!parsed.ok) { error.textContent = parsed.error; error.hidden = false; return; }
  if (sources.some(source => source.id === parsed.id)) { error.textContent = 'Already in the list.'; error.hidden = false; return; }
  $('add-input').value = '';
  await commit([...sources, { id: parsed.id, label: '', addedAt: Date.now() }]);
});

// --- Sync ---------------------------------------------------------------------------

function relTime(ms) {
  if (!ms) return 'Never synced.';
  const minutes = Math.round((Date.now() - ms) / 60000);
  if (minutes < 1) return 'Synced just now.';
  if (minutes < 60) return `Synced ${minutes} min ago.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Synced ${hours} h ago.`;
  return `Synced ${new Date(ms).toLocaleDateString()}.`;
}

function renderLog(entries) {
  $('log-count').textContent = entries.length ? `(${entries.length})` : '';
  $('log-list').replaceChildren(...entries.map(entry => {
    const li = document.createElement('li');
    li.dataset.level = entry.level || 'info';
    li.textContent = `${new Date(entry.ts).toLocaleTimeString()}  ${entry.text}`;
    return li;
  }));
}

$('sync').addEventListener('click', async () => {
  if (requesting || running) return;
  requesting = true;
  $('progress').hidden = false;
  $('fill').style.transform = 'scaleX(0)';
  $('progress-text').textContent = 'Starting...';
  $('sync-result').textContent = '';
  $('sync-result').classList.remove('err');
  render();
  try {
    const result = await chrome.runtime.sendMessage({ type: 'WL_START_SYNC' });
    if (!result?.ok) throw new Error(result?.error || 'No response. Reload the YouTube tab and try again.');
    if (result.error) throw new Error(result.error);
    if (result.started === false) {
      running = true;
      $('sync-result').textContent = 'A sync is already running. Check Activity for progress.';
    } else if (result.needsSources) {
      showSettings(true);
      $('sync-result').textContent = 'Choose at least one playlist, then sync.';
    } else if (result.errors || result.aborted) {
      throw new Error(`Sync incomplete. ${result.added || 0} videos added. Check Activity for details.`);
    } else {
      $('sync-result').textContent = result.added ? `Added ${result.added} new video${result.added === 1 ? '' : 's'}.` : 'Watch Later is up to date.';
    }
  } catch (error) {
    $('sync-result').textContent = error.message;
    $('sync-result').classList.add('err');
    $('log-list').closest('details').open = true;
  } finally {
    requesting = false;
    $('progress').hidden = !running;
    render();
  }
});

chrome.runtime.onMessage.addListener(message => {
  if (message?.type !== 'WL_TICK') return;
  $('progress').hidden = false;
  $('fill').style.transform = `scaleX(${message.total ? message.current / message.total : 0})`;
  $('progress-text').textContent = `${message.current}/${message.total}  ${message.title}`;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[KEYS.log]) renderLog(changes[KEYS.log].newValue || []);
  if (changes[KEYS.lastSync]) $('last').textContent = relTime(changes[KEYS.lastSync].newValue);
  if (changes[KEYS.sources]) { sources = normalizeSources(changes[KEYS.sources].newValue); render(); }
  if (changes[KEYS.inProgress]) {
    running = Boolean(changes[KEYS.inProgress].newValue);
    $('progress').hidden = !running && !requesting;
    if (running) $('progress-text').textContent = 'Syncing…';
    render();
  }
});

// --- Export / import ------------------------------------------------------------------

$('export').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([exportSources(sources)], { type: 'application/json' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: 'watch-later-sync-sources.json' });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('io-note').textContent = `Exported ${sources.length} playlist${sources.length === 1 ? '' : 's'}.`;
});

$('import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  const result = parseImport(await file.text());
  if (!result.ok) { $('io-note').textContent = result.error; return; }
  const before = sources.length;
  await commit(mergeSources(sources, result.sources));
  $('io-note').textContent = `Imported ${sources.length - before} new, ${result.skipped} skipped.`;
});

// --- Load ---------------------------------------------------------------------------------

(async function init() {
  // Wake the worker before reading a possibly stale running flag left by a restart.
  try {
    const status = await chrome.runtime.sendMessage({ type: 'WL_STATUS' });
    if (!status?.ok) throw new Error(status?.error || 'Extension unavailable. Reload YouTube and try again.');
  } catch (error) { $('sync-result').textContent = error.message; $('sync-result').classList.add('err'); }
  const store = await chrome.storage.local.get([KEYS.sources, KEYS.library, KEYS.lastSync, KEYS.log, KEYS.inProgress]);
  sources = normalizeSources(store[KEYS.sources]);
  library = store[KEYS.library]?.playlists || [];
  running = Boolean(store[KEYS.inProgress]);
  showSettings(params.has('configure') || sources.length === 0);
  $('progress').hidden = !running;
  if (running) $('progress-text').textContent = 'Syncing… Check Activity for progress.';
  if (library.length) $('load-note').textContent = `${library.length} playlists (from ${new Date(store[KEYS.library].fetchedAt).toLocaleDateString()}).`;
  $('last').textContent = relTime(store[KEYS.lastSync]);
  renderLog(store[KEYS.log] || []);
  if (!embedded && !(await activeYouTubeTab())) $('toggle-note').textContent = 'Open a YouTube tab to use multiselect.';
  render();
})();
