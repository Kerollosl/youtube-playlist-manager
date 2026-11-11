(() => {
  'use strict';
  if (document.getElementById('yt-multiselect-tools')) return;
  // Every YouTube DOM selector lives here. They are third-party markup that
  // can change without notice: verify them on the live page before editing a
  // value. Each use site fails soft (does nothing) when a selector matches nothing.
  const SELECTORS = {
    app: 'ytd-app',
    rows: 'ytd-playlist-video-renderer,ytd-playlist-panel-video-renderer,ytd-video-renderer,ytd-rich-item-renderer,ytd-grid-video-renderer',
    playlistRow: 'ytd-playlist-video-renderer',
    browsePage: 'ytd-browse',
    pageChildren: 'ytd-page-manager > *',
    pageManager: 'ytd-page-manager',
    masthead: 'ytd-masthead',
    mastheadEnd: 'ytd-masthead #end',
    mastheadButtons: '#buttons',
    miniGuide: 'ytd-mini-guide-renderer',
    miniGuideItems: 'ytd-mini-guide-renderer #items',
    chrome: 'ytd-mini-guide-renderer,ytd-masthead',
    guideLinks: 'ytd-guide-renderer a[href],ytd-mini-guide-renderer a[href]:not(.yt-multiselect-sidebar-link)',
    miniGuideEntry: 'ytd-mini-guide-entry-renderer',
    duration: 'ytd-thumbnail-overlay-time-status-renderer #text, ytd-thumbnail-overlay-time-status-renderer span',
    titleLink: 'a#video-title,a#video-title-link',
    videoLink: 'a[href*="/watch?v="],a[href*="/shorts/"]',
    index: '#index',
    channel: '#channel-name,#byline-container'
  };
  const ROWS = SELECTORS.rows;
  const host = document.createElement('div');
  host.id = 'yt-multiselect-tools';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<div class="bar" role="toolbar" aria-label="Selected videos" aria-busy="false" hidden>
    <button class="icon" data-action="close" title="Close selection" aria-label="Close selection">${svg('close')}</button>
    <button class="icon" data-action="all" role="checkbox" aria-checked="false" title="Select all" aria-label="Select all">${svg('clear')}</button>
    <span class="selection-info" aria-live="polite"><span class="count">0 selected</span><span class="duration" hidden></span></span>
    <div class="toolbar-actions">
      <button class="text stop" data-action="stop" title="Stop after the current batch is verified" aria-label="Stop after current batch" hidden>Stop</button>
      <button class="text save primary" data-action="save" title="Save to playlist" aria-label="Save to playlist">${svg('save')}<span>Save</span></button>
      <button class="text copy" data-action="links" title="Copy selected video links as plain text" aria-label="Copy links">${svg('link')}<span>Copy links</span></button>
      <button class="icon" data-action="menu" title="More actions" aria-label="More actions" aria-haspopup="menu" aria-expanded="false">${svg('more')}</button>
    </div>
    <div class="progress" hidden aria-hidden="true"><span></span></div>
    <div class="menu" role="menu" aria-label="Selection actions" hidden></div>
    <div class="panel" hidden></div>
  </div><div class="toast" role="status" hidden></div><div class="backdrop" hidden></div>`;
  (document.querySelector(SELECTORS.app) || document.documentElement).append(host);
  // Styles are applied from the extension's own stylesheet text, so no
  // extension file has to be web-accessible to youtube.com pages.
  (async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'STYLES' });
      if (!response?.css) return;
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(response.css);
      root.adoptedStyleSheets = [sheet];
    } catch {}
  })();
  function syncTheme() {
    host.dataset.theme = document.documentElement.hasAttribute('dark') ? 'dark' : 'light';
    const frame = root.querySelector('.wl-frame');
    frame?.contentWindow?.postMessage({ type: 'WL_THEME', theme: host.dataset.theme }, panelOrigin());
  }
  function panelOrigin() { const url = new URL(chrome.runtime.getURL(''), location.href); return `${url.protocol}//${url.host}`; }
  syncTheme();
  new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['dark'] });
  const bar = root.querySelector('.bar'), menu = root.querySelector('.menu'), backdrop = root.querySelector('.backdrop'), panel = root.querySelector('.panel');
  let noRowsTimer = null; const noRowsNotified = new Set();
  const selected = new Map(), rowBoxes = new WeakMap(), wiredRows = new WeakSet(), dragAttributes = new WeakMap();
  let groupDrag = null, dropRow = null, scrollFrame = null, scrollSpeed = 0;
  let enabled = false, scope = navigationScope(), snapshot = null, toggleButton, timer, toastTimer, lastAnchor = null, working = false, readPending = false, needsReload = false, dialogFocus, noticeRevision = 0, introduced = false;
  let operationStatus = { activeJob: null, queue: null, history: [], busy: false };
  let watchLaterControls, headerSyncButton, headerConfigButton, watchLaterBusy = false;

  function svg(name) {
    if (name === 'settings') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m19.4 13 .1-1-.1-1 2-1.6-2-3.4-2.4 1a8 8 0 0 0-1.7-1L15 3h-4l-.4 3a8 8 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6-.1 1 .1 1-2 1.6 2 3.4 2.4-1a8 8 0 0 0 1.7 1l.4 3h4l.4-3a8 8 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"/></svg>';
    if (name === 'playlists') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h14v2H3V4Zm0 5h14v2H3V9Zm0 5h8v2H3v-2Zm0 5h8v2H3v-2Zm12-6 7 4-7 4v-8Z"></path></svg>';
    if (name === 'watchLater') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm-1 3v6l5 3 1-1.7-4-2.3V7h-2Z"></path></svg>';
    if (name === 'history') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 1-9.8 12h2.1A8 8 0 1 0 6.3 6.3L9 9H2V2l2.9 2.9A10 10 0 0 1 12 2Zm-1 5h2v5.4l4 2.3-1 1.7-5-2.9V7Z"></path></svg>';
    if (name === 'more') return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="12" cy="19" r="2"></circle></svg>';
    const paths = { history: 'M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z', sync: 'M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z', summary: "M12 2 15 9l7 3-7 3-3 7-3-7-7-3 7-3 3-7Z", mixed: 'M3 3h18v18H3V3Zm2 2v14h14V5H5Zm2 6h10v2H7v-2Z', close: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4Z', all: 'M3 3h18v18H3V3Zm2 2v14h14V5H5Zm2 6 3 3 7-7 1.4 1.4L10 16.8 5.6 12.4 7 11Z', clear: 'M3 3h18v18H3V3Zm2 2v14h14V5H5Z', link: 'M10 7H7a5 5 0 0 0 0 10h3v-2H7a3 3 0 0 1 0-6h3V7Zm4 0v2h3a3 3 0 0 1 0 6h-3v2h3a5 5 0 0 0 0-10h-3Zm-6 4h8v2H8v-2Z', copy: 'M8 7V3h13v13h-4v5H3V7h5Zm2 0h7v7h2V5h-9v2Zm5 2H5v10h10V9Z', cut: 'M9.64 7.64a3.5 3.5 0 1 0-1.41 1.41L11.17 12l-2.94 2.95a3.5 3.5 0 1 0 1.41 1.41L12.59 13.4 18 18.81V16l-4-4 4-4V5.19l-5.41 5.41-2.95-2.96ZM6.5 8A1.5 1.5 0 1 1 6.5 5a1.5 1.5 0 0 1 0 3Zm0 11a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z', save: 'M3 5h12v2H3V5Zm0 6h12v2H3v-2Zm0 6h8v2H3v-2Zm16-4v4h4v2h-4v4h-2v-4h-4v-2h4v-4h2Z', recovery: 'M12 4a8 8 0 1 1-7.75 10H6.4A6 6 0 1 0 8 8l2 2H3V3l2.1 2.1A8 8 0 0 1 12 2v2Zm-1 3h2v5.2l3.2 1.9-1 1.7-4.2-2.5V7Z', trash: 'M8 3h8l1 2h4v2H3V5h4l1-2Zm-2 6h12l-1 12H7L6 9Zm3 2 .5 8h2L11 11H9Zm4 0-.5 8h2l.5-8h-2Z', toggle: 'M3 4h4v4H3V4Zm7 0h11v2H10V4ZM3 10h4v4H3v-4Zm7 0h11v2H10v-2ZM3 16h4v4H3v-4Zm7 0h11v2H10v-2Z' };
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]}"></path></svg>`;
  }
  function element(tag, text, className) { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; }
  function button(text, action, className = 'text') { const node = element('button', text, className); node.type = 'button'; node.addEventListener('click', () => Promise.resolve().then(action).catch(report)); return node; }
  function playlistId() { return new URL(location.href).searchParams.get('list'); }
  function navigationScope() { const url = new URL(location.href); return url.searchParams.get('list') ? `playlist:${url.searchParams.get('list')}` : `${url.pathname}?${url.searchParams.toString()}`; }
  function validVideo(item) { return /^[A-Za-z0-9_-]{11}$/.test(item?.videoId || ''); }
  function rowDuration(row) {
    const text = row.querySelector(SELECTORS.duration)?.textContent.trim();
    if (!/^\d+(?::[0-5]\d){1,2}$/.test(text || '')) return null;
    return text.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  }
  function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), remainder = seconds % 60;
    return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${minutes}:${String(remainder).padStart(2, '0')}`;
  }
  function links(items = [...selected.values()]) { return items.filter(validVideo).map(item => `https://www.youtube.com/watch?v=${item.videoId}`).join('\n'); }
  function notice(text, actionText, action, persistent = false, tone = 'status') {
    noticeRevision++;
    const toast = root.querySelector('.toast'); toast.replaceChildren(element('span', text, 'toast-message'));
    if (actionText) toast.append(button(actionText, action));
    if (text) { const close = button('', () => notice(''), 'icon'); close.innerHTML = svg('close'); close.setAttribute('aria-label', 'Dismiss notice'); toast.append(close); }
    toast.hidden = !text; toast.dataset.tone = tone; toast.setAttribute('role', tone === 'error' ? 'alert' : 'status'); clearTimeout(toastTimer);
    if (!persistent) toastTimer = setTimeout(() => { toast.hidden = true; }, 6500);
  }
  function messageDialog(title, text) { const body = dialog(title); body.append(element('p', text, 'error-copy')); if (/saved operation before starting another/i.test(text)) body.append(button('Review saved operation', recoveryDialog)); else if (playlistId()) body.append(button('Check playlist reader', readerDialog)); footer(body); }
  function announce(text) { const full = String(text || ''); notice(full.length > 140 ? `${full.slice(0, 110).trim()}…` : full, full.length > 140 ? 'Details' : null, () => messageDialog('Operation details', full)); }
  function refreshNotice(text) { notice(text, 'Refresh', () => location.reload(), true); }
  function report(error) { closePanel(); if (/saved operation before starting another/i.test(error?.message || '')) { notice('A stopped operation needs review.', 'Review', recoveryDialog, true, 'error'); return; } if (error?.refreshPage) { refreshNotice(error.message); return; } const full = error?.message || String(error); notice('Couldn’t complete this step.', 'Details', () => messageDialog('Couldn’t complete this step', full), true, 'error'); }
  async function send(type, values = {}) {
    const disconnected = () => Object.assign(new Error('Extension updated. Refresh YouTube to reconnect.'), { refreshPage: true });
    if (typeof chrome === 'undefined' || typeof chrome.runtime?.sendMessage !== 'function') throw disconnected();
    let result;
    try { result = await chrome.runtime.sendMessage({ type, ...values }); }
    catch (error) { if (/extension context invalidated/i.test(error.message || '')) throw disconnected(); throw error; }
    if (!result?.ok) throw Object.assign(new Error(result?.error || 'Could not reach playlist tools. Reload YouTube and try again.'), { jobId: result?.jobId });
    return result;
  }
  let byIndex = new Map(), byVideo = new Map(), byOccurrence = new Map();
  function setSnapshot(value) {
    snapshot = value; byIndex.clear(); byVideo.clear(); byOccurrence.clear();
    for (const item of value?.items || []) {
      byIndex.set(item.index, item); byOccurrence.set(item.setVideoId, item);
      byVideo.set(item.videoId, byVideo.has(item.videoId) ? null : item);
    }
  }
  function canonical(item) { return { ...item, key: item.setVideoId ? `entry:${item.setVideoId}` : item.key }; }
  function info(row) {
    const anchor = row.querySelector(SELECTORS.titleLink) || row.querySelector(SELECTORS.videoLink);
    if (!anchor) return null;
    let url; try { url = new URL(anchor.href, location.origin); } catch { return null; }
    const videoId = url.searchParams.get('v') || url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})/)?.[1];
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId || '')) return null;
    const indexText = url.searchParams.get('index') || row.querySelector(SELECTORS.index)?.textContent.trim();
    const index = /^[0-9]+$/.test(indexText || '') ? Number(indexText) - 1 : null;
    let exact = null;
    if (snapshot?.complete && snapshot.playlistId === playlistId()) {
      if (index !== null) { const atIndex = byIndex.get(index); if (atIndex?.videoId === videoId) exact = atIndex; }
      else { exact = byVideo.get(videoId); }
    }
    if (exact?.setVideoId) return canonical({ ...exact, durationSeconds: exact.durationSeconds ?? rowDuration(row) });
    const list = playlistId();
    return { key: list && index !== null ? `row:${list}:${videoId}:${index}` : `row:${scope}:${videoId}`, videoId, index, title: anchor.getAttribute('title') || anchor.textContent.trim() || videoId, channel: row.querySelector(SELECTORS.channel)?.textContent.trim() || '', durationSeconds: rowDuration(row), playlistId: list };
  }
  function loadedRows() {
    const visible = node => node.getClientRects().length > 0 && !node.closest('[hidden],[aria-hidden="true"]');
    const playlistPage = location.pathname === '/playlist';
    const pages = [...document.querySelectorAll(playlistPage ? SELECTORS.browsePage : SELECTORS.pageChildren)].filter(visible);
    const page = pages[pages.length - 1] || document;
    const selector = playlistPage ? SELECTORS.playlistRow : ROWS;
    return [...page.querySelectorAll(selector)].filter(row => visible(row) && !row.parentElement?.closest(ROWS)).map(row => ({ row, item: info(row) })).filter(entry => entry.item);
  }
  function reconcileSnapshot() {
    if (!snapshot?.complete) return;
    const migrated = new Map();
    for (const item of selected.values()) {
      const match = item.setVideoId ? byOccurrence.get(item.setVideoId) : item.index != null ? byIndex.get(item.index) : byVideo.get(item.videoId);
      const next = match?.videoId === item.videoId ? canonical(match) : item;
      if (lastAnchor === item.key) lastAnchor = next.key;
      migrated.set(next.key, next);
    }
    selected.clear(); for (const [key, item] of migrated) selected.set(key, item);
  }
  function exactSelection() {
    if (needsReload || !selected.size || !snapshot?.complete) return false;
    return [...selected.values()].every(item => item.setVideoId && byOccurrence.get(item.setVideoId)?.videoId === item.videoId);
  }
  function canReorder(entries) { return exactSelection() && snapshot.editable && snapshot.canReorder && (entries || loadedRows()).some(entry => entry.row.matches(SELECTORS.playlistRow)); }
  function selectionArgs() {
    if (!exactSelection()) throw new Error('Wait for the playlist to load, then select its videos again. Copy links works now.');
    return { playlistId: snapshot.playlistId, keys: [...selected.values()].map(item => item.setVideoId), expectedFingerprint: snapshot.fingerprint };
  }
  function update(entries) {
    toggleButton?.setAttribute('aria-pressed', String(enabled));
    if (toggleButton) { toggleButton.title = enabled ? 'Exit video selection' : 'Select videos'; toggleButton.setAttribute('aria-label', toggleButton.title); }
    // Hidden selection UI needs no video enumeration or toolbar rendering.
    if (!enabled) return;
    const count = snapshot?.complete && snapshot.playlistId === playlistId() ? snapshot.items.length : (entries || loadedRows()).length;
    const label = root.querySelector('.count');
    const queued = operationStatus.queue?.items?.length || 0, active = operationStatus.activeJob;
    if (!selected.size && active) label.replaceChildren(document.createTextNode(active.phase === 'ready_to_remove' ? 'Move ready' : 'Operation saved'));
    else if (!selected.size && queued) label.replaceChildren(document.createTextNode(`${queued}`), element('small', ` ready to ${operationStatus.queue.kind === 'move' ? 'move' : 'copy'}`));
    else label.replaceChildren(document.createTextNode(`${selected.size}`), element('small', ` / ${count}`), document.createTextNode(' selected'));
    label.title = active ? 'A saved operation needs attention' : queued && !selected.size ? `${queued} videos ready to ${operationStatus.queue.kind}` : `${selected.size} of ${count} ${snapshot?.complete ? 'playlist' : 'loaded'} videos selected`;
    const duration = root.querySelector('.duration'), durations = [...selected.values()].map(item => item.durationSeconds);
    const known = durations.filter(value => Number.isFinite(value) && value >= 0);
    const missing = durations.length - known.length;
    duration.hidden = !selected.size;
    duration.textContent = known.length ? `${formatDuration(known.reduce((sum, value) => sum + value, 0))}${missing ? ' + unknown' : ''}` : 'Duration unknown';
    duration.title = missing ? `${missing} selected ${missing === 1 ? 'video has' : 'videos have'} no available duration` : 'Total duration of selected videos';
    bar.setAttribute('aria-busy', String(working || operationStatus.busy));
    root.querySelector('[data-action="menu"]').classList.toggle('has-status', Boolean(active || queued));
    root.querySelector('[data-action="links"]').disabled = !selected.size || working;
    root.querySelector('[data-action="all"]').disabled = working || !count;
    const all = root.querySelector('[data-action="all"]');
    const checked = selected.size > 0 && selected.size === count;
    all.setAttribute('aria-checked', checked ? 'true' : selected.size ? 'mixed' : 'false');
    all.setAttribute('aria-label', checked ? 'Deselect all' : 'Select all'); all.title = all.getAttribute('aria-label');
    all.innerHTML = svg(checked ? 'all' : selected.size ? 'mixed' : 'clear');
    root.querySelector('[data-action="save"]').disabled = working || (!selected.size && !queued && !active);
    const progress = root.querySelector('.progress'); progress.hidden = !(working || operationStatus.busy);
    const removing = active?.phase === 'removing', reordering = ['sorting', 'reordering'].includes(active?.phase);
    const done = removing ? active.removed?.length || 0 : reordering ? active.reordered?.length || 0 : active?.copied?.length || 0;
    const total = reordering ? active.plannedMoves : active?.itemCount ?? active?.items?.length;
    progress.dataset.indeterminate = String(!total);
    progress.style.setProperty('--progress', String(total ? Math.min(1, done / total) : 0));
    if (working && active) label.textContent = `${removing ? 'Removing' : reordering ? 'Ordering' : 'Saving'} ${done}${total ? ` / ${total}` : '…'}`;
    const stop = root.querySelector('[data-action=stop]');
    stop.hidden = !working || !active?.id || !['copying', 'removing', 'sorting', 'reordering'].includes(active.phase);
    stop.disabled = Boolean(active?.stopRequested); stop.textContent = active?.stopRequested ? 'Stopping…' : 'Stop';
    if (!stop.hidden && active?.stopRequested) label.textContent = 'Finishing current batch…';
    if (!menu.hidden) buildMenu(entries);
  }
  let statusRequest = null, statusRevision = 0;
  async function refreshStatus() {
    if (statusRequest) return statusRequest;
    const revision = statusRevision;
    statusRequest = (async () => { try { const status = await send('STATUS'); if (revision === statusRevision) { operationStatus = status; update(); } } catch {} finally { statusRequest = null; } })();
    return statusRequest;
  }
  async function maybeIntroduce() {
    if (introduced) return;
    introduced = true;
    try {
      if (chrome.storage?.local?.get) {
        const stored = await chrome.storage.local.get('selectionHintSeen');
        if (stored.selectionHintSeen) return;
        await chrome.storage.local.set({ selectionHintSeen: true });
      }
    } catch {}
    notice('Click videos to select. Shift-click selects a range.', 'Got it', () => notice(''));
  }
  function mountToggle() {
    const end = document.querySelector(SELECTORS.mastheadEnd);
    if (!end) return;
    if (!toggleButton?.isConnected) {
      toggleButton = element('button'); toggleButton.id = 'yt-multiselect-toggle'; toggleButton.type = 'button';
      toggleButton.title = 'Select videos'; toggleButton.setAttribute('aria-label', 'Select videos'); toggleButton.innerHTML = svg('toggle');
      toggleButton.setAttribute('aria-pressed', String(enabled)); toggleButton.addEventListener('click', () => toggle(!enabled));
      end.insertBefore(toggleButton, end.querySelector(SELECTORS.mastheadButtons) || end.firstChild);
    }
    if (!watchLaterControls) {
      watchLaterControls = element('div'); watchLaterControls.id = 'yt-watch-later-controls';
      watchLaterControls.setAttribute('role', 'group'); watchLaterControls.setAttribute('aria-label', 'Watch Later sync');
      headerSyncButton = button('', quickWatchLaterSync, 'yt-watch-later-sync');
      headerSyncButton.id = 'yt-watch-later-sync';
      headerSyncButton.innerHTML = `${svg('sync')}<span>Sync</span>`;
      headerSyncButton.title = 'Sync chosen playlists to Watch Later';
      headerSyncButton.setAttribute('aria-label', 'Sync Watch Later now');
      headerConfigButton = button('', watchLaterDialog, 'yt-watch-later-config');
      headerConfigButton.id = 'yt-watch-later-config'; headerConfigButton.innerHTML = svg('settings');
      headerConfigButton.title = 'Configure Watch Later sync'; headerConfigButton.setAttribute('aria-label', 'Configure Watch Later sync');
      headerConfigButton.setAttribute('aria-haspopup', 'dialog'); headerConfigButton.setAttribute('aria-expanded', 'false');
      // These are independent actions, not a shared click target in YouTube's header.
      for (const control of [headerSyncButton, headerConfigButton]) control.addEventListener('click', event => event.stopPropagation());
      watchLaterControls.append(headerSyncButton, headerConfigButton);
    }
    if (watchLaterControls.nextElementSibling !== toggleButton) end.insertBefore(watchLaterControls, toggleButton);
    updateWatchLaterControls();
  }
  function updateWatchLaterControls() {
    if (!headerSyncButton) return;
    const busy = quickSyncPending || watchLaterBusy;
    headerSyncButton.disabled = busy;
    headerSyncButton.setAttribute('aria-label', busy ? 'Syncing Watch Later' : 'Sync Watch Later now');
    watchLaterControls.setAttribute('aria-busy', String(busy));
    const label = headerSyncButton.querySelector('span'), text = busy ? 'Syncing…' : 'Sync';
    if (label.textContent !== text) label.textContent = text;
  }
  const sidebarShortcuts = [
    { key: 'history', label: 'History', href: '/feed/history' },
    { key: 'playlists', label: 'Playlists', href: '/feed/playlists' },
    { key: 'watchLater', label: 'Watch Later', href: '/playlist?list=WL' }
  ];
  function matchesSidebarTarget(href, shortcut) {
    try {
      const url = new URL(href, location.origin);
      return url.origin === location.origin && (shortcut.key === 'watchLater' ? url.pathname === '/playlist' && url.searchParams.get('list') === 'WL' : url.pathname === shortcut.href);
    } catch { return false; }
  }
  function mountSidebarShortcuts() {
    // The expanded guide already supplies these links. Only extend the compact rail.
    for (const items of document.querySelectorAll(SELECTORS.miniGuideItems)) {
      const nativeLinks = [...items.querySelectorAll('a[href]:not(.yt-multiselect-sidebar-link)')];
      const you = nativeLinks.find(anchor => new URL(anchor.href, location.origin).pathname === '/feed/you')?.closest(SELECTORS.miniGuideEntry);
      let before = you;
      // Insert in reverse so existing shortcuts stay in place during ordinary scans.
      for (const shortcut of you ? [...sidebarShortcuts].reverse() : sidebarShortcuts) {
        let link = items.querySelector(`[data-yt-multiselect-shortcut="${shortcut.key}"]`);
        const native = nativeLinks.some(anchor => matchesSidebarTarget(anchor.href, shortcut));
        if (native) { link?.remove(); continue; }
        if (!link) {
          link = element('a', '', 'yt-multiselect-sidebar-link');
          link.dataset.ytMultiselectShortcut = shortcut.key;
          link.href = shortcut.href;
          link.title = shortcut.label;
          link.setAttribute('aria-label', shortcut.label);
          link.innerHTML = svg(shortcut.key);
          link.append(element('span', shortcut.label));
          link.addEventListener('click', event => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const native = [...document.querySelectorAll(SELECTORS.guideLinks)].find(anchor => matchesSidebarTarget(anchor.href, shortcut));
            // Reuse YouTube's router when its native entry is mounted. Normal links
            // remain the fallback, including open-in-new-tab and modified clicks.
            if (native) { event.preventDefault(); native.click(); }
          });
        }
        if (you) {
          if (link.nextElementSibling !== before) items.insertBefore(link, before);
          before = link;
        } else if (!link.isConnected) items.append(link);
        if (matchesSidebarTarget(location.href, shortcut)) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
    }
  }
  function scan() {
    if (!observing?.length) observeTargets();
    if (!host.isConnected) (document.querySelector(SELECTORS.app) || document.documentElement).append(host);
    mountToggle();
    mountSidebarShortcuts();
    if (scope !== navigationScope()) { clearDrag(); scope = navigationScope(); closePanel(); showMenu(false); notice(''); selected.clear(); setSnapshot(null); lastAnchor = null; needsReload = false; if (enabled) readPlaylist(); }
    if (!enabled) {
      for (const row of document.querySelectorAll('.yt-multiselect-row')) releaseRow(row);
      update(); return;
    }
    const entries = loadedRows(), currentRows = new Set(entries.map(entry => entry.row)), reorderable = canReorder(entries);
    // Fail soft if YouTube's markup changed: say so once instead of silently doing nothing.
    clearTimeout(noRowsTimer);
    if (!entries.length) noRowsTimer = setTimeout(() => { if (enabled && !loadedRows().length && !noRowsNotified.has(scope)) { noRowsNotified.add(scope); notice('No videos found on this page. If YouTube recently changed its layout, selection may not work here yet.'); } }, 5000);
    for (const row of document.querySelectorAll('.yt-multiselect-row')) if (!currentRows.has(row)) releaseRow(row);
    for (const { row, item } of entries) {
      let checkbox = rowBoxes.get(row);
      if (!checkbox?.isConnected) {
        checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'yt-multiselect-checkbox'; row.classList.add('yt-multiselect-row'); row.append(checkbox); rowBoxes.set(row, checkbox);
        checkbox.addEventListener('keydown', event => { if (enabled && event.key === ' ') event.stopPropagation(); });
      }
      if (!wiredRows.has(row)) {
        wiredRows.add(row);
        row.addEventListener('click', event => {
          if (!enabled) return;
          if (event.target !== rowBoxes.get(row)) event.preventDefault();
          event.stopImmediatePropagation();
          const current = info(row); if (!current || working) return; closePanel(); showMenu(false);
          const choose = !selected.has(current.key), entries = loadedRows();
          const from = entries.findIndex(entry => entry.item.key === lastAnchor), to = entries.findIndex(entry => entry.row === row);
          const range = event.shiftKey && from >= 0 ? entries.slice(Math.min(from, to), Math.max(from, to) + 1) : [{ item: current }];
          for (const entry of range) { if (choose) selected.set(entry.item.key, entry.item); else selected.delete(entry.item.key); }
          lastAnchor = current.key; syncRows();
        }, true);
        row.addEventListener('contextmenu', event => {
          if (!enabled || !selected.size || !selected.has(info(row)?.key)) return;
          event.preventDefault(); showMenu(true);
        });
      }
      checkbox.setAttribute('aria-label', `Select ${item.title}`); checkbox.hidden = !enabled; checkbox.disabled = working;
      checkbox.checked = selected.has(item.key); row.classList.toggle('yt-multiselect-enabled', enabled); row.classList.toggle('yt-multiselect-chosen', enabled && checkbox.checked);
      if (!working && reorderable && checkbox.checked) {
        if (!dragAttributes.has(row)) dragAttributes.set(row, row.getAttribute('draggable'));
        row.setAttribute('draggable', 'true');
      } else restoreDraggable(row);
      if (checkbox.checked) selected.set(item.key, item);
    }
    update(entries);
  }
  function restoreDraggable(row) {
    if (!dragAttributes.has(row)) return;
    const original = dragAttributes.get(row);
    if (original === null) row.removeAttribute('draggable'); else row.setAttribute('draggable', original);
    dragAttributes.delete(row);
  }
  function releaseRow(row) {
    restoreDraggable(row);
    row.classList.remove('yt-multiselect-row', 'yt-multiselect-enabled', 'yt-multiselect-chosen', 'yt-multiselect-drop-before', 'yt-multiselect-drop-after');
    rowBoxes.get(row)?.remove(); rowBoxes.delete(row);
  }
  function syncRows() { scan(); }
  async function readPlaylist() {
    const id = playlistId(), capturedScope = scope, revision = noticeRevision;
    if (needsReload) { refreshNotice('Refresh YouTube to update this playlist before another change.'); return; }
    if (!id || readPending) return;
    readPending = true;
    try { const result = await send('READ', { playlistId: id, pickerVideoId: loadedRows().map(entry => entry.item).find(validVideo)?.videoId }); if (!enabled || navigationScope() !== capturedScope) return; setSnapshot(result); reconcileSnapshot(); scan(); if (!result.complete && revision === noticeRevision && !working) notice('Playlist editing is unavailable.', 'Details', () => messageDialog('Playlist editing is unavailable', (result.warnings || []).join('\n') || 'The complete playlist could not be verified. Copy links remains available.'), true); }
    catch (error) { if (enabled && navigationScope() === capturedScope && revision === noticeRevision && !working) report(error); }
    finally { readPending = false; if (enabled && scope !== capturedScope && playlistId()) readPlaylist(); }
  }
  function toggle(value) { enabled = value; bar.hidden = !value; if (!value) { selected.clear(); lastAnchor = null; clearDrag(); showMenu(false); closeDialog(); closePanel(); notice(''); setSnapshot(null); } scan(); if (value) { maybeIntroduce(); refreshStatus(); if (!snapshot) readPlaylist(); } }
  function selectAll() { const items = snapshot?.complete ? snapshot.items.filter(validVideo).map(canonical) : loadedRows().map(entry => entry.item); for (const item of items) selected.set(item.key, item); syncRows(); }
  function deselect() { selected.clear(); lastAnchor = null; syncRows(); }
  function menuButtons() { return [...menu.querySelectorAll('button:not(:disabled)')].filter(node => node.getClientRects().length); }
  function showMenu(value, focus = true) {
    const trigger = root.querySelector('[data-action="menu"]'); host.toggleAttribute('data-menu-open', value); menu.hidden = !value; trigger.setAttribute('aria-expanded', String(value));
    if (value) { closePanel(); buildMenu(); refreshStatus(); if (focus) menuButtons()[0]?.focus(); }
  }
  let menuSignature = '';
  function buildMenu(entries = loadedRows()) {
    const exact = exactSelection(), reorderable = canReorder(entries);
    const queued = operationStatus.queue?.items?.length || 0, active = operationStatus.activeJob;
    const signature = JSON.stringify([selected.size, exact, reorderable, entries.length, needsReload, working, snapshot?.complete, snapshot?.editable, snapshot?.canReorder, snapshot?.items.length, queued, active?.id, active?.phase, operationStatus.historyCount ?? operationStatus.history?.length ?? 0]);
    // YouTube rerenders often. Keep menu buttons stable while a click is in progress.
    if (signature === menuSignature && menu.children.length) return;
    menuSignature = signature;
    const focusedText = menu.contains(root.activeElement) ? root.activeElement?.textContent : null;
    menu.replaceChildren();
    if (!selected.size) menu.append(element('p', queued ? `${queued} saved videos ready. Select videos to use selection actions.` : 'Click videos to select them, then choose an action.', 'menu-hint'));
    const group = text => menu.append(element('span', text, 'menu-label'));
    const divide = () => menu.append(element('hr'));
    const add = (icon, text, description, handler, disabled = false, danger = false) => {
      const node = button('', () => { showMenu(false); return handler(); }); node.setAttribute('role', 'menuitem'); node.disabled = disabled || working;
      node.title = description; node.setAttribute('aria-label', `${text}. ${description}`);
      const copy = element('span', '', 'menu-copy'); copy.append(element('strong', text)); node.append(document.createRange().createContextualFragment(svg(icon)), copy);
      if (danger) node.classList.add('danger'); menu.append(node);
    };
    group('Summarize');
    add('summary', 'YT Summary', 'Copy /YT and selected links for Gemini · ⌥Space, then paste', ytSummary, !selected.size);
    divide(); group('Organize');
    add('copy', 'Copy selection', 'Keep a reusable copy for another playlist', () => queueSelection('copy'), !selected.size);
    const editReason = !selected.size ? 'Select videos first' : needsReload ? 'Refresh YouTube before editing again' : !exact ? 'Wait for the complete playlist to load' : !snapshot?.editable ? 'This playlist is not editable' : null;
    add('cut', 'Cut selection', editReason || 'Move only after destination copies are verified', cutDialog, Boolean(editReason));
    add('toggle', 'Move in this playlist…', editReason || (!reorderable ? 'Open a playlist that supports reordering' : 'Move the selection to the top, bottom, or a custom position'), reorderDialog, !reorderable);
    add('all', selected.size ? 'Sort selected videos…' : 'Sort playlist…', selected.size ? `Order only the ${selected.size} selected videos` : 'Order the entire playlist by title, channel, or duration', sortDialog, needsReload || !snapshot?.complete || !snapshot?.editable || !snapshot?.canReorder || !snapshot?.items.length || Boolean(selected.size && !exact));
    divide();
    add('trash', 'Delete from playlist…', editReason || 'Review titles before permanent removal', deleteSelected, Boolean(editReason), true);
    if (focusedText) menuButtons().find(node => node.textContent === focusedText)?.focus();
  }
  // One click: run a Watch Later sync with the saved playlists and report the result in the status toast.
  let quickSyncPending = false;
  async function quickWatchLaterSync() {
    if (quickSyncPending) { announce('A Watch Later sync is already running.'); return; }
    quickSyncPending = true;
    updateWatchLaterControls();
    try {
      announce('Syncing Watch Later…');
      const result = await chrome.runtime.sendMessage({ type: 'WL_QUICK_SYNC' });
      if (!result?.ok) throw new Error(result?.error || 'Watch Later sync failed.');
      if (result.needsSources) announce('No playlists selected. Use the settings side to choose playlists, then press Sync.');
      else if (result.started === false) announce('A Watch Later sync is already running.');
      else if (result.error) announce(`Watch Later sync stopped: ${result.error}`);
      else if (result.aborted) announce('Watch Later sync stopped early. Open sync settings for details.');
      else {
        const added = result.added || 0, failed = Array.isArray(result.errors) ? result.errors.length : Number(result.errors) || 0;
        announce(added ? `Added ${added} new ${added === 1 ? 'video' : 'videos'} to Watch Later${failed ? ` (${failed} failed)` : ''}.` : failed ? `Nothing added; ${failed} failed. See the sync log.` : 'Watch Later is up to date. Nothing new to add.');
      }
    } finally { quickSyncPending = false; updateWatchLaterControls(); }
  }
  // The sync panel (the extension's popup page) as a mini window inside YouTube, not a separate browser window.
  function watchLaterDialog() {
    const body = dialog('Watch Later Sync'); body.classList.add('wl-dialog');
    headerConfigButton?.setAttribute('aria-expanded', 'true');
    const frame = document.createElement('iframe');
    frame.className = 'wl-frame'; frame.title = 'Watch Later Sync';
    frame.src = `${chrome.runtime.getURL('src/popup.html?embed=1&configure=1')}&theme=${host.dataset.theme}`;
    body.append(frame);
  }
  window.addEventListener('message', event => {
    const frame = backdrop.querySelector('.wl-frame');
    if (!frame || event.source !== frame.contentWindow || event.origin !== panelOrigin()) return;
    if (event.data?.type === 'WL_CLOSE_PANEL') closeDialog();
    if (event.data?.type === 'WL_PANEL_FOCUS_CLOSE') backdrop.querySelector('.dialog-header button')?.focus();
  });
  async function copyLinks(items = [...selected.values()]) {
    const text = links(items); if (!text) return;
    try { await navigator.clipboard.writeText(text); deselect(); announce(`${items.length} links copied. Paste into NotebookLM.`); }
    catch { const body = dialog('Selected video links'); body.append(element('p', 'Copy these links, one per line.')); const area = element('textarea'); area.value = text; area.readOnly = true; area.setAttribute('aria-label', 'Selected video links'); body.append(area); footer(body); area.focus(); area.select(); }
  }
  async function ytSummary() {
    const urls = links(); if (!urls) return;
    const text = `/YT\n${urls}`;
    const instructions = 'Press ⌥Space to open Gemini, then paste. If YT is not activated, choose it from Gemini’s / skill menu before sending.';
    try {
      await navigator.clipboard.writeText(text);
      deselect();
      notice('YT prompt copied. Press ⌥Space to open Gemini, then paste.', 'Help', () => {
        const body = dialog('YT Summary'); body.append(element('p', instructions)); footer(body);
      }, true);
    } catch {
      const body = dialog('YT Summary');
      body.append(element('p', `Copy this prompt. ${instructions}`));
      const area = element('textarea'); area.value = text; area.readOnly = true; area.setAttribute('aria-label', 'YT Summary prompt');
      body.append(area); footer(body); area.focus(); area.select();
    }
  }
  function download(name, content, type = 'application/json') { const url = URL.createObjectURL(new Blob([content], { type })); const anchor = element('a'); anchor.href = url; anchor.download = name; root.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  async function readerDialog() {
    const probe = [...selected.values()].find(validVideo)?.videoId || loadedRows().map(entry => entry.item).find(validVideo)?.videoId;
    const body = dialog('Playlist reader details');
    body.append(element('p', 'Checks playlist contents without changing any videos.'));
    const label = element('label', 'Playlist'); label.htmlFor = 'yt-reader-playlist';
    const select = element('select'); select.id = label.htmlFor;
    const current = element('option', snapshot?.title || 'Current playlist'); current.value = playlistId(); select.append(current);
    const output = element('div'); body.append(label, select, output);
    const check = async () => {
      const id = select.value; if (!id) return;
      select.disabled = true;
      output.replaceChildren(element('p', 'Reading playlist…'));
      try {
        const result = await send('READ', { playlistId: id, pickerVideoId: probe }); if (!body.isConnected) return;
        if (enabled && id === playlistId() && !needsReload) { setSnapshot(result); reconcileSnapshot(); scan(); }
        output.replaceChildren(element('p', `${result.title}: ${result.complete ? `Complete · ${result.items.length} videos` : 'Incomplete'}. ${result.editable ? 'Editable.' : 'Editing unavailable.'}`));
        for (const warning of result.warnings || []) output.append(element('p', warning, 'error'));
        const details = element('textarea'); details.readOnly = true; details.setAttribute('aria-label', 'Reader diagnostics');
        details.value = JSON.stringify({ version: chrome.runtime.getManifest().version, complete: result.complete, editable: result.editable, items: result.items.length, pages: result.pages, warnings: result.warnings, structure: result.diagnostics }, null, 2); const disclosure = element('details', '', 'diagnostics'); disclosure.append(element('summary', 'Technical details'), details); output.append(disclosure);
      } catch (error) { output.replaceChildren(element('p', error.message, 'error')); }
      finally { select.disabled = false; }
    };
    select.addEventListener('change', check);
    const foot = footer(body); foot.prepend(button('Check again', check));
    await check();
    try {
      const picker = await send('PLAYLISTS', { videoId: probe }); if (!body.isConnected) return;
      for (const item of picker.playlists || []) {
        const id = item.id || item.playlistId; if (id === current.value) continue;
        const option = element('option', item.title); option.value = id; select.append(option);
      }
    } catch { /* Current playlist remains available if the picker is unavailable. */ }
  }
  function closeDialog() { if (backdrop.hidden) return; backdrop.hidden = true; backdrop.replaceChildren(); headerConfigButton?.setAttribute('aria-expanded', 'false'); dialogFocus?.focus?.(); }
  function dialog(title) {
    dialogFocus = root.activeElement || document.activeElement; if (menu.contains(dialogFocus)) dialogFocus = root.querySelector('[data-action="menu"]'); headerConfigButton?.setAttribute('aria-expanded', 'false'); showMenu(false); backdrop.replaceChildren(); backdrop.hidden = false;
    const body = element('section', '', 'dialog'); body.setAttribute('role', 'dialog'); body.setAttribute('aria-modal', 'true'); body.setAttribute('aria-label', title); body.tabIndex = -1; const header = element('div', '', 'dialog-header'), close = button('', closeDialog, 'icon'); close.innerHTML = svg('close'); close.setAttribute('aria-label', 'Close dialog'); header.append(element('h2', title), close); body.append(header); backdrop.append(body); body.focus(); return body;
  }
  function footer(body, text, handler, danger = false) {
    const foot = element('div', '', 'footer'); foot.append(button('Cancel', closeDialog));
    if (text) foot.append(button(text, async () => { const controls = [...body.querySelectorAll('button,input,select')]; controls.forEach(node => { node.disabled = true; }); try { await handler(); } catch (error) { if (!body.isConnected || backdrop.hidden) { report(error); return; } let message = body.querySelector('.error'); if (!message) { message = element('p', '', 'error'); body.insertBefore(message, foot); } message.textContent = error.message; } finally { controls.forEach(node => { node.disabled = false; }); } }, `text ${danger ? 'danger' : 'primary'}`));
    else foot.firstChild.textContent = 'Close'; body.append(foot); return foot;
  }
  function listVideos(body, items, limit = 6) { const list = element('ol', '', 'videos'); for (const item of items.slice(0, limit)) list.append(element('li', item.title || item.videoId)); body.append(list); if (items.length > limit) body.append(element('p', `And ${items.length - limit} more…`, 'note')); }
  async function queueSelection(kind) {
    if (!selected.size) throw new Error('Select videos first.');
    const result = exactSelection() ? await send('QUEUE', { ...selectionArgs(), kind }) : kind === 'copy' ? await send('QUEUE_LINKS', { items: [...selected.values()], kind }) : (() => { throw new Error('Open an editable playlist before cutting.'); })();
    operationStatus.queue = result.queue; deselect(); notice(`${result.queue.items.length} videos ready to ${kind === 'move' ? 'move' : 'copy to another playlist'}.`, 'Choose playlist', saveDialog, true); return result;
  }
  function cutDialog() { return queueSelection('move'); }
  function reorderArgs() {
    if (!canReorder()) throw new Error('Select videos in an editable playlist to change their order.');
    return { ...selectionArgs(), expectedOrder: snapshot.items.map(item => item.setVideoId) };
  }
  function reorderDialog() {
    const args = reorderArgs(), items = [...snapshot.items], capturedScope = scope;
    const body = compact('Move in this playlist');
    body.append(element('p', `${selected.size} selected videos will keep their playlist order.`));
    const place = values => {
      if (navigationScope() !== capturedScope) throw new Error('The playlist changed. Select videos again.');
      return operation('REORDER', { ...args, ...values });
    };
    const choices = element('div', '', 'choices');
    choices.append(button('Move to top', () => place({ position: 'top' })), button('Move to bottom', () => place({ position: 'bottom' })), button('Drag to position', () => { closePanel(); notice('Drag any selected video between videos to move the group.', 'Got it', () => notice(''), true); }));
    body.append(choices);
    const label = element('label', 'Or place before video number'), input = element('input');
    input.id = 'reorder-position'; input.type = 'number'; input.min = '1'; input.max = String(items.length + 1); input.placeholder = `1–${items.length + 1}`;
    label.htmlFor = input.id; body.append(label, input);
    compactActions(body, 'Move here', () => {
      const number = Number(input.value);
      if (!Number.isInteger(number) || number < 1 || number > items.length + 1) throw new Error(`Enter a video number from 1 to ${items.length + 1}.`);
      if (number === items.length + 1) return place({ position: 'bottom' });
      if (args.keys.includes(items[number - 1].setVideoId)) throw new Error('Choose an unselected video as the placement target.');
      return place({ position: 'before', beforeId: items[number - 1].setVideoId });
    });
  }
  function sortDialog() {
    if (needsReload || !snapshot?.complete || !snapshot.editable || !snapshot.canReorder) throw new Error('Wait for an editable playlist to load.');
    const capturedScope = scope, args = selected.size ? selectionArgs() : { playlistId: snapshot.playlistId, expectedFingerprint: snapshot.fingerprint, keys: snapshot.items.map(item => item.setVideoId) };
    args.expectedOrder = snapshot.items.map(item => item.setVideoId);
    const chosen = new Set(args.keys), first = snapshot.items.findIndex(item => chosen.has(item.setVideoId));
    const consecutive = snapshot.items.slice(first, first + chosen.size).every(item => chosen.has(item.setVideoId));
    const body = compact(selected.size ? `Sort ${chosen.size} selected ${chosen.size === 1 ? 'video' : 'videos'}` : 'Sort playlist');
    body.append(element('p', selected.size ? consecutive ? 'Only selected videos are sorted, within their current positions.' : 'Selected videos are sorted and moved to the top. Other videos keep their order.' : `Order all ${snapshot.items.length} videos. Duplicate entries are kept.`));
    const field = (id, text, values) => {
      const label = element('label', text), select = element('select'); label.htmlFor = id; select.id = id;
      for (const [value, title] of values) { const option = element('option', title); option.value = value; select.append(option); }
      body.append(label, select); return select;
    };
    const by = field('sort-by', 'Sort by', [['duration', 'Duration'], ['title', 'Title'], ['channel', 'Channel']]);
    const direction = field('sort-direction', 'Order', [['descending', 'Descending'], ['ascending', 'Ascending']]);
    compactActions(body, 'Sort', () => { if (navigationScope() !== capturedScope) throw new Error('The playlist changed. Review sorting again.'); return operation('SORT', { ...args, sortBy: by.value, descending: direction.value === 'descending' }); });
  }
  function clearDrop() {
    dropRow?.classList.remove('yt-multiselect-drop-before', 'yt-multiselect-drop-after');
    dropRow = null;
  }
  function clearDrag() {
    clearDrop(); groupDrag = null; scrollSpeed = 0;
    if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
    scrollFrame = null;
  }
  function dragScroll() {
    if (!groupDrag || !scrollSpeed) { scrollFrame = null; return; }
    window.scrollBy(0, scrollSpeed);
    scrollFrame = requestAnimationFrame(dragScroll);
  }
  function dragRow(event) { return event.target instanceof Element ? event.target.closest(SELECTORS.playlistRow) : null; }
  function dragTarget(event) {
    const row = dragRow(event), item = row && info(row);
    if (!item?.setVideoId || groupDrag.selectedIds.has(item.setVideoId)) return null;
    const rect = row.getBoundingClientRect(), after = event.clientY > rect.top + rect.height / 2;
    let target = item;
    if (after) target = snapshot.items.slice(snapshot.items.findIndex(entry => entry.setVideoId === item.setVideoId) + 1).find(entry => !groupDrag.selectedIds.has(entry.setVideoId));
    return { row, after, placement: target ? { position: 'before', beforeId: target.setVideoId } : { position: 'bottom' } };
  }
  function closePanel() { panel.hidden = true; panel.replaceChildren(); host.removeAttribute('data-panel-open'); }
  function compact(title) {
    closeDialog(); showMenu(false); notice(''); panel.replaceChildren(); panel.hidden = false; host.setAttribute('data-panel-open', '');
    panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', title); panel.tabIndex = -1;
    const header = element('div', '', 'dialog-header'), close = button('', () => { closePanel(); root.querySelector('[data-action="menu"]').focus(); }, 'icon');
    close.innerHTML = svg('close'); close.setAttribute('aria-label', 'Close panel'); header.append(element('h2', title), close); panel.append(header); panel.focus(); return panel;
  }
  function compactActions(body, label, handler, danger = false) {
    const foot = element('div', '', 'footer'); foot.append(button('Cancel', closePanel), button(label, handler, `text ${danger ? 'danger' : 'primary'}`)); body.append(foot); return foot;
  }
  function deleteSelected() {
    const args = selectionArgs(), capturedScope = scope, count = selected.size;
    const body = compact(`Delete ${count} ${count === 1 ? "video" : "videos"}?`);
    body.append(element('p', `Permanently remove from ${snapshot.title || 'this playlist'}. A playlist backup is saved first.`));
    listVideos(body, [...selected.values()]);
    compactActions(body, `Delete ${count}`, () => { if (navigationScope() !== capturedScope) throw new Error('The playlist changed. Select videos again.'); return operation('REMOVE', args); }, true);
  }
  async function stopOperation() {
    const id = operationStatus.activeJob?.id;
    if (!working || !id) return;
    await send('STOP', { jobId: id });
    if (operationStatus.activeJob?.id === id) operationStatus.activeJob.stopRequested = true;
    update();
  }
  async function syncView(job) {
    const capturedScope = scope, capturedUrl = location.href;
    const left = scrollX, top = scrollY;
    try {
      const result = await send('SYNC_VIEW', { jobId: job.id, playlistId: playlistId(), expectedFingerprint: job.fingerprint });
      if (!enabled || scope !== capturedScope || location.href !== capturedUrl) return false;
      if (!result.updated || !result.snapshot?.complete) throw new Error('Refresh needed');
      setSnapshot(result.snapshot); needsReload = false;
      for (const [key, item] of selected) if (!byOccurrence.has(item.setVideoId)) selected.delete(key);
      reconcileSnapshot(); scan();
      window.scrollTo({ left, top, behavior: 'instant' });
      return true;
    } catch {
      if (enabled && scope === capturedScope && location.href === capturedUrl) {
        needsReload = true; scan();
        refreshNotice('Changes are saved. Refresh to update this playlist’s display.');
      }
      return false;
    }
  }
  async function operation(type, args) {
    if (working) throw new Error('Wait for the current step to finish.');
    const operationScope = scope; working = true; closeDialog(); closePanel(); showMenu(false); syncRows(); announce('Working…');
    try {
      let result;
      try { result = await send(type, args); }
      catch (error) {
        if (!['TRANSFER', 'PASTE'].includes(type)) throw error;
        const { activeJob } = await send('STATUS');
        if (!error.jobId || activeJob?.id !== error.jobId || activeJob.targetId !== args.targetId || (args.playlistId && activeJob.sourceId !== args.playlistId)) throw error;
        try { result = await send('CHECK_OPERATION', { jobId: activeJob.id }); }
        catch { if (enabled && navigationScope() === operationScope) pendingReview(activeJob); return; }
      }
      if (!enabled || navigationScope() !== operationScope) return result;
      const job = result.job;
      if (!result.stopped) deselect();
      const affectsCurrent = (['REMOVE', 'FINISH_MOVE', 'REORDER', 'SORT'].includes(type) && job?.sourceId === playlistId()) || (['TRANSFER', 'PASTE'].includes(type) && args.targetId === playlistId());
      const updated = !affectsCurrent || await syncView(job);
      if (result.stopped) {
        if (updated) notice(`Stopped. ${job.removed?.length || job.reordered?.length || job.copied?.length || 0} changes verified.`, 'Review', recoveryDialog, true);
      } else if (job?.phase === 'ready_to_remove') moveReview(job);
      else if (updated) announce(type === 'REMOVE' ? 'Videos deleted from playlist.' : type === 'FINISH_MOVE' ? 'Videos moved.' : ['REORDER', 'SORT'].includes(type) ? 'Playlist order updated.' : 'Videos saved.');
      return result;
    } finally { working = false; refreshStatus(); syncRows(); }
  }
  async function performanceDialog() {
    const { entries } = await send('PERFORMANCE'), body = dialog('Performance');
    body.append(element('p', 'Recent timings on this device. Stage totals may overlap when reads run together.', 'note'));
    if (!entries?.length) body.append(element('p', 'Run a playlist action to see its timings here.'));
    const names = { load: 'Playlist loading', edit: 'YouTube edits', verification: 'Verification', verification_wait: 'Verification waiting', storage: 'Checkpoint storage', throttle: 'Request spacing', view: 'Page update' };
    for (const entry of entries || []) {
      const card = element('div', '', 'saved');
      card.append(element('strong', `${entry.kind} · ${(entry.elapsedMs / 1000).toFixed(2)} s`));
      card.append(element('small', `${new Date(entry.startedAt).toLocaleString()} · ${entry.phase}`));
      for (const [stage, metric] of Object.entries(entry.stages || {})) card.append(element('small', `${names[stage] || stage}: ${(metric.ms / 1000).toFixed(2)} s · ${metric.calls} ${metric.calls === 1 ? 'call' : 'calls'}`));
      body.append(card);
    }
    body.append(button('Download timings', () => download('youtube-operation-timings.json', JSON.stringify(entries || [], null, 2))));
    footer(body);
  }
  async function transferDialog(kind, savedQueue = null) {
    const selection = savedQueue ? [...savedQueue.items] : [...selected.values()]; if (!selection.length) return;
    const capturedScope = scope, sourceId = savedQueue ? savedQueue.sourceId : playlistId(), args = !savedQueue && exactSelection() ? selectionArgs() : null;
    const body = compact(`Save ${selection.length} ${selection.length === 1 ? "video" : "videos"} to…`), token = element('div'); body.append(token);
    const search = element('input'); search.placeholder = 'Find a playlist'; search.setAttribute('aria-label', 'Find a playlist');
    const choices = element('div', '', 'choices'); choices.append(element('p', 'Loading playlists…')); token.append(search, choices);
    const save = async value => {
      if (navigationScope() !== capturedScope || !token.isConnected) return;
      const targetId = targetPlaylist(value); if (!targetId || targetId === sourceId) throw new Error('Choose a different destination playlist.');
      if (savedQueue) return operation('PASTE', { targetId, expectedQueueId: savedQueue.id });
      if (args) return operation('TRANSFER', { ...args, kind, targetId, pickerVideoId: selection[0].videoId });
      const saved = await send('QUEUE_LINKS', { items: selection, kind: 'copy' });
      return operation('PASTE', { targetId, expectedQueueId: saved.queue.id });
    };
    const details = element('details'), input = element('input'); input.placeholder = 'Playlist URL'; input.setAttribute('aria-label', 'Playlist URL'); details.append(element('summary', 'Use a playlist link'), input, button('Save', () => save(input.value.trim()))); token.append(details); search.focus();
    try {
      const result = await send('PLAYLISTS', { videoId: selection[0].videoId }); if (!token.isConnected) return;
      const playlists = (result.playlists || []).filter(item => (item.id || item.playlistId) !== sourceId).sort((a,b) => a.title.localeCompare(b.title));
      const render = () => { choices.replaceChildren(); for (const item of playlists.filter(item => item.title.toLowerCase().includes(search.value.toLowerCase()))) choices.append(button(item.title, () => save(item.id || item.playlistId))); if (!choices.children.length) choices.append(element('p', 'No matching playlists.')); };
      search.addEventListener('input', render); render();
    } catch { if (token.isConnected) { choices.replaceChildren(element('p', 'Use a playlist link below.')); details.open = true; } }
  }
  async function saveDialog() {
    const capturedScope = scope, status = await send('STATUS'); if (navigationScope() !== capturedScope) return;
    if (status.activeJob) return pendingReview(status.activeJob);
    if (selected.size) return transferDialog('copy');
    if (!status.queue?.items.length) throw new Error('Select videos first.');
    return transferDialog(status.queue.kind, status.queue);
  }
  function targetPlaylist(value) { try { return new URL(value).searchParams.get('list'); } catch { return /^(WL|LL|PL[A-Za-z0-9_-]+|UU[A-Za-z0-9_-]+|OLAK5uy_[A-Za-z0-9_-]+)$/.test(value) ? value : null; } }
  function pasteDialog() { return saveDialog(); }
  function moveReview(job) {
    const body = compact('Finish moving?'); body.append(element('p', `${job.items.length} destination copies are verified. Remove the originals from ${job.sourceBefore?.title || 'the source playlist'}?`));
    listVideos(body, job.items);
    const foot = compactActions(body, 'Remove originals', () => operation('FINISH_MOVE', { jobId: job.id }), true);
    foot.firstChild.textContent = 'Keep copies'; foot.firstChild.replaceWith(button('Keep copies', async () => { await send('DISMISS', { jobId: job.id }); closePanel(); announce('Copies saved. Originals kept.'); }));
  }
  function pendingReview(job) {
    if (job.phase === 'ready_to_remove') return moveReview(job);
    const removing = job.removed?.length || ['remove', 'remove_batch'].includes(job.intent?.kind);
    const body = compact(removing ? 'Review removal' : 'Check saved videos'); body.append(element('p', removing ? 'Removal stopped before it could be fully verified. Review the saved links and backup.' : 'The last save needs checking. Originals are kept.'));
    if (!removing && ['copy', 'move'].includes(job.kind)) body.append(button('Check again', () => operation('CHECK_OPERATION', { jobId: job.id }), 'text primary'));
    body.append(button(removing ? 'Close saved operation' : 'Keep originals and close', async () => { await send('DISMISS', { jobId: job.id }); closePanel(); notice(''); }), button('Details', () => { closePanel(); return recoveryDialog(); }));
  }
  async function recoveryDialog() {
    const status = await send('STATUS', { detailed: true }), body = dialog('Saved selections & recovery');
    body.append(element('p', 'Your saved videos and playlist backups stay available when you close or reload YouTube.', 'note'));
    const render = (job, current = false) => {
      const card = element('div', '', 'saved'), items = job.items || [], actions = element('div', '', 'saved-actions');
      card.append(element('strong', `${job.kind === 'move' ? 'Move' : job.kind === 'remove' ? 'Removal' : job.kind === 'sort' ? 'Sort' : job.kind === 'reorder' ? 'Reorder' : 'Copy'} · ${items.length} videos`));
      card.append(element('small', `Started ${new Date(job.createdAt || job.savedAt || Date.now()).toLocaleString()}`));
      if (job.targetId) card.append(element('small', `Destination: ${job.targetBefore?.title || job.targetId}`));
      card.append(element('small', current ? job.phase === 'ready_to_remove' ? 'Copies verified. Originals kept.' : status.busy ? 'A step is running.' : 'Stopped before completion. Review the saved videos.' : `Saved ${new Date(job.createdAt || job.savedAt || Date.now()).toLocaleString()}`));
      if (job.error) card.append(element('p', job.error, 'error note'));
      actions.append(button('Copy links', () => copyLinks(items)), button('Save links', () => download('saved-video-links.txt', links(items), 'text/plain')));
      if (job.sourceBefore) actions.append(button('Download backup', () => download(`playlist-${job.sourceId || job.sourceBefore.playlistId}.json`, JSON.stringify(job.sourceBefore, null, 2))));
      if (job.removalBefore) actions.append(button('Download removal backup', () => download(`playlist-${job.sourceId}-before-removal.json`, JSON.stringify(job.removalBefore, null, 2))));
      if (current && job.phase === 'ready_to_remove') actions.append(button('Review removal', () => moveReview(job)));
      if (current) { const stop = button(job.removed?.length || ['remove', 'remove_batch'].includes(job.intent?.kind) ? 'Close saved operation' : 'Keep originals and close operation', async () => { await send('DISMISS'); await recoveryDialog(); }); stop.disabled = status.busy; actions.append(stop); }
      card.append(actions);
      if (current) {
        const details = element('details', '', 'diagnostics'), output = element('textarea');
        output.readOnly = true; output.setAttribute('aria-label', 'Operation diagnostics');
        output.value = JSON.stringify({ version: chrome.runtime.getManifest().version, kind: job.kind, phase: job.phase,
          startedAt: job.createdAt, selectedVideos: items.length, verifiedCopies: job.copied?.length || 0,
          removedOriginals: job.removed?.length || 0, error: job.error,
          pendingBatch: ['add_batch', 'remove_batch', 'reorder_batch'].includes(job.intent?.kind) ? { kind: job.intent.kind, size: job.intent.batchSize } : null,
          reorderedVideos: job.reordered?.length || 0,
          timings: job.timings, stopRequested: job.stopRequested,
          lastCopyCheck: job.verification, finalCopyCheck: job.finalVerification }, null, 2);
        details.append(element('summary', 'Technical details'), output); card.append(details);
      }
      body.append(card);
    };
    if (status.activeJob) render(status.activeJob, true);
    if (status.queue) render(status.queue);
    for (const job of status.history || []) render(job);
    if (!status.activeJob && !status.queue && !status.history?.length) body.append(element('p', 'No saved operations yet.'));
    footer(body);
  }

  const actions = { stop: stopOperation, close: () => toggle(false), all: () => root.querySelector('[data-action=all]').getAttribute('aria-checked') === 'true' ? deselect() : selectAll(), save: saveDialog, clear: deselect, links: () => copyLinks(), menu: () => showMenu(menu.hidden) };
  root.addEventListener('click', event => { const action = event.target.closest?.('[data-action]')?.dataset.action; if (action) Promise.resolve().then(actions[action]).catch(report); });
  backdrop.addEventListener('click', event => { if (event.target === backdrop) closeDialog(); });
  document.addEventListener('click', event => { if (!event.composedPath().includes(host)) { showMenu(false); closePanel(); } });
  for (const type of ['pointerdown', 'mousedown']) document.addEventListener(type, event => {
    if (!enabled || working) return;
    const row = dragRow(event);
    if (row && selected.has(info(row)?.key) && canReorder()) event.stopImmediatePropagation();
  }, true);
  document.addEventListener('dragstart', event => {
    if (!enabled || working || !event.dataTransfer) return;
    const row = dragRow(event);
    if (!row || !selected.has(info(row)?.key) || !canReorder()) return;
    const args = reorderArgs(); groupDrag = { args, selectedIds: new Set(args.keys), scope }; event.stopImmediatePropagation();
    event.dataTransfer.clearData(); event.dataTransfer.setData('text/plain', `${selected.size} selected playlist videos`); event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setDragImage(row, 24, 24); closePanel(); showMenu(false); notice('');
  }, true);
  for (const type of ['dragenter', 'dragover']) document.addEventListener(type, event => {
    if (!enabled || !groupDrag || working) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const target = dragTarget(event); clearDrop();
    if (target) { dropRow = target.row; dropRow.classList.add(target.after ? 'yt-multiselect-drop-after' : 'yt-multiselect-drop-before'); }
    scrollSpeed = event.clientY < 72 ? -14 : event.clientY > innerHeight - 100 ? 14 : 0;
    if (scrollSpeed && scrollFrame === null) scrollFrame = requestAnimationFrame(dragScroll);
  }, true);
  document.addEventListener('drop', event => {
    if (!groupDrag) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const target = dragTarget(event), drag = groupDrag; clearDrag();
    if (!enabled || working || !target || navigationScope() !== drag.scope) return;
    Promise.resolve().then(() => operation('REORDER', { ...drag.args, ...target.placement })).catch(report);
  }, true);
  document.addEventListener('dragend', () => { if (groupDrag) clearDrag(); }, true);
  document.addEventListener('keydown', event => {
    if (groupDrag && event.key === 'Escape') { clearDrag(); return; }
    if (!panel.hidden && event.key === 'Escape') { event.preventDefault(); closePanel(); root.querySelector('[data-action="menu"]').focus(); return; }
    if (!backdrop.hidden) {
      if (event.key === 'Escape') { event.preventDefault(); closeDialog(); return; }
      if (event.key === 'Tab') { const nodes = [...backdrop.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea,summary,iframe')].filter(node => node.getClientRects().length); if (!nodes.length) return; const first = nodes[0], last = nodes[nodes.length - 1], active = root.activeElement; if (event.shiftKey && (active === first || !nodes.includes(active))) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && (active === last || !nodes.includes(active))) { event.preventDefault(); first.focus(); } }
      return;
    }
    if (!menu.hidden && ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'Escape') { showMenu(false); root.querySelector('[data-action="menu"]').focus(); return; }
      const nodes = menuButtons(), at = nodes.indexOf(root.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? nodes.length - 1 : (at + (event.key === 'ArrowUp' ? -1 : 1) + nodes.length) % nodes.length;
      nodes[next]?.focus(); return;
    }
    if (!enabled || working || event.composedPath().some(node => node instanceof Element && (node.matches('input,textarea,select') || node.isContentEditable))) return;
    if (event.key === 'Escape') { showMenu(false); return; }
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase(), handler = key === 'c' && event.shiftKey && selected.size ? () => queueSelection('copy') : key === 'c' && selected.size ? () => copyLinks() : key === 'x' && exactSelection() && snapshot.editable ? cutDialog : key === 'v' && playlistId() ? pasteDialog : key === 'a' ? selectAll : null;
    if (handler) { event.preventDefault(); Promise.resolve().then(handler).catch(report); }
  });
  const pageObserver = new MutationObserver(mutations => {
    if (mutations.every(mutation => mutation.target === host || mutation.target === toggleButton || mutation.target.closest?.('#yt-multiselect-toggle,#yt-watch-later-controls') || [...mutation.addedNodes, ...mutation.removedNodes].every(node => node.nodeType !== 1 || node.classList?.contains('yt-multiselect-checkbox')))) return;
    if (!enabled && !mutations.some(mutation => mutation.target.closest?.(SELECTORS.chrome) || [...mutation.addedNodes, ...mutation.removedNodes].some(node => node.nodeType === 1 && (node === host || node.matches(SELECTORS.chrome) || node.querySelector(SELECTORS.chrome))))) return;
    // Coalesce into one pending scan without postponing it through continuous renders.
    if (!timer) timer = setTimeout(() => { timer = null; scan(); }, enabled ? 120 : 0);
  });
  // Watch YouTube's page area and header/guide rails instead of the whole body.
  // Falls back to the body until those containers exist, then re-targets.
  let observing = null;
  function observeTargets() {
    let found = [...new Set([...document.querySelectorAll(`${SELECTORS.pageManager},${SELECTORS.masthead},${SELECTORS.miniGuide}`)])];
    // Without the page container (unknown layout) watch the whole body rather than miss rows.
    if (!found.some(node => node.matches(SELECTORS.pageManager))) found = [];
    if (observing && found.length === observing.length && found.every((node, index) => node === observing[index])) return;
    pageObserver.disconnect();
    observing = found;
    for (const node of found.length ? found : [document.body || document.documentElement]) pageObserver.observe(node, { childList: true, subtree: true });
  }
  observeTargets();
  document.addEventListener('yt-navigate-finish', () => { observeTargets(); closeDialog(); scan(); });
  chrome.runtime.onMessage?.addListener(message => { if (message.type === 'TOGGLE') toggle(!enabled); });
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.wlSyncInProgress) { watchLaterBusy = Boolean(changes.wlSyncInProgress.newValue); updateWatchLaterControls(); }
    if (!changes.activeJob && !changes.queue && !changes.history && !changes.historyCount) return;
    statusRevision++;
    for (const key of ['activeJob', 'queue']) if (changes[key]) operationStatus[key] = changes[key].newValue || null;
    if (changes.historyCount) operationStatus.historyCount = changes.historyCount.newValue;
    else if (changes.history) operationStatus.historyCount = changes.history.newValue?.length || 0;
    update();
  });
  scan();
  send('WL_SYNC_STATUS').then(status => { watchLaterBusy = Boolean(status.running); updateWatchLaterControls(); }).catch(() => {});
  // First run: say where the toolbar icon is, once.
  (async () => {
    try {
      if (!chrome.storage?.local?.get) return;
      const stored = await chrome.storage.local.get('toolbarHintSeen');
      if (stored.toolbarHintSeen) return;
      await chrome.storage.local.set({ toolbarHintSeen: true });
      notice('To select videos, click this extension\'s toolbar icon (puzzle-piece menu, then pin it) or the select button in YouTube\'s header.', 'Got it', () => notice(''));
    } catch {}
  })();
})();
