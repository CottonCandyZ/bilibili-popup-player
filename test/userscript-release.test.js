import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { checkPublishedUserscript } from '../scripts/check-published-userscript.mjs';
import { resolveReleaseVersion } from '../scripts/release-version.mjs';
import { getUserscriptHeader, validateUserscript } from '../scripts/validate-userscript.mjs';

const artifact = readFileSync(new URL('../bilibili-popup-player-nano.user.js', import.meta.url), 'utf8');
const header = `${getUserscriptHeader(artifact)}\n`;
const code = `${header}(() => { 'release fixture'; })();\n`;
const metadata = validateUserscript(code);
const updateURL = metadata.updateURL[0];
const downloadURL = metadata.downloadURL[0];
const cacheHeaders = { 'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate' };

test('release versions advance numerically and accept the documented pnpm separator', () => {
  assert.equal(resolveReleaseVersion('4.0.9'), '4.0.10');
  assert.equal(resolveReleaseVersion('4.0.9', ['--']), '4.0.10');
  assert.equal(resolveReleaseVersion('4.0.9', ['4.1.0']), '4.1.0');
  assert.equal(resolveReleaseVersion('4.0.9', ['--', '5.0.0']), '5.0.0');
  assert.equal(resolveReleaseVersion('4.0.9', ['4.0.9']), '4.0.9');
  assert.equal(resolveReleaseVersion('4.0.99'), '4.0.100');
});

test('release versions reject downgrades, invalid versions and extra arguments', () => {
  for (const value of ['4.0.8', '3.99.99', '0.3.0']) {
    assert.throws(() => resolveReleaseVersion('4.0.9', [value]), /Cannot release/);
  }
  for (const value of ['', 'v4.1.0', '4.1', '4.1.0-beta', '04.1.0', '--invalid']) {
    assert.throws(() => resolveReleaseVersion('4.0.9', [value]), /Invalid version/);
  }
  assert.throws(() => resolveReleaseVersion('4.0.9', ['4.1.0', '5.0.0']), /Usage:/);
});

test('published verification checks both manager URLs and the complete download', async () => {
  const requested = [];
  const result = await checkPublishedUserscript(code, async (url) => {
    requested.push(url);
    return new Response(url === updateURL ? header : code, { headers: cacheHeaders });
  });
  assert.deepEqual(new Set(requested), new Set([updateURL, downloadURL]));
  assert.deepEqual(result, { version: metadata.version[0], updateURL, downloadURL });
});

test('published verification rejects HTTP errors, HTML fallbacks and stale metadata', async () => {
  for (const endpoint of [updateURL, downloadURL]) {
    for (const [body, status, error] of [
      ['Not found', 404, /HTTP 404/],
      ['<!doctype html><title>Install</title>', 200, /UserScript metadata header/],
      [code.replace(/(\/\/ @version\s+)[^\n]+/, '$10.0.1'), 200, /published metadata does not match/],
      [code.replace('Bilibili Popup Player', 'A different script'), 200, /published metadata does not match/],
    ]) {
      await assert.rejects(checkPublishedUserscript(code, async (url) => {
        if (url === endpoint) return new Response(body, { status, headers: cacheHeaders });
        return new Response(url === updateURL ? header : code, { headers: cacheHeaders });
      }), error);
    }
  }
});

test('published verification rejects a partial or changed download even with the same version', async () => {
  await assert.rejects(checkPublishedUserscript(code, async (url) => new Response(
    url === updateURL ? header : `${header}(() => { 'old release body'; })();\n`,
    { headers: cacheHeaders },
  )), /published script body does not match/);
});

test('published verification rejects CDN cache overrides even when release contents match', async () => {
  for (const endpoint of [updateURL, downloadURL]) {
    for (const cacheControl of ['', 'max-age=14400, must-revalidate', 'no-cache="Set-Cookie", max-age=14400']) {
      await assert.rejects(checkPublishedUserscript(code, async (url) => new Response(
        url === updateURL ? header : code,
        { headers: url === endpoint ? { 'Cache-Control': cacheControl } : cacheHeaders },
      )), /Cache-Control must include no-store or no-cache/);
    }
  }
});

test('published verification accepts uncacheable or always revalidated releases', async () => {
  for (const cacheControl of ['no-store', 'no-cache, max-age=0, must-revalidate']) {
    await checkPublishedUserscript(code, async (url) => new Response(
      url === updateURL ? header : code,
      { headers: { 'Cache-Control': cacheControl } },
    ));
  }
});

test('published verification propagates network failures', async () => {
  await assert.rejects(checkPublishedUserscript(code, async () => {
    throw new Error('Network unavailable');
  }), /Network unavailable/);
});
