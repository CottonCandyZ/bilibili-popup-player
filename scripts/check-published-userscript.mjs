import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getUserscriptHeader, validateUserscript } from './validate-userscript.mjs';

export async function checkPublishedUserscript(expectedCode, fetchImpl = fetch) {
  const expected = validateUserscript(expectedCode, 'local userscript');
  const expectedHeader = getUserscriptHeader(expectedCode);
  const updateURL = expected.updateURL[0];
  const downloadURL = expected.downloadURL[0];

  await Promise.all([updateURL, downloadURL].map(async (url) => {
    // Check the actual manager URLs, including their cache behavior, without a cache-busting query.
    const response = await fetchImpl(url, { cache: 'no-cache', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const code = await response.text();
    const metadata = validateUserscript(code, url);
    if (getUserscriptHeader(code) !== expectedHeader) {
      throw new Error(`${url}: published metadata does not match the local build (expected ${expected.version[0]}, received ${metadata.version[0]})`);
    }
    if (url === downloadURL && code !== expectedCode) {
      throw new Error(`${url}: published script body does not match the local build`);
    }
  }));

  return { version: expected.version[0], updateURL, downloadURL };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const code = await readFile(new URL('../bilibili-popup-player-nano.user.js', import.meta.url), 'utf8');
  const { version, updateURL, downloadURL } = await checkPublishedUserscript(code);
  console.log(`Published userscript ${version} verified:\n${updateURL}\n${downloadURL}`);
}
