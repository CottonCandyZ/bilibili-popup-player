import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

loadDotEnv('.env');

if (!process.env.CLOUDFLARE_API_TOKEN) {
  console.error('Missing CLOUDFLARE_API_TOKEN. Copy .env.example to .env and fill it first.');
  process.exit(1);
}
if (process.env.CLOUDFLARE_ACCOUNT_ID === '') delete process.env.CLOUDFLARE_ACCOUNT_ID;
process.env.CLOUDFLARE_ACCOUNT_ID ||= await inferAccountId();

const deployArgs = [
  'pages',
  'deploy',
  'dist',
  '--project-name',
  'bilibili-popup-player-nano',
];
const command = process.platform === 'win32' ? 'cmd.exe' : 'wrangler';
const args = process.platform === 'win32'
  ? ['/d', '/s', '/c', `wrangler ${deployArgs.join(' ')}`]
  : deployArgs;
const child = spawn(command, args, {
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
    if (key && value && process.env[key] == null) process.env[key] = value;
  }
}

async function inferAccountId() {
  const response = await fetch('https://api.cloudflare.com/client/v4/accounts', {
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
  });
  if (!response.ok) {
    console.error('CLOUDFLARE_ACCOUNT_ID is missing, and the token cannot list Cloudflare accounts.');
    console.error('Fill CLOUDFLARE_ACCOUNT_ID in .env and rerun pnpm run deploy.');
    process.exit(1);
  }
  const payload = await response.json();
  const accounts = Array.isArray(payload.result) ? payload.result : [];
  if (accounts.length !== 1) {
    console.error(`CLOUDFLARE_ACCOUNT_ID is missing, and token returned ${accounts.length} accounts.`);
    console.error('Fill CLOUDFLARE_ACCOUNT_ID in .env and rerun pnpm run deploy.');
    process.exit(1);
  }
  console.log(`Using Cloudflare account: ${accounts[0].name}`);
  return accounts[0].id;
}
