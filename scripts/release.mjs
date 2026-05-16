import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const configPath = 'rollup.config.mjs';
const versionArg = process.argv[2];

const currentConfig = await readFile(configPath, 'utf8');
const currentVersion = currentConfig.match(/\/\/ @version\s+(\d+\.\d+\.\d+)/)?.[1];
if (!currentVersion) {
  console.error(`Cannot find userscript @version in ${configPath}`);
  process.exit(1);
}

const nextVersion = versionArg || bumpPatch(currentVersion);
if (!/^\d+\.\d+\.\d+$/.test(nextVersion)) {
  console.error(`Invalid version: ${nextVersion}`);
  process.exit(1);
}

if (nextVersion !== currentVersion) {
  await writeFile(
    configPath,
    currentConfig.replace(/(\/\/ @version\s+)\d+\.\d+\.\d+/, `$1${nextVersion}`),
  );
}

console.log(`Releasing ${currentVersion} -> ${nextVersion}`);
await run('pnpm', ['run', 'publish:pages']);
await run('pnpm', ['run', 'check']);
await printPublishedVersion();

function bumpPatch(version) {
  const parts = version.split('.').map(Number);
  parts[2] += 1;
  return parts.join('.');
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? `${command}.cmd` : command, args, {
      stdio: 'inherit',
      shell: false,
    });
    child.on('exit', (code, signal) => {
      if (signal) reject(new Error(`${command} exited by signal ${signal}`));
      else if (code) reject(new Error(`${command} exited with code ${code}`));
      else resolve();
    });
    child.on('error', reject);
  });
}

async function printPublishedVersion() {
  const url = `https://pop-player.nanachi.moe/bilibili-popup-player-nano.user.js?t=${Date.now()}`;
  const response = await fetch(url);
  if (!response.ok) {
    console.warn(`Published version check failed: ${response.status}`);
    return;
  }
  const text = await response.text();
  const version = text.match(/\/\/ @version\s+([^\n]+)/)?.[1]?.trim();
  console.log(`Published userscript: ${version || 'unknown'} (${url})`);
}
