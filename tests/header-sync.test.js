import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// The content script is intentionally not an ES module. Exercise its real
// sync handler without starting a browser or making any YouTube requests.
const source = fs.readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('  let quickSyncPending = false;'), source.indexOf('  // The sync panel'));
function controller(reply) {
  const messages = [], notices = [];
  let opened = 0;
  const context = vm.createContext({
    chrome: { runtime: { sendMessage: async message => { messages.push(message.type); return reply(); } } },
    announce: text => notices.push(text),
    updateWatchLaterControls() {},
    watchLaterDialog() { opened++; }
  });
  vm.runInContext(handler + '\nglobalThis.runSync = quickWatchLaterSync;', context);
  return { run: context.runSync, messages, notices, opened: () => opened };
}

test('Sync never opens configuration, including when no playlists have been configured', async () => {
  for (const result of [
    { ok: true, started: true, needsSources: true },
    { ok: true, started: true, added: 3, errors: 0 },
    { ok: true, started: false },
    { ok: true, started: true, aborted: true }
  ]) {
    const h = controller(() => result);
    await h.run();
    assert.deepEqual(h.messages, ['WL_QUICK_SYNC']);
    assert.equal(h.opened(), 0);
    if (result.needsSources) assert.match(h.notices.at(-1), /settings side/);
  }
});

test('a second Sync click cannot start another request while the first is pending', async () => {
  let complete;
  const h = controller(() => new Promise(resolve => { complete = resolve; }));
  const first = h.run();
  await h.run();
  assert.deepEqual(h.messages, ['WL_QUICK_SYNC']);
  complete({ ok: true, started: true, added: 0 });
  await first;
  assert.equal(h.opened(), 0);
});
