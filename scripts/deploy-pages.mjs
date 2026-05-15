import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

loadDotEnv('.env');

if (!process.env.CLOUDFLARE_API_TOKEN) {
  console.error('Missing CLOUDFLARE_API_TOKEN. Copy .env.example to .env and fill it first.');
  process.exit(1);
}

const command = process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler';
const child = spawn(command, [
  'pages',
  'deploy',
  'dist',
  '--project-name',
  'bilibili-popup-player-nano',
], {
  env: process.env,
  shell: false,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`wrangler exited by signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] == null) process.env[key] = value;
  }
}
