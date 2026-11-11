// SHARED MODULE: youtube-watch-later-sync/innertube.js and
// youtube-playlist-manager/src/innertube.js must stay byte-identical.
// Each extension ships its own copy (no cross-folder imports in a store zip).
// Run scripts/check-shared.sh in either folder to diff the two copies.
//
// Helpers for YouTube's private "InnerTube" web endpoints, used from the
// MAIN world of a youtube.com tab. It reads the page's own session cookie to
// sign requests the same way youtube.com does. Nothing here sends data
// anywhere except to https://www.youtube.com, and credentials are never
// logged, stored or returned to callers.
//
// Loaded as a plain script in the page's MAIN world (a manifest content script
// with world MAIN, or chrome.scripting.executeScript files: [...]) it defines
// globalThis.YTInnertube. Under Node it is also
// exported with module.exports for unit tests.
(function (root) {
  'use strict';

  const ORIGIN = 'https://www.youtube.com';

  // Reads one cookie from a document.cookie style string.
  function readCookie(cookieString, name) {
    for (const part of String(cookieString || '').split(/;\s*/)) {
      const idx = part.indexOf('=');
      if (idx > -1 && part.slice(0, idx) === name) return part.slice(idx + 1);
    }
    return null;
  }

  function getSapisid(cookieString) {
    return readCookie(cookieString, 'SAPISID') || readCookie(cookieString, '__Secure-3PAPISID') || null;
  }

  async function digestHex(algorithm, value) {
    const bytes = await root.crypto.subtle.digest(algorithm, new TextEncoder().encode(value));
    return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  // "SAPISIDHASH <unix seconds>_<sha1 of 'ts sapisid origin'>". Seconds, not ms.
  async function sapisidHashHeader(sapisid, nowMs = Date.now(), origin = ORIGIN) {
    const ts = Math.floor(nowMs / 1000);
    return `SAPISIDHASH ${ts}_${await digestHex('SHA-1', `${ts} ${sapisid} ${origin}`)}`;
  }

  // `get` is ytcfg.get bound to the page config: (name) => value.
  function sessionIndex(get) {
    const value = String(get('SESSION_INDEX') ?? '0');
    if (!/^\d{1,4}$/.test(value)) throw new Error('YouTube account identity is unavailable.');
    return value;
  }

  // The page's own request context. Never invent a client version.
  function requireContext(get) {
    const context = get('INNERTUBE_CONTEXT');
    if (!context?.client?.clientVersion || !context?.client?.clientName) {
      throw new Error('YouTube session context is unavailable. Reload YouTube and try again.');
    }
    return context;
  }

  function accountIdentity(get) {
    const context = get('INNERTUBE_CONTEXT');
    const accountIndex = sessionIndex(get);
    const delegated = context?.user?.onBehalfOfUser || get('DELEGATED_SESSION_ID') || '';
    const dataSyncId = get('DATASYNC_ID') || '';
    const stable = (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 2048;
    if ((!stable(dataSyncId) && !stable(delegated)) || (dataSyncId && !stable(dataSyncId)) || (delegated && !stable(delegated))) {
      throw new Error('YouTube account identity is unavailable. Reload YouTube and try again.');
    }
    return { accountIndex, delegated, dataSyncId, seed: JSON.stringify([accountIndex, delegated, dataSyncId]) };
  }

  // Opaque SHA-256 of the signed-in account identity; safe to store/compare.
  async function accountFingerprint(get) {
    return digestHex('SHA-256', accountIdentity(get).seed);
  }

  function buildHeaders({ get, context, authorization, accountIndex, delegated }) {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: authorization,
      'X-Goog-AuthUser': accountIndex ?? sessionIndex(get),
      'X-Origin': ORIGIN,
      'X-Youtube-Client-Version': context.client.clientVersion,
      'X-Youtube-Client-Name': String(get('INNERTUBE_CONTEXT_CLIENT_NAME') || '1'),
    };
    if (delegated) headers['X-Goog-PageId'] = String(delegated);
    if (context.client.visitorData) headers['X-Goog-Visitor-Id'] = context.client.visitorData;
    return headers;
  }

  function endpointUrl(get, path) {
    const url = new URL(`${ORIGIN}/youtubei/v1/${path}`);
    const key = get('INNERTUBE_API_KEY');
    if (key) url.searchParams.set('key', key);
    url.searchParams.set('prettyPrint', 'false');
    return url.href;
  }

  // fetch() that waits and retries on HTTP 429 (rate limited, request not
  // processed, so retrying a mutation is safe). Honours Retry-After (seconds,
  // capped at 30s), otherwise 1s, 2s, 4s. Returns the final response.
  async function fetchWithBackoff(url, init, options = {}) {
    const retries = options.retries ?? 3;
    const sleep = options.sleep || ((ms) => new Promise((resolve) => root.setTimeout(resolve, ms)));
    let response;
    for (let attempt = 0; ; attempt++) {
      response = await root.fetch(url, init);
      if (response.status !== 429 || attempt >= retries) return response;
      const retryAfter = Number(response.headers?.get?.('Retry-After'));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 1000 * 2 ** attempt;
      await sleep(wait);
    }
  }

  const api = {
    ORIGIN, readCookie, getSapisid, digestHex, sapisidHashHeader, sessionIndex,
    requireContext, accountIdentity, accountFingerprint, buildHeaders, endpointUrl, fetchWithBackoff,
  };
  root.YTInnertube = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
