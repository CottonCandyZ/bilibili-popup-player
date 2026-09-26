import { test, expect } from '@playwright/test';
import { getEmbeddedPlayerCss } from '../../src/embedded-player-style.js';
import { APP as A } from '../../src/constants.js';

// Native Web mode sizes the SVG span independently of ctrl-btn-icon. The
// floating shell reuses the regular controls, not the optional legacy mini UI.
const nativeCss = `
  .bpx-player-container, .bpx-player-video-area { position:relative; height:100%; }
  .bpx-player-control-wrap { position:absolute; inset:auto 0 0; height:73px; }
  .bpx-player-control-entity { position:relative; height:100%; }
  .bpx-player-control-top { height:30px; }
  .bpx-player-control-bottom { display:flex; height:43px; }
  .bpx-player-control-bottom-left, .bpx-player-control-bottom-right { display:flex; }
  .bpx-player-ctrl-btn { width:34px; height:22px; }
  .bpx-player-ctrl-btn-icon { width:100%; }
  .bpx-common-svg-icon { display:inline-flex; width:100%; }
  .bpx-common-svg-icon svg { display:block; width:100%; height:100%; }
  .bpx-player-ctrl-btn-icon > .bpx-common-svg-icon { height:22px; vertical-align:middle; }
  .bpx-player-container[data-screen=web] .bpx-player-ctrl-btn-icon > .bpx-common-svg-icon { height:28px; }
  .bpx-player-pbp { position:absolute; bottom:100%; width:100%; height:28px; }
  .bpx-player-pbp-pin { position:absolute; right:4px; bottom:8%; width:16px; height:16px; }
`;
const icon = (size, attributes = '') => `<div class="bpx-player-ctrl-btn-icon ${attributes}"><span class="bpx-common-svg-icon"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="width:100%;height:100%"><rect width="${size}" height="${size}" /></svg></span></div>`;
const markup = `<div class="bpx-player-container" data-screen="web"><div class="bpx-player-video-area">
  <div class="bpx-player-control-wrap"><div class="bpx-player-control-entity">
    <div class="bpx-player-control-top">进度条</div>
    <div class="bpx-player-control-bottom">
      <div class="bpx-player-control-bottom-left"><div class="bpx-player-ctrl-btn bpx-player-ctrl-play" role="button">${icon(28)}</div></div>
      <div class="bpx-player-control-bottom-right"><div class="bpx-player-ctrl-btn bpx-player-ctrl-volume" role="button">
        ${icon(88, 'bpx-player-ctrl-volume-icon')}${icon(88, 'bpx-player-ctrl-muted-icon')}
      </div></div>
    </div>
    <div class="bpx-player-pbp show pin" style="opacity:1"><svg width="100%" height="100%"></svg><div class="bpx-player-pbp-pin" style="opacity:1">钉</div></div>
  </div></div>
</div></div>`;

for (const mode of ['minimized', 'scroll-home', 'scroll-pip']) {
  async function mount(page) {
    const pip = mode === 'scroll-pip', frameId = pip ? 'stage' : `${A}-player-wrap`;
    const rootId = pip ? 'bilibili-player' : `${A}-player`;
    await page.setContent(`<style>${nativeCss}${getEmbeddedPlayerCss()}</style>
      <section id="${A}-overlay" ${pip ? 'data-bili-popup-ui="pip"' : ''}>
        <div id="${frameId}" data-controls-visible="true" style="width:400px;height:225px">
          <div id="${rootId}" style="height:100%">${markup}</div>
        </div>
      </section><div id="host-player" style="width:600px;height:340px">${markup}</div>`);
    const frame = page.locator(`#${frameId}`);
    await frame.evaluate(frame => {
      const play = frame.querySelector('.bpx-player-ctrl-play');
      const volume = frame.querySelector('.bpx-player-ctrl-volume');
      const muted = volume.querySelector('.bpx-player-ctrl-muted-icon');
      muted.style.display = 'none';
      // Model existing click handlers and native mute selection by inline display.
      play.addEventListener('click', () => { play.dataset.paused = String(play.dataset.paused !== 'true'); });
      volume.addEventListener('click', () => {
        const mute = muted.style.display === 'none';
        muted.style.display = mute ? '' : 'none';
        volume.querySelector('.bpx-player-ctrl-volume-icon').style.display = mute ? 'none' : '';
      });
    });
    async function float(active) {
      await frame.evaluate((el, { active, mode, A }) => {
        if (mode === 'minimized') el.closest('section').classList.toggle(`${A}--minimized`, active);
        else el.dataset.scrollFloating = String(active);
      }, { active, mode, A });
    }
    return { frame, float };
  }

  test(`${mode}: native play and both volume icons remain square and centered`, async ({ page }) => {
    const { frame, float } = await mount(page);
    const play = frame.locator('.bpx-player-ctrl-play'), volume = frame.locator('.bpx-player-ctrl-volume');
    for (let cycle = 0; cycle < 2; cycle++) {
      await float(true);
      for (const paused of [true, false]) {
        await play.click();
        await expect(play).toHaveAttribute('data-paused', String(paused));
        await volume.click();
        for (const button of [play, volume]) {
          const box = await button.boundingBox();
          const glyph = await button.locator('svg:visible').boundingBox();
          expect(box.width).toBe(32); expect(box.height).toBe(32);
          expect(glyph.width).toBe(glyph.height);
          expect(glyph.width).toBeLessThanOrEqual(24);
          expect(glyph.x + glyph.width / 2).toBeCloseTo(box.x + box.width / 2, 1);
          expect(glyph.y + glyph.height / 2).toBeCloseTo(box.y + box.height / 2, 1);
        }
      }
      await frame.evaluate(el => { el.dataset.controlsVisible = 'false'; });
      await expect(play).toBeHidden(); await expect(volume).toBeHidden();
      await frame.evaluate(el => { el.dataset.controlsVisible = 'true'; });
      await expect(play).toBeVisible(); await expect(volume).toBeVisible();
      await float(false);
      expect((await play.locator('svg').boundingBox()).height).toBe(28);
    }
    expect((await page.locator('#host-player .bpx-player-ctrl-play svg').boundingBox()).height).toBe(28);
  });

  test(`${mode}: pinned heatmap and pin hide only while floating`, async ({ page }) => {
    const { frame, float } = await mount(page);
    for (let cycle = 0; cycle < 2; cycle++) {
      await float(true);
      for (const visible of [true, false, true]) {
        await frame.evaluate((el, visible) => { el.dataset.controlsVisible = String(visible); }, visible);
        await expect(frame.locator('.bpx-player-pbp')).toBeHidden({ timeout: 1000 });
        await expect(frame.locator('.bpx-player-pbp-pin')).toBeHidden();
      }
      await float(false);
      await expect(frame.locator('.bpx-player-pbp')).toBeVisible();
      await expect(frame.locator('.bpx-player-pbp-pin')).toBeVisible();
    }
    await expect(page.locator('#host-player .bpx-player-pbp')).toBeVisible();
  });
}
