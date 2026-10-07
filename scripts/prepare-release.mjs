import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveReleaseVersion } from './release-version.mjs';

export async function prepareRelease(args = [], configPath = 'rollup.config.mjs') {
  const config = await readFile(configPath, 'utf8');
  const current = config.match(/\/\/ @version\s+(\d+\.\d+\.\d+)/)?.[1];
  if (!current) throw new Error(`Cannot find userscript @version in ${configPath}`);
  const next = resolveReleaseVersion(current, args);
  if (next !== current) {
    await writeFile(configPath, config.replace(/(\/\/ @version\s+)\d+\.\d+\.\d+/, `$1${next}`));
  }
  return next;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await prepareRelease(process.argv.slice(2)));
}
