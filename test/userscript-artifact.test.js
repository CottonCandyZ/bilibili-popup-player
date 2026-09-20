import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateUserscript } from '../scripts/validate-userscript.mjs';

const code = readFileSync(new URL('../bilibili-popup-player-nano.user.js', import.meta.url), 'utf8');

test('built userscript retains its installation metadata and the distribution matches it', () => {
  const metadata = validateUserscript(code);
  assert.equal(metadata.name[0], 'Bilibili Popup Player');
  assert.equal(metadata.license[0], 'AGPL-3.0-only');
  assert.equal(metadata['run-at'][0], 'document-idle');
  assert.deepEqual(new Set(metadata.grant), new Set(['GM_getValue', 'GM_setValue', 'GM_deleteValue', 'unsafeWindow']));
  for (const host of ['www', 'space', 'search', 'live', 't']) {
    assert.ok(metadata.match.includes(`https://${host}.bilibili.com/*`));
  }
  assert.equal(code, readFileSync(new URL('../dist/bilibili-popup-player-nano.user.js', import.meta.url), 'utf8'));
});

test('build validation rejects a valid JavaScript program with its userscript header stripped', () => {
  const body = code.slice(code.indexOf('// ==/UserScript==') + '// ==/UserScript=='.length).trimStart();
  assert.throws(() => validateUserscript(body), /UserScript metadata header/);
});
