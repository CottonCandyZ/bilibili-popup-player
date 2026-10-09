import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { getEmbeddedPlayerCss } from '../../src/embedded-player-style.js';
import { APP } from '../../src/constants.js';
import { cardButton, loadFixture, mockPlayback } from './fixture.js';

const adapter = readFileSync(new URL('../../src/fullscreen-marker.js', import.meta.url), 'utf8')
  .replace("import { APP } from './constants.js';", `const APP = ${JSON.stringify(APP)};`).replace('export function', 'function');

// Headless Chromium verifies pixel placement, paint and native state. Whether
// this avoids Windows/Chrome's fullscreen overlay optimization needs a real GPU.
for (const kind of ['home', 'pip']) test(`${kind} fullscreen uses a letterbox pixel and preserves native danmaku state`, async ({ page }) => {
  const shell = kind === 'home' ? `${APP}-dialog` : 'system-shell';
  const root = kind === 'home' ? `${APP}-player` : 'bilibili-player';
  await page.setContent(`<style>
    #${shell} { position:relative; width:800px; height:450px; background:black; }
    #${shell}:fullscreen { width:100vw; height:100vh; }
    #${root}, .bpx-player-container, .bpx-player-video-area { position:relative; width:100%; height:100%; }
    video, .bpx-player-dm-mask-wrap, .bpx-player-row-dm-wrap { position:absolute; inset:0; width:100%; height:100%; }
    video { object-fit:contain; }
    .bpx-player-dm-mask-wrap { z-index:2; }
    .bpx-player-row-dm-wrap { contain:paint; }
    .test-danmaku { position:absolute; top:4px; left:24px; color:white; animation:roll 60s linear infinite; }
    @keyframes roll { to { transform:translateX(500px); } }
    .bpx-player-control-bottom { position:absolute; bottom:0; width:100%; height:40px; z-index:75; background:#0008; opacity:1; transition:opacity .2s; }
    [data-ctrl-hidden="true"] .bpx-player-control-bottom { opacity:0; }
    ${getEmbeddedPlayerCss()}
  </style><div ${kind === 'pip' ? 'data-bili-popup-ui="pip"' : ''}>
    <div id="${shell}"><div id="${root}"><div class="bpx-player-container" data-ctrl-hidden="false">
      <div class="bpx-player-video-area"><video muted></video>
        <div class="bpx-player-dm-mask-wrap"><div class="bpx-player-row-dm-wrap"><span class="test-danmaku">全屏弹幕</span></div></div>
        <div class="bpx-player-control-bottom">播控</div>
      </div>
    </div></div></div>
  </div><div id="host-player"><div class="bpx-player-dm-mask-wrap"></div></div>`);
  await page.locator('video').evaluate(video => {
    Object.defineProperties(video, { videoWidth: { configurable: true, value: 1920 }, videoHeight: { configurable: true, value: 1080 } });
  });
  await page.addScriptTag({ content: `${adapter}; window.disposeMarker = installFullscreenMarker(document.getElementById('${root}'));` });
  const mask = page.locator(`#${root} .bpx-player-dm-mask-wrap`);
  const bullet = page.locator('.test-danmaku');
  const marker = page.locator(`.${APP}__fullscreen-marker`);
  await expect(mask).toHaveCSS('backdrop-filter', 'none');
  await expect(marker).toHaveCount(0);
  await bullet.evaluate(el => { window.__existingDanmaku = { node: el, animation: el.getAnimations()[0] }; });

  await page.locator('#' + shell).evaluate(el => el.requestFullscreen());
  await expect(marker).toBeVisible();
  const pixel = await marker.boundingBox(), video = await page.locator('video').boundingBox();
  expect(pixel.width).toBe(1); expect(pixel.height).toBe(1);
  expect(pixel.y).toBeGreaterThan(video.y);
  expect(pixel.y + pixel.height).toBeLessThan(video.y + (video.height - video.width * 9 / 16) / 2);
  await expect(marker).toHaveCSS('pointer-events', 'none');
  await expect(marker).toHaveAttribute('aria-hidden', 'true');
  const color = await marker.evaluate(el => getComputedStyle(el).backgroundColor);
  await expect.poll(() => marker.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(color);
  for (const hidden of ['true', 'false', 'true']) {
    const before = await bullet.evaluate(el => el.getAnimations()[0].currentTime);
    await page.locator('.bpx-player-container').evaluate((el, hidden) => { el.dataset.ctrlHidden = hidden; }, hidden);
    await expect(page.locator('.bpx-player-control-bottom')).toHaveCSS('opacity', hidden === 'true' ? '0' : '1');
    await expect(bullet).toBeVisible();
    await expect(mask).toHaveCSS('backdrop-filter', 'none');
    await expect(marker).toBeVisible();
    expect(await bullet.evaluate(el => el === window.__existingDanmaku.node && el.getAnimations()[0] === window.__existingDanmaku.animation)).toBe(true);
    await expect.poll(() => bullet.evaluate(el => el.getAnimations()[0].currentTime)).toBeGreaterThan(before);
  }
  // Native off/opacity/smart-mask settings must continue to own the danmaku.
  await mask.evaluate(el => { el.style.visibility = 'hidden'; });
  await expect(bullet).toBeHidden();
  await mask.evaluate(el => { el.style.visibility = ''; el.style.opacity = '.4'; el.style.maskImage = 'linear-gradient(black, transparent)'; });
  await expect(bullet).toBeVisible();
  await expect(mask).toHaveCSS('opacity', '0.4');
  const smartMask = await mask.evaluate(el => getComputedStyle(el).maskImage);
  await expect(page.locator('video')).toHaveCSS('opacity', '1');
  // No black border: do not paint on the video. Changing fit must remeasure.
  await page.locator('video').evaluate(el => { el.style.objectFit = 'fill'; });
  await expect(marker).toBeHidden();
  await page.locator('video').evaluate(el => { el.style.objectFit = 'contain'; });
  await expect(marker).toBeVisible();
  // A portrait replacement moves the marker into a side border.
  await page.locator('video').evaluate(el => {
    const next = el.cloneNode();
    Object.defineProperties(next, { videoWidth: { value: 1080 }, videoHeight: { value: 1920 } });
    el.replaceWith(next);
  });
  await expect.poll(async () => (await marker.boundingBox()).x).toBeLessThan(300);
  expect((await marker.boundingBox()).x + 1).toBeLessThan((video.width - video.height * 9 / 16) / 2 + video.x);
  await page.evaluate(() => document.exitFullscreen());
  await expect(marker).toHaveCount(0);
  await expect(mask).toHaveCSS('backdrop-filter', 'none');
  await expect(mask).toHaveCSS('mask-image', smartMask);
  await expect(page.locator('#host-player .bpx-player-dm-mask-wrap')).toHaveCSS('backdrop-filter', 'none');
  expect(await bullet.evaluate(el => el === window.__existingDanmaku.node && el.getAnimations()[0] === window.__existingDanmaku.animation)).toBe(true);
  await page.locator('#' + shell).evaluate(el => el.requestFullscreen());
  await expect(marker).toBeVisible();
  await page.evaluate(() => window.disposeMarker());
  await expect(marker).toHaveCount(0);
});

test('the popup installs the fullscreen marker and cleans it up when closed', async ({ page }) => {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await page.locator(`#${APP}-player .bpx-player-container`).evaluate(root => {
    root.innerHTML = '<div class="bpx-player-video-area" style="position:relative;width:100%;height:100%;background:black"><video style="width:100%;height:100%;object-fit:contain"></video><div class="bpx-player-dm-mask-wrap"></div></div>';
    Object.defineProperties(root.querySelector('video'), { videoWidth: { value: 1080 }, videoHeight: { value: 1920 } });
  });
  const marker = page.locator(`.${APP}__fullscreen-marker`);
  await expect(marker).toHaveCount(0);
  await page.locator(`#${APP}-dialog`).evaluate(el => el.requestFullscreen());
  await expect(marker).toBeVisible();
  await expect(page.locator('.bpx-player-dm-mask-wrap')).toHaveCSS('backdrop-filter', 'none');
  await page.evaluate(() => window.__biliPopupPlayerNano.close());
  await expect(marker).toHaveCount(0);
  expect(errors).toEqual([]);
});
