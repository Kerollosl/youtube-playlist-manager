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
const files = [manifest.background.service_worker, manifest.action.default_popup, ...Object.values(manifest.icons), ...manifest.content_scripts.flatMap(script => [...script.js, ...(script.css || [])])];
assert.ok(manifest.description.length <= 132, 'Manifest description is over 132 characters');
assert.deepEqual(manifest.web_accessible_resources, [{
  resources: ['src/popup.html'], matches: ['https://www.youtube.com/*']
}], 'Only the embedded panel entry point should be web-accessible, only to YouTube');
files.push('src/ui.css', 'src/popup.css', 'src/popup.js', 'src/watch-later.js', 'src/watch-later-worker.js');
assert.deepEqual(manifest.permissions.slice().sort(), ['clipboardWrite', 'scripting', 'storage']);
for (const file of files) assert.ok(fs.existsSync(path.join(root, file)), `Missing ${file}`);
for (const file of fs.readdirSync(path.join(root, 'src')).filter(file => file.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, 'src', file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
console.log('Manifest, permissions, referenced files, and JS syntax checks passed.');
// MV3: no inline scripts or handlers in the popup.
const popup = fs.readFileSync(path.join(root, manifest.action.default_popup), 'utf8');
assert.ok(!/<script(?![^>]*\ssrc=)/i.test(popup) && !/\son[a-z]+\s*=/i.test(popup), 'Popup must not contain inline scripts');
