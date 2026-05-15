import { copyFile, mkdir, writeFile } from 'node:fs/promises';

const fileName = 'bilibili-popup-player-nano.user.js';

await mkdir('dist', { recursive: true });
await copyFile(fileName, `dist/${fileName}`);
await writeFile(
  'dist/index.html',
  `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bilibili Popup Player Nano</title>
<style>
  :root {
    color-scheme: light dark;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  body {
    max-width: 720px;
    margin: 56px auto;
    padding: 0 24px;
    line-height: 1.7;
  }

  a {
    color: #00aeec;
  }
</style>
<h1>Bilibili Popup Player Nano</h1>
<p><a href="./${fileName}">安装 userscript</a></p>
<p>需要先安装下面任意一个用户脚本管理器：</p>
<ul>
  <li><a href="https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo">Tampermonkey</a></li>
  <li><a href="https://violentmonkey.github.io/get-it/">Violentmonkey</a></li>
  <li><a href="https://chromewebstore.google.com/detail/scriptcat/ndcooeababalnlpkfedmmbbbgkljhpjf">ScriptCat</a></li>
</ul>
<p>如果浏览器没有安装用户脚本管理器，点击上面的 <code>.user.js</code> 链接通常只会打开或下载 JS 源码，不会自动安装，也不会在 B 站页面里运行。</p>
`,
);
