import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { preparePreview } from '../scripts/prepare-preview.mjs';
import { getUserscriptHeader, validateUserscript } from '../scripts/validate-userscript.mjs';

const artifact = readFileSync(new URL('../bilibili-popup-player-nano.user.js', import.meta.url), 'utf8');
const productionHeader = getUserscriptHeader(artifact);
const production = validateUserscript(artifact);
const sha = '1234567890abcdef1234567890abcdef12345678';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'popup-preview-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'dist');
  await mkdir(directory);
  await writeFile(join(directory, 'bilibili-popup-player-nano.user.js'), artifact);
  await writeFile(join(directory, 'index.html'), '<title>Bilibili Popup Player</title><h1>Bilibili Popup Player</h1><a href="./bilibili-popup-player-nano.user.js">安装</a>');
  return { root, directory };
}

test('preview preserves the tested script body and permissions while isolating installation and updates', async (t) => {
  const { directory } = await fixture(t);
  const result = await preparePreview({ prNumber: 4, sha, directory });
  const code = await readFile(join(directory, 'bilibili-popup-player-nano.user.js'), 'utf8');
  const metadata = validateUserscript(code);
  const header = getUserscriptHeader(code);
  assert.equal(code.slice(header.length), artifact.slice(productionHeader.length));
  assert.equal(metadata.name[0], 'Bilibili Popup Player (PR #4 · 1234567)');
  assert.notEqual(metadata.namespace[0], production.namespace[0]);
  assert.ok(metadata.namespace[0].endsWith(sha));
  assert.deepEqual(metadata.version, production.version);
  assert.deepEqual(metadata.grant, production.grant);
  assert.deepEqual(metadata.match, production.match);
  assert.deepEqual(metadata.downloadURL, [result.install_url]);
  assert.deepEqual(metadata.updateURL, [`${result.url}/bilibili-popup-player-nano.meta.js`]);
  assert.equal(await readFile(join(directory, 'bilibili-popup-player-nano.meta.js'), 'utf8'), `${header}\n`);
  const page = await readFile(join(directory, 'index.html'), 'utf8');
  assert.ok(page.includes(sha));
  assert.ok(page.includes('停用正式版'));
  assert.ok(page.includes('固定对应上述提交'));
  assert.equal(readFileSync(new URL('../bilibili-popup-player-nano.user.js', import.meta.url), 'utf8'), artifact);
});

test('preview URLs bind the full commit hash, including commits with the same short hash', async (t) => {
  for (const prNumber of [4, 1234567890]) {
    const first = await fixture(t);
    const second = await fixture(t);
    const firstResult = await preparePreview({ prNumber, sha, directory: first.directory });
    const otherSha = sha.slice(0, -1) + '9';
    const secondResult = await preparePreview({ prNumber, sha: otherSha, directory: second.directory });
    assert.ok(firstResult.branch.startsWith(`pr-${prNumber}-`));
    assert.ok(firstResult.branch.length <= 28, 'Pages must not truncate the alias');
    assert.equal(firstResult.url, `https://${firstResult.branch}.bilibili-popup-player-nano.pages.dev`);
    assert.notEqual(firstResult.url, secondResult.url);
    const firstCode = await readFile(join(first.directory, 'bilibili-popup-player-nano.user.js'), 'utf8');
    const secondCode = await readFile(join(second.directory, 'bilibili-popup-player-nano.user.js'), 'utf8');
    assert.notEqual(validateUserscript(firstCode).namespace[0], validateUserscript(secondCode).namespace[0]);
    assert.equal(validateUserscript(firstCode).downloadURL[0], firstResult.install_url);
  }
});

test('preview rejects invalid PR numbers and hashes before changing files', async (t) => {
  const { directory } = await fixture(t);
  for (const options of [
    { prNumber: 0, sha }, { prNumber: '4\nmain', sha },
    { prNumber: 4, sha: 'main' }, { prNumber: 4, sha: `${sha}\n` },
  ]) {
    await assert.rejects(preparePreview({ ...options, directory }), /Invalid/);
  }
  assert.equal(await readFile(join(directory, 'bilibili-popup-player-nano.user.js'), 'utf8'), artifact);
});

test('preview CLI exports the commit branch and install URLs for the deployment job', async (t) => {
  const { root } = await fixture(t);
  const output = join(root, 'github-output');
  const script = fileURLToPath(new URL('../scripts/prepare-preview.mjs', import.meta.url));
  execFileSync(process.execPath, [script], {
    cwd: root,
    env: { ...process.env, PR_NUMBER: '4', PR_HEAD_SHA: sha, GITHUB_OUTPUT: output },
    stdio: 'pipe',
  });
  const values = Object.fromEntries((await readFile(output, 'utf8')).trim().split('\n').map(line => line.split('=')));
  assert.match(values.branch, /^pr-4-[0-9a-f]{23}$/);
  assert.equal(values.url, `https://${values.branch}.bilibili-popup-player-nano.pages.dev`);
  assert.equal(values.install_url, `${values.url}/bilibili-popup-player-nano.user.js`);
  assert.equal(values.version, production.version[0]);
});
