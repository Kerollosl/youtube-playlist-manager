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
    *{box-sizing:border-box}[hidden]{display:none!important}::selection{background:var(--selection)}button,input,select,textarea{font:inherit;caret-color:var(--blue)}button{min-height:44px;border:0;background:transparent;color:inherit;cursor:pointer;transition:background-color 160ms,color 160ms}button:disabled{opacity:.45;cursor:default}button:hover:not(:disabled){background:var(--hover)}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible{outline:2px solid var(--blue);outline-offset:2px}button svg{width:20px;height:20px;fill:currentColor;flex-shrink:0}.icon{display:flex;align-items:center;justify-content:center;width:44px;height:44px;padding:0;border-radius:50%;flex-shrink:0;position:relative}.icon.has-status::after{content:"";position:absolute;right:5px;top:5px;width:8px;height:8px;border-radius:50%;background:var(--blue);box-shadow:0 0 0 2px var(--surface)}.text{border-radius:22px;padding:10px 16px;font-weight:500}.primary{background:var(--blue);color:var(--primary-text)}.primary:hover:not(:disabled){filter:brightness(.92);background:var(--blue)}.danger{color:var(--danger)}
    .bar{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:var(--toolbar-z);display:flex;align-items:center;gap:4px;height:56px;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:6px;box-shadow:0 6px 24px #0004;max-width:calc(100vw - 24px);white-space:nowrap;overflow:visible}.bar[aria-busy=true]::before{content:"";position:absolute;top:-1px;left:14px;width:32%;height:2px;border-radius:2px;background:var(--blue);animation:working 1.1s ease-in-out infinite}.count{padding:0 12px;font-weight:500;min-width:116px;font-variant-numeric:tabular-nums}.count small{color:var(--muted);font-size:inherit;font-weight:400}.divider{width:1px;height:24px;background:var(--line);margin:0 4px}.copy,.save{display:flex;align-items:center;justify-content:center;gap:8px}.save{color:var(--blue)}.menu{position:absolute;bottom:calc(100% + 10px);right:0;width:264px;max-width:calc(100vw - 24px);max-height:min(76vh,560px);overflow:auto;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:6px 0;box-shadow:0 8px 28px #0005}.menu button{display:flex;align-items:center;gap:13px;width:100%;text-align:left;padding:6px 16px;border-radius:0;font-weight:400;min-height:44px}.menu button>svg{width:20px;height:20px}.menu-copy{display:flex;min-width:0}.menu-copy strong{font-weight:500;line-height:1.3;overflow:hidden;text-overflow:ellipsis}.menu-label{display:block;padding:9px 16px 3px;font-size:11px;color:var(--muted);font-weight:500;text-transform:uppercase;letter-spacing:.05em}.menu hr{border:0;border-top:1px solid var(--line);margin:6px 0}.menu .compact-only{display:none}.toast{position:fixed;bottom:88px;left:50%;transform:translateX(-50%);z-index:var(--notice-z);border:1px solid var(--line);border-radius:12px;background:var(--surface);box-shadow:0 4px 18px #0004;padding:8px 12px 8px 16px;max-width:min(460px,calc(100vw - 24px));display:flex;gap:8px;align-items:center;white-space:normal}.toast[data-tone=error]{border-color:color-mix(in srgb,var(--danger) 48%,var(--line))}.toast-message{flex:1;min-width:0;line-height:1.45}.toast button{color:var(--blue);flex-shrink:0;padding:8px 12px}
    .backdrop{position:fixed;inset:0;z-index:var(--dialog-z);background:#0009;display:flex;align-items:center;justify-content:center;padding:20px}.dialog{background:var(--surface);border-radius:16px;width:480px;max-width:100%;max-height:85vh;overflow:auto;box-shadow:0 8px 32px #0005;padding:0 24px 20px;overflow-wrap:anywhere}.dialog-header{display:flex;align-items:center;gap:12px;justify-content:space-between;padding:12px 0;margin-bottom:4px;position:sticky;top:0;background:var(--surface);z-index:1}.dialog h2{font-size:20px;line-height:1.3;margin:0;font-weight:500}.dialog p{line-height:1.5;margin:12px 0;color:var(--muted)}.dialog label{display:block;margin:18px 0 6px;font-weight:500}.dialog input:not([type=checkbox]),.dialog select,.dialog textarea{width:100%;min-height:44px;border:1px solid var(--line);border-radius:8px;padding:10px 12px;background:transparent;color:inherit}.dialog input::placeholder{color:var(--muted)}.dialog select option{background:var(--surface);color:var(--text)}.dialog textarea{min-height:160px;resize:vertical;line-height:1.5}.footer{display:flex;gap:8px;justify-content:flex-end;margin-top:24px;padding-top:12px;border-top:1px solid var(--line);flex-wrap:wrap}.videos{max-height:168px;overflow:auto;margin:16px 0 0;padding:0;list-style:none;font-size:14px;border-top:1px solid var(--line)}.videos li{padding:9px 0;border-bottom:1px solid var(--line);line-height:1.4}.saved{padding:16px 0;border-bottom:1px solid var(--line)}.saved strong{font-weight:500}.saved small{display:block;color:var(--muted);margin:5px 0}.saved-actions{display:flex;gap:4px;flex-wrap:wrap}.error{color:var(--danger)!important}.note{font-size:13px}.checklabel{display:flex!important;gap:8px;align-items:center;min-height:44px}.checklabel input{accent-color:var(--blue);width:20px;height:20px}.diagnostics{margin-top:16px}.diagnostics summary{cursor:pointer;min-height:44px;display:flex;align-items:center;color:var(--blue);font-weight:500}.diagnostics textarea{font:12px/1.5 monospace;max-height:240px}.error-copy{white-space:pre-wrap}
    .panel{position:absolute;bottom:calc(100% + 10px);right:0;width:320px;max-width:calc(100vw - 24px);max-height:65vh;overflow:auto;background:var(--surface);border-radius:12px;padding:12px;box-shadow:0 4px 24px #0005;white-space:normal}.panel h2{font-size:16px;margin:0;font-weight:500}.panel .dialog-header{padding:0;margin:0}.panel p{color:var(--muted);margin:8px 4px}.panel input{width:100%;min-height:44px;padding:10px;border:1px solid var(--line);border-radius:8px;background:transparent;color:inherit}.panel .choices{max-height:230px;overflow:auto;margin-top:8px}.panel .choices button{display:block;text-align:left;width:100%;border-radius:8px;padding:10px 12px}.panel .footer{margin-top:12px;padding-top:8px}.panel summary{cursor:pointer;padding:10px 4px;color:var(--muted)}
    :host([data-menu-open]) .toast,:host([data-panel-open]) .toast{visibility:hidden}
    @media(max-width:560px){.bar{bottom:12px;gap:0;max-width:calc(100vw - 16px);padding:6px 4px}.count{min-width:0;padding:0 8px;font-size:13px}.count small{display:none}.divider{margin:0 2px}.copy{width:44px;height:44px;padding:0;gap:0}.copy span{display:none}.dialog{padding:0 20px 16px}.backdrop{padding:12px}.toast{bottom:78px;font-size:14px}.dialog-header{padding:10px 0}.footer{gap:4px}.menu{right:0}}
    @media(max-width:340px){.bar .copy,.bar [data-action=all],.bar [data-action=clear],.bar .divider{display:none}.count{padding:0 8px;font-size:12px}.menu .compact-only{display:flex}.menu span.compact-only{display:block}.menu,.panel{left:50%;right:auto;width:calc(100vw - 16px);max-width:none;transform:translateX(-50%);max-height:calc(100vh - 96px)}}
    @keyframes working{0%{transform:translateX(0)}50%{transform:translateX(170%)}100%{transform:translateX(0)}}
    @media(prefers-reduced-motion:reduce){button{transition:none}.bar[aria-busy=true]::before{animation:none;left:34%;width:32%}}
  </style>
  <div class="bar" role="toolbar" aria-label="Selected videos" aria-busy="false" hidden>
    <span class="count" aria-live="polite">0 selected</span><span class="divider" aria-hidden="true"></span>
    <button class="text copy primary" data-action="links" title="Copy selected video links as plain text" aria-label="Copy links">${svg('link')}<span>Copy links</span></button>
    <button class="icon" data-action="all" title="Select all" aria-label="Select all">${svg('all')}</button>
    <button class="icon" data-action="clear" title="Deselect all" aria-label="Deselect all">${svg('clear')}</button>
    <button class="icon" data-action="menu" title="More actions" aria-label="More actions" aria-haspopup="menu" aria-expanded="false">${svg('more')}</button>
    <button class="icon" data-action="close" title="Close selection" aria-label="Close selection">${svg('close')}</button>
    <div class="menu" role="menu" aria-label="Selection actions" hidden></div>
    <div class="panel" hidden></div>
  </div><div class="toast" role="status" hidden></div><div class="backdrop" hidden></div>`;
  document.documentElement.append(host);
  function syncTheme() { host.dataset.theme = document.documentElement.hasAttribute('dark') ? 'dark' : 'light'; }
  syncTheme();
  new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['dark'] });
  const pageStyle = document.createElement('style');
  pageStyle.textContent = `#yt-multiselect-toggle{display:inline-flex;align-items:center;justify-content:center;flex:0 0 44px;width:44px;height:44px;margin:0 4px;border:0;border-radius:50%;background:transparent;color:#065fd4;cursor:pointer}html[dark] #yt-multiselect-toggle{color:#3ea6ff}#yt-multiselect-toggle:hover{background:var(--yt-spec-10-percent-layer,#e5e5e5)}#yt-multiselect-toggle[aria-pressed=true]{background:var(--yt-spec-badge-chip-background,#e5e5e5)}#yt-multiselect-toggle:focus-visible{outline:2px solid currentColor;outline-offset:2px}#yt-multiselect-toggle svg{width:24px;height:24px;fill:currentColor}.yt-multiselect-row{position:relative!important}.yt-multiselect-enabled,.yt-multiselect-enabled *{cursor:pointer!important}.yt-multiselect-checkbox[hidden]{display:none!important}.yt-multiselect-checkbox{appearance:none!important;position:absolute!important;right:0;bottom:0;width:44px;height:44px;z-index:10;cursor:pointer;margin:0;border:0!important;border-radius:6px 0 12px 0;background:transparent!important;background-repeat:no-repeat!important;background-position:center!important;background-size:28px 28px!important;opacity:0}.yt-multiselect-enabled .yt-multiselect-checkbox:not(:checked){opacity:.34;box-shadow:inset 0 0 0 2px #065fd4}.yt-multiselect-checkbox:checked{opacity:1;background-color:#065fd4!important;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='m4 12 5 5L20 6' fill='none' stroke='white' stroke-width='3'/%3E%3C/svg%3E")!important}html[dark] .yt-multiselect-enabled .yt-multiselect-checkbox:not(:checked){box-shadow:inset 0 0 0 2px #3ea6ff}html[dark] .yt-multiselect-checkbox:checked{background-color:#3ea6ff!important;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='m4 12 5 5L20 6' fill='none' stroke='%230f0f0f' stroke-width='3'/%3E%3C/svg%3E")!important}.yt-multiselect-checkbox:focus-visible{opacity:1;outline:2px solid #065fd4;outline-offset:-3px}html[dark] .yt-multiselect-checkbox:focus-visible{outline-color:#3ea6ff}.yt-multiselect-row:has(.yt-multiselect-checkbox:focus-visible){outline:2px solid #065fd4;outline-offset:-2px}html[dark] .yt-multiselect-row:has(.yt-multiselect-checkbox:focus-visible){outline-color:#3ea6ff}.yt-multiselect-checkbox:disabled{cursor:default}.yt-multiselect-enabled:hover{background-color:rgba(6,95,212,.08)!important}.yt-multiselect-row.yt-multiselect-chosen{background-color:#d5e5fb!important}html[dark] .yt-multiselect-enabled:hover{background-color:rgba(62,166,255,.12)!important}html[dark] .yt-multiselect-row.yt-multiselect-chosen{background-color:#254f70!important}`;
  document.documentElement.append(pageStyle);
  pageStyle.textContent += `.yt-multiselect-drop-before{box-shadow:inset 0 3px #065fd4!important}.yt-multiselect-drop-after{box-shadow:inset 0 -3px #065fd4!important}html[dark] .yt-multiselect-drop-before{box-shadow:inset 0 3px #3ea6ff!important}html[dark] .yt-multiselect-drop-after{box-shadow:inset 0 -3px #3ea6ff!important}.yt-multiselect-enabled[draggable=true],.yt-multiselect-enabled[draggable=true] *{cursor:grab!important}`;
  const bar = root.querySelector('.bar'), menu = root.querySelector('.menu'), backdrop = root.querySelector('.backdrop'), panel = root.querySelector('.panel');
  const selected = new Map(), rowBoxes = new WeakMap(), wiredRows = new WeakSet(), dragAttributes = new WeakMap();
  let groupDrag = null, dropRow = null, scrollFrame = null, scrollSpeed = 0;
  let enabled = false, scope = navigationScope(), snapshot = null, toggleButton, timer, toastTimer, lastAnchor = null, working = false, readPending = false, needsReload = false, dialogFocus, noticeRevision = 0, introduced = false;
  let operationStatus = { activeJob: null, queue: null, history: [], busy: false };

  function svg(name) {
    if (name === 'more') return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="12" cy="19" r="2"></circle></svg>';
    const paths = { close: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4Z', all: 'M3 3h18v18H3V3Zm2 2v14h14V5H5Zm2 6 3 3 7-7 1.4 1.4L10 16.8 5.6 12.4 7 11Z', clear: 'M3 3h18v18H3V3Zm2 2v14h14V5H5Z', link: 'M10 7H7a5 5 0 0 0 0 10h3v-2H7a3 3 0 0 1 0-6h3V7Zm4 0v2h3a3 3 0 0 1 0 6h-3v2h3a5 5 0 0 0 0-10h-3Zm-6 4h8v2H8v-2Z', copy: 'M8 7V3h13v13h-4v5H3V7h5Zm2 0h7v7h2V5h-9v2Zm5 2H5v10h10V9Z', cut: 'M9.6 12 16 5.6 14.4 4 8 10.4A4 4 0 1 0 9.6 12ZM5 17a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm5.4-3L14 17.6l1.6-1.6-3.6-3.6-1.6 1.6ZM19 13a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z', save: 'M3 5h12v2H3V5Zm0 6h12v2H3v-2Zm0 6h8v2H3v-2Zm16-4v4h4v2h-4v4h-2v-4h-4v-2h4v-4h2Z', recovery: 'M12 4a8 8 0 1 1-7.75 10H6.4A6 6 0 1 0 8 8l2 2H3V3l2.1 2.1A8 8 0 0 1 12 2v2Zm-1 3h2v5.2l3.2 1.9-1 1.7-4.2-2.5V7Z', trash: 'M8 3h8l1 2h4v2H3V5h4l1-2Zm-2 6h12l-1 12H7L6 9Zm3 2 .5 8h2L11 11H9Zm4 0-.5 8h2l.5-8h-2Z', toggle: 'M3 4h4v4H3V4Zm7 0h11v2H10V4ZM3 10h4v4H3v-4Zm7 0h11v2H10v-2ZM3 16h4v4H3v-4Zm7 0h11v2H10v-2Z' };
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
  function exactSelection() {
    if (!selected.size || !snapshot?.complete) return false;
    const occurrences = new Map(snapshot.items.map(item => [item.setVideoId, item.videoId]));
    return [...selected.values()].every(item => item.setVideoId && occurrences.get(item.setVideoId) === item.videoId);
  }
  function canReorder() { return exactSelection() && snapshot.editable && snapshot.canReorder && loadedRows().some(entry => entry.row.matches('ytd-playlist-video-renderer')); }
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
    root.querySelector('[data-action="clear"]').disabled = working || !selected.size;
    toggleButton?.setAttribute('aria-pressed', String(enabled));
    if (toggleButton) { toggleButton.title = enabled ? 'Exit video selection' : 'Select videos'; toggleButton.setAttribute('aria-label', toggleButton.title); }
    if (!menu.hidden) buildMenu();
  }
  async function refreshStatus() {
    try { operationStatus = await send('STATUS'); update(); } catch {}
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
    mountToggle();
    if (scope !== navigationScope()) { clearDrag(); scope = navigationScope(); closePanel(); showMenu(false); notice(''); selected.clear(); snapshot = null; lastAnchor = null; needsReload = false; if (enabled) readPlaylist(); }
    if (!enabled) {
      for (const row of document.querySelectorAll('.yt-multiselect-row')) releaseRow(row);
      update(); return;
    }
    const entries = loadedRows(), currentRows = new Set(entries.map(entry => entry.row)), reorderable = canReorder();
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
    try { const result = await send('READ', { playlistId: id, pickerVideoId: loadedRows().map(entry => entry.item).find(validVideo)?.videoId }); if (!enabled || navigationScope() !== capturedScope) return; snapshot = result; reconcileSnapshot(); scan(); if (!result.complete && revision === noticeRevision && !working) notice('Playlist editing is unavailable.', 'Details', () => messageDialog('Playlist editing is unavailable', (result.warnings || []).join('\n') || 'The complete playlist could not be verified. Copy links remains available.'), true); }
    catch (error) { if (enabled && navigationScope() === capturedScope && revision === noticeRevision && !working) report(error); }
    finally { readPending = false; if (enabled && scope !== capturedScope && playlistId()) readPlaylist(); }
  }
  function toggle(value) { enabled = value; bar.hidden = !value; if (!value) { clearDrag(); showMenu(false); closeDialog(); closePanel(); notice(''); snapshot = null; } scan(); if (value) { maybeIntroduce(); refreshStatus(); if (!snapshot) readPlaylist(); } }
  function selectAll() { const items = snapshot?.complete ? snapshot.items.filter(validVideo).map(canonical) : loadedRows().map(entry => entry.item); for (const item of items) selected.set(item.key, item); syncRows(); }
  function deselect() { selected.clear(); lastAnchor = null; syncRows(); }
  function menuButtons() { return [...menu.querySelectorAll('button:not(:disabled)')].filter(node => node.getClientRects().length); }
  function showMenu(value, focus = true) {
    const trigger = root.querySelector('[data-action="menu"]'); host.toggleAttribute('data-menu-open', value); menu.hidden = !value; trigger.setAttribute('aria-expanded', String(value));
    if (value) { closePanel(); buildMenu(); refreshStatus(); if (focus) menuButtons()[0]?.focus(); }
  }
  function buildMenu() {
    const focusedText = menu.contains(root.activeElement) ? root.activeElement?.textContent : null;
    menu.replaceChildren();
    const group = (text, compactOnly = false) => { const node = element('span', text, 'menu-label'); if (compactOnly) node.classList.add('compact-only'); menu.append(node); };
    const divide = (compactOnly = false) => { const node = element('hr'); if (compactOnly) node.classList.add('compact-only'); menu.append(node); };
    const add = (icon, text, description, handler, disabled = false, danger = false, compactOnly = false) => {
      const node = button('', () => { showMenu(false); return handler(); }); node.setAttribute('role', 'menuitem'); node.disabled = disabled || working;
      node.title = description; node.setAttribute('aria-label', `${text}. ${description}`);
      const copy = element('span', '', 'menu-copy'); copy.append(element('strong', text)); node.append(document.createRange().createContextualFragment(svg(icon)), copy);
      if (danger) node.classList.add('danger'); if (compactOnly) node.classList.add('compact-only'); menu.append(node);
    };
    group('Selection', true);
    add('all', 'Select all', 'Every verified playlist video', selectAll, !snapshot?.complete && !loadedRows().length, false, true);
    add('clear', 'Deselect all', 'Clear the current selection', deselect, !selected.size, false, true);
    add('link', 'Copy video links', 'Plain links for NotebookLM or anywhere else', () => copyLinks(), !selected.size, false, true);
    divide(true); group('Organize');
    add('copy', 'Copy selection', 'Keep a reusable copy for another playlist', () => queueSelection('copy'), !selected.size);
    add('cut', 'Cut selection', 'Move only after destination copies are verified', cutDialog, !exactSelection() || !snapshot?.editable);
    const queued = operationStatus.queue?.items?.length || 0;
    add('save', 'Save to playlist…', selected.size ? 'Copy the current selection' : queued ? `Continue with ${queued} saved videos` : 'Select or copy videos first', saveDialog, !selected.size && !queued && !operationStatus.activeJob);
    add('toggle', 'Move in this playlist…', 'Move the selection to the top, bottom, or a custom position', reorderDialog, !canReorder());
    divide(); group('Safety & recovery');
    const active = operationStatus.activeJob;
    add('recovery', active ? 'Review saved operation' : 'Saved operations', active ? 'A stopped or verified operation needs attention' : `${operationStatus.history?.length || 0} recent backups`, recoveryDialog);
    add('trash', 'Delete from playlist…', 'Review titles before permanent removal', deleteSelected, !exactSelection() || !snapshot?.editable, true);
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
      if (result.job?.phase === 'ready_to_remove') moveReview(result.job);
      else {
        deselect(); announce(type === 'REMOVE' ? 'Videos deleted from playlist.' : type === 'FINISH_MOVE' ? 'Videos moved.' : type === 'REORDER' ? 'Playlist order updated.' : 'Videos saved.');
        if ((['REMOVE', 'FINISH_MOVE', 'REORDER'].includes(type) && result.job?.sourceId === playlistId()) || (['TRANSFER', 'PASTE'].includes(type) && args.targetId === playlistId())) location.reload();
      }
      return result;
    } finally { working = false; refreshStatus(); syncRows(); }
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
    const status = await send('STATUS'), body = dialog('Saved selections & recovery');
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
    if (changes.activeJob || changes.queue || changes.history) refreshStatus();
    const job = changes.activeJob?.newValue;
    if (!job || !enabled || !working) return;
    if (job.phase === 'copying') announce(`Saving ${job.copied?.length || 0} / ${job.items.length} videos… Originals kept.`);
    else if (job.phase === 'removing') announce(`Removing ${job.removed?.length || 0} / ${job.items.length} videos…`);
    else if (job.phase === 'sorting') announce(`Sorting playlist…`);
    else if (job.phase === 'reordering') announce(`Updating playlist order… ${job.reordered?.length || 0} moves verified.`);
  });
  scan();
})();
