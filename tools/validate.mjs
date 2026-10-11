import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
assert.equal(manifest.manifest_version, 3);
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.deepEqual(manifest.host_permissions, ['https://www.youtube.com/*']);
assert.ok(!manifest.permissions.includes('cookies'));
const files = [manifest.background.service_worker, ...Object.values(manifest.icons), ...manifest.content_scripts.flatMap(script => [...script.js, ...(script.css || [])]), ...manifest.web_accessible_resources.flatMap(entry => entry.resources)];
for (const entry of manifest.web_accessible_resources) {
  assert.deepEqual(entry.matches, ['https://www.youtube.com/*']);
  assert.ok(entry.resources.every(file => file.endsWith('.css')), 'Only UI styles should be exposed');
}
for (const file of files) assert.ok(fs.existsSync(path.join(root, file)), `Missing ${file}`);
for (const file of fs.readdirSync(path.join(root, 'src')).filter(file => file.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, 'src', file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
console.log('Manifest, permissions, referenced files, and JS syntax checks passed.');
