import { copyFile, mkdir, writeFile } from 'node:fs/promises';

const fileName = 'bilibili-popup-player-nano.user.js';

await mkdir('dist', { recursive: true });
await copyFile(fileName, `dist/${fileName}`);
await writeFile(
  'dist/index.html',
  `<!doctype html>
<meta charset="utf-8">
<title>Bilibili Popup Player Nano</title>
<p><a href="./${fileName}">Install userscript</a></p>
`,
);
