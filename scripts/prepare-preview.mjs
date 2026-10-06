import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getUserscriptHeader, validateUserscript } from './validate-userscript.mjs';

export async function preparePreview({ prNumber, sha, directory = 'dist' }) {
  if (!/^[1-9]\d{0,9}$/.test(String(prNumber))) throw new Error('Invalid PR number');
  if (!/^[0-9a-f]{40}$/i.test(sha || '')) throw new Error('Invalid commit SHA');
  sha = sha.toLowerCase();
  const branch = `pr-${prNumber}-${sha}`;
  const url = `https://${branch}.bilibili-popup-player-nano.pages.dev`;
  const name = `Bilibili Popup Player (PR #${prNumber} · ${sha.slice(0, 7)})`;
  const scriptPath = resolve(directory, 'bilibili-popup-player-nano.user.js');
  const code = await readFile(scriptPath, 'utf8');
  const metadata = validateUserscript(code, scriptPath);
  const version = metadata.version[0];
  const originalHeader = getUserscriptHeader(code);
  let header = originalHeader;
  const fields = {
    name,
    namespace: `https://github.com/CottonCandyZ/bilibili-popup-player/pull/${prNumber}/commits/${sha}`,
    downloadURL: `${url}/bilibili-popup-player-nano.user.js`,
    updateURL: `${url}/bilibili-popup-player-nano.meta.js`,
  };
  for (const [key, value] of Object.entries(fields)) {
    header = header.replace(new RegExp(`^(// @${key}\\s+)[^\\r\\n]+`, 'm'), (_, prefix) => prefix + value);
  }
  const previewCode = header + code.slice(originalHeader.length);
  validateUserscript(previewCode, scriptPath);
  const pagePath = resolve(directory, 'index.html');
  const page = await readFile(pagePath, 'utf8');
  const heading = '<h1>Bilibili Popup Player</h1>';
  if (!page.includes(heading)) throw new Error('Missing preview page heading');
  const previewPage = page.replace('<title>Bilibili Popup Player</title>', `<title>${name}</title>`)
    .replace(heading, `<h1>${name}</h1>
<p>PR #${prNumber} · 测试版本 ${version}</p>
<p>提交：<code>${sha}</code></p>
<p>测试前请停用正式版和其他 PR 预览版。测试结束后可删除此版本，再启用正式版。</p>
<p class="note">此链接固定对应上述提交。测试其他提交时，请打开对应的 PR 部署链接。</p>`);
  await writeFile(scriptPath, previewCode);
  await writeFile(resolve(directory, 'bilibili-popup-player-nano.meta.js'), `${header}\n`);
  await writeFile(pagePath, previewPage);
  return { branch, url, install_url: fields.downloadURL, version };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await preparePreview({
    prNumber: process.env.PR_NUMBER,
    sha: process.env.PR_HEAD_SHA,
  });
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, Object.entries(result).map(([key, value]) => `${key}=${value}\n`).join(''));
  }
  console.log(`Prepared ${result.branch} preview ${result.version}`);
}
