/**
 * Serialized into YouTube's MAIN world. Keep every dependency inside this
 * function; credentials and raw responses must never leave the page.
 * InnerTube is undocumented. Renderer/action references:
 * https://github.com/LuanRT/YouTube.js/blob/main/src/core/managers/PlaylistManager.ts
 */
export async function youtubeCommand(command) {
  const origin = 'https://www.youtube.com';
  if (location.origin !== origin) throw new Error('Open a YouTube page to use playlist tools.');
  const ownKeys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => allowed.includes(key));
  const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{2,128}$/.test(value);
  const videoId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{11}$/.test(value);
  const occurrenceId = value => typeof value === 'string' && value.length > 0
    && value.length <= 2048 && !/[\u0000-\u0020\u007f]/.test(value);
  const commandSchemas = {
    read: ['type', 'playlistId'], edit: ['type', 'playlistId', 'action', 'expectedFingerprint'],
    playlists: ['type', 'videoId'], create: ['type', 'title', 'videoIds', 'expectedFingerprint']
  };
  if (!Object.hasOwn(commandSchemas, command?.type) || !ownKeys(command, commandSchemas[command.type])) {
    throw new Error('Invalid playlist command.');
  }
  if (['edit', 'create'].includes(command.type)
    && (typeof command.expectedFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(command.expectedFingerprint))) {
    throw new Error('Refresh the playlist to confirm your YouTube account before making changes.');
  }
  if (['read', 'edit'].includes(command.type) && !id(command.playlistId)) {
    throw new Error('A valid playlist ID is required.');
  }
  if (command.type === 'edit') {
    const action = command.action;
    const schemas = {
      ACTION_ADD_VIDEO: ['action', 'addedVideoId'],
      ACTION_REMOVE_VIDEO: ['action', 'setVideoId'],
      ACTION_MOVE_VIDEO_AFTER: ['action', 'setVideoId', 'movedSetVideoIdPredecessor']
    };
    if (!Object.hasOwn(schemas, action?.action) || !ownKeys(action, schemas[action.action])) {
      throw new Error('This playlist action is not permitted.');
    }
    if (action.action === 'ACTION_ADD_VIDEO' ? !videoId(action.addedVideoId) : !occurrenceId(action.setVideoId)) {
      throw new Error('The action needs an exact video or playlist occurrence ID.');
    }
    if (action.action === 'ACTION_MOVE_VIDEO_AFTER' && action.movedSetVideoIdPredecessor !== undefined
      && (!occurrenceId(action.movedSetVideoIdPredecessor) || action.setVideoId === action.movedSetVideoIdPredecessor)) {
      throw new Error('The reorder predecessor is invalid.');
    }
  } else if (command.type === 'playlists') {
    if (command.videoId !== undefined && !videoId(command.videoId)) throw new Error('Invalid video ID.');
  } else if (command.type === 'create') {
    if (typeof command.title !== 'string' || !command.title.trim() || command.title.length > 150
      || !Array.isArray(command.videoIds) || command.videoIds.length > 500 || !command.videoIds.every(videoId)) {
      throw new Error('Provide a playlist title and valid video IDs (at most 500).');
    }
  } else if (command.type !== 'read') {
    throw new Error('Unknown playlist command.');
  }

  const cfg = window.ytcfg;
  const config = name => cfg?.get?.(name);
  const context = config('INNERTUBE_CONTEXT');
  if (!context?.client?.clientVersion || !context?.client?.clientName) {
    throw new Error('YouTube session context is unavailable. Reload YouTube and try again.');
  }
  const accountIndex = String(config('SESSION_INDEX') ?? '0');
  if (!/^\d{1,4}$/.test(accountIndex)) throw new Error('YouTube account identity is unavailable.');
  const delegated = context.user?.onBehalfOfUser || config('DELEGATED_SESSION_ID') || '';
  const dataSyncId = config('DATASYNC_ID') || '';
  const stableIdentity = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 2048;
  if ((!stableIdentity(dataSyncId) && !stableIdentity(delegated))
    || (dataSyncId && !stableIdentity(dataSyncId)) || (delegated && !stableIdentity(delegated))) {
    throw new Error('YouTube account identity is unavailable. Reload YouTube before managing playlists.');
  }
  const identitySeed = JSON.stringify([accountIndex, delegated, dataSyncId]);
  async function digest(algorithm, value) {
    const bytes = await crypto.subtle.digest(algorithm, new TextEncoder().encode(value));
    return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  const fingerprint = await digest('SHA-256', identitySeed);
  if (command.expectedFingerprint && command.expectedFingerprint !== fingerprint) {
    throw new Error('YouTube account changed. Review the operation again.');
  }
  const cookie = name => document.cookie.split(/;\s*/).map(part => {
    const split = part.indexOf('=');
    return [part.slice(0, split), part.slice(split + 1)];
  }).find(([key]) => key === name)?.[1];
  const sapisid = cookie('SAPISID') || cookie('__Secure-3PAPISID');
  if (!sapisid || config('LOGGED_IN') === false) throw new Error('Sign in to YouTube before managing playlists.');
  const text = value => typeof value === 'string' ? value : value?.simpleText
    || (Array.isArray(value?.runs) ? value.runs.map(run => run.text || '').join('') : '');
  // Locate named containers, never collect videos or continuations globally.
  function containers(node, name, output = [], depth = 0) {
    if (!node || typeof node !== 'object' || depth > 30) return output;
    if (Array.isArray(node)) {
      for (const child of node) containers(child, name, output, depth + 1);
    } else if (Object.hasOwn(node, name)) {
      output.push(node[name]);
    } else {
      for (const child of Object.values(node)) containers(child, name, output, depth + 1);
    }
    return output;
  }
  function assertSession() {
    if (JSON.stringify([String(config('SESSION_INDEX') ?? '0'),
      config('INNERTUBE_CONTEXT')?.user?.onBehalfOfUser || config('DELEGATED_SESSION_ID') || '',
      config('DATASYNC_ID') || '']) !== identitySeed
      || (cookie('SAPISID') || cookie('__Secure-3PAPISID')) !== sapisid
      || config('LOGGED_IN') === false) {
      throw new Error('YouTube account changed. Review the operation again.');
    }
  }
  async function request(path, body, mutation = false) {
    assertSession();
    const timestamp = Math.floor(Date.now() / 1000);
    const hash = await digest('SHA-1', `${timestamp} ${sapisid} ${origin}`);
    assertSession();
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `SAPISIDHASH ${timestamp}_${hash}`,
      'X-Goog-AuthUser': accountIndex,
      'X-Origin': origin,
      'X-Youtube-Client-Version': context.client.clientVersion,
      'X-Youtube-Client-Name': String(config('INNERTUBE_CONTEXT_CLIENT_NAME') || '1')
    };
    if (delegated) headers['X-Goog-PageId'] = String(delegated);
    if (context.client.visitorData) headers['X-Goog-Visitor-Id'] = context.client.visitorData;
    const url = new URL(`${origin}/youtubei/v1/${path}`);
    if (config('INNERTUBE_API_KEY')) url.searchParams.set('key', config('INNERTUBE_API_KEY'));
    url.searchParams.set('prettyPrint', 'false');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    let response;
    try {
      response = await fetch(url.href, {
        method: 'POST', credentials: 'include', headers, signal: controller.signal,
        body: JSON.stringify({ context, ...body })
      });
    } catch {
      throw new Error(mutation ? 'YouTube request interrupted; outcome is unknown. Refresh before retrying.'
        : 'Could not read YouTube. Check your connection and try again.');
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error(`YouTube request failed (HTTP ${response.status}).${mutation ? ' Refresh before retrying.' : ''}`);
    let data;
    try { data = await response.json(); } catch {
      throw new Error('YouTube returned an unreadable response; refresh before retrying.');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('YouTube returned an unexpected response.');
    if (data.error || (data.status && data.status !== 'STATUS_SUCCEEDED')) {
      throw new Error(`YouTube rejected the request${data.error?.code ? ` (${data.error.code})` : ''}. Refresh before retrying.`);
    }
    if (containers(data.alerts, 'alertRenderer').some(alert => alert.type === 'ERROR')) {
      throw new Error('YouTube reported a playlist error. Refresh before retrying.');
    }
    return data;
  }

  if (command.type === 'edit') {
    const data = await request('browse/edit_playlist', { playlistId: command.playlistId, actions: [command.action] }, true);
    if (data.status !== 'STATUS_SUCCEEDED') {
      throw new Error('YouTube did not confirm the action; outcome is unknown. Refresh before retrying.');
    }
    return { ok: true, acknowledged: true, verified: false, fingerprint };
  }
  if (command.type === 'create') {
    const data = await request('playlist/create', {
      title: command.title.trim(), videoIds: command.videoIds, privacyStatus: 'PRIVATE'
    }, true);
    if (!id(data.playlistId)) throw new Error('Playlist creation outcome is unknown. Check your playlists before retrying.');
    return { ok: true, playlistId: data.playlistId, fingerprint };
  }
  if (command.type === 'playlists') {
    const data = await request('playlist/get_add_to_playlist', { videoIds: command.videoId ? [command.videoId] : [] });
    const menus = containers(data.contents, 'addToPlaylistRenderer');
    if (menus.length !== 1 || !Array.isArray(menus[0]?.playlists)) {
      throw new Error('YouTube playlist picker format changed. Open the destination playlist directly.');
    }
    const playlists = [];
    for (const row of menus[0].playlists) {
      const option = row.playlistAddToOptionRenderer;
      if (!option || !id(option.playlistId)) continue;
      playlists.push({ id: option.playlistId, playlistId: option.playlistId,
        title: text(option.title), privacy: option.privacy || '',
        containsSelectedVideos: option.containsSelectedVideos || '' });
    }
    return { ok: true, playlists, fingerprint };
  }

  const data = await request('browse', { browseId: `VL${command.playlistId}` });
  const lists = containers(data.contents, 'playlistVideoListRenderer');
  const header = data.header?.playlistHeaderRenderer;
  const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs;
  const tabRenderers = Array.isArray(tabs) ? tabs.map(tab => tab.tabRenderer).filter(Boolean) : [];
  const selectedTabs = tabRenderers.filter(tab => tab.selected === true);
  const selectedTab = selectedTabs.length === 1 ? selectedTabs[0]
    : !selectedTabs.length && tabRenderers.length === 1 ? tabRenderers[0] : null;
  const selectedBody = selectedTab?.content;
  const sections = selectedBody?.sectionListRenderer?.contents;
  const bodyRows = Array.isArray(sections) ? sections.flatMap(section =>
    Array.isArray(section.itemSectionRenderer?.contents) ? section.itemSectionRenderer.contents : [section]) : [];
  let canonicalId = null;
  const canonical = data.microformat?.microformatDataRenderer?.urlCanonical;
  if (typeof canonical === 'string') {
    try {
      const url = new URL(canonical, origin);
      if (url.protocol === 'https:' && ['youtube.com', 'www.youtube.com'].includes(url.hostname)
        && url.pathname === '/playlist') canonicalId = url.searchParams.get('list');
    } catch { /* An unrecognized URL cannot establish identity. */ }
  }
  const identityIds = [...lists.map(list => list.playlistId), header?.playlistId, canonicalId].filter(Boolean);
  if (identityIds.some(playlistId => playlistId !== command.playlistId)) {
    throw new Error('YouTube returned a different playlist. Refresh the page.');
  }
  const warnings = [];
  const result = { ok: true, playlistId: command.playlistId, fingerprint, items: [],
    title: data.metadata?.playlistMetadataRenderer?.title || text(header?.title) || command.playlistId,
    complete: false, editable: false, canReorder: false, warnings,
    diagnostics: {
      listCount: lists.length,
      listKeys: lists.map(list => Object.keys(list || {})),
      headerRenderers: Object.keys(data.header || {}),
      microformatRenderers: Object.keys(data.microformat || {}),
      selectedBodyRenderers: Object.keys(selectedBody || {}),
      bodyRowRenderers: [...new Set(bodyRows.flatMap(row => Object.keys(row || {}).filter(key => key.endsWith('Renderer'))))],
      identity: { list: lists.some(list => list.playlistId === command.playlistId),
        header: header?.playlistId === command.playlistId, canonical: canonicalId === command.playlistId }
    } };
  if (!identityIds.length) {
    warnings.push('YouTube did not identify the requested playlist.');
    return result;
  }
  if (!lists.length) {
    // Empty playlists have a terminal message instead of a video list. Accept
    // only the observed exact marker in the selected tab's ordinary body.
    const emptyMessage = 'No videos in this playlist yet';
    const knownSections = Array.isArray(sections) && sections.length > 0
      && sections.every(section => section.itemSectionRenderer
        && Array.isArray(section.itemSectionRenderer.contents)
        && section.itemSectionRenderer.contents.length > 0
        && Object.keys(section).every(key => ['itemSectionRenderer', 'trackingParams'].includes(key))
        && Object.keys(section.itemSectionRenderer).every(key =>
          ['contents', 'trackingParams', 'sectionIdentifier', 'targetId', 'continuations'].includes(key)));
    const terminalEmpty = knownSections && bodyRows.length === 1 && bodyRows[0].messageRenderer
      && Object.keys(selectedBody).every(key => ['sectionListRenderer', 'trackingParams'].includes(key))
      && Object.keys(selectedBody.sectionListRenderer).every(key =>
        ['contents', 'trackingParams', 'targetId', 'continuations'].includes(key))
      && Object.keys(bodyRows[0]).every(key => ['messageRenderer', 'trackingParams'].includes(key))
      && text(bodyRows[0].messageRenderer.text).trim() === emptyMessage
      && !containers(selectedBody, 'continuationItemRenderer').length
      && sections.every(section => section.itemSectionRenderer.continuations === undefined
        || Array.isArray(section.itemSectionRenderer.continuations) && !section.itemSectionRenderer.continuations.length)
      && (selectedBody.sectionListRenderer.continuations === undefined
        || Array.isArray(selectedBody.sectionListRenderer.continuations) && !selectedBody.sectionListRenderer.continuations.length);
    const countText = text(header?.numVideosText).trim();
    const pageMetadata = data.header?.pageHeaderRenderer?.content?.pageHeaderViewModel
      ?.metadata?.contentMetadataViewModel?.metadataRows;
    const videoStats = [...(Array.isArray(header?.stats) ? header.stats.map(text) : []),
      ...(Array.isArray(pageMetadata) ? pageMetadata.flatMap(row =>
        Array.isArray(row.metadataParts) ? row.metadataParts.map(part => part.text?.content || '') : []) : [])]
      .filter(value => typeof value === 'string' && /^\s*[\d,.]+\s+videos?\s*$/i.test(value));
    const positiveCount = /\d/.test(countText) && Number(countText.replace(/[^\d]/g, '')) > 0
      || videoStats.some(value => Number(value.replace(/[^\d]/g, '')) > 0);
    if (!terminalEmpty || positiveCount) {
      warnings.push('YouTube playlist structure is unrecognized. No complete snapshot is available.');
      return result;
    }
    result.complete = true;
    result.pages = 1;
    result.editable = header?.isEditable === true
      || containers(data.header, 'playlistEditEndpoint').some(endpoint => endpoint.playlistId === command.playlistId);
    if (!result.editable) {
      try {
        const picker = await request('playlist/get_add_to_playlist', { videoIds: [] });
        const menus = containers(picker.contents, 'addToPlaylistRenderer');
        result.editable = menus.length === 1 && Array.isArray(menus[0]?.playlists)
          && menus[0].playlists.some(row => row.playlistAddToOptionRenderer?.playlistId === command.playlistId);
      } catch (error) {
        warnings.push('Could not verify whether this empty playlist is editable.');
        // A changed session invalidates the entire read, including empty reads.
        try { assertSession(); } catch {
          result.complete = false;
          warnings.push('YouTube account changed. Review the operation again.');
        }
      }
    }
    assertSession();
    return result;
  }
  if (lists.length !== 1 || !Array.isArray(lists[0]?.contents)) {
    warnings.push('YouTube playlist structure is unrecognized. No complete snapshot is available.');
    return result;
  }
  const list = lists[0];
  result.editable = list.isEditable === true;
  result.canReorder = list.canReorder === true;
  const seenOccurrences = new Set();
  const seenTokens = new Set();
  let recognized = true;
  function parseRows(rows) {
    let continuation = null;
    for (const row of rows) {
      const video = row?.playlistVideoRenderer;
      if (video) {
        // YouTube sometimes nests suggested videos in playlist results.
        if (video.style === 'PLAYLIST_VIDEO_RENDERER_STYLE_RECOMMENDED_VIDEO') continue;
        const position = result.items.length;
        const setVideoId = occurrenceId(video.setVideoId) ? video.setVideoId : null;
        if (setVideoId && seenOccurrences.has(setVideoId)) {
          recognized = false;
          warnings.push('YouTube returned a repeated playlist occurrence.');
        }
        if (setVideoId) seenOccurrences.add(setVideoId);
        const length = text(video.lengthText);
        const seconds = Number(video.lengthSeconds);
        result.items.push({
          key: `${command.playlistId}:${setVideoId || `unidentified-${position}`}`,
          setVideoId, videoId: videoId(video.videoId) ? video.videoId : null,
          title: text(video.title), channel: text(video.shortBylineText || video.longBylineText),
          duration: length || (Number.isFinite(seconds) ? String(seconds) : ''),
          durationSeconds: Number.isFinite(seconds) ? seconds : null,
          index: position, displayIndex: text(video.index), playable: video.isPlayable !== false
        });
      } else if (row?.continuationItemRenderer) {
        const token = row.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token;
        if (typeof token !== 'string' || !token || continuation) recognized = false;
        else continuation = token;
      } else {
        recognized = false;
        warnings.push('A playlist row has an unsupported format.');
      }
    }
    return continuation;
  }
  let token = parseRows(list.contents);
  if (!token && Array.isArray(list.continuations) && list.continuations.length) {
    const legacyToken = list.continuations[0]?.nextContinuationData?.continuation;
    if (typeof legacyToken === 'string' && legacyToken) token = legacyToken;
    else recognized = false;
  }
  let pages = 1;
  while (token && recognized) {
    if (seenTokens.has(token) || pages >= 200) {
      warnings.push('Playlist pagination did not finish safely.');
      recognized = false;
      break;
    }
    seenTokens.add(token);
    let next;
    try { next = await request('browse', { continuation: token }); } catch (error) {
      warnings.push(error.message);
      recognized = false;
      break;
    }
    const roots = [next.onResponseReceivedActions, next.onResponseReceivedEndpoints, next.onResponseReceivedCommands];
    const batches = roots.flatMap(root => [
      ...containers(root, 'appendContinuationItemsAction'),
      ...containers(root, 'reloadContinuationItemsCommand')
    ]).filter(batch => Array.isArray(batch.continuationItems)
      && (!list.targetId || !batch.targetId || batch.targetId === list.targetId));
    const legacy = next.continuationContents?.playlistVideoListContinuation;
    let rows;
    if (batches.length === 1) rows = batches[0].continuationItems;
    else if (!batches.length && Array.isArray(legacy?.contents)) rows = legacy.contents;
    else {
      recognized = false;
      warnings.push('YouTube continuation format is unrecognized.');
      break;
    }
    token = parseRows(rows);
    if (!token && Array.isArray(legacy?.continuations) && legacy.continuations.length) {
      const legacyToken = legacy.continuations[0]?.nextContinuationData?.continuation;
      if (typeof legacyToken === 'string' && legacyToken) token = legacyToken;
      else recognized = false;
    }
    pages++;
  }
  result.complete = recognized && !token;
  result.pages = pages;
  if (result.complete) assertSession();
  return result;
}
