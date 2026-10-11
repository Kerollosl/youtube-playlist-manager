/** Runs in MAIN world. Update the native renderer model, never just shuffle DOM.
 * Unknown, partially loaded, concurrently changed, and newly added rows require
 * a user-controlled refresh. No playlist/network mutations occur here.
 */
export async function youtubeRefresh({ before, after }) {
  const fail = () => ({ updated: false });
  const currentPlaylist = () => location.pathname === '/playlist' && new URL(location.href).searchParams.get('list') === after?.playlistId;
  if (!currentPlaylist() || !before?.complete || !after?.complete || before.playlistId !== after.playlistId || before.fingerprint !== after.fingerprint) return fail();
  const config = name => window.ytcfg?.get?.(name);
  const accountSeed = () => JSON.stringify([String(config('SESSION_INDEX') ?? '0'), config('INNERTUBE_CONTEXT')?.user?.onBehalfOfUser || config('DELEGATED_SESSION_ID') || '', config('DATASYNC_ID') || '']);
  const seed = accountSeed();
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  const fingerprint = [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
  if (fingerprint !== after.fingerprint || !currentPlaylist()) return fail();
  const lists = [...document.querySelectorAll('ytd-playlist-video-list-renderer')].filter(node => node.getClientRects().length && !node.closest('[hidden],[aria-hidden=true]'));
  if (lists.length !== 1) return fail();
  const list = lists[0], contents = list.data?.contents;
  if (typeof list.set !== 'function' || !Array.isArray(contents) || contents.some(entry => !entry.playlistVideoRenderer?.setVideoId)) return fail();
  const same = (entries, items) => entries.length === items.length && entries.every((entry, index) => entry.playlistVideoRenderer.setVideoId === items[index].setVideoId && entry.playlistVideoRenderer.videoId === items[index].videoId);
  const renderedMatches = () => {
    const rows = [...list.querySelectorAll('ytd-playlist-video-renderer')];
    return rows.length === after.items.length && rows.every((row, index) => {
      const anchor = row.querySelector?.('a#video-title,a[href*="watch?v="]');
      if (!anchor || row.data?.setVideoId !== after.items[index].setVideoId) return false;
      const url = new URL(anchor.href, location.href);
      const ordinal = url.searchParams.get('index') || row.querySelector('#index')?.textContent.trim();
      return Number(ordinal) === index + 1;
    });
  };
  // Count changes need a recognized native header as well as the list model.
  const header = [...document.querySelectorAll('ytd-playlist-header-renderer')].find(node => node.getClientRects().length && !node.closest('[hidden]'));
  const countText = header?.data?.numVideosText;
  const changesCount = before.items.length !== after.items.length;
  if (changesCount && (typeof header?.set !== 'function' || !Array.isArray(countText?.runs) || !/^[\d,\.\s]+$/.test(countText.runs[0]?.text || ''))) return fail();
  if (same(contents, after.items)) return { updated: renderedMatches() && (!changesCount || Number(countText.runs[0].text.replace(/[,\.\s]/g, '')) === after.items.length) };
  if (!same(contents, before.items)) return fail();
  const byId = new Map(contents.map(entry => [entry.playlistVideoRenderer.setVideoId, entry]));
  if (byId.size !== contents.length || after.items.some(item => !byId.has(item.setVideoId) || byId.get(item.setVideoId).playlistVideoRenderer.videoId !== item.videoId)) return fail();
  const next = after.items.map((item, index) => {
    const entry = structuredClone(byId.get(item.setVideoId)), video = entry.playlistVideoRenderer;
    video.index = { simpleText: String(index + 1) };
    for (const navigation of [video.navigationEndpoint, ...(video.title?.runs || []).map(run => run.navigationEndpoint)]) {
      if (!navigation) continue;
      if (navigation.watchEndpoint) navigation.watchEndpoint.index = index;
      const metadata = navigation.commandMetadata?.webCommandMetadata;
      if (metadata?.url) {
        const url = new URL(metadata.url, location.href);
        if (url.searchParams.get('list') === after.playlistId) { url.searchParams.set('index', String(index + 1)); metadata.url = `${url.pathname}${url.search}`; }
      }
    }
    return entry;
  });
  const oldCount = countText && structuredClone(countText);
  try {
    // Recheck immediately before changing Polymer-owned data.
    if (!currentPlaylist() || accountSeed() !== seed || list.data.contents !== contents) return fail();
    list.set('data.contents', next);
    if (changesCount) {
      const count = structuredClone(countText); count.runs[0].text = after.items.length.toLocaleString();
      if (/^ videos?$/.test(count.runs[1]?.text || '')) count.runs[1].text = after.items.length === 1 ? ' video' : ' videos';
      header.set('data.numVideosText', count);
    }
    // Give Polymer its render turn, then verify both model and visible rows.
    await new Promise(resolve => setTimeout(resolve, 100));
    if (!currentPlaylist()) return fail();
    if (!same(list.data.contents, after.items) || !renderedMatches()) throw new Error('Native rows did not reconcile.');
    return { updated: true };
  } catch {
    if (currentPlaylist() && list.data.contents === next) {
      try { list.set('data.contents', contents); if (changesCount) header.set('data.numVideosText', oldCount); } catch {}
    }
    return fail();
  }
}
