import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { webcrypto, createHash } from 'node:crypto';
import { youtubeCommand } from '../src/youtube-api.js';

const VIDEO = 'abcdefghijk';
const OTHER = 'lmnopqrstuv';
const FINGERPRINT = createHash('sha256').update(JSON.stringify(['2', 'channel-test', 'test-account-identity'])).digest('hex');
const row = (setVideoId, videoId = VIDEO) => ({ playlistVideoRenderer: {
  setVideoId, videoId, title: { runs: [{ text: 'Video' }] },
  shortBylineText: { simpleText: 'Channel' }, lengthSeconds: '90',
  index: { simpleText: '1' }, isPlayable: true
} });
const continuation = token => ({ continuationItemRenderer: {
  continuationEndpoint: { continuationCommand: { token } }
} });
const initial = contents => ({ contents: { twoColumnBrowseResultsRenderer: {
  tabs: [{ tabRenderer: { content: { playlistVideoListRenderer: {
    playlistId: 'PLtest', targetId: 'playlist-video-list', isEditable: true, canReorder: true, contents
  } } } }]
} }, metadata: { playlistMetadataRenderer: { title: 'Test playlist' } } });
const emptyPlaylist = () => ({
  header: { pageHeaderRenderer: { content: { pageHeaderViewModel: {} } } },
  microformat: { microformatDataRenderer: { urlCanonical: 'https://www.youtube.com/playlist?list=PLtest' } },
  contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: {
    selected: true, content: { sectionListRenderer: { contents: [{ itemSectionRenderer: {
      contents: [{ messageRenderer: { text: { simpleText: 'No videos in this playlist yet' } } }]
    } }] } }
  } }] } }
});
const picker = (playlistId = 'PLtest') => ({ contents: [{ addToPlaylistRenderer: {
  playlists: [{ playlistAddToOptionRenderer: { playlistId, title: { simpleText: 'Test' } } }]
} }] });

function page(responses, configOverrides = {}) {
  const calls = [];
  const config = {
    INNERTUBE_CONTEXT: { client: { clientName: 'WEB', clientVersion: '2.current' },
      user: { onBehalfOfUser: 'channel-test' } },
    SESSION_INDEX: 2, DATASYNC_ID: 'test-account-identity', LOGGED_IN: true,
    ...configOverrides
  };
  const sandbox = { location: { origin: 'https://www.youtube.com' },
    window: { ytcfg: { get: key => config[key] } },
    document: { cookie: 'SAPISID=test-secret-cookie' },
    crypto: webcrypto, TextEncoder, URL, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      const next = responses.shift();
      if (typeof next === 'function') return next(calls.at(-1), config, sandbox.document);
      if (next instanceof Error) throw next;
      return { ok: true, status: 200, json: async () => next };
    }
  };
  // This verifies that Chrome's serialized function has no module closures.
  const run = vm.runInNewContext(`(${youtubeCommand.toString()})`, sandbox);
  return { run, calls, config, document: sandbox.document };
}

test('account identity check avoids network requests and exposes no credentials', async () => {
  const { run, calls } = page([]);
  const result = await run({ type: 'account' });
  assert.equal(result.ok, true);
  assert.equal(result.fingerprint, FINGERPRINT);
  assert.deepEqual(Object.keys(result).sort(), ['fingerprint', 'ok']);
  assert.equal(calls.length, 0);
});

for (const missing of ['identity', 'cookie', 'signed-in session']) test(`account identity check rejects missing ${missing} before any request`, async () => {
  const { run, calls, config, document } = page([]);
  if (missing === 'identity') {
    config.DATASYNC_ID = '';
    config.INNERTUBE_CONTEXT.user = {};
  } else if (missing === 'cookie') document.cookie = '';
  else config.LOGGED_IN = false;
  await assert.rejects(run({ type: 'account' }), /identity is unavailable|Sign in/);
  assert.equal(calls.length, 0);
});

test('account identity check rejects a session switch during asynchronous hashing', async () => {
  const { run, calls, config } = page([]);
  const pending = run({ type: 'account' });
  config.DATASYNC_ID = 'changed-account';
  await assert.rejects(pending, /account changed/);
  assert.equal(calls.length, 0);
});

test('serialized read retains duplicate occurrences and scopes continuation', async () => {
  const first = initial([row('one'), continuation('page-two')]);
  first.sidebar = { playlistVideoRenderer: { videoId: OTHER, setVideoId: 'unrelated' } };
  first.header = continuation('unrelated-continuation');
  const { run, calls } = page([first, { onResponseReceivedActions: [{ appendContinuationItemsAction: {
    targetId: 'playlist-video-list', continuationItems: [row('two')]
  } }] }]);
  const result = await run({ type: 'read', playlistId: 'PLtest' });
  assert.equal(result.complete, true);
  assert.equal(result.items.length, 2);
  assert.deepEqual(Array.from(result.items, item => item.setVideoId), ['one', 'two']);
  assert.deepEqual(Array.from(result.items, item => item.videoId), [VIDEO, VIDEO]);
  assert.equal(calls[1].body.continuation, 'page-two');
  assert.equal(calls[0].options.headers['X-Goog-AuthUser'], '2');
  assert.equal(calls[0].options.headers['X-Goog-PageId'], 'channel-test');
  assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(result).includes('test-secret-cookie'));
});

test('read reports incomplete on unknown response and repeated continuation', async () => {
  const unknown = page([initial([row('one'), continuation('next')]), { contents: {} }]);
  assert.equal((await unknown.run({ type: 'read', playlistId: 'PLtest' })).complete, false);
  const repeated = page([initial([row('one'), continuation('next')]), {
    onResponseReceivedEndpoints: [{ appendContinuationItemsAction: {
      continuationItems: [row('two'), continuation('next')]
    } }]
  }]);
  const result = await repeated.run({ type: 'read', playlistId: 'PLtest' });
  assert.equal(result.complete, false);
  assert.equal(repeated.calls.length, 2);
});

test('read marks unsupported rows and overlapping occurrence IDs incomplete', async () => {
  const { run } = page([initial([row('one'), row('one'), { lockupViewModel: {} }])]);
  const result = await run({ type: 'read', playlistId: 'PLtest' });
  assert.equal(result.complete, false);
  assert.equal(result.items.length, 2);
});

test('read preserves partial results on failed pagination', async () => {
  const { run } = page([initial([row('one'), continuation('next')]), new Error('network')]);
  const result = await run({ type: 'read', playlistId: 'PLtest' });
  assert.equal(result.complete, false);
  assert.equal(result.items.length, 1);
  assert.ok(result.warnings.length);
});

test('rejects a mismatched playlist', async () => {
  const data = initial([]);
  data.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.playlistVideoListRenderer.playlistId = 'PLwrong';
  const { run } = page([data]);
  await assert.rejects(run({ type: 'read', playlistId: 'PLtest' }), /different playlist/);
});

test('allows only exact safe actions and acknowledges without claiming verification', async () => {
  const { run, calls } = page([{ status: 'STATUS_SUCCEEDED' }, { status: 'STATUS_SUCCEEDED' }]);
  await assert.rejects(run({ type: 'edit', playlistId: 'PLtest', expectedFingerprint: FINGERPRINT, action: { action: 'ACTION_DELETE_PLAYLIST' } }), /not permitted/);
  await assert.rejects(run({ type: 'edit', playlistId: 'PLtest', expectedFingerprint: FINGERPRINT, action: { action: 'ACTION_REMOVE_VIDEO', videoId: VIDEO } }), /not permitted/);
  await assert.rejects(run({ type: 'edit', playlistId: 'PLtest', expectedFingerprint: FINGERPRINT, action: { action: 'toString' } }), /not permitted/);
  assert.equal(calls.length, 0);
  const result = await run({ type: 'edit', playlistId: 'PLtest', expectedFingerprint: FINGERPRINT, action: { action: 'ACTION_REMOVE_VIDEO', setVideoId: 'one' } });
  assert.equal(result.verified, false);
  assert.equal(calls[0].body.actions[0].setVideoId, 'one');
  const batch = await run({ type: 'edit', playlistId: 'PLtest', expectedFingerprint: FINGERPRINT, actions: [
    { action: 'ACTION_ADD_VIDEO', addedVideoId: VIDEO },
    { action: 'ACTION_REMOVE_VIDEO', setVideoId: 'two' }
  ] });
  assert.equal(batch.verified, false);
  assert.equal(calls[1].body.actions.length, 2);
});

test('invalid batches are rejected in full before any network request', async () => {
  const { run, calls } = page([]);
  const valid = { action: 'ACTION_ADD_VIDEO', addedVideoId: VIDEO };
  for (const actions of [[], Array.from({ length: 51 }, () => valid), [valid, { action: 'ACTION_DELETE_PLAYLIST' }]]) {
    await assert.rejects(run({ type: 'edit', playlistId: 'PLtest', expectedFingerprint: FINGERPRINT, actions }), /playlist actions|not permitted/);
  }
  await assert.rejects(run({ type: 'edit', playlistId: 'PLtest', expectedFingerprint: FINGERPRINT, action: valid, actions: [valid] }), /not permitted/);
  assert.equal(calls.length, 0);
});

test('HTTP 200 error, unknown and unreadable mutation responses fail closed', async () => {
  for (const response of [{ error: { code: 403, message: 'sensitive response' } }, {},
    () => ({ ok: true, status: 200, json: async () => { throw new Error('not-json'); } })]) {
    const { run } = page([response]);
    await assert.rejects(run({ type: 'edit', playlistId: 'PLtest', expectedFingerprint: FINGERPRINT, action: {
      action: 'ACTION_ADD_VIDEO', addedVideoId: VIDEO
    } }), /rejected|unknown|unreadable/);
  }
});

test('stops pagination when the signed-in account changes', async () => {
  const { run, calls } = page([(_call, config) => {
    config.SESSION_INDEX = 3;
    return { ok: true, status: 200, json: async () => initial([row('one'), continuation('next')]) };
  }]);
  const result = await run({ type: 'read', playlistId: 'PLtest' });
  assert.equal(result.complete, false);
  assert.match(result.warnings[0], /account changed/);
  assert.equal(calls.length, 1);
});

test('playlist picker parses known menu and private creation returns only ID', async () => {
  const { run, calls } = page([{ contents: [{ addToPlaylistRenderer: { playlists: [
    { playlistAddToOptionRenderer: { playlistId: 'PLtarget', title: { simpleText: 'Target' }, privacy: 'PRIVATE' } }
  ] } }] }, { playlistId: 'PLnew' }]);
  const menus = await run({ type: 'playlists', videoId: VIDEO });
  assert.equal(menus.playlists[0].title, 'Target');
  const created = await run({ type: 'create', title: 'New', videoIds: [VIDEO], expectedFingerprint: FINGERPRINT });
  assert.equal(created.playlistId, 'PLnew');
  assert.equal(calls[1].body.privacyStatus, 'PRIVATE');
});

test('mutation account fingerprint is required and checked before any fetch', async () => {
  const { run, calls } = page([]);
  const action = { action: 'ACTION_REMOVE_VIDEO', setVideoId: 'one' };
  await assert.rejects(run({ type: 'edit', playlistId: 'PLtest', action }), /Refresh|fingerprint/);
  await assert.rejects(run({ type: 'edit', playlistId: 'PLtest', action, expectedFingerprint: 'a'.repeat(64) }), /account changed/);
  await assert.rejects(run({ type: 'create', title: 'Test', videoIds: [], expectedFingerprint: 'a'.repeat(64) }), /account changed/);
  assert.equal(calls.length, 0);
});

test('missing stable account identity rejects read and edit before fetch', async () => {
  const { run, calls } = page([], {
    DATASYNC_ID: undefined,
    INNERTUBE_CONTEXT: { client: { clientName: 'WEB', clientVersion: 'test' }, user: {} }
  });
  await assert.rejects(run({ type: 'read', playlistId: 'PLtest' }), /account identity is unavailable/);
  await assert.rejects(run({ type: 'edit', playlistId: 'PLtest', expectedFingerprint: FINGERPRINT,
    action: { action: 'ACTION_REMOVE_VIDEO', setVideoId: 'one' } }), /account identity is unavailable/);
  assert.equal(calls.length, 0);
});

test('delegated identity can identify a session without DATASYNC_ID', async () => {
  const { run } = page([initial([row('one')])], { DATASYNC_ID: undefined });
  const result = await run({ type: 'read', playlistId: 'PLtest' });
  assert.equal(result.complete, true);
  assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
});

test('authentication cookie change stops pagination without exposing cookie values', async () => {
  const { run, calls } = page([(_call, _config, document) => {
    document.cookie = 'SAPISID=changed-secret-cookie';
    return { ok: true, status: 200, json: async () => initial([row('one'), continuation('next')]) };
  }]);
  const result = await run({ type: 'read', playlistId: 'PLtest' });
  assert.equal(result.complete, false);
  assert.match(result.warnings[0], /account changed/);
  assert.equal(calls.length, 1);
  assert.ok(!JSON.stringify(result).includes('secret-cookie'));
});

test('modern empty playlist proves enumeration and verifies editability with account-bound picker', async () => {
  const { run, calls } = page([emptyPlaylist(), picker()]);
  const result = await run({ type: 'read', playlistId: 'PLtest' });
  assert.equal(result.complete, true);
  assert.equal(result.editable, true);
  assert.equal(result.items.length, 0);
  assert.equal(result.pages, 1);
  assert.equal(result.diagnostics.identity.canonical, true);
  assert.deepEqual(Array.from(result.diagnostics.bodyRowRenderers), ['messageRenderer']);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].url.includes('/playlist/get_add_to_playlist'));
  assert.ok(!JSON.stringify(result.diagnostics).includes('PLtest'));
  assert.ok(!JSON.stringify(result.diagnostics).includes('secret-cookie'));
});

test('authoritative header identity and editability support empty playlists without a picker', async () => {
  const data = emptyPlaylist();
  delete data.microformat;
  data.header = { playlistHeaderRenderer: { playlistId: 'PLtest', isEditable: true,
    numVideosText: { simpleText: 'No videos' } } };
  const { run, calls } = page([data]);
  const result = await run({ type: 'read', playlistId: 'PLtest' });
  assert.equal(result.complete, true);
  assert.equal(result.editable, true);
  assert.equal(calls.length, 1);
});

test('empty playlist header edit endpoint must target exact playlist', async () => {
  const data = emptyPlaylist();
  delete data.microformat;
  data.header.pageHeaderRenderer.content.pageHeaderViewModel.actions = {
    playlistEditEndpoint: { playlistId: 'PLtest', actions: [{ action: 'ACTION_SET_PLAYLIST_NAME' }] }
  };
  const { run, calls } = page([data]);
  const result = await run({ type: 'read', playlistId: 'PLtest' });
  assert.equal(result.editable, true);
  assert.equal(result.complete, true);
  assert.equal(result.diagnostics.identity.headerActions, true);
  assert.equal(calls.length, 1);
});

test('modern empty header playlist navigation proves identity and uses a real picker video', async () => {
  const data = emptyPlaylist();
  delete data.microformat;
  data.header.pageHeaderRenderer.content.pageHeaderViewModel.actions = {
    flexibleActionsViewModel: { actionsRows: [{ actions: [{ buttonViewModel: {
      onTap: { innertubeCommand: { browseEndpoint: { browseId: 'VLPLtest' } } }
    } }] }] }
  };
  const { run, calls } = page([data, picker()]);
  const result = await run({ type: 'read', playlistId: 'PLtest', pickerVideoId: VIDEO });
  assert.equal(result.complete, true);
  assert.equal(result.editable, true);
  assert.deepEqual(Array.from(calls[1].body.videoIds), [VIDEO]);
  assert.equal(result.diagnostics.identity.headerActions, true);
  assert.ok(result.diagnostics.headerIdentityPaths[0].endsWith('.browseEndpoint.browseId'));
  assert.ok(result.diagnostics.headerActionSchemaPaths.some(path => path.endsWith('.buttonViewModel')));
  assert.ok(!JSON.stringify(result.diagnostics).includes('PLtest'));
});

test('modern header playlist references reject conflicting IDs before picker', async () => {
  for (const reference of [
    { playlistEditEndpoint: { playlistId: 'PLwrong' } },
    { browseEndpoint: { browseId: 'VLPLwrong' } }
  ]) {
    const data = emptyPlaylist();
    data.header.pageHeaderRenderer.content.pageHeaderViewModel.actions = {
      commands: [{ playlistEditEndpoint: { playlistId: 'PLtest' } }, reference]
    };
    const { run, calls } = page([data]);
    await assert.rejects(run({ type: 'read', playlistId: 'PLtest' }), /different playlist/);
    assert.equal(calls.length, 1);
  }
});

test('unrelated identity and metadata title cannot establish an empty playlist', async () => {
  const data = emptyPlaylist();
  delete data.microformat;
  data.metadata = { playlistMetadataRenderer: { title: 'Test' } };
  data.sidebar = { playlistEditEndpoint: { playlistId: 'PLtest' } };
  data.header.pageHeaderRenderer.content.pageHeaderViewModel.title = { playlistId: 'PLtest' };
  const { run, calls } = page([data, picker('PLunrelated')]);
  const result = await run({ type: 'read', playlistId: 'PLtest' });
  assert.equal(result.complete, false);
  assert.equal(calls.length, 2);
});

test('ID-free modern empty response uses exact unique owned picker ID and metadata title', async () => {
  const data = emptyPlaylist();
  delete data.microformat;
  data.metadata = { playlistMetadataRenderer: { title: 'Test' } };
  const { run, calls } = page([data, picker()]);
  const result = await run({ type: 'read', playlistId: 'PLtest', pickerVideoId: VIDEO });
  assert.equal(result.complete, true);
  assert.equal(result.editable, true);
  assert.equal(result.diagnostics.identity.ownedPicker, true);
  assert.equal(result.items.length, 0);
  assert.equal(calls.length, 2);
  assert.deepEqual(Array.from(calls[1].body.videoIds), [VIDEO]);
});

test('ID-free empty response rejects absent, conflicting and ambiguous owned picker evidence', async () => {
  const wrongTitle = picker();
  wrongTitle.contents[0].addToPlaylistRenderer.playlists[0].playlistAddToOptionRenderer.title.simpleText = 'Different';
  const duplicateTitle = picker();
  duplicateTitle.contents[0].addToPlaylistRenderer.playlists.push({
    playlistAddToOptionRenderer: { playlistId: 'PLother', title: { simpleText: 'Test' } }
  });
  const duplicateId = picker();
  duplicateId.contents[0].addToPlaylistRenderer.playlists.push({
    playlistAddToOptionRenderer: { playlistId: 'PLtest', title: { simpleText: 'Other title' } }
  });
  for (const response of [picker('PLwrong'), wrongTitle, duplicateTitle, duplicateId,
    { contents: [] }, new Error('offline')]) {
    const data = emptyPlaylist();
    delete data.microformat;
    data.metadata = { playlistMetadataRenderer: { title: 'Test' } };
    const result = await page([data, response]).run({ type: 'read', playlistId: 'PLtest', pickerVideoId: VIDEO });
    assert.equal(result.complete, false);
    assert.equal(result.editable, false);
    assert.equal(result.diagnostics.identity.ownedPicker, false);
  }
});

test('owned picker cannot override contradictory identity, positive count or hidden continuation', async () => {
  for (const modify of [
    data => { data.header.pageHeaderRenderer.content.pageHeaderViewModel.actions = {
      playlistEditEndpoint: { playlistId: 'PLwrong' }
    }; },
    data => { data.header.pageHeaderRenderer.content.pageHeaderViewModel.metadata = {
      contentMetadataViewModel: { metadataRows: [{ metadataParts: [{ text: { content: '1 video' } }] }] }
    }; },
    data => { data.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer
      .continuations = [{ nextContinuationData: { continuation: 'hidden' } }]; }
  ]) {
    const data = emptyPlaylist();
    delete data.microformat;
    data.metadata = { playlistMetadataRenderer: { title: 'Test' } };
    modify(data);
    const { run, calls } = page([data, picker()]);
    try {
      assert.equal((await run({ type: 'read', playlistId: 'PLtest', pickerVideoId: VIDEO })).complete, false);
    } catch (error) {
      assert.match(error.message, /different playlist/);
    }
    assert.equal(calls.length, 1);
  }
});

test('ID-free empty verification aborts if account changes during picker response', async () => {
  const data = emptyPlaylist();
  delete data.microformat;
  data.metadata = { playlistMetadataRenderer: { title: 'Test' } };
  const { run } = page([data, (_call, config) => {
    config.DATASYNC_ID = 'another-account';
    return { ok: true, status: 200, json: async () => picker() };
  }]);
  await assert.rejects(run({ type: 'read', playlistId: 'PLtest', pickerVideoId: VIDEO }), /account changed/);
});

test('read rejects invalid picker video IDs before fetch', async () => {
  const { run, calls } = page([]);
  await assert.rejects(run({ type: 'read', playlistId: 'PLtest', pickerVideoId: 'invalid' }), /picker video/);
  assert.equal(calls.length, 0);
});

test('missing list ID can use matching canonical identity but rejects disagreement', async () => {
  const data = initial([row('one')]);
  delete data.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.playlistVideoListRenderer.playlistId;
  data.microformat = emptyPlaylist().microformat;
  const good = page([data]);
  assert.equal((await good.run({ type: 'read', playlistId: 'PLtest' })).complete, true);
  data.header = { playlistHeaderRenderer: { playlistId: 'PLdifferent' } };
  await assert.rejects(page([data]).run({ type: 'read', playlistId: 'PLtest' }), /different playlist/);
});

test('empty-looking unsupported or ambiguous bodies remain incomplete', async () => {
  const modifications = [
    data => { delete data.microformat; },
    data => { data.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents[0]
      .itemSectionRenderer.contents[0].messageRenderer.text.simpleText = 'Playlist unavailable'; },
    data => { data.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents[0]
      .itemSectionRenderer.contents.push({ lockupViewModel: {} }); },
    data => { data.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents[0]
      .itemSectionRenderer.contents.push(continuation('next')); },
    data => { data.header.playlistHeaderRenderer = { playlistId: 'PLtest', numVideosText: { simpleText: '2 videos' } }; },
    data => { data.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.richGridRenderer = {}; },
    data => { data.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.unknownBody = {}; },
    data => { data.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents[0]
      .itemSectionRenderer.unknownBody = {}; },
    data => { data.header.pageHeaderRenderer.content.pageHeaderViewModel.metadata = {
      contentMetadataViewModel: { metadataRows: [{ metadataParts: [{ text: { content: '2 videos' } }] }] }
    }; }
  ];
  for (const modify of modifications) {
    const data = emptyPlaylist();
    modify(data);
    const { run, calls } = page([data]);
    const result = await run({ type: 'read', playlistId: 'PLtest' });
    assert.equal(result.complete, false);
    assert.equal(calls.length, 1);
  }
});

test('empty read does not infer editability from absent or unavailable picker target', async () => {
  for (const response of [picker('PLother'), new Error('network')]) {
    const { run } = page([emptyPlaylist(), response]);
    const result = await run({ type: 'read', playlistId: 'PLtest' });
    assert.equal(result.complete, true);
    assert.equal(result.editable, false);
  }
});

test('empty read rejects conflicting canonical identity and account change during picker', async () => {
  const data = emptyPlaylist();
  data.microformat.microformatDataRenderer.urlCanonical = 'https://www.youtube.com/playlist?list=PLwrong';
  await assert.rejects(page([data]).run({ type: 'read', playlistId: 'PLtest' }), /different playlist/);
  const changed = page([emptyPlaylist(), (_call, config) => {
    config.DATASYNC_ID = 'another-account';
    return { ok: true, status: 200, json: async () => picker() };
  }]);
  await assert.rejects(changed.run({ type: 'read', playlistId: 'PLtest' }), /account changed/);
});
