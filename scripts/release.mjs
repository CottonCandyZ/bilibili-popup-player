import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolveReleaseVersion } from './release-version.mjs';

const configPath = 'rollup.config.mjs';

const currentConfig = await readFile(configPath, 'utf8');
const currentVersion = currentConfig.match(/\/\/ @version\s+(\d+\.\d+\.\d+)/)?.[1];
if (!currentVersion) {
  console.error(`Cannot find userscript @version in ${configPath}`);
  process.exit(1);
}

const nextVersion = resolveReleaseVersion(currentVersion, process.argv.slice(2));

if (nextVersion !== currentVersion) {
  await writeFile(
    configPath,
    currentConfig.replace(/(\/\/ @version\s+)\d+\.\d+\.\d+/, `$1${nextVersion}`),
  );
}

console.log(`Releasing ${currentVersion} -> ${nextVersion}`);
await run('pnpm', ['run', 'publish:pages']);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(...resolveSpawnArgs(command, args), {
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

function resolveSpawnArgs(command, args) {
  if (process.platform !== 'win32') return [command, args];
  return ['cmd.exe', ['/d', '/s', '/c', [command, ...args].map(quoteCmdArg).join(' ')]];
}

function quoteCmdArg(value) {
  const arg = String(value);
  if (/^[\w./:@=-]+$/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '""')}"`;
}
