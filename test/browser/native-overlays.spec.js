import { test, expect } from '@playwright/test';
import { getEmbeddedPlayerCss } from '../../src/embedded-player-style.js';
import { APP as A, cardButton, loadFixture, mockPlayback } from './fixture.js';

// Nano's menu rows have 30px of content plus vertical padding. Its statistics
// actions are spans, including an SVG nested inside the close action.
const nativeCss = `
  * { box-sizing:border-box; }
  .bpx-player-container, .bpx-player-video-area { position:relative; width:100%; height:100%; }
  .bpx-player-video-perch { position:absolute; inset:0; }
  .bpx-player-context-area { position:absolute; inset:0; pointer-events:none; z-index:1000; }
  .bpx-player-contextmenu { position:absolute; margin:0; padding:0; min-width:80px; overflow:hidden; border-radius:4px; background:rgba(33,33,33,.9); color:#eee; pointer-events:auto; opacity:0; visibility:hidden; list-style:none; }
  .bpx-player-contextmenu.bpx-player-active { opacity:1; visibility:visible; }
  .bpx-player-contextmenu > li { height:30px; line-height:30px; padding:4px 20px; overflow:hidden; font-size:12px; white-space:nowrap; cursor:pointer; }
  .bpx-player-contextmenu > li + li { border-top:1px solid rgba(255,255,255,.1); }
  .bpx-player-info-container { position:absolute; top:10px; left:10px; width:360px; padding-bottom:15px; border-radius:4px; background:rgba(33,33,33,.9); color:#fff; line-height:18px; z-index:80; }
  .bpx-player-info-title { font-size:16px; line-height:40px; text-align:center; }
  .bpx-player-info-close { position:absolute; top:10px; right:10px; width:22px; height:22px; cursor:pointer; }
  .bpx-player-info-close svg { width:22px; height:22px; }
  .bpx-player-info-panel { padding:15px 26px; }
  .bpx-player-info-log { padding:0 26px; }
  .bpx-player-info-copy, .bpx-player-info-download { cursor:pointer; }
`;

const menuMarkup = `<ul class="bpx-player-contextmenu">
  <li data-action="copy-link"><span>复制视频地址（精准空降）</span></li>
  <li data-action="color"><span>视频色彩调整</span></li>
  <li data-action="statistics"><span>视频统计信息</span></li>
</ul>`;

async function openPlayer(page, paused) {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.addStyleTag({ content: nativeCss });
  await page.evaluate(({ paused, menuMarkup }) => {
    const log = window.__nativeOverlays = { paused, changes: 0, copied: 0, downloaded: 0, linkCopied: 0 };
    const create = window.nano.createPlayer;
    window.nano.createPlayer = setting => {
      const player = create(setting);
      return Object.assign(player, {
        isPaused: () => log.paused,
        play() { log.paused = false; log.changes++; },
        pause() { log.paused = true; log.changes++; },
        connect() {
          setting.element.innerHTML = `<div class="bpx-player-container" data-screen="web" data-ctrl-hidden="false"><div class="bpx-player-video-area">
            <div class="bpx-player-video-perch"></div>
            <div class="bpx-player-info-container" style="display:none">
              <div class="bpx-player-info-title"><span>统计信息</span><span class="bpx-player-info-close"><span class="bpx-common-svg-icon"><svg viewBox="0 0 22 22"><path d="M3 3 19 19M3 19 19 3" stroke="white"/></svg></span></span></div>
              <div class="bpx-player-info-panel"><div class="info-line"><span>Resolution:</span> <span>1920 x 1080@60.000</span></div></div>
              <div class="bpx-player-info-log"><span class="bpx-player-info-copy">[Copy]</span> <span class="bpx-player-info-download">[Download]</span></div>
            </div>
          </div><div class="bpx-player-context-area">${menuMarkup}</div></div>`;
          const root = setting.element, menu = root.querySelector('.bpx-player-contextmenu'), info = root.querySelector('.bpx-player-info-container');
          root.querySelector('.bpx-player-video-perch').addEventListener('contextmenu', event => {
            event.preventDefault();
            const rect = root.getBoundingClientRect();
            menu.style.left = `${event.clientX - rect.left}px`;
            menu.style.top = `${event.clientY - rect.top}px`;
            menu.classList.add('bpx-player-active');
          });
          menu.addEventListener('click', event => {
            const action = event.target.closest('li')?.dataset.action;
            if (action === 'statistics') info.style.display = '';
            if (action === 'copy-link') log.linkCopied++;
            menu.classList.remove('bpx-player-active');
          });
          root.querySelector('.bpx-player-info-close').addEventListener('click', () => { info.style.display = 'none'; });
          root.querySelector('.bpx-player-info-copy').addEventListener('click', () => { log.copied++; });
          root.querySelector('.bpx-player-info-download').addEventListener('click', () => { log.downloaded++; });
        },
      });
    };
  }, { paused, menuMarkup });
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.locator(`#${A}-player .bpx-player-video-perch`)).toBeVisible();
  return errors;
}

for (const paused of [false, true]) test(`native statistics and context actions preserve ${paused ? 'paused' : 'playing'} playback`, async ({ page }) => {
  const errors = await openPlayer(page, paused);
  const root = page.locator(`#${A}-player`), canvas = root.locator('.bpx-player-video-perch');
  const menu = root.locator('.bpx-player-contextmenu'), info = root.locator('.bpx-player-info-container');
  // Run through both popup and system fullscreen: close must still reach Nano.
  for (const fullscreen of [false, true]) {
    if (fullscreen) await canvas.dblclick({ position: { x: 450, y: 240 } });
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(fullscreen);
    await canvas.click({ button: 'right', position: { x: 400, y: 200 } });
    await menu.locator('[data-action="copy-link"] span').click();
    await canvas.click({ button: 'right', position: { x: 400, y: 200 } });
    await menu.locator('[data-action="statistics"] span').click();
    await expect(info).toBeVisible({ timeout: 1000 });
    const toolbar = page.locator(`#${A}-header`);
    await expect(toolbar).toBeVisible();
    await expect(toolbar).toHaveCSS('opacity', '1');
    const infoBox = await info.boundingBox(), toolbarBox = await toolbar.boundingBox();
    expect(infoBox.y).toBeGreaterThanOrEqual(toolbarBox.y + toolbarBox.height);
    await info.locator('.bpx-player-info-close svg').click();
    await expect(info).toBeHidden({ timeout: 1000 });
    await expect(page.locator(`#${A}-header`)).toBeVisible();
    await canvas.click({ button: 'right', position: { x: 400, y: 200 } });
    await menu.locator('[data-action="statistics"] span').click();
    await expect(info).toBeVisible();
    await info.locator('.bpx-player-info-copy').click();
    await info.locator('.bpx-player-info-download').click();
    await info.locator('.bpx-player-info-title > span').first().dblclick();
    expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(fullscreen);
    await info.locator('.bpx-player-info-close svg').click();
    await expect(info).toBeHidden({ timeout: 1000 });
    await page.waitForTimeout(350);
    expect(await page.evaluate(() => window.__nativeOverlays)).toEqual({ paused, changes: 0, copied: fullscreen ? 2 : 1, downloaded: fullscreen ? 2 : 1, linkCopied: fullscreen ? 2 : 1 });
  }
  expect(errors).toEqual([]);
});

for (const kind of ['home', 'pip']) test(`${kind} native menu text fits every row despite the page box-sizing reset`, async ({ page }) => {
  const rootId = kind === 'home' ? `${A}-player` : 'bilibili-player';
  await page.setContent(`<style>${nativeCss}${getEmbeddedPlayerCss()}</style>
    <section ${kind === 'pip' ? 'data-bili-popup-ui="pip"' : ''}><div id="${rootId}" style="width:600px;height:300px"><div class="bpx-player-container">${menuMarkup}</div></div></section>
    <div id="host-player" style="width:600px;height:300px"><div class="bpx-player-container">${menuMarkup}</div></div>`);
  const root = page.locator(`#${rootId}`), menu = root.locator('.bpx-player-contextmenu');
  await menu.evaluate(el => el.classList.add('bpx-player-active'));
  for (const screen of ['normal', 'web', 'full']) {
    await root.locator('.bpx-player-container').evaluate((el, screen) => { el.dataset.screen = screen; }, screen);
    const rows = menu.locator('li');
    for (let i = 0; i < await rows.count(); i++) {
      const row = await rows.nth(i).boundingBox(), text = await rows.nth(i).locator('span').boundingBox();
      expect(row.height).toBe(i === 0 ? 38 : 39);
      expect(text.y).toBeGreaterThanOrEqual(row.y + 4);
      expect(text.y + text.height).toBeLessThanOrEqual(row.y + row.height - 4);
    }
    const bounds = await menu.boundingBox(), last = await rows.last().boundingBox();
    expect(bounds.height).toBe(116);
    expect(last.y + last.height).toBe(bounds.y + bounds.height);
  }
  await expect(page.locator('#host-player .bpx-player-contextmenu > li').first()).toHaveCSS('box-sizing', 'border-box');
});
