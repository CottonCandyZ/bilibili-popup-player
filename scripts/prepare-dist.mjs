import { createHash } from 'node:crypto';
import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';

const fileName = 'bilibili-popup-player-nano.user.js';
const previews = await Promise.all([
  { file: 'popup-player-modal.webp', caption: '网页小窗', alt: '视频在网页小窗中播放，背景页面虚化', width: 3674, height: 1694 },
  { file: 'popup-player-sidebar.webp', caption: '评论侧栏', alt: '视频在左侧播放，右侧显示视频信息与评论', width: 3686, height: 1706 },
].map(async (preview) => {
  const path = `assets/screenshots/${preview.file}`;
  const version = createHash('sha256').update(await readFile(path)).digest('hex').slice(0, 12);
  return { ...preview, src: `./${path}?v=${version}` };
}));

await mkdir('dist', { recursive: true });
await copyFile(fileName, `dist/${fileName}`);
await copyFile('LICENSE', 'dist/LICENSE');
await copyFile('THIRD_PARTY_NOTICES.txt', 'dist/THIRD_PARTY_NOTICES.txt');
await cp('assets', 'dist/assets', { recursive: true, force: true });
await writeFile(
  'dist/index.html',
  `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bilibili Popup Player</title>
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

  h2 {
    margin-top: 28px;
    font-size: 18px;
  }

  ul {
    padding-left: 22px;
  }

  .note {
    color: color-mix(in srgb, currentColor 72%, transparent);
  }

  .preview {
    margin-top: 32px;
  }

  .preview figure {
    margin: 20px 0 0;
  }

  .preview figure a {
    display: block;
  }

  .preview img {
    box-sizing: border-box;
    display: block;
    width: 100%;
    height: auto;
    border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
    border-radius: 8px;
  }

  .preview figcaption {
    margin-top: 8px;
    font-size: 14px;
    color: color-mix(in srgb, currentColor 72%, transparent);
  }
</style>
<h1>Bilibili Popup Player</h1>
<p><a href="./${fileName}">安装 userscript</a></p>
<p>需要先安装对应浏览器的用户脚本管理器：</p>
<h2>Chrome</h2>
<ul>
  <li><a href="https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo">Tampermonkey</a></li>
  <li><a href="https://chromewebstore.google.com/detail/scriptcat/ndcooeababalnlpkfedmmbbbgkljhpjf">ScriptCat</a></li>
</ul>
<h2>Firefox</h2>
<p class="note"><s>Firefox 当前不支持 Document PiP，本脚本会隐藏 PiP 入口，仅提供网页内弹窗模式。</s></p>
<p>Firefox 桌面版自 <strong>151</strong> 起已支持 Document PiP（独立小窗）。脚本按浏览器实际能力启用独立小窗，接口不可用时仍可使用网页小窗。<a href="https://www.firefox.com/en-US/firefox/151.0/releasenotes/">查看官方发布说明</a>。</p>
<ul>
  <li><a href="https://addons.mozilla.org/firefox/addon/tampermonkey/">Tampermonkey</a></li>
  <li><a href="https://addons.mozilla.org/firefox/addon/violentmonkey/">Violentmonkey</a></li>
  <li><a href="https://addons.mozilla.org/firefox/addon/scriptcat/">ScriptCat</a></li>
</ul>
<h2>Microsoft Edge</h2>
<ul>
  <li><a href="https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd">Tampermonkey</a></li>
  <li><a href="https://microsoftedge.microsoft.com/addons/detail/violentmonkey/eeagobfjdenkkddmbclomhiblgggliao">Violentmonkey</a></li>
  <li><a href="https://microsoftedge.microsoft.com/addons/detail/scriptcat/liilgpjgabokdklappibcjfablkpcekh">ScriptCat</a></li>
</ul>
<section class="preview">
  <h2>预览图</h2>
  ${previews.map(({ src, caption, alt, width, height }) => `<figure>
    <a href="${src}" target="_blank" rel="noopener" aria-label="查看${caption}原图">
      <img src="${src}" alt="${alt}" width="${width}" height="${height}" loading="lazy">
    </a>
    <figcaption>${caption}</figcaption>
  </figure>`).join('\n  ')}
</section>
<p class="note"><a href="https://github.com/CottonCandyZ/bilibili-popup-player">源代码</a> · <a href="./LICENSE">AGPL-3.0</a> · <a href="./THIRD_PARTY_NOTICES.txt">第三方许可</a></p>
`,
);
