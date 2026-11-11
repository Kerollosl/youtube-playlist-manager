import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
vm.runInThisContext(fs.readFileSync(new URL('../src/innertube.js', import.meta.url), 'utf8')); // package is type:module, file is a classic script
const IT = globalThis.YTInnertube;

test('cookie reading prefers SAPISID, falls back, never matches prefixes', () => {
  assert.equal(IT.readCookie('a=1; SAPISID=abc=def; b=2', 'SAPISID'), 'abc=def');
  assert.equal(IT.getSapisid('X-SAPISID=no; __Secure-3PAPISID=fallback'), 'fallback');
  assert.equal(IT.getSapisid('a=1'), null);
});
test('SAPISIDHASH uses unix seconds and the youtube origin', async () => {
  const header = await IT.sapisidHashHeader('SECRET', 1700000000999);
  const expected = createHash('sha1').update('1700000000 SECRET https://www.youtube.com').digest('hex');
  assert.equal(header, `SAPISIDHASH 1700000000_${expected}`);
});
const cfg = (o) => (n) => ({ SESSION_INDEX: 2, DATASYNC_ID: 'dsid', INNERTUBE_CONTEXT: { client: { clientName: 'WEB', clientVersion: '2.x' } }, ...o })[n];
test('session index, context and fingerprint', async () => {
  assert.equal(IT.sessionIndex(cfg({ SESSION_INDEX: undefined })), '0');
  assert.equal(IT.sessionIndex(cfg({})), '2');
  assert.throws(() => IT.sessionIndex(cfg({ SESSION_INDEX: 'x' })), /identity/);
  assert.throws(() => IT.requireContext(cfg({ INNERTUBE_CONTEXT: undefined })), /context is unavailable/);
  const fp = await IT.accountFingerprint(cfg({}));
  assert.equal(fp, createHash('sha256').update(JSON.stringify(['2', '', 'dsid'])).digest('hex'));
  assert.notEqual(fp, await IT.accountFingerprint(cfg({ SESSION_INDEX: 3 })));
  await assert.rejects(IT.accountFingerprint(cfg({ DATASYNC_ID: '' })), /identity/);
});
test('headers carry the account index and no cookie', () => {
  const get = cfg({});
  const h = IT.buildHeaders({ get, context: get('INNERTUBE_CONTEXT'), authorization: 'SAPISIDHASH 1_x', delegated: 'page' });
  assert.equal(h['X-Goog-AuthUser'], '2');
  assert.equal(h['X-Goog-PageId'], 'page');
  assert.equal(h['X-Youtube-Client-Version'], '2.x');
});
test('429 backoff retries then returns the final response', async () => {
  const waits = [];
  let n = 0;
  globalThis.fetch = async () => ({ status: ++n < 3 ? 429 : 200, headers: { get: () => (n === 1 ? '2' : null) } });
  const r = await IT.fetchWithBackoff('u', {}, { sleep: async (ms) => waits.push(ms) });
  assert.equal(r.status, 200);
  assert.deepEqual(waits, [2000, 2000]);
  n = 0; globalThis.fetch = async () => ({ status: 429, headers: { get: () => null } });
  const w2 = [];
  const r2 = await IT.fetchWithBackoff('u', {}, { retries: 2, sleep: async (ms) => w2.push(ms) });
  assert.equal(r2.status, 429);
  assert.deepEqual(w2, [1000, 2000]);
});
