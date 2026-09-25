import { test, expect } from '@playwright/test';
import { getEmbeddedPlayerCss } from '../../src/embedded-player-style.js';
import { APP as A, cardButton, loadFixture, mockPlayback } from './fixture.js';

// The native mini buttons live outside control-bottom and use different offsets.
// These defaults reproduce the old player runtime as well as its initial 46px bar.
const nativeCss = `
  .bpx-player-container { position:relative; width:100%; height:100%; }
  .bpx-player-primary-area { height:calc(100% - 46px); }
  .bpx-player-video-area { position:relative; height:100%; }
  .bpx-player-sending-area { height:46px; background:white; }
  .bpx-player-ctrl-play { position:relative; width:34px; height:43px; }
  .bpx-player-ctrl-btn-icon { width:34px; height:22px; }
  .bpx-player-ctrl-btn-play-icon-mini { position:absolute; left:0; bottom:0; scale:.9; transform:translate(10px,-16px); }
  .bpx-player-ctrl-btn-play-icon-mini::after { content:""; position:absolute; top:-6px; left:0; width:34px; height:34px; background:#0008; border-radius:50%; }
  .bpx-player-ctrl-volume-icon-mini { position:absolute; left:50%; bottom:0; transform:translate(-28px,-16px); }
  .bpx-player-ctrl-volume-icon-mini::before { content:""; position:absolute; left:50%; width:32px; height:32px; transform:translate(-16px,-5px); background:#0008; border-radius:50%; }
  .bpx-player-control-bottom { display:flex; }
  .bpx-player-control-wrap { position:absolute; inset:auto 0 0; height:73px; z-index:75; }
`;

const markup = `<div class="bpx-player-container">
  <div class="bpx-player-primary-area"><div class="bpx-player-video-area">
    <div class="bpx-player-control-wrap"><div class="bpx-player-control-bottom"><button class="bpx-player-ctrl-btn bpx-player-ctrl-play">普通播放</button><div class="bpx-player-video-inputbar">浮层弹幕输入</div></div></div>
    <div class="bpx-player-ctrl-btn bpx-player-ctrl-play bpx-player-ctrl-btn-play-icon-mini" role="button" aria-label="播放/暂停"><div class="bpx-player-ctrl-btn-icon"><span class="bpx-common-svg-icon"><svg viewBox="0 0 28 28"></svg></span></div></div>
    <div class="bpx-player-ctrl-btn-icon bpx-player-ctrl-volume-icon bpx-player-ctrl-volume-icon-mini"><span class="bpx-common-svg-icon"><svg viewBox="0 0 88 88"></svg></span></div>
    <div class="bpx-player-ctrl-btn-icon bpx-player-ctrl-muted-icon bpx-player-ctrl-volume-icon-mini" style="display:none"><span class="bpx-common-svg-icon"><svg viewBox="0 0 88 88"></svg></span></div>
  </div></div><div class="bpx-player-sending-area">底部弹幕栏</div>
</div>`;

for (const kind of ['home', 'pip']) {
  async function mount(page, width = 400) {
    const rootId = kind === 'home' ? `${A}-player` : 'bilibili-player';
    const frameId = kind === 'home' ? `${A}-player-wrap` : 'stage';
    await page.setContent(`<style>${nativeCss}${getEmbeddedPlayerCss()}</style>
      <section ${kind === 'pip' ? 'data-bili-popup-ui="pip"' : ''}>
        <div id="${frameId}" data-controls-visible="true" style="width:${width}px;height:225px"><div id="${rootId}" style="height:100%">${markup}</div></div>
      </section><div id="host-player" style="width:400px;height:225px">${markup}</div>`);
    return page.locator(`#${rootId}`);
  }

  test(`${kind} initial player has no sending-bar flash before Web mode is ready`, async ({ page }) => {
    const root = await mount(page, 1200);
    for (const screen of [null, 'normal', 'web']) {
      await root.locator('.bpx-player-container').evaluate((el, screen) => {
        if (screen) el.dataset.screen = screen;
        else el.removeAttribute('data-screen');
      }, screen);
      await expect(root.locator('.bpx-player-sending-area')).toBeHidden();
      expect((await root.locator('.bpx-player-primary-area').boundingBox()).height).toBe(225);
      await expect(root.locator('.bpx-player-video-inputbar')).toBeVisible();
    }
    await expect(page.locator('#host-player .bpx-player-sending-area')).toBeVisible();
    expect((await page.locator('#host-player .bpx-player-primary-area').boundingBox()).height).toBe(179);
  });

  test(`${kind} hidden control overflow cannot scroll the first danmaku row out of view`, async ({ page }) => {
    const root = await mount(page, 1200);
    // Native control animations overflow the video viewport by 20px. Focus or
    // scrollIntoView on a control must not scroll that hidden overflow together
    // with the video, subtitles and first row of danmaku.
    await page.addStyleTag({ content: `
      .bpx-player-video-area { overflow:hidden; }
      .bpx-player-row-dm-wrap { position:absolute; inset:0; pointer-events:none; }
      .test-danmaku { position:absolute; top:4px; left:100px; font:17px/20px sans-serif; }
      .test-control-overflow { position:absolute; top:100%; height:20px; width:30px; }
    ` });
    await page.locator('.bpx-player-video-area').evaluateAll(areas => {
      for (const area of areas) area.insertAdjacentHTML('beforeend', '<div class="bpx-player-row-dm-wrap"><span class="test-danmaku">第一行弹幕</span></div><button class="test-control-overflow">控件</button>');
    });
    const area = root.locator('.bpx-player-video-area');
    for (const fullscreen of [false, true, false]) {
      await root.evaluate(async (el, fullscreen) => {
        if (fullscreen) await el.parentElement.requestFullscreen();
        else if (document.fullscreenElement) await document.exitFullscreen();
      }, fullscreen);
      await area.locator('.test-control-overflow').evaluate(el => el.scrollIntoView({ block: 'nearest' }));
      expect(await area.evaluate(el => el.scrollTop)).toBe(0);
      const viewport = await area.boundingBox(), bullet = await area.locator('.test-danmaku').boundingBox();
      expect(bullet.y - viewport.y).toBe(4);
      expect(bullet.y + bullet.height).toBeLessThan(viewport.y + viewport.height);
    }
    // The host site's player retains its own overflow behavior.
    const hostArea = page.locator('#host-player .bpx-player-video-area');
    await hostArea.evaluate(el => { el.scrollTop = 20; });
    expect(await hostArea.evaluate(el => el.scrollTop)).toBe(20);
  });

  test(`${kind} clipping preserves flex shrinking in a short fullscreen viewport`, async ({ page }) => {
    const root = await mount(page, 1200);
    await root.evaluate(el => {
      el.parentElement.style.height = '400px';
      el.querySelector('.bpx-player-primary-area').style.cssText = 'display:flex;flex-direction:column;';
      const area = el.querySelector('.bpx-player-video-area');
      area.style.cssText = 'flex:1 1 0%;height:auto;';
      // Native video-perch uses a percentage placeholder. It must not become
      // the flex item's minimum height after changing hidden to overflow:clip.
      area.insertAdjacentHTML('afterbegin', '<div style="padding-top:50%"></div>');
    });
    const area = root.locator('.bpx-player-video-area');
    const controls = root.locator('.bpx-player-control-wrap');
    await area.evaluate(el => el.style.setProperty('min-height', 'auto', 'important'));
    expect((await area.boundingBox()).height).toBe(600);
    await area.evaluate(el => el.style.removeProperty('min-height'));
    for (const width of [1200, 1800, 800]) {
      await root.evaluate((el, width) => { el.parentElement.style.width = `${width}px`; }, width);
      const box = await area.boundingBox(), bar = await controls.boundingBox();
      expect(box.height).toBe(400);
      expect(bar.y + bar.height).toBe(box.y + box.height);
      expect(await area.evaluate(el => { el.scrollTop = 100; return el.scrollTop; })).toBe(0);
    }
  });

  test(`${kind} mini controls align and play visibility follows shell activity instead of native resume`, async ({ page }) => {
    const root = await mount(page);
    await root.locator('.bpx-player-container').evaluate(el => { el.dataset.screen = 'web'; });
    const play = root.locator('.bpx-player-ctrl-btn-play-icon-mini');
    const volume = root.locator('.bpx-player-ctrl-volume-icon-mini:not(.bpx-player-ctrl-muted-icon)');
    const muted = root.locator('.bpx-player-ctrl-muted-icon');
    const frame = await root.boundingBox(), p = await play.boundingBox(), v = await volume.boundingBox();
    expect(p.width).toBe(32); expect(p.height).toBe(32);
    expect(v.width).toBe(32); expect(v.height).toBe(32);
    expect(p.y).toBe(v.y);
    expect(p.x - frame.x).toBe(12);
    expect(frame.x + frame.width - v.x - v.width).toBe(12);
    expect(frame.y + frame.height - p.y - p.height).toBe(12);
    for (const control of [play, volume]) {
      expect((await control.locator('svg').boundingBox()).width).toBe(24);
      expect((await control.locator('svg').boundingBox()).height).toBe(24);
      await expect(control).toHaveCSS('border-radius', '50%');
      expect(await control.evaluate(el => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      })).toBe(true);
    }
    expect(await play.evaluate(el => getComputedStyle(el, '::after').display)).toBe('none');
    expect(await volume.evaluate(el => getComputedStyle(el, '::before').display)).toBe('none');
    await expect(muted).toBeHidden();
    await volume.evaluate(el => { el.style.display = 'none'; el.nextElementSibling.style.display = ''; });
    expect(await muted.boundingBox()).toEqual(v);
    await root.locator('[class*=icon-mini]').evaluateAll(els => els.forEach(el => { el.style.display = 'none'; }));
    await expect(play).toBeVisible(); await expect(volume).toBeHidden(); await expect(muted).toBeHidden();
    await play.evaluate(el => el.classList.add('bpx-player-ctrl-play-left'));
    expect((await play.locator('svg').boundingBox()).width).toBe(20);
    expect((await play.locator('svg').boundingBox()).height).toBe(20);
    expect((await play.boundingBox()).width).toBe(32);
    await root.evaluate(el => { el.parentElement.dataset.controlsVisible = 'false'; });
    await expect(play).toBeHidden();
    await root.evaluate(el => { el.parentElement.dataset.controlsVisible = 'true'; });
    await expect(play).toBeVisible();
    const regularBackground = await page.locator('#host-player .bpx-player-control-bottom .bpx-player-ctrl-play').evaluate(el => getComputedStyle(el).backgroundColor);
    await expect(root.locator('.bpx-player-control-bottom .bpx-player-ctrl-play')).toHaveCSS('background-color', regularBackground);
    expect((await page.locator('#host-player .bpx-player-ctrl-volume-icon-mini:not(.bpx-player-ctrl-muted-icon)').boundingBox()).width).toBe(34);
  });
}

test('legacy mini pause/resume follows activity when the regular shell is not floating', async ({ page }) => {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  const frame = page.locator(`#${A}-player-wrap`);
  await page.locator(`#${A}-player .bpx-player-container`).evaluate(root => {
    root.style.position = 'relative';
    const play = document.createElement('div');
    play.className = 'bpx-player-ctrl-btn bpx-player-ctrl-play bpx-player-ctrl-btn-play-icon-mini';
    play.setAttribute('role', 'button');
    play.tabIndex = 0;
    play.innerHTML = '<div class="bpx-player-ctrl-btn-icon"><span class="bpx-common-svg-icon"><svg viewBox="0 0 28 28"></svg></span></div>';
    window.__miniPaused = false;
    play.addEventListener('click', () => {
      window.__miniPaused = !window.__miniPaused;
      play.classList.toggle('bpx-player-ctrl-play-left', window.__miniPaused);
      // This is the native TinyView reaction to a paused -> playing change.
      play.style.display = window.__miniPaused ? '' : 'none';
    });
    root.append(play);
  });
  const play = frame.locator('.bpx-player-ctrl-btn-play-icon-mini');
  await frame.hover();
  for (const paused of [true, false, true, false]) {
    await play.click();
    expect(await page.evaluate(() => window.__miniPaused)).toBe(paused);
    await page.waitForTimeout(350);
    await expect(play).toBeVisible();
  }
  await frame.hover();
  await expect(frame).toHaveAttribute('data-controls-visible', 'false');
  await expect(play).toBeHidden();
  const rect = await frame.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2 + 5, rect.y + rect.height / 2);
  await expect(play).toBeVisible();
  expect(errors).toEqual([]);
});
