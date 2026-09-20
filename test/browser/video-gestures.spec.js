import { test, expect } from '@playwright/test';
import { APP as A, cardButton, loadFixture, mockPlayback } from './fixture.js';

async function openPlayer(page, paused = false) {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.evaluate(paused => {
    const media = window.__gestureMedia = { paused, nativeClicks: 0, changes: 0 };
    const create = window.nano.createPlayer;
    window.nano.createPlayer = setting => {
      const player = create(setting), connect = player.connect;
      return Object.assign(player, {
        isPaused: () => media.paused,
        pause() { media.paused = true; media.changes++; },
        play() { media.paused = false; media.changes++; },
        connect() {
          connect();
          const area = document.createElement('div');
          area.className = 'bpx-player-video-area';
          area.style.cssText = 'position:absolute;inset:80px 0 60px';
          area.innerHTML = '<div class="bpx-player-video-perch" style="position:absolute;inset:0"></div><div class="bpx-player-dm-wrap" style="position:absolute;inset:0"><span class="danmaku" style="position:absolute;left:40%;top:40%">移动弹幕</span></div><div class="bpx-player-control-wrap" style="position:absolute;bottom:0"><button>原播放器按钮</button></div>';
          area.addEventListener('click', () => { media.nativeClicks++; setTimeout(() => { media.paused = !media.paused; media.changes++; }, 180); }, true);
          setting.element.firstChild.append(area);
        },
      });
    };
  }, paused);
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.locator('.bpx-player-video-area')).toBeVisible();
  return errors;
}

for (const paused of [false, true]) test(`double clicking a danmaku layer preserves ${paused ? 'paused' : 'playing'} state on entering and leaving fullscreen`, async ({ page }) => {
  const errors = await openPlayer(page, paused);
  for (const fullscreen of [true, false]) {
    await page.locator('.bpx-player-dm-wrap').dblclick();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(fullscreen);
    await page.waitForTimeout(450);
    expect(await page.evaluate(() => window.__gestureMedia)).toEqual({ paused, nativeClicks: 0, changes: 0 });
  }
  expect(errors).toEqual([]);
});

for (const paused of [false, true]) test(`native mini mute clicks never toggle ${paused ? 'paused' : 'playing'} video playback`, async ({ page }) => {
  const errors = await openPlayer(page, paused);
  await page.evaluate(() => {
    const area = document.querySelector('.bpx-player-video-area');
    const replacement = area.cloneNode(true);
    area.replaceWith(replacement);
    const volume = document.createElement('div');
    volume.className = 'bpx-player-ctrl-btn-icon bpx-player-ctrl-volume-icon-mini';
    volume.innerHTML = '<span class="bpx-common-svg-icon"><svg viewBox="0 0 24 24"><path d="M4 4H20V20H4Z"/></svg></span>';
    volume.addEventListener('click', event => { event.stopPropagation(); window.__gestureMedia.muted = !window.__gestureMedia.muted; });
    replacement.append(volume);
  });
  const volume = page.locator('.bpx-player-ctrl-volume-icon-mini');
  for (const muted of [true, false]) {
    await volume.locator('svg').click();
    await expect.poll(() => page.evaluate(() => window.__gestureMedia.muted)).toBe(muted);
    await page.waitForTimeout(350);
    expect(await page.evaluate(() => window.__gestureMedia)).toEqual({ paused, muted, nativeClicks: 0, changes: 0 });
  }
  expect(errors).toEqual([]);
});

for (const paused of [false, true]) test(`native fullscreen and layout buttons preserve ${paused ? 'paused' : 'playing'} playback until the click completes`, async ({ page }) => {
  const errors = await openPlayer(page, paused);
  await page.locator('.bpx-player-control-wrap').evaluate(controls => {
    controls.style.cssText = 'position:absolute;bottom:0;right:10px;display:flex';
    for (const name of ['full', 'web', 'wide']) {
      const button = document.createElement('button');
      button.className = 'bpx-player-ctrl-' + name; button.textContent = name;
      controls.append(button);
    }
  });
  for (const name of ['full', 'web', 'wide']) {
    const state = () => page.evaluate(() => {
      const s = window.__biliPopupPlayerNano.getState();
      return { system: !!document.fullscreenElement, web: s.home.fullscreen, layout: s.homeCommentLayout };
    });
    const initial = await state();
    for (const restore of [false, true]) {
      const before = await state();
      const button = page.locator('.bpx-player-ctrl-' + name);
      await button.hover();
      const rect = await button.boundingBox();
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await page.mouse.down();
      // A normal held press must not move the button out from under mouseup.
      await page.waitForTimeout(100);
      expect(await state()).toEqual(before);
      await page.mouse.up();
      await expect.poll(state).not.toEqual(before);
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => window.__gestureMedia)).toEqual({ paused, nativeClicks: 0, changes: 0 });
      if (restore) expect(await state()).toEqual(initial);
    }
  }
  const full = page.locator('.bpx-player-ctrl-full');
  for (const key of ['Enter', 'Space']) {
    await full.focus(); await page.keyboard.press(key);
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(key === 'Enter');
    await page.waitForTimeout(350);
    expect(await page.evaluate(() => window.__gestureMedia)).toEqual({ paused, nativeClicks: 0, changes: 0 });
  }
  expect(errors).toEqual([]);
});

test('slow system double clicks restore playback and normal single clicks still toggle once', async ({ page }) => {
  const errors = await openPlayer(page);
  await page.locator('.bpx-player-dm-wrap').evaluate(el => el.remove());
  const canvas = page.locator('.bpx-player-video-perch');
  await canvas.click();
  await expect.poll(() => page.evaluate(() => window.__gestureMedia.paused)).toBe(true);
  const rect = await canvas.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down({ clickCount: 2 });
  await page.mouse.up({ clickCount: 2 });
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__gestureMedia)).toEqual({ paused: false, nativeClicks: 0, changes: 2 });
  await canvas.click();
  await page.waitForTimeout(400);
  await expect.poll(() => page.evaluate(() => window.__gestureMedia.paused)).toBe(true);
  await page.getByRole('button', { name: '原播放器按钮', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__gestureMedia.paused)).toBe(false);
  expect(await page.evaluate(() => window.__gestureMedia.nativeClicks)).toBe(1);
  expect(errors).toEqual([]);
});

test('a user pause or paused double click during startup cancels the delayed autoplay retry', async ({ page }) => {
  const errors = await openPlayer(page, true);
  await page.locator('.bpx-player-dm-wrap').dblclick();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.waitForTimeout(1450);
  expect(await page.evaluate(() => window.__gestureMedia)).toEqual({ paused: true, nativeClicks: 0, changes: 0 });
  expect(errors).toEqual([]);
});

test('double clicks use the media state when the player API has not caught up', async ({ page }) => {
  const errors = await openPlayer(page);
  await page.evaluate(() => {
    const h = window.__biliPopupPlayerNano.getState().home;
    const video = document.createElement('video');
    Object.defineProperty(video, 'paused', { get: () => window.__gestureMedia.paused });
    h.ui.playerRoot.append(video);
    h.player.isPaused = () => true;
  });
  await page.locator('.bpx-player-dm-wrap').dblclick();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__gestureMedia)).toEqual({ paused: false, nativeClicks: 0, changes: 0 });
  expect(errors).toEqual([]);
});

test('a replaced danmaku hit target still counts as a double click, and closing cancels a pending single click', async ({ page }) => {
  const errors = await openPlayer(page);
  const canvas = page.locator('.bpx-player-dm-wrap');
  // Both click events have detail=1 because the overlay changed under the mouse.
  // Use real mouse activations, replacing only the hit target between them.
  await canvas.click();
  await canvas.evaluate(el => el.replaceWith(el.cloneNode(true)));
  await canvas.click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  expect(await page.evaluate(() => window.__gestureMedia.paused)).toBe(false);
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForTimeout(350);
  await canvas.click();
  await page.evaluate(() => window.__biliPopupPlayerNano.getState().home.ui.close.click());
  await page.waitForTimeout(350);
  // closeHome pauses the player; the delayed canvas action must not resume it.
  expect(await page.evaluate(() => window.__gestureMedia.paused)).toBe(true);
  expect(errors).toEqual([]);
});
