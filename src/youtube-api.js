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
  const warnings = [];
  const result = { ok: true, playlistId: command.playlistId, fingerprint, items: [],
    title: data.metadata?.playlistMetadataRenderer?.title || command.playlistId,
    complete: false, editable: false, canReorder: false, warnings };
  if (lists.length !== 1 || !Array.isArray(lists[0]?.contents)) {
    warnings.push('YouTube playlist structure is unrecognized. No complete snapshot is available.');
    return result;
  }
  const list = lists[0];
  if (list.playlistId && list.playlistId !== command.playlistId) {
    throw new Error('YouTube returned a different playlist. Refresh the page.');
  }
  if (!list.playlistId) {
    warnings.push('YouTube did not identify the requested playlist.');
    return result;
  }
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
  return result;
}
