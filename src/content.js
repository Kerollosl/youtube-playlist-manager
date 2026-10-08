(() => {
  'use strict';
  if (document.getElementById('yt-multiselect-tools')) return;
  const ROWS = 'ytd-playlist-video-renderer,ytd-playlist-panel-video-renderer,ytd-video-renderer,ytd-rich-item-renderer,ytd-grid-video-renderer';
  const host = document.createElement('div');
  host.id = 'yt-multiselect-tools';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host{font-family:Roboto,Arial,sans-serif;font-size:14px;color:var(--yt-spec-text-primary,#0f0f0f);--surface:var(--yt-spec-raised-background,var(--yt-spec-base-background,#fff));--line:var(--yt-spec-10-percent-layer,rgba(128,128,128,.25));--muted:var(--yt-spec-text-secondary,#606060);--blue:var(--yt-spec-call-to-action,#065fd4)}
    *{box-sizing:border-box}[hidden]{display:none!important}button,input,select,textarea{font:inherit}button{border:0;background:transparent;color:inherit;cursor:pointer}button:disabled{opacity:.4;cursor:default}button:hover:not(:disabled){background:var(--line)}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--blue);outline-offset:2px}button svg{width:22px;height:22px;fill:currentColor;flex-shrink:0}.icon{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%}.text{border-radius:18px;padding:9px 16px}.primary{background:var(--blue);color:var(--yt-spec-static-brand-white,#fff)}.primary:hover:not(:disabled){filter:brightness(.9);background:var(--blue)}.danger{color:var(--yt-spec-error-indicator,#c00)}
    .bar{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:2200;display:flex;align-items:center;gap:4px;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:5px 8px;box-shadow:0 3px 12px #0003;max-width:calc(100vw - 24px);white-space:nowrap}.count{padding:0 12px;font-size:14px}.divider{width:1px;height:28px;background:var(--line);margin:0 5px}.copy{display:flex;align-items:center;gap:7px;color:var(--blue);font-weight:500}.menu{position:absolute;bottom:calc(100% + 8px);right:0;min-width:230px;max-height:min(80vh,580px);overflow:auto;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:8px 0;box-shadow:0 4px 18px #0003}.menu button{display:flex;align-items:center;width:100%;text-align:left;padding:11px 18px}.menu hr{border:0;border-top:1px solid var(--line);margin:5px 0}.toast{position:fixed;bottom:87px;left:50%;transform:translateX(-50%);z-index:2201;border-radius:5px;background:var(--surface);box-shadow:0 2px 8px #0003;padding:10px 16px;max-width:calc(100vw - 32px);color:var(--muted);white-space:normal}
    .backdrop{position:fixed;inset:0;z-index:2300;background:#0007;display:flex;align-items:center;justify-content:center;padding:20px}.dialog{background:var(--surface);border-radius:12px;width:490px;max-width:100%;max-height:85vh;overflow:auto;box-shadow:0 8px 32px #0005;padding:24px}.dialog h2{font-size:20px;margin:0 0 16px;font-weight:500}.dialog p{line-height:1.5;margin:12px 0;color:var(--muted)}.dialog label{display:block;margin:14px 0 6px}.dialog input:not([type=checkbox]),.dialog select,.dialog textarea{width:100%;border:1px solid var(--line);border-radius:6px;padding:10px;background:transparent;color:inherit}.dialog select option{background:var(--surface);color:var(--yt-spec-text-primary,#0f0f0f)}.dialog textarea{min-height:180px;resize:vertical}.footer{display:flex;gap:8px;justify-content:flex-end;margin-top:20px;flex-wrap:wrap}.videos{max-height:190px;overflow:auto;padding-left:22px;font-size:13px}.videos li{padding:5px 0;line-height:1.4}.saved{padding:12px 0;border-bottom:1px solid var(--line)}.saved strong{font-weight:500}.saved small{display:block;color:var(--muted);margin:5px 0}.saved-actions{display:flex;gap:4px;flex-wrap:wrap}.error{color:var(--yt-spec-error-indicator,#c00)!important}.note{font-size:12px}.checklabel{display:flex!important;gap:8px;align-items:center}
    @media(max-width:560px){.bar{bottom:12px;padding:4px;gap:0}.count{padding:0 6px;font-size:12px}.icon{width:34px;height:36px}.copy{padding:9px 10px;font-size:12px}.divider{margin:0 3px}.dialog{padding:20px}.toast{bottom:70px}}
  </style>
  <div class="bar" role="toolbar" aria-label="Selected videos" hidden>
    <button class="icon" data-action="close" title="Close selection" aria-label="Close selection">${svg('close')}</button>
    <span class="count" aria-live="polite">0 / 0 selected</span><span class="divider"></span>
    <button class="icon" data-action="all" title="Select all loaded videos" aria-label="Select all loaded videos">${svg('all')}</button>
    <button class="icon" data-action="clear" title="Deselect all" aria-label="Deselect all">${svg('clear')}</button>
    <button class="text copy" data-action="links" title="Copy selected video links as plain text">${svg('link')}<span>Copy links</span></button>
    <button class="icon" data-action="menu" title="More actions" aria-label="More actions" aria-expanded="false">${svg('more')}</button>
    <div class="menu" role="menu" hidden></div>
  </div><div class="toast" role="status" hidden></div><div class="backdrop" hidden></div>`;
  document.documentElement.append(host);
  const pageStyle = document.createElement('style');
  pageStyle.textContent = `#yt-multiselect-toggle{display:inline-flex;align-items:center;justify-content:center;flex:0 0 40px;width:40px;height:40px;margin:0 8px;border:0;border-radius:50%;background:transparent;color:var(--yt-spec-call-to-action,#065fd4);cursor:pointer}#yt-multiselect-toggle:hover{background:var(--yt-spec-10-percent-layer,#ddd)}#yt-multiselect-toggle[aria-pressed=true]{color:var(--yt-spec-call-to-action,#065fd4);background:var(--yt-spec-badge-chip-background,#eee)}#yt-multiselect-toggle svg{width:24px;height:24px;fill:currentColor}.yt-multiselect-row{position:relative!important}.yt-multiselect-checkbox[hidden]{display:none!important}.yt-multiselect-checkbox{position:absolute!important;left:5px;top:50%;transform:translateY(-50%);width:18px;height:18px;z-index:10;accent-color:var(--yt-spec-call-to-action,#065fd4);cursor:pointer;margin:0}.yt-multiselect-row.yt-multiselect-enabled{padding-left:31px!important}.yt-multiselect-row.yt-multiselect-chosen{background:var(--yt-spec-badge-chip-background,rgba(128,128,128,.12))!important}`;
  document.documentElement.append(pageStyle);
  const bar = root.querySelector('.bar'), menu = root.querySelector('.menu'), backdrop = root.querySelector('.backdrop');
  const selected = new Map(), rowBoxes = new WeakMap();
  let enabled = false, scope = navigationScope(), snapshot = null, toggleButton, timer, toastTimer, lastAnchor = null, working = false, readPending = false, needsReload = false, dialogFocus;

  function svg(name) {
    if (name === 'more') return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="12" cy="19" r="2"></circle></svg>';
    const paths = { close: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4Z', all: 'M3 3h18v18H3V3Zm2 2v14h14V5H5Zm2 6 3 3 7-7 1.4 1.4L10 16.8 5.6 12.4 7 11Z', clear: 'M3 3h18v18H3V3Zm2 2v14h14V5H5Z', link: 'M10 7H7a5 5 0 0 0 0 10h3v-2H7a3 3 0 0 1 0-6h3V7Zm4 0v2h3a3 3 0 0 1 0 6h-3v2h3a5 5 0 0 0 0-10h-3Zm-6 4h8v2H8v-2Z', more: 'M12 5a2 2 0 1 0 0 .01Zm0 7a2 2 0 1 0 0 .01Zm0 7a2 2 0 1 0 0 .01Z', toggle: 'M3 4h4v4H3V4Zm7 0h11v2H10V4ZM3 10h4v4H3v-4Zm7 0h11v2H10v-2ZM3 16h4v4H3v-4Zm7 0h11v2H10v-2Z' };
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]}"></path></svg>`;
  }
  function element(tag, text, className) { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; }
  function button(text, action, className = 'text') { const node = element('button', text, className); node.type = 'button'; node.addEventListener('click', () => Promise.resolve().then(action).catch(report)); return node; }
  function playlistId() { return new URL(location.href).searchParams.get('list'); }
  function navigationScope() { const url = new URL(location.href); return url.searchParams.get('list') ? `playlist:${url.searchParams.get('list')}` : `${url.pathname}?${url.searchParams.toString()}`; }
  function validVideo(item) { return /^[A-Za-z0-9_-]{11}$/.test(item?.videoId || ''); }
  function links(items = [...selected.values()]) { return items.filter(validVideo).map(item => `https://www.youtube.com/watch?v=${item.videoId}`).join('\n'); }
  function announce(text) { const toast = root.querySelector('.toast'); toast.textContent = text; toast.hidden = !text; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 6500); }
  function refreshNotice(text) {
    const toast = root.querySelector('.toast'); clearTimeout(toastTimer); toast.replaceChildren(document.createTextNode(`${text} `), button('Refresh YouTube', () => location.reload())); toast.hidden = false;
  }
  function report(error) { announce(error?.message || String(error)); }
  async function send(type, values = {}) { const result = await chrome.runtime.sendMessage({ type, ...values }); if (!result?.ok) throw new Error(result?.error || 'Could not reach playlist tools. Reload YouTube and try again.'); return result; }
  function canonical(item) { return { ...item, key: item.setVideoId ? `entry:${item.setVideoId}` : item.key }; }
  function info(row) {
    const anchor = row.querySelector('a#video-title,a#video-title-link,a[href*="/watch?v="],a[href*="/shorts/"]');
    if (!anchor) return null;
    let url; try { url = new URL(anchor.href, location.origin); } catch { return null; }
    const videoId = url.searchParams.get('v') || url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})/)?.[1];
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId || '')) return null;
    const indexText = url.searchParams.get('index') || row.querySelector('#index')?.textContent.trim();
    const index = /^[0-9]+$/.test(indexText || '') ? Number(indexText) - 1 : null;
    let exact = null;
    if (snapshot?.complete && snapshot.playlistId === playlistId()) {
      if (index !== null) { const atIndex = snapshot.items.find(item => item.index === index); if (atIndex?.videoId === videoId) exact = atIndex; }
      else { const matches = snapshot.items.filter(item => item.videoId === videoId); if (matches.length === 1) exact = matches[0]; }
    }
    if (exact?.setVideoId) return canonical(exact);
    const list = playlistId();
    return { key: list && index !== null ? `row:${list}:${videoId}:${index}` : `row:${scope}:${videoId}`, videoId, index, title: anchor.getAttribute('title') || anchor.textContent.trim() || videoId, channel: row.querySelector('#channel-name,#byline-container')?.textContent.trim() || '', playlistId: list };
  }
  function loadedRows() { return [...document.querySelectorAll(ROWS)].filter(row => !row.parentElement?.closest(ROWS)).map(row => ({ row, item: info(row) })).filter(entry => entry.item); }
  function reconcileSnapshot() {
    const migrated = new Map();
    for (const item of selected.values()) {
      const matches = snapshot?.items?.filter(entry => entry.videoId === item.videoId && (item.setVideoId ? entry.setVideoId === item.setVideoId : item.index !== null && entry.index === item.index)) || [];
      const next = matches.length === 1 ? canonical(matches[0]) : item;
      migrated.set(next.key, next);
    }
    selected.clear(); for (const [key, item] of migrated) selected.set(key, item);
  }
  function exactSelection() { return selected.size > 0 && snapshot?.complete && [...selected.values()].every(item => item.setVideoId && snapshot.items.some(entry => entry.setVideoId === item.setVideoId && entry.videoId === item.videoId)); }
  function selectionArgs() {
    if (!exactSelection()) throw new Error('Wait for the playlist to load, then select its videos again. Copy links works now.');
    return { playlistId: snapshot.playlistId, keys: [...selected.values()].map(item => item.setVideoId), expectedFingerprint: snapshot.fingerprint };
  }
  function update() {
    const count = loadedRows().length;
    root.querySelector('.count').textContent = `${selected.size} / ${count} selected`;
    root.querySelector('[data-action="links"]').disabled = !selected.size;
    root.querySelector('[data-action="all"]').disabled = working;
    root.querySelector('[data-action="clear"]').disabled = working;
    toggleButton?.setAttribute('aria-pressed', String(enabled));
    if (!menu.hidden) buildMenu();
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
    mountToggle();
    if (scope !== navigationScope()) { scope = navigationScope(); selected.clear(); snapshot = null; lastAnchor = null; needsReload = false; if (enabled) readPlaylist(); }
    for (const { row, item } of loadedRows()) {
      let checkbox = rowBoxes.get(row);
      if (!checkbox?.isConnected) {
        checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'yt-multiselect-checkbox'; row.classList.add('yt-multiselect-row'); row.append(checkbox); rowBoxes.set(row, checkbox);
        checkbox.addEventListener('click', event => {
          event.stopPropagation(); const current = info(row); if (!current || working) return;
          const entries = loadedRows(); const from = entries.findIndex(entry => entry.item.key === lastAnchor), to = entries.findIndex(entry => entry.row === row);
          const range = event.shiftKey && from >= 0 ? entries.slice(Math.min(from, to), Math.max(from, to) + 1) : [{ item: current }];
          for (const entry of range) { if (checkbox.checked) selected.set(entry.item.key, entry.item); else selected.delete(entry.item.key); }
          lastAnchor = current.key; syncRows();
        });
        checkbox.addEventListener('keydown', event => { if (event.key === ' ') event.stopPropagation(); });
        row.addEventListener('contextmenu', event => {
          if (!enabled || !selected.size || !selected.has(info(row)?.key)) return;
          event.preventDefault(); showMenu(true);
        });
      }
      checkbox.setAttribute('aria-label', `Select ${item.title}`); checkbox.hidden = !enabled; checkbox.disabled = working;
      checkbox.checked = selected.has(item.key); row.classList.toggle('yt-multiselect-enabled', enabled); row.classList.toggle('yt-multiselect-chosen', enabled && checkbox.checked);
      if (checkbox.checked) selected.set(item.key, item);
    }
    update();
  }
  function syncRows() { scan(); }
  async function readPlaylist() {
    const id = playlistId(), capturedScope = scope;
    if (needsReload) { refreshNotice('Refresh YouTube to update this playlist before another change.'); return; }
    if (!id || readPending) return;
    readPending = true;
    try { const result = await send('READ', { playlistId: id }); if (scope !== capturedScope) return; snapshot = result; reconcileSnapshot(); scan(); if (!result.complete) announce('Copy links is ready. Playlist changes are unavailable for this list.'); }
    catch (error) { if (scope === capturedScope) announce(`Copy links is ready. ${error.message}`); }
    finally { readPending = false; if (enabled && scope !== capturedScope && playlistId()) readPlaylist(); }
  }
  function toggle(value) { enabled = value; bar.hidden = !value; if (!value) { showMenu(false); closeDialog(); } scan(); if (value && !snapshot) readPlaylist(); }
  function selectAll() { for (const { item } of loadedRows()) selected.set(item.key, item); syncRows(); }
  function deselect() { selected.clear(); lastAnchor = null; syncRows(); }
  function showMenu(value) { menu.hidden = !value; root.querySelector('[data-action="menu"]').setAttribute('aria-expanded', String(value)); if (value) buildMenu(); }
  function buildMenu() {
    menu.replaceChildren();
    const add = (text, handler, disabled = false) => { const node = button(text, () => { showMenu(false); return handler(); }); node.setAttribute('role', 'menuitem'); node.disabled = disabled || working; menu.append(node); };
    add('Copy selected links', copyLinks, !selected.size);
    add('Select duplicates', selectDuplicates);
    add('Select with filter…', filterDialog);
    add('Select entire playlist', () => { for (const item of snapshot.items.filter(validVideo)) selected.set(canonical(item).key, canonical(item)); syncRows(); }, !snapshot?.complete);
    menu.append(element('hr'));
    add('Export playlist…', exportPlaylist, !snapshot?.complete);
    add('Save selection to file', () => download('selected-video-links.txt', links(), 'text/plain'), !selected.size);
    add('Copy', () => queueSelection('copy'), !selected.size);
    add('Cut…', cutDialog, !exactSelection() || !snapshot?.editable);
    add('Paste to this playlist…', pasteDialog, !playlistId());
    add('Save to playlist…', () => transferDialog('copy'), !selected.size);
    add('Move to playlist…', () => transferDialog('move'), !exactSelection() || !snapshot?.editable);
    add('Remove from this list…', removeDialog, !exactSelection() || !snapshot?.editable);
    add('Sort playlist…', sortDialog, !snapshot?.complete || !snapshot?.editable || !snapshot?.canReorder);
    menu.append(element('hr')); add('Saved selections & recovery…', recoveryDialog); add('Refresh playlist details', async () => { snapshot = null; await readPlaylist(); }, !playlistId());
  }
  async function copyLinks(items = [...selected.values()]) {
    const text = links(items); if (!text) return;
    try { await navigator.clipboard.writeText(text); announce(`${items.length} links copied. Paste into NotebookLM.`); }
    catch { const body = dialog('Selected video links'); body.append(element('p', 'Copy these links, one per line.')); const area = element('textarea'); area.value = text; area.readOnly = true; area.setAttribute('aria-label', 'Selected video links'); body.append(area); footer(body); area.focus(); area.select(); }
  }
  function download(name, content, type = 'application/json') { const url = URL.createObjectURL(new Blob([content], { type })); const anchor = element('a'); anchor.href = url; anchor.download = name; root.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function exportPlaylist() { if (!snapshot?.complete) throw new Error('Wait for the full playlist to load.'); download(`playlist-${snapshot.playlistId}.json`, JSON.stringify(snapshot, null, 2)); announce('Playlist backup saved.'); }
  function selectDuplicates() { const seen = new Set(); const items = snapshot?.complete ? snapshot.items.filter(validVideo).map(canonical) : loadedRows().map(entry => entry.item); selected.clear(); for (const item of items) { if (seen.has(item.videoId)) selected.set(item.key, item); seen.add(item.videoId); } syncRows(); }
  function closeDialog() { if (backdrop.hidden) return; backdrop.hidden = true; backdrop.replaceChildren(); dialogFocus?.focus?.(); }
  function dialog(title) {
    dialogFocus = root.activeElement || document.activeElement; showMenu(false); backdrop.replaceChildren(); backdrop.hidden = false;
    const body = element('section', '', 'dialog'); body.setAttribute('role', 'dialog'); body.setAttribute('aria-modal', 'true'); body.setAttribute('aria-label', title); body.tabIndex = -1; body.append(element('h2', title)); backdrop.append(body); body.focus(); return body;
  }
  function footer(body, text, handler, danger = false) {
    const foot = element('div', '', 'footer'); foot.append(button('Cancel', closeDialog));
    if (text) foot.append(button(text, async () => { const controls = [...body.querySelectorAll('button,input,select')]; controls.forEach(node => { node.disabled = true; }); try { await handler(); } catch (error) { if (!body.isConnected || backdrop.hidden) { report(error); return; } let message = body.querySelector('.error'); if (!message) { message = element('p', '', 'error'); body.insertBefore(message, foot); } message.textContent = error.message; } finally { controls.forEach(node => { node.disabled = false; }); } }, `text ${danger ? 'danger' : 'primary'}`));
    else foot.firstChild.textContent = 'Close'; body.append(foot); return foot;
  }
  function listVideos(body, items) { const list = element('ol', '', 'videos'); for (const item of items) list.append(element('li', item.title || item.videoId)); body.append(list); }
  function filterDialog() {
    const body = dialog('Select with filter'); const label = element('label', 'Title or channel'); label.htmlFor = 'yt-select-filter'; const input = element('input'); input.id = label.htmlFor; input.type = 'search'; input.placeholder = 'Search videos'; body.append(label, input);
    const label2 = element('label', 'Match'); const mode = element('select'); for (const [value, text] of [['include', 'Contains text'], ['exclude', 'Does not contain text']]) { const option = element('option', text); option.value = value; mode.append(option); } body.append(label2, mode);
    body.append(element('p', snapshot?.complete ? 'Searches every video in this playlist.' : 'Searches loaded videos on this page.', 'note'));
    footer(body, 'Select', () => { const filter = input.value.trim().toLocaleLowerCase(); if (!filter) throw new Error('Enter text to match.'); const items = snapshot?.complete ? snapshot.items.filter(validVideo).map(canonical) : loadedRows().map(entry => entry.item); selected.clear(); for (const item of items) { const match = `${item.title} ${item.channel}`.toLocaleLowerCase().includes(filter); if (match === (mode.value === 'include')) selected.set(item.key, item); } closeDialog(); syncRows(); }); input.focus();
  }
  async function queueSelection(kind) {
    if (!selected.size) throw new Error('Select videos first.');
    const result = exactSelection() ? await send('QUEUE', { ...selectionArgs(), kind }) : kind === 'copy' ? await send('QUEUE_LINKS', { items: [...selected.values()], kind }) : (() => { throw new Error('Open an editable playlist before cutting.'); })();
    announce(`${result.queue?.items.length || selected.size} videos saved. ${kind === 'move' ? 'Originals stay until copies are verified and you confirm removal.' : 'Open a playlist and choose Paste.'}`); return result;
  }
  function cutDialog() {
    const args = selectionArgs(), body = dialog(`Cut ${selected.size} videos`), count = selected.size;
    body.append(element('p', 'Your selection is saved before moving. Original videos stay in this playlist until the destination copies are verified and you confirm removal.'));
    listVideos(body, [...selected.values()]);
    footer(body, 'Save cut selection', async () => { await send('QUEUE', { ...args, kind: 'move' }); closeDialog(); announce(`${count} videos saved for moving. Open the destination playlist and choose Paste.`); });
  }
  async function operation(type, args) {
    if (working) throw new Error('Wait for the current step to finish.');
    const operationScope = scope; working = true; closeDialog(); showMenu(false); syncRows(); announce('Working… Your selection is saved.');
    try { const result = await send(type, args); if (result.job?.phase === 'completed' && ['REMOVE', 'SORT', 'FINISH_MOVE'].includes(type) && result.job.sourceId === playlistId()) { snapshot = null; needsReload = true; } if (result.job?.phase === 'ready_to_remove') { announce('Destination copies verified. Originals are still in place.'); moveReview(result.job); } else { if (scope === operationScope) deselect(); refreshNotice(type === 'REMOVE' ? 'Selected videos removed. Backup saved in recovery.' : type === 'SORT' ? 'Playlist sorted.' : type === 'FINISH_MOVE' ? 'Move completed. Copies and removals verified.' : 'Videos saved to the playlist.'); } return result; }
    finally { working = false; syncRows(); }
  }
  async function transferDialog(kind) {
    if (kind === 'move') selectionArgs();
    const selection = [...selected.values()]; if (!selection.length) return;
    const capturedScope = scope, args = exactSelection() ? selectionArgs() : null;
    const body = dialog(kind === 'move' ? `Move ${selection.length} videos` : `Save ${selection.length} videos to playlist`);
    body.append(element('p', kind === 'move' ? 'Copies are verified first. You review removal of the originals in a separate step.' : 'Adds copies to the destination playlist.'));
    const label = element('label', 'Playlist'); label.htmlFor = 'yt-select-destination'; const select = element('select'); select.id = label.htmlFor; select.append(element('option', 'Loading your playlists…')); select.disabled = true; body.append(label, select);
    const label2 = element('label', 'Or paste a playlist URL'); label2.htmlFor = 'yt-playlist-url'; const input = element('input'); input.id = label2.htmlFor; input.placeholder = 'https://www.youtube.com/playlist?list=…'; body.append(label2, input);
    listVideos(body, selection);
    footer(body, kind === 'move' ? 'Copy, then review removal' : 'Save copies', async () => {
      if (scope !== capturedScope) throw new Error('The page changed. Close this dialog and select videos again.');
      const targetId = targetPlaylist(input.value.trim() || select.value); if (!targetId) throw new Error('Choose a destination playlist.');
      if (targetId === playlistId()) throw new Error('Choose a different playlist.');
      if (args) await operation('TRANSFER', { ...args, kind, targetId });
      else { const saved = await send('QUEUE_LINKS', { items: selection, kind: 'copy' }); await operation('PASTE', { targetId, expectedQueueId: saved.queue.id }); }
    });
    try { const result = await send('PLAYLISTS', { videoId: selection[0].videoId }); if (!body.isConnected) return; select.replaceChildren(); const empty = element('option', 'Choose a playlist'); empty.value = ''; select.append(empty); for (const item of [...(result.playlists || [])].sort((a, b) => (a.title || '').localeCompare(b.title || ''))) { if ((item.id || item.playlistId) === playlistId()) continue; const option = element('option', item.title); option.value = item.id || item.playlistId; select.append(option); } select.disabled = false; }
    catch { if (body.isConnected) { select.replaceChildren(element('option', 'Paste a playlist URL below')); select.disabled = true; } }
  }
  function targetPlaylist(value) { try { return new URL(value).searchParams.get('list'); } catch { return /^(WL|LL|PL[A-Za-z0-9_-]+|UU[A-Za-z0-9_-]+|OLAK5uy_[A-Za-z0-9_-]+)$/.test(value) ? value : null; } }
  async function pasteDialog() {
    const targetId = playlistId(), capturedScope = scope, status = await send('STATUS');
    if (scope !== capturedScope) return;
    if (!status.queue?.items.length) throw new Error('No saved selection. Select videos and choose Copy or Cut first.');
    const body = dialog(`Paste ${status.queue.items.length} videos`); body.append(element('p', `Destination: ${snapshot?.title || targetId}`));
    if (status.queue.kind === 'move') body.append(element('p', 'Copies are verified first. Originals stay until you confirm their removal.'));
    listVideos(body, status.queue.items);
    footer(body, 'Paste copies', async () => { if (scope !== capturedScope) throw new Error('The destination page changed.'); await operation('PASTE', { targetId, expectedQueueId: status.queue.id }); });
  }
  function removeDialog() {
    const args = selectionArgs(), items = [...selected.values()], body = dialog(`Remove ${items.length} videos from this list?`);
    body.append(element('p', 'Only these selected entries will be removed. A playlist backup is saved in recovery before the first change.')); listVideos(body, items);
    footer(body, `Remove ${items.length} videos`, () => operation('REMOVE', args), true);
  }
  function moveReview(job) {
    const body = dialog('Copies verified. Remove originals?');
    const remaining = job.items.filter(item => !job.removed?.includes(item.setVideoId));
    body.append(element('p', `${job.items.length} videos were copied to the destination playlist. These ${remaining.length} original entries are still in the source playlist.`)); listVideos(body, remaining);
    const foot = footer(body, `Remove ${remaining.length} originals`, async () => { await operation('FINISH_MOVE', { jobId: job.id }); }, true);
    foot.firstChild.textContent = 'Keep originals';
  }
  function sortDialog() {
    const body = dialog('Sort this playlist'), id = snapshot?.playlistId, expectedFingerprint = snapshot?.fingerprint, keys = snapshot.items.map(item => item.setVideoId);
    body.append(element('p', `Sorts every video in ${snapshot?.title || 'this playlist'}. A backup is saved before changes.`));
    const label = element('label', 'Sort by'), by = element('select'); for (const [value, text] of [['title', 'Title'], ['channel', 'Channel'], ['duration', 'Duration']]) { const option = element('option', text); option.value = value; by.append(option); } body.append(label, by);
    const descendingLabel = element('label', '', 'checklabel'), descending = element('input'); descending.type = 'checkbox'; descendingLabel.append(descending, document.createTextNode('Descending order')); body.append(descendingLabel);
    footer(body, 'Sort playlist', () => operation('SORT', { playlistId: id, keys, sortBy: by.value, descending: descending.checked, expectedFingerprint }));
  }
  async function recoveryDialog() {
    const status = await send('STATUS'), body = dialog('Saved selections & recovery');
    body.append(element('p', 'Your saved videos and playlist backups stay available when you close or reload YouTube.', 'note'));
    const render = (job, current = false) => {
      const card = element('div', '', 'saved'), items = job.items || [], actions = element('div', '', 'saved-actions');
      card.append(element('strong', `${job.kind === 'move' ? 'Move' : job.kind === 'remove' ? 'Removal' : job.kind === 'sort' ? 'Sort' : 'Copy'} · ${items.length} videos`));
      card.append(element('small', current ? job.phase === 'ready_to_remove' ? 'Copies verified. Originals kept.' : status.busy ? 'A step is running.' : 'Stopped before completion. Review the saved videos.' : `Saved ${new Date(job.createdAt || job.savedAt || Date.now()).toLocaleString()}`));
      if (job.error) card.append(element('p', job.error, 'error note'));
      actions.append(button('Copy links', () => copyLinks(items)), button('Save links', () => download('saved-video-links.txt', links(items), 'text/plain')));
      if (job.sourceBefore) actions.append(button('Download backup', () => download(`playlist-${job.sourceId || job.sourceBefore.playlistId}.json`, JSON.stringify(job.sourceBefore, null, 2))));
      if (current && job.phase === 'ready_to_remove') actions.append(button('Review removal', () => moveReview(job)));
      if (current) { const stop = button('Keep remaining originals', async () => { await send('DISMISS'); await recoveryDialog(); }); stop.disabled = status.busy; actions.append(stop); }
      card.append(actions); body.append(card);
    };
    if (status.activeJob) render(status.activeJob, true);
    if (status.queue) render(status.queue);
    for (const job of status.history || []) render(job);
    if (!status.activeJob && !status.queue && !status.history?.length) body.append(element('p', 'No saved operations yet.'));
    footer(body);
  }

  const actions = { close: () => toggle(false), all: selectAll, clear: deselect, links: copyLinks, menu: () => showMenu(menu.hidden) };
  root.addEventListener('click', event => { const action = event.target.closest?.('[data-action]')?.dataset.action; if (action) Promise.resolve().then(actions[action]).catch(report); });
  backdrop.addEventListener('click', event => { if (event.target === backdrop) closeDialog(); });
  document.addEventListener('click', event => { if (!event.composedPath().includes(host)) showMenu(false); });
  document.addEventListener('keydown', event => {
    if (!backdrop.hidden) {
      if (event.key === 'Escape') { event.preventDefault(); closeDialog(); return; }
      if (event.key === 'Tab') { const nodes = [...backdrop.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea')]; if (!nodes.length) return; const first = nodes[0], last = nodes[nodes.length - 1], active = root.activeElement; if (event.shiftKey && (active === first || !nodes.includes(active))) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && (active === last || !nodes.includes(active))) { event.preventDefault(); first.focus(); } }
      return;
    }
    if (!enabled || working || event.composedPath().some(node => node instanceof Element && (node.matches('input,textarea,select') || node.isContentEditable))) return;
    if (event.key === 'Escape') { showMenu(false); return; }
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase(), handler = key === 'c' && selected.size ? () => queueSelection('copy') : key === 'x' && exactSelection() && snapshot.editable ? cutDialog : key === 'v' && playlistId() ? pasteDialog : key === 'a' ? selectAll : null;
    if (handler) { event.preventDefault(); Promise.resolve().then(handler).catch(report); }
  });
  new MutationObserver(mutations => {
    if (mutations.every(mutation => mutation.target === host || mutation.target === toggleButton || mutation.target.closest?.('#yt-multiselect-toggle') || [...mutation.addedNodes, ...mutation.removedNodes].every(node => node.nodeType !== 1 || node.classList?.contains('yt-multiselect-checkbox')))) return;
    clearTimeout(timer); timer = setTimeout(scan, 120);
  }).observe(document.body || document.documentElement, { childList: true, subtree: true });
  document.addEventListener('yt-navigate-finish', () => { closeDialog(); scan(); });
  chrome.runtime.onMessage?.addListener(message => { if (message.type === 'TOGGLE') toggle(!enabled); });
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local' || !changes.activeJob?.newValue || !enabled) return;
    const job = changes.activeJob.newValue;
    if (job.phase === 'copying') announce(`Copying ${job.copied?.length || 0} / ${job.items.length} videos… Originals kept.`);
    if (job.phase === 'interrupted') announce('Operation stopped. Saved videos and backups are in recovery.');
  });
  scan();
})();
