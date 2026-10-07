import { spawn } from 'node:child_process';
import { prepareRelease } from './prepare-release.mjs';

console.log(`Releasing ${await prepareRelease(process.argv.slice(2))}`);
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
