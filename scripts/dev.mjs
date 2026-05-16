import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const host = '127.0.0.1';
const port = Number(process.env.DEV_SERVER_PORT || 8715);
const bundleName = 'bilibili-popup-player-nano.user.js';
const root = process.cwd();

const mimeTypes = new Map([
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
]);

const rollup = spawnCommand('rollup', ['-c', '-w']);
const server = createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${host}:${port}`);
  setDevHeaders(response);

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  if (url.pathname === '/dev-version.json') {
    const bundlePath = resolve(root, bundleName);
    const version = existsSync(bundlePath) ? String(statSync(bundlePath).mtimeMs) : 'missing';
    send(response, 200, JSON.stringify({ version }), 'application/json; charset=utf-8');
    return;
  }

  const pathname = url.pathname === '/' ? `/${bundleName}` : decodeURIComponent(url.pathname);
  const filePath = resolve(root, `.${pathname}`);
  if (!filePath.startsWith(root) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    send(response, 404, 'Not found\n', 'text/plain; charset=utf-8');
    return;
  }

  response.writeHead(200, {
    'Content-Type': mimeTypes.get(extname(filePath)) || 'application/octet-stream',
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Dev bundle: http://${host}:${port}/${bundleName}`);
  console.log('Install once: bilibili-popup-player-nano.dev.user.js');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    rollup.kill(signal);
    server.close(() => process.exit(0));
  });
}

function spawnCommand(command, args) {
  const child = spawn(process.platform === 'win32' ? `${command}.cmd` : command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  });
  child.on('exit', (code, signal) => {
    if (signal) return;
    server.close(() => process.exit(code ?? 1));
  });
  return child;
}

function setDevHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', '*');
  response.setHeader('Cache-Control', 'no-store, max-age=0');
}

function send(response, status, body, type) {
  response.writeHead(status, { 'Content-Type': type });
  response.end(body);
}
