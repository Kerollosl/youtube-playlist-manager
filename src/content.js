(() => {
  'use strict';
  if (document.getElementById('yt-multiselect-tools')) return;
  const ROWS = 'ytd-playlist-video-renderer,ytd-playlist-panel-video-renderer,ytd-video-renderer,ytd-rich-item-renderer,ytd-grid-video-renderer';
  const host = document.createElement('div');
  host.id = 'yt-multiselect-tools';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host{font-family:Roboto,Arial,sans-serif;font-size:14px;line-height:1.5;color:var(--text);--surface:#fff;--text:#0f0f0f;--line:#e0e0e0;--hover:#f2f2f2;--muted:#606060;--blue:#065fd4;--primary-text:#fff;--danger:#b3261e;--selection:#d9e8fc;color-scheme:light;--toolbar-z:2200;--notice-z:2201;--dialog-z:2300}
    :host([data-theme=dark]){--surface:#212121;--text:#f1f1f1;--line:#464646;--hover:#383838;--muted:#b6b6b6;--blue:#3ea6ff;--primary-text:#0f0f0f;--danger:#ffb4ab;--selection:#173d5c;color-scheme:dark}
    *{box-sizing:border-box}[hidden]{display:none!important}::selection{background:var(--selection)}button,input,select,textarea{font:inherit;caret-color:var(--blue)}button{min-height:44px;border:0;background:transparent;color:inherit;cursor:pointer;transition:background-color 160ms,color 160ms}button:disabled{opacity:.45;cursor:default}button:hover:not(:disabled){background:var(--hover)}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible{outline:2px solid var(--blue);outline-offset:2px}button svg{width:20px;height:20px;fill:currentColor;flex-shrink:0}.icon{display:flex;align-items:center;justify-content:center;width:44px;height:44px;padding:0;border-radius:50%;flex-shrink:0}.text{border-radius:22px;padding:10px 16px;font-weight:500}.primary{background:var(--blue);color:var(--primary-text)}.primary:hover:not(:disabled){filter:brightness(.92);background:var(--blue)}.danger{color:var(--danger)}
    .bar{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:var(--toolbar-z);display:flex;align-items:center;gap:4px;height:56px;background:var(--surface);border-radius:16px;padding:6px;box-shadow:0 4px 20px #0004;max-width:calc(100vw - 24px);white-space:nowrap}.count{padding:0 12px;font-weight:500;min-width:116px;font-variant-numeric:tabular-nums}.count small{color:var(--muted);font-size:inherit;font-weight:400}.divider{width:1px;height:24px;background:var(--line);margin:0 4px}.copy,.save{display:flex;align-items:center;justify-content:center;gap:8px}.save{color:var(--blue)}.menu{position:absolute;bottom:calc(100% + 10px);right:0;width:280px;max-width:calc(100vw - 24px);max-height:min(70vh,540px);overflow:auto;background:var(--surface);border-radius:12px;padding:8px 0;box-shadow:0 4px 24px #0005}.menu button{display:flex;align-items:center;width:100%;text-align:left;padding:10px 20px;border-radius:0;font-weight:400}.menu-label{display:block;padding:10px 20px 4px;font-size:12px;color:var(--muted);font-weight:500}.menu hr{border:0;border-top:1px solid var(--line);margin:8px 0}.toast{position:fixed;bottom:88px;left:50%;transform:translateX(-50%);z-index:var(--notice-z);border-radius:12px;background:var(--surface);box-shadow:0 3px 16px #0004;padding:8px 12px 8px 16px;max-width:min(420px,calc(100vw - 24px));display:flex;gap:8px;align-items:center;white-space:normal}.toast-message{flex:1;min-width:0;line-height:1.45}.toast button{color:var(--blue);flex-shrink:0;padding:8px 12px}
    .backdrop{position:fixed;inset:0;z-index:var(--dialog-z);background:#0009;display:flex;align-items:center;justify-content:center;padding:20px}.dialog{background:var(--surface);border-radius:16px;width:480px;max-width:100%;max-height:85vh;overflow:auto;box-shadow:0 8px 32px #0005;padding:0 24px 20px;overflow-wrap:anywhere}.dialog-header{display:flex;align-items:center;gap:12px;justify-content:space-between;padding:12px 0;margin-bottom:4px;position:sticky;top:0;background:var(--surface);z-index:1}.dialog h2{font-size:20px;line-height:1.3;margin:0;font-weight:500}.dialog p{line-height:1.5;margin:12px 0;color:var(--muted)}.dialog label{display:block;margin:18px 0 6px;font-weight:500}.dialog input:not([type=checkbox]),.dialog select,.dialog textarea{width:100%;min-height:44px;border:1px solid var(--line);border-radius:8px;padding:10px 12px;background:transparent;color:inherit}.dialog input::placeholder{color:var(--muted)}.dialog select option{background:var(--surface);color:var(--text)}.dialog textarea{min-height:160px;resize:vertical;line-height:1.5}.footer{display:flex;gap:8px;justify-content:flex-end;margin-top:24px;padding-top:12px;border-top:1px solid var(--line);flex-wrap:wrap}.videos{max-height:168px;overflow:auto;margin:16px 0 0;padding:0;list-style:none;font-size:14px;border-top:1px solid var(--line)}.videos li{padding:9px 0;border-bottom:1px solid var(--line);line-height:1.4}.saved{padding:16px 0;border-bottom:1px solid var(--line)}.saved strong{font-weight:500}.saved small{display:block;color:var(--muted);margin:5px 0}.saved-actions{display:flex;gap:4px;flex-wrap:wrap}.error{color:var(--danger)!important}.note{font-size:13px}.checklabel{display:flex!important;gap:8px;align-items:center;min-height:44px}.checklabel input{accent-color:var(--blue);width:20px;height:20px}.diagnostics{margin-top:16px}.diagnostics summary{cursor:pointer;min-height:44px;display:flex;align-items:center;color:var(--blue);font-weight:500}.diagnostics textarea{font:12px/1.5 monospace;max-height:240px}.error-copy{white-space:pre-wrap}
    :host([data-menu-open]) .toast{visibility:hidden}
    @media(max-width:560px){.bar{bottom:12px;gap:0;max-width:calc(100vw - 16px);padding:6px 4px}.count{min-width:0;padding:0 8px;font-size:13px}.count small{display:none}.divider{margin:0 2px}.copy{width:44px;height:44px;padding:0;gap:0}.copy span{display:none}.dialog{padding:0 20px 16px}.backdrop{padding:12px}.toast{bottom:78px;font-size:14px}.dialog-header{padding:10px 0}.footer{gap:4px}.menu{right:0}}
    @media(max-width:340px){.bar .copy{display:none}.count{padding:0 6px;font-size:12px}}
    @media(prefers-reduced-motion:reduce){button{transition:none}}
  </style>
  <div class="bar" role="toolbar" aria-label="Selected videos" hidden>
    <span class="count" aria-live="polite">0 selected</span><span class="divider" aria-hidden="true"></span>
    <button class="text copy primary" data-action="links" title="Copy selected video links as plain text" aria-label="Copy links">${svg('link')}<span>Copy links</span></button>
    <button class="icon" data-action="all" title="Select all" aria-label="Select all">${svg('all')}</button>
    <button class="icon" data-action="clear" title="Deselect all" aria-label="Deselect all">${svg('clear')}</button>
    <button class="icon" data-action="menu" title="More actions" aria-label="More actions" aria-haspopup="menu" aria-expanded="false">${svg('more')}</button>
    <button class="icon" data-action="close" title="Close selection" aria-label="Close selection">${svg('close')}</button>
    <div class="menu" role="menu" aria-label="Selection actions" hidden></div>
  </div><div class="toast" role="status" hidden></div><div class="backdrop" hidden></div>`;
  document.documentElement.append(host);
  function syncTheme() { host.dataset.theme = document.documentElement.hasAttribute('dark') ? 'dark' : 'light'; }
  syncTheme();
  new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['dark'] });
  const pageStyle = document.createElement('style');
  pageStyle.textContent = `#yt-multiselect-toggle{display:inline-flex;align-items:center;justify-content:center;flex:0 0 44px;width:44px;height:44px;margin:0 4px;border:0;border-radius:50%;background:transparent;color:#065fd4;cursor:pointer}html[dark] #yt-multiselect-toggle{color:#3ea6ff}#yt-multiselect-toggle:hover{background:var(--yt-spec-10-percent-layer,#e5e5e5)}#yt-multiselect-toggle[aria-pressed=true]{background:var(--yt-spec-badge-chip-background,#e5e5e5)}#yt-multiselect-toggle:focus-visible{outline:2px solid currentColor;outline-offset:2px}#yt-multiselect-toggle svg{width:24px;height:24px;fill:currentColor}.yt-multiselect-row{position:relative!important}.yt-multiselect-enabled,.yt-multiselect-enabled *{cursor:pointer!important}.yt-multiselect-checkbox[hidden]{display:none!important}.yt-multiselect-checkbox{appearance:none!important;position:absolute!important;right:0;bottom:0;width:44px;height:44px;z-index:10;cursor:pointer;margin:0;border:0!important;border-radius:6px 0 12px 0;background:transparent!important;background-repeat:no-repeat!important;background-position:center!important;background-size:28px 28px!important;opacity:0}.yt-multiselect-checkbox:checked{opacity:1;background-color:#065fd4!important;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='m4 12 5 5L20 6' fill='none' stroke='white' stroke-width='3'/%3E%3C/svg%3E")!important}html[dark] .yt-multiselect-checkbox:checked{background-color:#3ea6ff!important;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='m4 12 5 5L20 6' fill='none' stroke='%230f0f0f' stroke-width='3'/%3E%3C/svg%3E")!important}.yt-multiselect-checkbox:focus-visible{opacity:1;outline:2px solid #065fd4;outline-offset:-3px}html[dark] .yt-multiselect-checkbox:focus-visible{outline-color:#3ea6ff}.yt-multiselect-row:has(.yt-multiselect-checkbox:focus-visible){outline:2px solid #065fd4;outline-offset:-2px}html[dark] .yt-multiselect-row:has(.yt-multiselect-checkbox:focus-visible){outline-color:#3ea6ff}.yt-multiselect-checkbox:disabled{cursor:default}.yt-multiselect-enabled:hover{background-color:rgba(6,95,212,.08)!important}.yt-multiselect-row.yt-multiselect-chosen{background-color:#d5e5fb!important}html[dark] .yt-multiselect-enabled:hover{background-color:rgba(62,166,255,.12)!important}html[dark] .yt-multiselect-row.yt-multiselect-chosen{background-color:#254f70!important}`;
  document.documentElement.append(pageStyle);
  const bar = root.querySelector('.bar'), menu = root.querySelector('.menu'), backdrop = root.querySelector('.backdrop');
  const selected = new Map(), rowBoxes = new WeakMap();
  let enabled = false, scope = navigationScope(), snapshot = null, toggleButton, timer, toastTimer, lastAnchor = null, working = false, readPending = false, needsReload = false, dialogFocus;

  function svg(name) {
    if (name === 'more') return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="12" cy="19" r="2"></circle></svg>';
    const paths = { close: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4Z', all: 'M3 3h18v18H3V3Zm2 2v14h14V5H5Zm2 6 3 3 7-7 1.4 1.4L10 16.8 5.6 12.4 7 11Z', clear: 'M3 3h18v18H3V3Zm2 2v14h14V5H5Z', link: 'M10 7H7a5 5 0 0 0 0 10h3v-2H7a3 3 0 0 1 0-6h3V7Zm4 0v2h3a3 3 0 0 1 0 6h-3v2h3a5 5 0 0 0 0-10h-3Zm-6 4h8v2H8v-2Z', more: 'M12 5a2 2 0 1 0 0 .01Zm0 7a2 2 0 1 0 0 .01Zm0 7a2 2 0 1 0 0 .01Z', save: 'M3 5h12v2H3V5Zm0 6h12v2H3v-2Zm0 6h8v2H3v-2Zm16-4v4h4v2h-4v4h-2v-4h-4v-2h4v-4h2Z', toggle: 'M3 4h4v4H3V4Zm7 0h11v2H10V4ZM3 10h4v4H3v-4Zm7 0h11v2H10v-2ZM3 16h4v4H3v-4Zm7 0h11v2H10v-2Z' };
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]}"></path></svg>`;
  }
  function element(tag, text, className) { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; }
  function button(text, action, className = 'text') { const node = element('button', text, className); node.type = 'button'; node.addEventListener('click', () => Promise.resolve().then(action).catch(report)); return node; }
  function playlistId() { return new URL(location.href).searchParams.get('list'); }
  function navigationScope() { const url = new URL(location.href); return url.searchParams.get('list') ? `playlist:${url.searchParams.get('list')}` : `${url.pathname}?${url.searchParams.toString()}`; }
  function validVideo(item) { return /^[A-Za-z0-9_-]{11}$/.test(item?.videoId || ''); }
  function links(items = [...selected.values()]) { return items.filter(validVideo).map(item => `https://www.youtube.com/watch?v=${item.videoId}`).join('\n'); }
  function notice(text, actionText, action, persistent = false) {
    const toast = root.querySelector('.toast'); toast.replaceChildren(element('span', text, 'toast-message'));
    if (actionText) toast.append(button(actionText, action));
    toast.hidden = !text; clearTimeout(toastTimer);
    if (!persistent) toastTimer = setTimeout(() => { toast.hidden = true; }, 6500);
  }
  function messageDialog(title, text) { const body = dialog(title); body.append(element('p', text, 'error-copy')); if (/saved operation before starting another/i.test(text)) body.append(button('Review saved operation', recoveryDialog)); else if (playlistId()) body.append(button('Check playlist reader', readerDialog)); footer(body); }
  function announce(text) { const full = String(text || ''); notice(full.length > 140 ? `${full.slice(0, 110).trim()}…` : full, full.length > 140 ? 'Details' : null, () => messageDialog('Operation details', full)); }
  function refreshNotice(text) { notice(text, 'Refresh', () => location.reload(), true); }
  function report(error) { if (/saved operation before starting another/i.test(error?.message || '')) { notice('A stopped operation needs review.', 'Review', recoveryDialog, true); return; } if (error?.refreshPage) { refreshNotice(error.message); return; } const full = error?.message || String(error); notice('Couldn’t complete this step.', 'Details', () => messageDialog('Couldn’t complete this step', full), true); }
  async function send(type, values = {}) {
    const disconnected = () => Object.assign(new Error('Extension updated. Refresh YouTube to reconnect.'), { refreshPage: true });
    if (typeof chrome === 'undefined' || typeof chrome.runtime?.sendMessage !== 'function') throw disconnected();
    let result;
    try { result = await chrome.runtime.sendMessage({ type, ...values }); }
    catch (error) { if (/extension context invalidated/i.test(error.message || '')) throw disconnected(); throw error; }
    if (!result?.ok) throw new Error(result?.error || 'Could not reach playlist tools. Reload YouTube and try again.');
    return result;
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
      if (index !== null) { const atIndex = snapshot.items.find(item => item.index === index); if (atIndex?.videoId === videoId) exact = atIndex; }
      else { const matches = snapshot.items.filter(item => item.videoId === videoId); if (matches.length === 1) exact = matches[0]; }
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
    const count = snapshot?.complete && snapshot.playlistId === playlistId() ? snapshot.items.length : loadedRows().length;
    const label = root.querySelector('.count');
    label.replaceChildren(document.createTextNode(`${selected.size}`), element('small', ` / ${count}`), document.createTextNode(' selected'));
    label.title = `${selected.size} of ${count} ${snapshot?.complete ? 'playlist' : 'loaded'} videos selected`;
    root.querySelector('[data-action="links"]').disabled = !selected.size || working;
    root.querySelector('[data-action="all"]').disabled = working || !count;
    root.querySelector('[data-action="clear"]').disabled = working || !selected.size;
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
    const entries = loadedRows(), currentRows = new Set(entries.map(entry => entry.row));
    for (const row of document.querySelectorAll('.yt-multiselect-row')) if (!currentRows.has(row)) { row.classList.remove('yt-multiselect-enabled', 'yt-multiselect-chosen'); const box = rowBoxes.get(row); if (box) box.hidden = true; }
    for (const { row, item } of entries) {
      let checkbox = rowBoxes.get(row);
      if (!checkbox?.isConnected) {
        checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'yt-multiselect-checkbox'; row.classList.add('yt-multiselect-row'); row.append(checkbox); rowBoxes.set(row, checkbox);
        row.addEventListener('click', event => {
          if (!enabled) return;
          if (event.target !== checkbox) event.preventDefault();
          event.stopImmediatePropagation();
          const current = info(row); if (!current || working) return;
          const choose = !selected.has(current.key), entries = loadedRows();
          const from = entries.findIndex(entry => entry.item.key === lastAnchor), to = entries.findIndex(entry => entry.row === row);
          const range = event.shiftKey && from >= 0 ? entries.slice(Math.min(from, to), Math.max(from, to) + 1) : [{ item: current }];
          for (const entry of range) { if (choose) selected.set(entry.item.key, entry.item); else selected.delete(entry.item.key); }
          lastAnchor = current.key; syncRows();
        }, true);
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
    try { const result = await send('READ', { playlistId: id, pickerVideoId: loadedRows().map(entry => entry.item).find(validVideo)?.videoId }); if (scope !== capturedScope) return; snapshot = result; reconcileSnapshot(); scan(); if (!result.complete) notice('Playlist editing is unavailable.', 'Details', () => messageDialog('Playlist editing is unavailable', (result.warnings || []).join('\n') || 'The complete playlist could not be verified. Copy links remains available.'), true); }
    catch (error) { if (scope === capturedScope) report(error); }
    finally { readPending = false; if (enabled && scope !== capturedScope && playlistId()) readPlaylist(); }
  }
  function toggle(value) { enabled = value; bar.hidden = !value; if (!value) { showMenu(false); closeDialog(); } scan(); if (value && !snapshot) readPlaylist(); }
  function selectAll() { const items = snapshot?.complete ? snapshot.items.filter(validVideo).map(canonical) : loadedRows().map(entry => entry.item); for (const item of items) selected.set(item.key, item); syncRows(); }
  function deselect() { selected.clear(); lastAnchor = null; syncRows(); }
  function showMenu(value, focus = true) {
    const trigger = root.querySelector('[data-action="menu"]'); host.toggleAttribute('data-menu-open', value); menu.hidden = !value; trigger.setAttribute('aria-expanded', String(value));
    if (value) { buildMenu(); if (focus) menu.querySelector('button:not(:disabled)')?.focus(); }
  }
  function buildMenu() {
    const focusedText = menu.contains(root.activeElement) ? root.activeElement?.textContent : null;
    menu.replaceChildren();
    const add = (text, handler, disabled = false) => { const node = button(text, () => { showMenu(false); return handler(); }); node.setAttribute('role', 'menuitem'); node.disabled = disabled || working; menu.append(node); };
    add('Cut', cutDialog, !exactSelection() || !snapshot?.editable);
    add('Copy', () => queueSelection('copy'), !selected.size);
    add('Save to playlist', saveDialog);
    add('Copy links', () => copyLinks(), !selected.size);
    if (focusedText) [...menu.querySelectorAll('button')].find(node => node.textContent === focusedText && !node.disabled)?.focus();
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
  function listVideos(body, items) { const list = element('ol', '', 'videos'); for (const item of items) list.append(element('li', item.title || item.videoId)); body.append(list); }
  async function queueSelection(kind) {
    if (!selected.size) throw new Error('Select videos first.');
    const result = exactSelection() ? await send('QUEUE', { ...selectionArgs(), kind }) : kind === 'copy' ? await send('QUEUE_LINKS', { items: [...selected.values()], kind }) : (() => { throw new Error('Open an editable playlist before cutting.'); })();
    deselect(); announce(`${result.queue?.items.length || 0} videos saved. ${kind === 'move' ? 'Originals stay until copies are verified and you confirm removal.' : 'Choose Save to playlist when you’re ready.'}`); return result;
  }
  function cutDialog() {
    const args = selectionArgs(), body = dialog(`Cut ${selected.size} videos`), count = selected.size;
    body.append(element('p', 'Your selection is saved before moving. Original videos stay in this playlist until the destination copies are verified and you confirm removal.'));
    listVideos(body, [...selected.values()]);
    footer(body, 'Save cut selection', async () => { await send('QUEUE', { ...args, kind: 'move' }); closeDialog(); deselect(); announce(`${count} videos saved for moving. Choose Save to playlist to pick the destination.`); });
  }
  async function operation(type, args) {
    if (working) throw new Error('Wait for the current step to finish.');
    const operationScope = scope; working = true; closeDialog(); showMenu(false); syncRows(); announce('Working… Your selection is saved.');
    try { const result = await send(type, args); if (result.job?.phase === 'completed' && ['REMOVE', 'SORT', 'FINISH_MOVE'].includes(type) && result.job.sourceId === playlistId()) { snapshot = null; needsReload = true; } if (result.job?.phase === 'ready_to_remove') { announce('Destination copies verified. Originals are still in place.'); moveReview(result.job); } else { if (scope === operationScope) deselect(); refreshNotice(type === 'REMOVE' ? 'Selected videos removed. Backup saved in recovery.' : type === 'SORT' ? 'Playlist sorted.' : type === 'FINISH_MOVE' ? 'Move completed. Copies and removals verified.' : 'Videos saved to the playlist.'); } return result; }
    finally { working = false; syncRows(); }
  }
  async function transferDialog(kind, savedQueue = null) {
    if (kind === 'move' && !savedQueue) selectionArgs();
    const selection = savedQueue ? [...savedQueue.items] : [...selected.values()]; if (!selection.length) return;
    const capturedScope = scope, sourceId = savedQueue ? savedQueue.sourceId : playlistId(), args = !savedQueue && exactSelection() ? selectionArgs() : null;
    const body = dialog(kind === 'move' ? `Move ${selection.length} videos` : `Save ${selection.length} videos to playlist`);
    body.append(element('p', kind === 'move' ? 'Copies are verified first. You review removal of the originals in a separate step.' : 'Adds copies to the destination playlist.'));
    const label = element('label', 'Playlist'); label.htmlFor = 'yt-select-destination'; const select = element('select'); select.id = label.htmlFor; select.append(element('option', 'Loading your playlists…')); select.disabled = true; body.append(label, select);
    const label2 = element('label', 'Or paste a playlist URL'); label2.htmlFor = 'yt-playlist-url'; const input = element('input'); input.id = label2.htmlFor; input.placeholder = 'https://www.youtube.com/playlist?list=…'; body.append(label2, input);
    listVideos(body, selection);
    footer(body, kind === 'move' ? 'Copy, then review removal' : 'Save copies', async () => {
      if (scope !== capturedScope) throw new Error('The page changed. Close this dialog and select videos again.');
      const targetId = targetPlaylist(input.value.trim() || select.value); if (!targetId) throw new Error('Choose a destination playlist.');
      if (targetId === sourceId) throw new Error('Choose a different playlist.');
      if (savedQueue) await operation('PASTE', { targetId, expectedQueueId: savedQueue.id });
      else if (args) await operation('TRANSFER', { ...args, kind, targetId });
      else { const saved = await send('QUEUE_LINKS', { items: selection, kind: 'copy' }); await operation('PASTE', { targetId, expectedQueueId: saved.queue.id }); }
    });
    try { const result = await send('PLAYLISTS', { videoId: selection[0].videoId }); if (!body.isConnected) return; select.replaceChildren(); const empty = element('option', 'Choose a playlist'); empty.value = ''; select.append(empty); for (const item of [...(result.playlists || [])].sort((a, b) => (a.title || '').localeCompare(b.title || ''))) { if ((item.id || item.playlistId) === sourceId) continue; const option = element('option', item.title); option.value = item.id || item.playlistId; select.append(option); } select.disabled = false; }
    catch { if (body.isConnected) { select.replaceChildren(element('option', 'Paste a playlist URL below')); select.disabled = true; } }
  }
  async function saveDialog() {
    const status = await send('STATUS');
    if (status.activeJob) return recoveryDialog();
    if (selected.size) return transferDialog('copy');
    if (!status.queue?.items.length) throw new Error('Select videos or choose Copy or Cut first.');
    return transferDialog(status.queue.kind === 'move' ? 'move' : 'copy', status.queue);
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
  function moveReview(job) {
    const body = dialog('Copies verified. Remove originals?');
    const remaining = job.items.filter(item => !job.removed?.includes(item.setVideoId));
    body.append(element('p', `${job.items.length} videos were copied to the destination playlist. These ${remaining.length} original entries are still in the source playlist.`)); listVideos(body, remaining);
    const foot = footer(body, `Remove ${remaining.length} originals`, async () => { await operation('FINISH_MOVE', { jobId: job.id }); }, true);
    foot.firstChild.textContent = 'Keep originals';
  }
  async function recoveryDialog() {
    const status = await send('STATUS'), body = dialog('Saved selections & recovery');
    body.append(element('p', 'Your saved videos and playlist backups stay available when you close or reload YouTube.', 'note'));
    const render = (job, current = false) => {
      const card = element('div', '', 'saved'), items = job.items || [], actions = element('div', '', 'saved-actions');
      card.append(element('strong', `${job.kind === 'move' ? 'Move' : job.kind === 'remove' ? 'Removal' : job.kind === 'sort' ? 'Sort' : 'Copy'} · ${items.length} videos`));
      card.append(element('small', `Started ${new Date(job.createdAt || job.savedAt || Date.now()).toLocaleString()}`));
      if (job.targetId) card.append(element('small', `Destination: ${job.targetBefore?.title || job.targetId}`));
      card.append(element('small', current ? job.phase === 'ready_to_remove' ? 'Copies verified. Originals kept.' : status.busy ? 'A step is running.' : 'Stopped before completion. Review the saved videos.' : `Saved ${new Date(job.createdAt || job.savedAt || Date.now()).toLocaleString()}`));
      if (job.error) card.append(element('p', job.error, 'error note'));
      actions.append(button('Copy links', () => copyLinks(items)), button('Save links', () => download('saved-video-links.txt', links(items), 'text/plain')));
      if (job.sourceBefore) actions.append(button('Download backup', () => download(`playlist-${job.sourceId || job.sourceBefore.playlistId}.json`, JSON.stringify(job.sourceBefore, null, 2))));
      if (current && job.phase === 'ready_to_remove') actions.append(button('Review removal', () => moveReview(job)));
      if (current) { const stop = button('Keep originals and close operation', async () => { await send('DISMISS'); await recoveryDialog(); }); stop.disabled = status.busy; actions.append(stop); }
      card.append(actions);
      if (current) {
        const details = element('details', '', 'diagnostics'), output = element('textarea');
        output.readOnly = true; output.setAttribute('aria-label', 'Operation diagnostics');
        output.value = JSON.stringify({ version: chrome.runtime.getManifest().version, kind: job.kind, phase: job.phase,
          startedAt: job.createdAt, selectedVideos: items.length, verifiedCopies: job.copied?.length || 0,
          removedOriginals: job.removed?.length || 0, error: job.error,
          pendingAdd: job.intent?.kind === 'add' ? { videoId: job.intent.videoId, beforeCount: job.intent.beforeCount } : null,
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

  const actions = { close: () => toggle(false), all: selectAll, clear: deselect, links: () => copyLinks(), save: saveDialog, menu: () => showMenu(menu.hidden) };
  root.addEventListener('click', event => { const action = event.target.closest?.('[data-action]')?.dataset.action; if (action) Promise.resolve().then(actions[action]).catch(report); });
  backdrop.addEventListener('click', event => { if (event.target === backdrop) closeDialog(); });
  document.addEventListener('click', event => { if (!event.composedPath().includes(host)) showMenu(false); });
  document.addEventListener('keydown', event => {
    if (!backdrop.hidden) {
      if (event.key === 'Escape') { event.preventDefault(); closeDialog(); return; }
      if (event.key === 'Tab') { const nodes = [...backdrop.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea,summary')].filter(node => node.getClientRects().length); if (!nodes.length) return; const first = nodes[0], last = nodes[nodes.length - 1], active = root.activeElement; if (event.shiftKey && (active === first || !nodes.includes(active))) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && (active === last || !nodes.includes(active))) { event.preventDefault(); first.focus(); } }
      return;
    }
    if (!menu.hidden && ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'Escape') { showMenu(false); root.querySelector('[data-action="menu"]').focus(); return; }
      const nodes = [...menu.querySelectorAll('button:not(:disabled)')], at = nodes.indexOf(root.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? nodes.length - 1 : (at + (event.key === 'ArrowUp' ? -1 : 1) + nodes.length) % nodes.length;
      nodes[next]?.focus(); return;
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
    if (job.phase === 'interrupted') notice('Operation stopped. Your videos are saved.', 'Review', recoveryDialog, true);
  });
  scan();
})();
