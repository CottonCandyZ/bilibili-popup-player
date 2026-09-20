import { test, expect } from '@playwright/test';
import { APP, cardButton, loadFixture, mockPlayback } from './fixture.js';

async function setup(page, directClick = true, path = '/video/BV1original/') {
  await page.addInitScript(({ APP, directClick }) => localStorage.setItem(APP + ':direct-click', directClick ? '1' : '0'), { APP, directClick });
  const errors = await loadFixture(page, path);
  await mockPlayback(page);
  await page.locator('#card-b').evaluate(card => {
    const image = card.querySelector('img').outerHTML;
    // Playback-page duration, preview and watch-later layers are siblings of
    // the image anchor, not descendants of it.
    card.className = 'video-page-card-small';
    card.innerHTML = `<div class="card-box">
      <div class="pic-box" style="position:relative;width:142px;height:80px">
        <div class="pic" style="width:100%;height:100%">
          <div class="framepreview-box"><a class="video-awesome-img" href="/video/BV1test002/"><div class="b-img">${image}</div></a></div>
          <span class="mask-video" style="position:absolute;inset:0;pointer-events:none"></span>
          <span class="duration" style="position:absolute;right:4px;bottom:4px;background:#0008;color:white">03:00</span>
        </div>
        <div class="watch-later-video" style="position:absolute;right:4px;top:4px;width:20px;height:20px">稍后</div>
        <div class="v-recommend-inline-player" style="display:none;position:absolute;inset:0;background:#567">预览画面</div>
      </div>
      <div class="info"><a href="/video/BV1test002/"><p class="title">留一点时间给自己</p></a></div>
    </div>`;
    card.querySelector('img').style.cssText = 'width:142px;height:80px;display:block';
    card.querySelector('.video-awesome-img').style.cssText = 'display:block;width:142px;height:80px';
    window.__nativeNavigation = [];
    window.__nativeVideoBvid = 'BV1original';
    card.querySelector('.info .title').addEventListener('click', () => {
      window.__nativeVideoBvid = 'BV1test002';
    });
    card.addEventListener('click', event => {
      const link = event.target.closest('a');
      if (!link) return;
      event.preventDefault();
      window.__nativeNavigation.push(link.getAttribute('href'));
      history.pushState({}, '', link.href);
    });
    card.querySelector('.watch-later-video').addEventListener('click', () => { window.__watchLaterClicked = true; });
    window.__biliPopupPlayerNano.scan();
  });
  return errors;
}

test('recommendation duration and inline preview do not hide the hover action', async ({ page }) => {
  const errors = await setup(page);
  const cover = page.locator('#card-b .pic-box'), action = cardButton(page, 'BV1test002');
  await cover.hover();
  await expect(action).toBeVisible();
  await page.locator('.v-recommend-inline-player').evaluate(el => { el.style.display = 'block'; });
  await expect(action).toBeVisible();
  // An unrelated overlay inside the card must still block the cover.
  await page.locator('#card-b').evaluate(card => card.insertAdjacentHTML('beforeend', '<div id="blocker" style="position:absolute;inset:0;z-index:5;background:#fff"></div>'));
  await expect(action).toBeHidden();
  expect(errors).toEqual([]);
});

test('clicking the recommendation preview starts the popup once and does not navigate the native player', async ({ page }) => {
  const errors = await setup(page);
  await page.locator('.v-recommend-inline-player').evaluate(el => { el.style.display = 'block'; });
  await page.locator('.v-recommend-inline-player').click({ position: { x: 30, y: 20 } });
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => window.__mockPlayback.created)).toBe(1);
  expect(await page.evaluate(() => window.__nativeNavigation)).toEqual([]);
  expect(errors).toEqual([]);
});

test('jump on a playback page uses its original same-tab navigation, bypassing cover playback', async ({ page, context }) => {
  const errors = await setup(page);
  const pages = context.pages().length;
  await page.locator('#card-b .pic-box').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page).toHaveURL('https://www.bilibili.com/video/BV1test002/');
  expect(await page.evaluate(() => window.__nativeNavigation)).toEqual(['/video/BV1test002/']);
  expect(await page.evaluate(() => window.__nativeVideoBvid)).toBe('BV1test002');
  expect(await page.evaluate(() => window.__mockPlayback.created)).toBe(0);
  expect(context.pages()).toHaveLength(pages);
  expect(errors).toEqual([]);
});

test('watch-later remains native and button-play mode opens the recommendation popup', async ({ page }) => {
  const errors = await setup(page, false);
  await page.locator('.watch-later-video').click();
  expect(await page.evaluate(() => window.__watchLaterClicked)).toBe(true);
  expect(await page.evaluate(() => window.__mockPlayback.created)).toBe(0);
  await page.locator('#card-b .pic-box').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => window.__mockPlayback.created)).toBe(1);
  expect(errors).toEqual([]);
});

test('watch-later is not intercepted in cover-play mode', async ({ page }) => {
  await setup(page);
  await page.locator('.watch-later-video').click();
  expect(await page.evaluate(() => window.__watchLaterClicked)).toBe(true);
  expect(await page.evaluate(() => window.__mockPlayback.created)).toBe(0);
});
