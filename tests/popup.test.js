import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import * as helpers from '../src/watch-later.js';

// Exercise the controller with a small DOM double. Rendering still needs Chrome.
const script = fs.readFileSync(new URL('../src/popup.js', import.meta.url), 'utf8').replace(/^import .*;$/m, '');
const html = fs.readFileSync(new URL('../src/popup.html', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
async function popup({ sources = [{ id: 'PLabcdefghij1', label: 'Lectures' }], embedded = false, configure = false, reply } = {}) {
  const nodes = new Map();
  function node() {
    const classes = new Set();
    return {
      hidden: false, disabled: false, value: '', textContent: '', dataset: {}, style: {}, attributes: {}, children: [], events: {},
      classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, handler) { this.events[name] = handler; },
      replaceChildren(...children) { this.children = children; },
      append(...children) { this.children.push(...children); },
      closest(selector) { return nodes.get(selector === 'section' ? 'selection-section' : 'activity'); },
      getClientRects() { return this.hidden ? [] : [{}]; }
    };
  }
  for (const match of html.matchAll(/id="([^"]+)"/g)) nodes.set(match[1], node());
  nodes.set('selection-section', node()); nodes.set('activity', node());
  const data = { [helpers.KEYS.sources]: sources };
  const sent = [], windowEvents = {}, documentEvents = {}, posts = [];
  let storageChanged;
  const document = {
    documentElement: node(), getElementById: id => nodes.get(id), createElement: node,
    addEventListener: (name, handler) => { documentEvents[name] = handler; }
  };
  const parent = { postMessage: (...args) => posts.push(args) };
  const sandbox = { ...helpers, document, parent, URLSearchParams,
    location: { search: embedded ? `?embed=1&theme=dark${configure ? '&configure=1' : ''}` : '' },
    window: { addEventListener: (name, handler) => { windowEvents[name] = handler; } },
    chrome: {
      tabs: { query: async () => [] },
      runtime: {
        sendMessage: async message => { sent.push(message.type); return message.type === 'WL_STATUS' ? { ok: true, running: false } : reply(message); },
        onMessage: { addListener: () => {} }
      },
      storage: {
        local: {
          get: async keys => Object.fromEntries(keys.map(key => [key, data[key]])),
          set: async update => Object.assign(data, update)
        },
        onChanged: { addListener: handler => { storageChanged = handler; } }
      }
    }
  };
  vm.runInNewContext(script, sandbox);
  await flush();
  return { nodes, document, sent, windowEvents, documentEvents, posts, parent, storageChanged };
}

test('saved playlists show direct sync with configuration collapsed; first run opens configuration', async () => {
  const saved = await popup();
  assert.equal(saved.sent[0], 'WL_STATUS');
  assert.equal(saved.nodes.get('settings').hidden, true);
  assert.equal(saved.nodes.get('sync').disabled, false);
  assert.equal(saved.nodes.get('source-count').textContent, '1 playlist selected');
  saved.nodes.get('settings-toggle').events.click();
  assert.equal(saved.nodes.get('settings').hidden, false);
  assert.equal(saved.nodes.get('settings-toggle').attributes['aria-expanded'], 'true');
  const first = await popup({ sources: [] });
  assert.equal(first.nodes.get('settings').hidden, false);
  assert.equal(first.nodes.get('sync').disabled, true);
});

test('direct sync submits saved settings once and displays the actual completion', async () => {
  let complete;
  const h = await popup({ reply: () => new Promise(resolve => { complete = resolve; }) });
  const first = h.nodes.get('sync').events.click();
  assert.equal(h.nodes.get('sync').disabled, true);
  await h.nodes.get('sync').events.click();
  assert.equal(h.sent.filter(type => type === 'WL_START_SYNC').length, 1);
  complete({ ok: true, started: true, added: 2, errors: 0 });
  await first;
  assert.equal(h.nodes.get('sync-result').textContent, 'Added 2 new videos.');
  assert.equal(h.nodes.get('settings').hidden, true);
  assert.equal(h.nodes.get('sync').disabled, false);
});

test('missing response, transport failure and incomplete sync expose recovery instead of hanging', async () => {
  for (const reply of [() => undefined, () => { throw new Error('Worker disconnected'); }, () => ({ ok: true, errors: 1, added: 0 })]) {
    const h = await popup({ reply });
    await h.nodes.get('sync').events.click();
    assert.equal(h.nodes.get('sync-result').classList.contains('err'), true);
    assert.equal(h.nodes.get('activity').open, true);
    assert.equal(h.nodes.get('sync').disabled, false);
    assert.equal(h.nodes.get('progress').hidden, true);
  }
});

test('embedded panel hides multiselect, follows trusted theme changes, and forwards Escape', async () => {
  const h = await popup({ embedded: true, configure: true });
  assert.equal(h.nodes.get('settings').hidden, false);
  assert.equal(h.nodes.get('selection-section').hidden, true);
  assert.equal(h.document.documentElement.dataset.theme, 'dark');
  h.windowEvents.message({ source: h.parent, origin: 'https://example.com', data: { type: 'WL_THEME', theme: 'light' } });
  assert.equal(h.document.documentElement.dataset.theme, 'dark');
  h.windowEvents.message({ source: h.parent, origin: 'https://www.youtube.com', data: { type: 'WL_THEME', theme: 'light' } });
  assert.equal(h.document.documentElement.dataset.theme, 'light');
  h.documentEvents.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(h.posts[0][0].type, 'WL_CLOSE_PANEL');
  assert.equal(h.posts[0][1], 'https://www.youtube.com');
});
