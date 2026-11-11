import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
import { youtubeCommand } from '../src/youtube-api.js';
import {
  KEYS, extractPlaylistId, normalizeSources, exportSources, parseImport, mergeSources, buildRows, setChosen,
  parseAtomEntries, selectNewEntries, createSync, addVideoInPage
} from '../src/watch-later.js';

const INNERTUBE = fs.readFileSync(new URL('../src/innertube.js', import.meta.url), 'utf8');
const PL = n => `PLabcdefghij${n}`;

// --- Library playlists parser (fixture InnerTube JSON written for this test) ---
const grid = (id, title, count) => ({ gridPlaylistRenderer: { playlistId: id, title: { runs: [{ text: title }] }, videoCountShortText: { simpleText: count } } });
const lockup = (id, title, badge) => ({ lockupViewModel: { contentId: id, contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST',
  contentImage: { badge: { text: badge } }, metadata: { lockupMetadataViewModel: { title: { content: title } } } } });
const token = t => ({ continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: t } } } });
const firstPage = { contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { content: { sectionListRenderer: { contents: [{
  itemSectionRenderer: { contents: [{ gridRenderer: { items: [grid(PL(1), 'Cooking', '12'), lockup(PL(2), 'Jazz', '40 videos'), grid('WL', 'Watch Later', '9'), token('page2')] } }] } }] } } } }] } } };
const secondPage = { onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: [
  grid(PL(3), 'Lectures', '5'), grid(PL(1), 'Cooking duplicate', '12'), lockup(PL(4), '', '3 videos'), token('page3')] } }] };
const thirdPage = { onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: [grid(PL(5), 'Last one', '1')] } }] };

function page(responses) {
  const calls = [];
  const config = { INNERTUBE_CONTEXT: { client: { clientName: 'WEB', clientVersion: '2.x' }, user: { onBehalfOfUser: 'ch' } },
    SESSION_INDEX: 0, DATASYNC_ID: 'acct', LOGGED_IN: true };
  const sandbox = { location: { origin: 'https://www.youtube.com' }, window: { ytcfg: { get: k => config[k] } },
    document: { cookie: 'SAPISID=secret' }, crypto: webcrypto, TextEncoder, URL, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => { calls.push(JSON.parse(options.body)); const next = responses.shift(); return { ok: true, status: 200, json: async () => next }; } };
  vm.createContext(sandbox);
  vm.runInContext(INNERTUBE, sandbox);
  return { run: vm.runInContext(`(${youtubeCommand.toString()})`, sandbox), calls };
}

test('library command follows continuations, merges both renderer styles, drops WL and duplicates', async () => {
  const { run, calls } = page([firstPage, secondPage, thirdPage]);
  const result = await run({ type: 'library' });
  assert.deepEqual(calls.map(c => c.browseId ?? c.continuation), ['FEplaylist_aggregation', 'page2', 'page3']);
  assert.deepEqual(JSON.parse(JSON.stringify(result.playlists.map(p => [p.id, p.title, p.count]))), [
    [PL(1), 'Cooking', '12'], [PL(2), 'Jazz', '40 videos'], [PL(3), 'Lectures', '5'], [PL(4), PL(4), '3 videos'], [PL(5), 'Last one', '1']]);
  assert.equal(result.truncated, false);
  assert.deepEqual(Object.keys(result).sort(), ['fingerprint', 'ok', 'playlists', 'truncated']);
  assert.ok(!JSON.stringify(result).includes('secret'));
});

test('library command stops on a repeated continuation token and rejects extra fields', async () => {
  const loop = { items: [grid(PL(1), 'A', '1'), token('same')] };
  const { run, calls } = page([loop, loop]);
  const result = await run({ type: 'library' });
  assert.equal(result.playlists.length, 1);
  assert.equal(calls.length, 2);
  await assert.rejects(page([]).run({ type: 'library', extra: 1 }), /Invalid playlist command/);
});

// --- Source list ---------------------------------------------------------------
test('extractPlaylistId accepts IDs and youtube.com URLs only', () => {
  assert.equal(extractPlaylistId(PL(1)).id, PL(1));
  assert.equal(extractPlaylistId(`https://www.youtube.com/playlist?list=${PL(2)}`).id, PL(2));
  assert.equal(extractPlaylistId(`https://www.youtube.com/watch?v=abcdefghijk&list=${PL(3)}`).id, PL(3));
  for (const bad of ['', 'WL', 'https://evil.example/playlist?list=' + PL(1), 'https://www.youtube.com/watch?v=abcdefghijk', 'not a url!', 'https://www.youtube.com/playlist?list=WL'])
    assert.equal(extractPlaylistId(bad).ok, false, bad);
});

test('export then import round-trips and import validates, dedupes and merges', () => {
  const sources = normalizeSources([{ id: PL(1), label: 'Cooking', addedAt: 5 }, PL(2), { id: PL(1), label: 'dup' }, { id: 'WL' }, null, 7]);
  assert.deepEqual(sources.map(s => s.id), [PL(1), PL(2)]);
  const json = exportSources(sources, 0);
  assert.deepEqual(JSON.parse(json).sources, [{ id: PL(1), label: 'Cooking' }, { id: PL(2), label: '' }]);
  const back = parseImport(json);
  assert.equal(back.ok, true);
  assert.deepEqual(back.sources.map(s => [s.id, s.label]), [[PL(1), 'Cooking'], [PL(2), '']]);
  const mixed = parseImport(JSON.stringify([PL(3), `https://www.youtube.com/playlist?list=${PL(4)}`, 'junk', { id: 'LL' }]));
  assert.deepEqual(mixed.sources.map(s => s.id), [PL(3), PL(4)]);
  assert.equal(mixed.skipped, 2);
  const merged = mergeSources([{ id: PL(1), label: 'Mine', addedAt: 1 }], back.sources, 9);
  assert.deepEqual(merged.map(s => [s.id, s.label]), [[PL(1), 'Mine'], [PL(2), '']]);
  assert.equal(parseImport('{nope').ok, false);
  assert.equal(parseImport(JSON.stringify({ format: 'something-else', sources: [] })).ok, false);
  assert.equal(parseImport(JSON.stringify({ hello: 1 })).ok, false);
});

test('picker rows merge library and manual sources, filter, and select all/none only touch visible rows', () => {
  const library = [{ id: PL(1), title: 'Cooking', kind: 'saved' }, { id: PL(2), title: 'Jazz', kind: 'own' }, { id: PL(3), title: 'Cooking tips', kind: 'saved' }];
  let sources = [{ id: PL(9), label: '', addedAt: 1 }];
  let rows = buildRows(library, sources, 'cook');
  assert.deepEqual(rows.map(r => r.id), [PL(1), PL(3)]);
  sources = setChosen(sources, rows, true, 5);
  assert.deepEqual(sources.map(s => s.id).sort(), [PL(1), PL(3), PL(9)].sort());
  const all = buildRows(library, sources, '');
  assert.deepEqual(all.map(r => [r.id, r.checked]).sort(), [[PL(1), true], [PL(2), false], [PL(3), true], [PL(9), true]]);
  assert.equal(all.find(r => r.id === PL(9)).kind, 'manual');
  sources = setChosen(sources, buildRows(library, sources, 'cook'), false);
  assert.deepEqual(sources.map(s => s.id), [PL(9)]);
});

// --- Feed + sync decisions -------------------------------------------------------
const feed = entries => '<feed>' + entries.map(([id, date, title]) => `<entry><yt:videoId>${id}</yt:videoId><title>${title}</title><published>${date}</published></entry>`).join('') + '</feed>';

test('feed parsing decodes entities and skips malformed entries; new-entry selection honours clock and record', () => {
  const entries = parseAtomEntries(feed([['aaaaaaaaaaa', '2026-01-02T00:00:00Z', 'Tom &amp; Jerry &#39;s'], ['bbbbbbbbbbb', 'bad-date', 'x']]) + '<entry><title>no id</title></entry>');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, "Tom & Jerry 's");
  const two = [{ videoId: 'a', publishedMs: 100 }, { videoId: 'b', publishedMs: 200 }, { videoId: 'c', publishedMs: 300 }];
  assert.deepEqual(selectNewEntries(two, 150, new Set(['c'])).map(e => e.videoId), ['b']);
  assert.equal(selectNewEntries(two, undefined, new Set()).length, 3);
});

function harness({ sources, stored = {}, feeds = {}, wl = [{ ok: true, ids: [], fingerprint: 'fp1' }], addResults = {}, afterIds } = {}) {
  const data = { [KEYS.sources]: sources, ...stored };
  const emitted = [];
  const wlReads = [...wl];
  const added = [];
  let closed = 0;
  const deps = {
    storage: { get: async keys => Object.fromEntries((typeof keys === 'string' ? [keys] : keys).map(k => [k, structuredClone(data[k])])), set: async u => Object.assign(data, structuredClone(u)) },
    fetchEntries: async id => { if (feeds[id] instanceof Error) throw feeds[id]; return feeds[id] || []; },
    ensureTab: async () => ({ tabId: 1, created: true }), closeTab: async () => { closed++; },
    readWatchLater: async () => { const next = wlReads.length > 1 ? wlReads.shift() : wlReads[0]; return typeof next === 'function' ? next(added) : next; },
    addVideo: async (_tab, id, expectedFingerprint) => { assert.equal(expectedFingerprint, 'fp1'); added.push(id); return addResults[id] || { ok: true, status: 200 }; },
    now: () => 1_000_000, pause: async () => {}, emit: m => emitted.push(m)
  };
  return { data, emitted, added, deps, closed: () => closed, sync: createSync(deps) };
}
const E = (videoId, publishedMs) => ({ videoId, publishedMs, title: videoId });
const landing = (...ids) => added => ({ ok: true, ids: ids.length ? ids : added, fingerprint: 'fp1' });

test('sync adds new videos oldest-first, verifies, records them and advances the clock', async () => {
  const h = harness({ sources: [{ id: PL(1), label: 'A' }], stored: { [KEYS.lastSync]: 100 },
    feeds: { [PL(1)]: [E('new2', 300), E('old', 50), E('new1', 200)] }, wl: [{ ok: true, ids: [], fingerprint: 'fp1' }, landing()] });
  await h.sync.runSync();
  assert.deepEqual(h.added, ['new1', 'new2']);
  assert.deepEqual(h.data[KEYS.added], ['new1', 'new2']);
  assert.equal(h.data[KEYS.lastSync], 1_000_000);
  assert.equal(h.data[KEYS.inProgress], false);
  assert.equal(h.data[KEYS.lastAddedAt], 1_000_000);
  assert.equal(h.closed(), 1);
});

test('sync skips videos already in Watch Later and failed adds keep the clock (retry next time)', async () => {
  const h = harness({ sources: [{ id: PL(1) }], feeds: { [PL(1)]: [E('here', 10), E('bad', 20), E('good', 30)] },
    wl: [{ ok: true, ids: ['here'], fingerprint: 'fp1' }, landing()], addResults: { bad: { ok: false, status: 400, error: 'nope' } } });
  await h.sync.runSync();
  assert.deepEqual(h.added, ['bad', 'good']);
  assert.deepEqual(h.data[KEYS.added].sort(), ['good', 'here']);
  assert.equal(h.data[KEYS.lastSync], undefined);
});

test('verification shortfall un-records videos that never landed', async () => {
  const h = harness({ sources: [{ id: PL(1) }], feeds: { [PL(1)]: [E('v1', 10), E('v2', 20)] },
    wl: [{ ok: true, ids: [], fingerprint: 'fp1' }, { ok: true, ids: ['v1'], fingerprint: 'fp1' }] });
  await h.sync.runSync();
  assert.deepEqual(h.data[KEYS.added], ['v1']);
  assert.equal(h.data[KEYS.lastSync], undefined);
  assert.equal(h.data[KEYS.lastAddedAt], 1_000_000);
});

test('a different signed-in account resets the added record', async () => {
  const h = harness({ sources: [{ id: PL(1) }], stored: { [KEYS.added]: ['old1'], [KEYS.fingerprint]: 'other' },
    feeds: { [PL(1)]: [E('old1', 10), E('n', 20)] }, wl: [{ ok: true, ids: [], fingerprint: 'fp1' }, landing()] });
  await h.sync.runSync();
  assert.deepEqual(h.data[KEYS.added], ['old1', 'n']);
  assert.equal(h.data[KEYS.fingerprint], 'fp1');
});

test('unavailable or changed post-add verification is incomplete and does not replay recorded additions', async () => {
  for (const after of [{ ok: false, error: 'HTTP 503' }, { ok: true, ids: ['new'], fingerprint: 'other' }]) {
    const h = harness({ sources: [{ id: PL(1) }], feeds: { [PL(1)]: [E('new', 10)] },
      stored: { [KEYS.lastSync]: 5 }, wl: [{ ok: true, ids: [], fingerprint: 'fp1' }, after] });
    const result = await h.sync.runSync();
    assert.equal(result.added, 0);
    assert.equal(result.errors, 1);
    assert.equal(h.data[KEYS.lastSync], 5);
    assert.deepEqual(h.data[KEYS.added], ['new']);
  }
});

test('unreadable Watch Later fails closed before any addition', async () => {
  const h = harness({ sources: [{ id: PL(1) }], feeds: { [PL(1)]: [E('new', 10)] },
    wl: [{ ok: false, error: 'HTTP 503', ids: [] }] });
  assert.equal((await h.sync.runSync()).aborted, true);
  assert.deepEqual(h.added, []);
  assert.equal(h.data[KEYS.lastSync], undefined);
});

test('page-side adds reject missing or switched accounts before POST', async () => {
  let posts = 0;
  const sandbox = {
    window: { ytcfg: { get: () => true } }, document: { cookie: 'not-exposed' },
    YTInnertube: {
      getSapisid: () => 'not-exposed', requireContext: () => ({}), accountIdentity: () => ({}),
      accountFingerprint: async () => 'account-b',
      fetchWithBackoff: async () => { posts++; throw new Error('must not reach network'); }
    }
  };
  vm.createContext(sandbox);
  const add = vm.runInContext(`(${addVideoInPage.toString()})`, sandbox);
  for (const fingerprint of [undefined, 'account-a']) {
    const result = await add('abcdefghijk', fingerprint);
    assert.equal(result.status, 403);
    assert.match(result.error, /account changed/);
  }
  assert.equal(posts, 0);
});

test('auth error stops the run without advancing the clock; sign-in failure adds nothing', async () => {
  const h = harness({ sources: [{ id: PL(1) }], feeds: { [PL(1)]: [E('a', 10), E('b', 20)] }, addResults: { a: { ok: false, status: 403, error: 'x' } } });
  await h.sync.runSync();
  assert.deepEqual(h.added, ['a']);
  assert.equal(h.data[KEYS.lastSync], undefined);
  const out = harness({ sources: [{ id: PL(1) }], feeds: { [PL(1)]: [E('a', 10)] }, wl: [{ ok: false, ids: [], error: 'Not signed in to YouTube.' }] });
  await out.sync.runSync();
  assert.deepEqual(out.added, []);
  assert.equal(out.data[KEYS.inProgress], false);
});

test('no sources, feed failures, a concurrent run and a thrown error all leave the state clean', async () => {
  const none = harness({ sources: [] });
  assert.equal((await none.sync.runSync()).needsSources, true);
  assert.equal(none.data[KEYS.inProgress], false);
  const failed = harness({ sources: [{ id: PL(1) }], feeds: { [PL(1)]: new Error('HTTP 404') } });
  assert.equal((await failed.sync.runSync()).errors, 1);
  assert.equal(failed.data[KEYS.lastSync], undefined);
  assert.ok(failed.data[KEYS.log].some(l => l.level === 'error'));
  const busy = harness({ sources: [{ id: PL(1) }], stored: { [KEYS.inProgress]: true } });
  assert.equal((await busy.sync.runSync()).started, false);
  const broken = harness({ sources: [{ id: PL(1) }], feeds: { [PL(1)]: [E('a', 1)] } });
  broken.deps.ensureTab = async () => { throw new Error('no tab'); };
  const result = await createSync(broken.deps).runSync();
  assert.equal(result.error, 'no tab');
  assert.equal(broken.data[KEYS.inProgress], false);
});

test('simultaneous sync requests cannot both pass the asynchronous storage check', async () => {
  const h = harness({ sources: [] });
  const results = await Promise.all([h.sync.runSync(), h.sync.runSync()]);
  assert.equal(results.filter(result => result.started).length, 1);
  assert.equal(results.filter(result => result.started === false).length, 1);
  assert.equal(h.data[KEYS.inProgress], false);
});

test('a failed feed preserves the retry window even when another playlist adds successfully', async () => {
  const h = harness({ sources: [{ id: PL(1) }, { id: PL(2) }], stored: { [KEYS.lastSync]: 5 },
    feeds: { [PL(1)]: new Error('HTTP 503'), [PL(2)]: [E('new', 10)] },
    wl: [{ ok: true, ids: [], fingerprint: 'fp1' }, landing()] });
  const result = await h.sync.runSync();
  assert.equal(result.added, 1);
  assert.equal(result.errors, 1);
  assert.equal(h.data[KEYS.lastSync], 5);
});

test('log is capped at 50 entries', async () => {
  const h = harness({ sources: [] });
  for (let i = 0; i < 60; i++) await h.sync.appendLog(`line ${i}`);
  assert.equal(h.data[KEYS.log].length, 50);
  assert.equal(h.data[KEYS.log].at(-1).text, 'line 59');
});
