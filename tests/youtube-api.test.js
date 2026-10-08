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
  return { run, calls, config };
}

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
  const { run, calls } = page([{ status: 'STATUS_SUCCEEDED' }]);
  await assert.rejects(run({ type: 'edit', playlistId: 'PLtest', expectedFingerprint: FINGERPRINT, action: { action: 'ACTION_DELETE_PLAYLIST' } }), /not permitted/);
  await assert.rejects(run({ type: 'edit', playlistId: 'PLtest', expectedFingerprint: FINGERPRINT, action: { action: 'ACTION_REMOVE_VIDEO', videoId: VIDEO } }), /not permitted/);
  await assert.rejects(run({ type: 'edit', playlistId: 'PLtest', expectedFingerprint: FINGERPRINT, action: { action: 'toString' } }), /not permitted/);
  assert.equal(calls.length, 0);
  const result = await run({ type: 'edit', playlistId: 'PLtest', expectedFingerprint: FINGERPRINT, action: { action: 'ACTION_REMOVE_VIDEO', setVideoId: 'one' } });
  assert.equal(result.verified, false);
  assert.equal(calls[0].body.actions[0].setVideoId, 'one');
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
