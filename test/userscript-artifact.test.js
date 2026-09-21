import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getUserscriptHeader, validateUserscript } from '../scripts/validate-userscript.mjs';

const code = readFileSync(new URL('../bilibili-popup-player-nano.user.js', import.meta.url), 'utf8');

test('built userscript retains its installation metadata and the distribution matches it', () => {
  const metadata = validateUserscript(code);
  assert.equal(metadata.name[0], 'Bilibili Popup Player');
  assert.equal(metadata.namespace[0], 'https://www.bilibili.com/');
  assert.equal(metadata.license[0], 'AGPL-3.0-only');
  assert.equal(metadata['run-at'][0], 'document-idle');
  assert.deepEqual(new Set(metadata.grant), new Set(['GM_getValue', 'GM_setValue', 'GM_deleteValue', 'unsafeWindow']));
  for (const host of ['www', 'space', 'search', 'live', 't']) {
    assert.ok(metadata.match.includes(`https://${host}.bilibili.com/*`));
  }
  assert.equal(code, readFileSync(new URL('../dist/bilibili-popup-player-nano.user.js', import.meta.url), 'utf8'));
});

test('update metadata and downloadable scripts describe the same release', () => {
  const metadata = validateUserscript(code);
  assert.deepEqual(metadata.updateURL, ['https://pop-player.nanachi.moe/bilibili-popup-player-nano.meta.js']);
  assert.deepEqual(metadata.downloadURL, ['https://pop-player.nanachi.moe/bilibili-popup-player-nano.user.js']);
  for (const path of ['../bilibili-popup-player-nano.meta.js', '../dist/bilibili-popup-player-nano.meta.js']) {
    const metaCode = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.equal(metaCode, `${getUserscriptHeader(code)}\n`);
    assert.deepEqual(validateUserscript(metaCode), metadata);
  }
});

test('both stable update endpoints are deployed with revalidation headers', () => {
  const headers = readFileSync(new URL('../dist/_headers', import.meta.url), 'utf8');
  const rules = new Map(headers.trim().split(/\n\s*\n/).map((rule) => {
    const [path, ...lines] = rule.split('\n');
    return [path, lines.map((line) => line.trim())];
  }));
  const metadata = validateUserscript(code);
  for (const url of [metadata.updateURL[0], metadata.downloadURL[0]]) {
    const rule = rules.get(new URL(url).pathname);
    assert.ok(rule, `Missing deployment headers for ${url}`);
    assert.ok(rule.includes('Cache-Control: no-cache, max-age=0, must-revalidate'));
    assert.ok(rule.includes('Content-Type: application/javascript; charset=utf-8'));
  }
});

test('build validation rejects a valid JavaScript program with its userscript header stripped', () => {
  const body = code.slice(code.indexOf('// ==/UserScript==') + '// ==/UserScript=='.length).trimStart();
  assert.throws(() => validateUserscript(body), /UserScript metadata header/);
});

test('build validation rejects missing or ambiguous update metadata', () => {
  const header = `${getUserscriptHeader(code)}\n`;
  for (const key of ['version', 'updateURL', 'downloadURL']) {
    const field = new RegExp(`^// @${key}[^\\n]*\\n`, 'm');
    assert.throws(() => validateUserscript(header.replace(field, '')), new RegExp(`missing @${key}`));
    assert.throws(() => validateUserscript(header.replace(field, '$&$&')), new RegExp(`exactly one @${key}`));
  }
});

test('build validation rejects update URLs that cannot support production updates', () => {
  const header = `${getUserscriptHeader(code)}\n`;
  for (const key of ['updateURL', 'downloadURL']) {
    for (const value of ['none', '/script.user.js', 'http://example.com/script.user.js', 'https://user:password@example.com/script.user.js']) {
      const invalid = header.replace(new RegExp(`(// @${key}\\s+)[^\\n]+`), `$1${value}`);
      assert.throws(() => validateUserscript(invalid), new RegExp(`@${key} must be an absolute HTTPS URL`));
    }
  }
  const invalidVersion = header.replace(/(\/\/ @version\s+)[^\n]+/, '$1not-a-version');
  assert.throws(() => validateUserscript(invalidVersion), /@version must be a stable/);
});
