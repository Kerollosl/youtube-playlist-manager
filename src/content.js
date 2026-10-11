(() => {
  'use strict';
  if (document.getElementById('yt-multiselect-tools')) return;
  const ROWS = 'ytd-playlist-video-renderer,ytd-playlist-panel-video-renderer,ytd-video-renderer,ytd-rich-item-renderer,ytd-grid-video-renderer';
  const host = document.createElement('div');
  host.id = 'yt-multiselect-tools';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<link rel="stylesheet" href="${chrome.runtime.getURL('src/ui.css')}">
  <div class="bar" role="toolbar" aria-label="Selected videos" aria-busy="false" hidden>
    <button class="icon" data-action="close" title="Close selection" aria-label="Close selection">${svg('close')}</button>
    <button class="icon" data-action="all" role="checkbox" aria-checked="false" title="Select all" aria-label="Select all">${svg('clear')}</button>
    <span class="count" aria-live="polite">0 selected</span>
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
  (document.querySelector('ytd-app') || document.documentElement).append(host);
  function syncTheme() { host.dataset.theme = document.documentElement.hasAttribute('dark') ? 'dark' : 'light'; }
  syncTheme();
  new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['dark'] });
  const bar = root.querySelector('.bar'), menu = root.querySelector('.menu'), backdrop = root.querySelector('.backdrop'), panel = root.querySelector('.panel');
  const selected = new Map(), rowBoxes = new WeakMap(), wiredRows = new WeakSet(), dragAttributes = new WeakMap();
  let groupDrag = null, dropRow = null, scrollFrame = null, scrollSpeed = 0;
  let enabled = false, scope = navigationScope(), snapshot = null, toggleButton, timer, toastTimer, lastAnchor = null, working = false, readPending = false, needsReload = false, dialogFocus, noticeRevision = 0, introduced = false;
  let operationStatus = { activeJob: null, queue: null, history: [], busy: false };

  function svg(name) {
    if (name === 'more') return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="12" cy="19" r="2"></circle></svg>';
    const paths = { mixed: 'M3 3h18v18H3V3Zm2 2v14h14V5H5Zm2 6h10v2H7v-2Z', close: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4Z', all: 'M3 3h18v18H3V3Zm2 2v14h14V5H5Zm2 6 3 3 7-7 1.4 1.4L10 16.8 5.6 12.4 7 11Z', clear: 'M3 3h18v18H3V3Zm2 2v14h14V5H5Z', link: 'M10 7H7a5 5 0 0 0 0 10h3v-2H7a3 3 0 0 1 0-6h3V7Zm4 0v2h3a3 3 0 0 1 0 6h-3v2h3a5 5 0 0 0 0-10h-3Zm-6 4h8v2H8v-2Z', copy: 'M8 7V3h13v13h-4v5H3V7h5Zm2 0h7v7h2V5h-9v2Zm5 2H5v10h10V9Z', cut: 'M9.6 12 16 5.6 14.4 4 8 10.4A4 4 0 1 0 9.6 12ZM5 17a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm5.4-3L14 17.6l1.6-1.6-3.6-3.6-1.6 1.6ZM19 13a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z', save: 'M3 5h12v2H3V5Zm0 6h12v2H3v-2Zm0 6h8v2H3v-2Zm16-4v4h4v2h-4v4h-2v-4h-4v-2h4v-4h2Z', recovery: 'M12 4a8 8 0 1 1-7.75 10H6.4A6 6 0 1 0 8 8l2 2H3V3l2.1 2.1A8 8 0 0 1 12 2v2Zm-1 3h2v5.2l3.2 1.9-1 1.7-4.2-2.5V7Z', trash: 'M8 3h8l1 2h4v2H3V5h4l1-2Zm-2 6h12l-1 12H7L6 9Zm3 2 .5 8h2L11 11H9Zm4 0-.5 8h2l.5-8h-2Z', toggle: 'M3 4h4v4H3V4Zm7 0h11v2H10V4ZM3 10h4v4H3v-4Zm7 0h11v2H10v-2ZM3 16h4v4H3v-4Zm7 0h11v2H10v-2Z' };
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]}"></path></svg>`;
  }
  function element(tag, text, className) { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; }
  function button(text, action, className = 'text') { const node = element('button', text, className); node.type = 'button'; node.addEventListener('click', () => Promise.resolve().then(action).catch(report)); return node; }
  function playlistId() { return new URL(location.href).searchParams.get('list'); }
  function navigationScope() { const url = new URL(location.href); return url.searchParams.get('list') ? `playlist:${url.searchParams.get('list')}` : `${url.pathname}?${url.searchParams.toString()}`; }
  function validVideo(item) { return /^[A-Za-z0-9_-]{11}$/.test(item?.videoId || ''); }
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
    const anchor = row.querySelector('a#video-title,a#video-title-link') || row.querySelector('a[href*="/watch?v="],a[href*="/shorts/"]');
    if (!anchor) return null;
    let url; try { url = new URL(anchor.href, location.origin); } catch { return null; }
    const videoId = url.searchParams.get('v') || url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})/)?.[1];
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId || '')) return null;
    const indexText = url.searchParams.get('index') || row.querySelector('#index')?.textContent.trim();
    const index = /^[0-9]+$/.test(indexText || '') ? Number(indexText) - 1 : null;
    let exact = null;
    if (snapshot?.complete && snapshot.playlistId === playlistId()) {
      if (index !== null) { const atIndex = byIndex.get(index); if (atIndex?.videoId === videoId) exact = atIndex; }
      else { exact = byVideo.get(videoId); }
    }
    if (exact?.setVideoId) return canonical(exact);
    const list = playlistId();
    return { key: list && index !== null ? `row:${list}:${videoId}:${index}` : `row:${scope}:${videoId}`, videoId, index, title: anchor.getAttribute('title') || anchor.textContent.trim() || videoId, channel: row.querySelector('#channel-name,#byline-container')?.textContent.trim() || '', playlistId: list };
  }
  function loadedRows() {
    const visible = node => node.getClientRects().length > 0 && !node.closest('[hidden],[aria-hidden="true"]');
    const playlistPage = location.pathname === '/playlist';
    const pages = [...document.querySelectorAll(playlistPage ? 'ytd-browse' : 'ytd-page-manager > *')].filter(visible);
    const page = pages[pages.length - 1] || document;
    const selector = playlistPage ? 'ytd-playlist-video-renderer' : ROWS;
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
  function canReorder(entries = loadedRows()) { return exactSelection() && snapshot.editable && snapshot.canReorder && entries.some(entry => entry.row.matches('ytd-playlist-video-renderer')); }
  function selectionArgs() {
    if (!exactSelection()) throw new Error('Wait for the playlist to load, then select its videos again. Copy links works now.');
    return { playlistId: snapshot.playlistId, keys: [...selected.values()].map(item => item.setVideoId), expectedFingerprint: snapshot.fingerprint };
  }
  function update() {
    const count = snapshot?.complete && snapshot.playlistId === playlistId() ? snapshot.items.length : loadedRows().length;
    const label = root.querySelector('.count');
    const queued = operationStatus.queue?.items?.length || 0, active = operationStatus.activeJob;
    if (!selected.size && active) label.replaceChildren(document.createTextNode(active.phase === 'ready_to_remove' ? 'Move ready' : 'Operation saved'));
    else if (!selected.size && queued) label.replaceChildren(document.createTextNode(`${queued}`), element('small', ` ready to ${operationStatus.queue.kind === 'move' ? 'move' : 'copy'}`));
    else label.replaceChildren(document.createTextNode(`${selected.size}`), element('small', ` / ${count}`), document.createTextNode(' selected'));
    label.title = active ? 'A saved operation needs attention' : queued && !selected.size ? `${queued} videos ready to ${operationStatus.queue.kind}` : `${selected.size} of ${count} ${snapshot?.complete ? 'playlist' : 'loaded'} videos selected`;
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
    toggleButton?.setAttribute('aria-pressed', String(enabled));
    if (toggleButton) { toggleButton.title = enabled ? 'Exit video selection' : 'Select videos'; toggleButton.setAttribute('aria-label', toggleButton.title); }
    if (!menu.hidden) buildMenu();
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
    const end = document.querySelector('ytd-masthead #end');
    if (!end) return;
    if (!toggleButton?.isConnected) {
      toggleButton = element('button'); toggleButton.id = 'yt-multiselect-toggle'; toggleButton.type = 'button';
      toggleButton.title = 'Select videos'; toggleButton.setAttribute('aria-label', 'Select videos'); toggleButton.innerHTML = svg('toggle');
      toggleButton.setAttribute('aria-pressed', String(enabled)); toggleButton.addEventListener('click', () => toggle(!enabled));
      end.insertBefore(toggleButton, end.querySelector('#buttons') || end.firstChild);
    }
  }
  function scan() {
    if (!host.isConnected) (document.querySelector('ytd-app') || document.documentElement).append(host);
    mountToggle();
    if (scope !== navigationScope()) { clearDrag(); scope = navigationScope(); closePanel(); showMenu(false); notice(''); selected.clear(); setSnapshot(null); lastAnchor = null; needsReload = false; if (enabled) readPlaylist(); }
    if (!enabled) {
      for (const row of document.querySelectorAll('.yt-multiselect-row')) releaseRow(row);
      update(); return;
    }
    const entries = loadedRows(), currentRows = new Set(entries.map(entry => entry.row)), reorderable = canReorder(entries);
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
    update();
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
  function toggle(value) { enabled = value; bar.hidden = !value; if (!value) { clearDrag(); showMenu(false); closeDialog(); closePanel(); notice(''); setSnapshot(null); } scan(); if (value) { maybeIntroduce(); refreshStatus(); if (!snapshot) readPlaylist(); } }
  function selectAll() { const items = snapshot?.complete ? snapshot.items.filter(validVideo).map(canonical) : loadedRows().map(entry => entry.item); for (const item of items) selected.set(item.key, item); syncRows(); }
  function deselect() { selected.clear(); lastAnchor = null; syncRows(); }
  function menuButtons() { return [...menu.querySelectorAll('button:not(:disabled)')].filter(node => node.getClientRects().length); }
  function showMenu(value, focus = true) {
    const trigger = root.querySelector('[data-action="menu"]'); host.toggleAttribute('data-menu-open', value); menu.hidden = !value; trigger.setAttribute('aria-expanded', String(value));
    if (value) { closePanel(); buildMenu(); refreshStatus(); if (focus) menuButtons()[0]?.focus(); }
  }
  let menuSignature = '';
  function buildMenu() {
    const entries = loadedRows(), exact = exactSelection(), reorderable = canReorder(entries);
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
    group('Selection');
    add('all', 'Select all', 'Every verified playlist video', selectAll, !snapshot?.complete && !entries.length);
    add('clear', 'Deselect all', 'Clear the current selection', deselect, !selected.size);
    add('link', 'Copy video links', 'Plain links for NotebookLM or anywhere else', () => copyLinks(), !selected.size);
    divide(); group('Organize');
    add('copy', 'Copy selection', 'Keep a reusable copy for another playlist', () => queueSelection('copy'), !selected.size);
    const editReason = !selected.size ? 'Select videos first' : needsReload ? 'Refresh YouTube before editing again' : !exact ? 'Wait for the complete playlist to load' : !snapshot?.editable ? 'This playlist is not editable' : null;
    add('cut', 'Cut selection', editReason || 'Move only after destination copies are verified', cutDialog, Boolean(editReason));
    add('save', 'Save to playlist…', selected.size ? 'Copy the current selection' : queued ? `Continue with ${queued} saved videos` : 'Select or copy videos first', saveDialog, !selected.size && !queued && !operationStatus.activeJob);
    add('toggle', 'Move in this playlist…', editReason || (!reorderable ? 'Open a playlist that supports reordering' : 'Move the selection to the top, bottom, or a custom position'), reorderDialog, !reorderable);
    add('all', 'Sort playlist…', 'Order the entire playlist by title, channel, or duration', sortDialog, needsReload || !snapshot?.complete || !snapshot?.editable || !snapshot?.canReorder || !snapshot?.items.length);
    divide(); group('Saved & recovery');
    add('recovery', active ? 'Review saved operation' : 'Saved operations', active ? 'A stopped or verified operation needs attention' : `${operationStatus.historyCount ?? operationStatus.history?.length ?? 0} recent backups`, recoveryDialog);
    add('recovery', 'Performance', 'Recent action timings on this device', performanceDialog);
    add('trash', 'Delete from playlist…', editReason || 'Review titles before permanent removal', deleteSelected, Boolean(editReason), true);
    if (focusedText) menuButtons().find(node => node.textContent === focusedText)?.focus();
  }
  async function copyLinks(items = [...selected.values()]) {
    const text = links(items); if (!text) return;
    try { await navigator.clipboard.writeText(text); announce(`${items.length} links copied. Paste into NotebookLM.`); }
    catch { const body = dialog('Selected video links'); body.append(element('p', 'Copy these links, one per line.')); const area = element('textarea'); area.value = text; area.readOnly = true; area.setAttribute('aria-label', 'Selected video links'); body.append(area); footer(body); area.focus(); area.select(); }
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
  function closeDialog() { if (backdrop.hidden) return; backdrop.hidden = true; backdrop.replaceChildren(); dialogFocus?.focus?.(); }
  function dialog(title) {
    dialogFocus = root.activeElement || document.activeElement; if (menu.contains(dialogFocus)) dialogFocus = root.querySelector('[data-action="menu"]'); showMenu(false); backdrop.replaceChildren(); backdrop.hidden = false;
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
    const capturedScope = scope, args = { playlistId: snapshot.playlistId, expectedFingerprint: snapshot.fingerprint, keys: snapshot.items.map(item => item.setVideoId) };
    const body = compact('Sort playlist');
    body.append(element('p', `Order all ${snapshot.items.length} videos. Duplicate entries are kept.`));
    const field = (id, text, values) => {
      const label = element('label', text), select = element('select'); label.htmlFor = id; select.id = id;
      for (const [value, title] of values) { const option = element('option', title); option.value = value; select.append(option); }
      body.append(label, select); return select;
    };
    const by = field('sort-by', 'Sort by', [['title', 'Title'], ['channel', 'Channel'], ['duration', 'Duration']]);
    const direction = field('sort-direction', 'Order', [['ascending', 'Ascending'], ['descending', 'Descending']]);
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
  function dragRow(event) { return event.target instanceof Element ? event.target.closest('ytd-playlist-video-renderer') : null; }
  function dragTarget(event) {
    const row = dragRow(event), item = row && info(row);
    if (!item?.setVideoId || groupDrag.selectedIds.has(item.setVideoId)) return null;
    const after = event.clientY > row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
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
      if (args) return operation('TRANSFER', { ...args, kind, targetId });
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
    if (!enabled || working || !canReorder()) return;
    const row = dragRow(event);
    if (row && selected.has(info(row)?.key)) event.stopImmediatePropagation();
  }, true);
  document.addEventListener('dragstart', event => {
    if (!enabled || working || !canReorder() || !event.dataTransfer) return;
    const row = dragRow(event);
    if (!row || !selected.has(info(row)?.key)) return;
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
      if (event.key === 'Tab') { const nodes = [...backdrop.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea,summary')].filter(node => node.getClientRects().length); if (!nodes.length) return; const first = nodes[0], last = nodes[nodes.length - 1], active = root.activeElement; if (event.shiftKey && (active === first || !nodes.includes(active))) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && (active === last || !nodes.includes(active))) { event.preventDefault(); first.focus(); } }
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
  new MutationObserver(mutations => {
    if (mutations.every(mutation => mutation.target === host || mutation.target === toggleButton || mutation.target.closest?.('#yt-multiselect-toggle') || [...mutation.addedNodes, ...mutation.removedNodes].every(node => node.nodeType !== 1 || node.classList?.contains('yt-multiselect-checkbox')))) return;
    clearTimeout(timer); timer = setTimeout(scan, 120);
  }).observe(document.body || document.documentElement, { childList: true, subtree: true });
  document.addEventListener('yt-navigate-finish', () => { closeDialog(); scan(); });
  chrome.runtime.onMessage?.addListener(message => { if (message.type === 'TOGGLE') toggle(!enabled); });
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!changes.activeJob && !changes.queue && !changes.history && !changes.historyCount) return;
    statusRevision++;
    for (const key of ['activeJob', 'queue']) if (changes[key]) operationStatus[key] = changes[key].newValue || null;
    if (changes.historyCount) operationStatus.historyCount = changes.historyCount.newValue;
    else if (changes.history) operationStatus.historyCount = changes.history.newValue?.length || 0;
    update();
  });
  scan();
})();
