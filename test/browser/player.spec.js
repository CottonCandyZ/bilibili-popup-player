import { test, expect } from '@playwright/test';
import { APP, cardButton, loadFixture, mockPlayback } from './fixture.js';

test('OGV only mounts real covers, never episode cells or layer contents', async ({ page }) => {
  const errors = await loadFixture(page);
  await expect(page.locator(`#${APP}-host button[data-key]`)).toHaveCount(3);
  await page.locator('#card-a .cover').hover();
  await expect(cardButton(page)).toBeVisible();
  await expect(page.locator(`.ep-list .${APP}__button`)).toHaveCount(0);
  await page.locator('.ep-list a').nth(1).hover();
  await expect(cardButton(page)).toBeHidden();
  await page.evaluate(() => {
    const layer = document.createElement('div'); layer.setAttribute('role', 'dialog');
    layer.innerHTML = '<a class="cover" href="/bangumi/play/ep999"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="弹层中的视频"></a>';
    document.querySelector('#extra').append(layer);
    window.__biliPopupPlayerNano.scan();
  });
  await expect(cardButton(page, 'ep999')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('covered cards cannot float through overlays, even with a stationary pointer', async ({ page }) => {
  await loadFixture(page);
  await page.locator('#card-a .cover').hover();
  await expect(cardButton(page)).toBeVisible();
  await page.evaluate(() => {
    const layer = document.createElement('div'); layer.id = 'blocker';
    layer.style.cssText = 'position:fixed;inset:0;z-index:50;background:#0004';
    document.body.append(layer);
  });
  await expect(cardButton(page)).toBeHidden();
  await page.mouse.move(170, 470);
  await expect(cardButton(page)).toBeHidden();
  await page.locator('#blocker').evaluate(el => el.remove());
  await page.locator('#card-a .cover').hover();
  await expect(cardButton(page)).toBeVisible();
});

test('a partial occluder over the button and clipped scroll parents hide the control', async ({ page }) => {
  await loadFixture(page);
  await page.locator('#card-a .cover').hover();
  await expect(cardButton(page)).toBeVisible();
  const box = await cardButton(page).boundingBox();
  await page.evaluate(box => {
    const layer = document.createElement('div'); layer.id = 'blocker';
    layer.style.cssText = `position:fixed;left:${box.x - 4}px;top:${box.y - 4}px;width:90px;height:40px;background:white;z-index:40`;
    document.body.append(layer);
  }, box);
  await expect(cardButton(page)).toBeHidden();
  await page.locator('#blocker').evaluate(el => el.remove());
  await page.locator('#card-a').evaluate(el => { el.style.height = '80px'; el.style.overflow = 'hidden'; });
  await page.locator('#card-a').hover();
  await expect(cardButton(page)).toBeHidden();
});

test('recycled and removed cards update targets without duplicate controls', async ({ page }) => {
  await loadFixture(page);
  await page.locator('#card-a a').evaluateAll(links => links.forEach(link => link.href = '/bangumi/play/ep301'));
  await expect(cardButton(page, 'ep301')).toHaveCount(1);
  await expect(cardButton(page, 'ep201')).toHaveCount(0);
  await page.locator('#card-a').evaluate(el => el.remove());
  await expect(cardButton(page, 'ep301')).toHaveCount(0);
});

test('a layer inside the same card cannot masquerade as the exposed cover', async ({ page }) => {
  await loadFixture(page);
  await page.locator('#card-a .cover').hover();
  await expect(cardButton(page)).toBeVisible();
  await page.locator('#card-a').evaluate(card => {
    const layer = document.createElement('div');
    layer.id = 'card-layer';
    layer.style.cssText = 'position:absolute;inset:0;background:white;z-index:2';
    card.append(layer);
  });
  await expect(cardButton(page)).toBeHidden();
  await page.locator('#card-layer').evaluate(el => el.remove());
  await expect(cardButton(page)).toBeVisible();
});

test('master switch tears down and restores enhancements, and survives reload', async ({ page }) => {
  const errors = await loadFixture(page);
  await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await page.getByRole('switch', { name: '小窗播放', exact: true }).click();
  await expect(page.locator(`#${APP}-host button[data-key]`)).toHaveCount(0);
  await expect(page.getByRole('switch', { name: '小窗播放', exact: true })).not.toBeChecked();
  await expect(page.getByRole('radio', { name: '网页小窗', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.__biliPopupPlayerNano.getState().observer)).toBeNull();
  await page.getByRole('switch', { name: '小窗播放', exact: true }).click();
  await expect(page.locator(`#${APP}-host button[data-key]`)).toHaveCount(3);
  await page.getByRole('switch', { name: '小窗播放', exact: true }).click();
  await loadFixture(page);
  await expect(page.locator(`#${APP}-host button[data-key]`)).toHaveCount(0);
  await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await expect(page.getByRole('switch', { name: '小窗播放', exact: true })).not.toBeChecked();
  expect(errors).toEqual([]);
});

test('settings support Escape, keyboard switches and a narrow viewport', async ({ page }) => {
  const errors = await loadFixture(page);
  await page.setViewportSize({ width: 390, height: 740 });
  await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await expect(page.getByText('让喜欢的内容，留在眼前')).toHaveCount(0);
  const panel = page.locator(`.${APP}__settings__panel`);
  const bounds = await panel.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await page.getByRole('switch', { name: '点击封面播放', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('switch', { name: '点击封面播放', exact: true })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  expect(errors).toEqual([]);
});

test('current OGV entry follows SPA episode changes and works without Document PiP', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: undefined }));
  const errors = await loadFixture(page);
  const current = page.locator(`.${APP}__playback-pip-button`);
  await expect(current).toHaveAttribute('data-ep-id', '101');
  await page.evaluate(() => history.pushState({}, '', '/bangumi/play/ep102'));
  await expect(current).toHaveAttribute('data-ep-id', '102');
  await current.click();
  await expect(page.getByRole('dialog', { name: '小窗播放器', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭播放器', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '小窗播放器', exact: true })).toBeHidden();
  expect(errors).toEqual([]);
});

test('background-image recommendation covers work while virtual episode rows remain untouched', async ({ page }) => {
  await loadFixture(page);
  await page.evaluate(() => {
    document.querySelector('#extra').innerHTML = '<div class="RecommendItem_wrap__5sPoo"><a href="/bangumi/play/ss500"><div class="RecommendItem_cover__2W1Nu" style="width:142px;height:80px;background-image:linear-gradient(#ddd,#aaa)"></div>推荐番剧</a></div><div class="EpisodeVirtualList_list__abc"><a href="/bangumi/play/ep501"><img width="142" height="80" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">有封面的选集行</a></div>';
    window.__biliPopupPlayerNano.scan();
  });
  await expect(cardButton(page, 'ogv:ss:500')).toHaveCount(1);
  await expect(cardButton(page, 'ep501')).toHaveCount(0);
});

test('the page stays interactive while minimized and restoring keeps the same player instance', async ({ page }) => {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  const full = page.getByRole('dialog', { name: '小窗播放器', exact: true });
  await expect(full).toBeVisible();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(4);
  await expect(page.getByRole('tab', { name: '评论', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: '播放：2. 看见新的风景', exact: true })).toBeHidden();
  await page.evaluate(() => { window.__originalPlayerRoot = window.__biliPopupPlayerNano.getState().home.ui.playerRoot; });
  await page.getByRole('button', { name: '收起到右下角', exact: true }).click();
  const mini = page.getByRole('dialog', { name: '迷你播放器', exact: true });
  await expect(mini).toBeVisible();
  await expect(page.locator(`.${APP}__playback-pip-button`)).toBeHidden();
  await expect.poll(() => mini.evaluate(el => el.getAnimations().length)).toBe(0);
  const bounds = await mini.boundingBox();
  expect(bounds.width).toBeLessThanOrEqual(401);
  expect(page.viewportSize().height - bounds.y - bounds.height).toBeCloseTo(16, 0);
  expect(bounds.height).toBeCloseTo(bounds.width * 9 / 16, 0);
  expect(bounds.x).toBeGreaterThan(900);
  expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe('hidden');
  await page.locator('#card-a .cover').hover();
  await expect(cardButton(page)).toBeVisible();
  await page.evaluate(() => { window.__backgroundClicked = false; document.querySelector('h1').addEventListener('click', () => { window.__backgroundClicked = true; }); });
  await page.locator('h1').click();
  expect(await page.evaluate(() => window.__backgroundClicked)).toBe(true);
  await page.mouse.wheel(0, 250);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__mockPlayback.created)).toBe(1);
  expect(await page.evaluate(() => window.__mockPlayback.paused)).toBe(0);
  await mini.hover();
  await page.getByRole('button', { name: '还原播放器', exact: true }).click();
  await expect(full).toBeVisible();
  expect(await page.evaluate(() => window.__originalPlayerRoot === window.__biliPopupPlayerNano.getState().home.ui.playerRoot)).toBe(true);
  await expect.poll(() => full.evaluate(el => el.getAnimations().length)).toBe(0);
  await page.locator(`#${APP}-player-wrap`).hover();
  await page.getByRole('button', { name: '关闭播放器', exact: true }).click();
  await expect(page.locator(`.${APP}__playback-pip-button`)).toBeVisible();
  expect(await page.evaluate(() => window.__mockPlayback.externalPaused)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__mockPlayback.externalPlayed)).toBe(1);
  expect(errors).toEqual([]);
});

test('player menu remains accessible inside the modal and Escape returns to playback', async ({ page }) => {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  const trigger = page.getByRole('button', { name: '小窗播放设置', exact: true });
  await trigger.click();
  await expect(page.getByRole('button', { name: '重置窗口尺寸', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '自动适配布局', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator(`.${APP}__settings__panel`)).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('dialog', { name: '小窗播放器', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '小窗播放器', exact: true })).toBeHidden();
  expect(errors).toEqual([]);
});

test('master switch closes a playing mini window and removes its React roots', async ({ page }) => {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '收起到右下角', exact: true }).click();
  await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await page.getByRole('switch', { name: '小窗播放', exact: true }).click();
  await expect(page.locator(`[data-bili-popup-ui="home"]`)).toHaveCount(0);
  expect(await page.evaluate(() => window.__mockPlayback.disconnected)).toBe(1);
  expect(errors).toEqual([]);
});

test('cover-click mode leaves OGV episode links and Ctrl-clicks native', async ({ page }) => {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await page.getByRole('switch', { name: '点击封面播放', exact: true }).click();
  await page.keyboard.press('Escape');
  const results = await page.evaluate(() => {
    const click = (el, ctrlKey = false) => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey, button: 0 });
      // Avoid navigation in this fixture but observe whether our capture handler claimed it.
      let claimed = false;
      const listener = e => { claimed = e.defaultPrevented; e.preventDefault(); };
      el.addEventListener('click', listener, { once: true });
      el.dispatchEvent(event);
      return claimed;
    };
    return { episode: click(document.querySelector('.ep-list a:nth-child(2)')), modified: click(document.querySelector('#card-b .cover'), true) };
  });
  expect(results).toEqual({ episode: false, modified: false });
  await page.locator('#card-b .cover').click();
  await expect(page.getByRole('dialog', { name: '小窗播放器', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a pending system PiP request cannot reopen the player after disabling', async ({ page }) => {
  const errors = await loadFixture(page);
  await page.evaluate(() => Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: { requestWindow: () => new Promise(resolve => { window.__resolvePip = resolve; }) } }));
  await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await page.getByRole('radio', { name: /独立小窗/ }).click();
  await page.keyboard.press('Escape');
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect.poll(() => page.evaluate(() => typeof window.__resolvePip)).toBe('function');
  await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await page.getByRole('switch', { name: '小窗播放', exact: true }).click();
  await page.evaluate(() => window.__resolvePip({ close() { window.__latePipClosed = true; } }));
  await expect.poll(() => page.evaluate(() => window.__latePipClosed)).toBe(true);
  expect(await page.evaluate(() => window.__biliPopupPlayerNano.getState().pip.win)).toBeNull();
  expect(errors).toEqual([]);
});

test('React playback and sidebar mount into a separate PiP document and clean up on close', async ({ page, context }) => {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await context.route('https://s1.hdslb.com/**', route => route.abort());
  await page.evaluate(() => Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: {
    requestWindow() {
      const win = window.open('about:blank', '_blank', 'popup,width=960,height=600');
      win.nano = window.nano;
      win.BiliComments = window.BiliComments;
      return Promise.resolve(win);
    },
  } }));
  await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await page.getByRole('radio', { name: /独立小窗/ }).click();
  await page.keyboard.press('Escape');
  await page.locator('#card-b .cover').hover();
  const popupPromise = page.waitForEvent('popup');
  await cardButton(page, 'BV1test002').click();
  const popup = await popupPromise;
  popup.on('pageerror', error => errors.push(error.message));
  await expect(popup.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await popup.getByRole('tab', { name: '分P', exact: true }).click();
  await expect(popup.getByRole('button', { name: '播放：2. 看见新的风景', exact: true })).toBeVisible();
  await injectWideControl(popup, '#bilibili-player');
  await popup.getByRole('button', { name: '宽屏', exact: true }).click();
  await expect(popup.locator('body')).toHaveClass(/comments-bottom/);
  await popup.getByRole('button', { name: '恢复侧栏', exact: true }).click();
  await expect(popup.locator('body')).toHaveClass(/comments-right/);
  await expect(popup.getByRole('tab', { name: '分P', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: '小窗播放设置', exact: true })).toBeHidden();
  await popup.locator('#stage').hover();
  await popup.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await popup.getByRole('switch', { name: '联播倒计时', exact: true }).click();
  await popup.keyboard.press('Escape');
  await expect(popup.locator(`.${APP}__settings__panel`)).toBeHidden();
  await popup.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await popup.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await expect(popup.locator(`.${APP}__pip-tools`)).toHaveCSS('opacity', '0');
  await popup.close();
  await expect.poll(() => page.evaluate(() => window.__biliPopupPlayerNano.getState().pip.player)).toBeNull();
  await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await expect(page.getByRole('switch', { name: '联播倒计时', exact: true })).not.toBeChecked();
  expect(await page.evaluate(() => window.__mockPlayback.externalPlayed)).toBe(1);
  expect(errors).toEqual([]);
});

test('mini playback fits narrow screens and respects reduced motion', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: undefined }));
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 740 });
  // Native current-page entry also supports the in-page player on a narrow viewport.
  await page.evaluate(() => history.pushState({}, '', '/video/BV1test002/'));
  await expect(page.locator(`.${APP}__playback-pip-button`)).toHaveAttribute('data-bvid', 'BV1test002');
  await page.locator(`.${APP}__playback-pip-button`).click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '收起到右下角', exact: true }).click();
  const mini = page.getByRole('dialog', { name: '迷你播放器', exact: true });
  const box = await mini.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await mini.evaluate(el => el.getAnimations().length)).toBe(0);
  expect(errors).toEqual([]);
});

test('OGV reuses the host comment script even when the page schedules it after opening', async ({ page }) => {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.route('**/commentpc/bili-comments.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    window.__commentLoads = (window.__commentLoads || 0) + 1;
    customElements.define('fixture-comment-component', class extends HTMLElement {});
    window.BiliComments = class { mount(el) { el.textContent = '原站评论组件已复用'; return { unmount() {} }; } };
  ` }));
  await page.evaluate(() => {
    delete window.BiliComments;
    const data = document.createElement('script');
    data.id = '__NEXT_DATA__'; data.type = 'application/json'; data.textContent = '{}';
    document.head.append(data);
  });
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await expect(page.getByText('评论加载中...', { exact: true })).toBeVisible();
  await expect(page.locator('script[src*="commentpc"]')).toHaveCount(0);
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.src = '//s1.hdslb.com/bfs/seed/jinkela/commentpc/bili-comments.js';
    document.head.append(script);
  });
  await expect(page.getByText('原站评论组件已复用')).toBeVisible();
  await expect(page.locator('script[src*="commentpc"]')).toHaveCount(1);
  expect(await page.evaluate(() => window.__commentLoads)).toBe(1);
  expect(errors).toEqual([]);
});

test('settings follow the player, fit the mini window and Escape closes only the menu', async ({ page }) => {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  const floating = page.locator(`#${APP}-host`).getByRole('button', { name: '小窗播放设置', exact: true });
  const initialBox = await floating.boundingBox();
  expect(page.viewportSize().height - initialBox.y - initialBox.height).toBeCloseTo(20, 0);
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByText('评论区测试内容')).toBeVisible();
  await expect(floating).toBeHidden();
  const frame = page.locator(`#${APP}-player-wrap`);
  const frameBox = await frame.boundingBox();
  const headerBox = await page.locator(`#${APP}-header`).boundingBox();
  expect(headerBox.y).toBeCloseTo(frameBox.y, 0);
  expect(headerBox.x + headerBox.width).toBeLessThanOrEqual(frameBox.x + frameBox.width + 1);
  await page.locator(`#${APP}-comments`).hover();
  await expect(page.locator(`#${APP}-header`)).toHaveCSS('opacity', '0');
  await frame.hover();
  await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await page.getByRole('switch', { name: '联播倒计时', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator(`.${APP}__settings__panel`)).toBeHidden();
  await expect(page.getByRole('dialog', { name: '小窗播放器', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '收起到右下角', exact: true }).click();
  const mini = page.getByRole('dialog', { name: '迷你播放器', exact: true });
  await expect.poll(() => mini.evaluate(el => el.getAnimations().length)).toBe(0);
  await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await expect(page.getByRole('switch', { name: '联播倒计时', exact: true })).not.toBeChecked();
  const panel = page.locator(`.${APP}__settings__panel`);
  await expect(panel).toHaveCSS('opacity', '1');
  const bounds = await panel.boundingBox();
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize().height);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '关闭播放器', exact: true }).click();
  await expect(floating).toBeVisible();
  expect(errors).toEqual([]);
});

test('the original tabs switch by mouse and keyboard while keeping comments mounted', async ({ page }) => {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  const part = page.getByRole('button', { name: '播放：2. 看见新的风景', exact: true });
  const comments = page.getByText('评论区测试内容');
  await expect(comments).toBeVisible();
  await expect(part).toBeHidden();
  await page.evaluate(id => { window.__commentsNode = document.getElementById(id + '-comments-mount').firstChild; }, APP);
  await page.getByRole('tab', { name: '分P', exact: true }).click();
  await expect(part).toBeVisible();
  await expect(comments).toBeHidden();
  await page.getByRole('tab', { name: '相关推荐', exact: true }).click();
  await expect(page.getByRole('button', { name: '播放：下一站，慢慢走', exact: true })).toBeVisible();
  await expect(part).toBeHidden();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: '评论', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(comments).toBeVisible();
  expect(await page.evaluate(id => window.__commentsNode === document.getElementById(id + '-comments-mount').firstChild, APP)).toBe(true);
  expect(await page.evaluate(() => window.__mockPlayback.created)).toBe(1);
  expect(errors).toEqual([]);
});

test('backdrop blur interpolates on open, minimize, restore and close', async ({ page }) => {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.evaluate(id => {
    window.__blurSamples = [];
    function sample() {
      const overlay = document.getElementById(id + '-overlay');
      if (overlay) window.__blurSamples.push(Number(/blur\(([\d.]+)px\)/.exec(getComputedStyle(overlay).backdropFilter)?.[1] || 0));
      window.__blurFrame = requestAnimationFrame(sample);
    }
    sample();
  }, APP);
  const hasIntermediate = () => page.evaluate(() => window.__blurSamples.some(value => value > 0 && value < 8));
  const reset = () => page.evaluate(() => { window.__blurSamples = []; });
  const overlay = page.locator(`#${APP}-overlay`);
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(overlay).toHaveCSS('backdrop-filter', 'blur(8px)');
  expect(await hasIntermediate()).toBe(true);
  await reset();
  await page.getByRole('button', { name: '收起到右下角', exact: true }).click();
  await expect(overlay).toHaveCSS('backdrop-filter', 'blur(0px)');
  expect(await hasIntermediate()).toBe(true);
  await expect.poll(() => page.locator(`#${APP}-dialog`).evaluate(el => el.getAnimations().length)).toBe(0);
  await page.locator(`#${APP}-player-wrap`).hover();
  await reset();
  await page.getByRole('button', { name: '还原播放器', exact: true }).click();
  await expect(overlay).toHaveCSS('backdrop-filter', 'blur(8px)');
  expect(await hasIntermediate()).toBe(true);
  await expect.poll(() => page.locator(`#${APP}-dialog`).evaluate(el => el.getAnimations().length)).toBe(0);
  await page.locator(`#${APP}-player-wrap`).hover();
  await reset();
  await page.getByRole('button', { name: '关闭播放器', exact: true }).click();
  await expect(overlay).toBeHidden();
  expect(await hasIntermediate()).toBe(true);
  await page.evaluate(() => cancelAnimationFrame(window.__blurFrame));
  expect(errors).toEqual([]);
});

test('mouse clicks do not keep the full or mini toolbar visible after inactivity', async ({ page }) => {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  const header = page.locator(`#${APP}-header`);
  const frame = page.locator(`#${APP}-player-wrap`);
  await page.getByRole('button', { name: /^自动联播/ }).click();
  await expect(header).toHaveCSS('opacity', '0');
  await frame.hover();
  const settings = page.getByRole('button', { name: '小窗播放设置', exact: true });
  await settings.click();
  // The modal settings mask now sits above comments; moving over that region
  // still must not dismiss the menu or hide its toolbar before a click.
  const commentsRect = await page.locator(`#${APP}-comments`).boundingBox();
  await page.mouse.move(commentsRect.x + commentsRect.width / 2, commentsRect.y + commentsRect.height / 2);
  await expect(page.locator(`.${APP}__settings__panel`)).toBeVisible();
  await expect(header).toHaveCSS('opacity', '1');
  await settings.click();
  await expect(header).toHaveCSS('opacity', '0');
  await frame.hover();
  await page.getByRole('button', { name: '收起到右下角', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '迷你播放器', exact: true })).toBeVisible();
  await expect(header).toHaveCSS('opacity', '0');
  await frame.hover();
  await expect(header).toHaveCSS('opacity', '1');
  expect(errors).toEqual([]);
});

test('keyboard focus keeps the toolbar available while the pointer is elsewhere', async ({ page }) => {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await page.keyboard.press('Tab');
  const header = page.locator(`#${APP}-header`);
  await expect(header.locator(':focus-visible')).toHaveCount(1);
  await page.locator(`#${APP}-comments`).hover();
  await expect(header).toHaveCSS('opacity', '1');
  expect(errors).toEqual([]);
});

for (const url of ['https://www.bilibili.com/bangumi/play/ep101', 'https://t.bilibili.com/']) {
test(`small history covers preserve the hover popover on ${url}`, async ({ page }) => {
  const errors = await loadFixture(page, url);
  await mockPlayback(page);
  await page.evaluate(() => {
    const popover = document.createElement('div');
    popover.id = 'history-popover'; popover.className = 'v-popover-content';
    popover.style.cssText = 'position:fixed;left:80px;top:80px;width:320px;padding:16px;background:white;z-index:60';
    popover.innerHTML = '<a class="history-item" href="/video/BV1test002/" style="display:flex;gap:12px"><img alt="历史视频" style="width:104px;height:60px" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">历史视频</a>';
    let timer;
    popover.addEventListener('mouseleave', () => { timer = setTimeout(() => { popover.hidden = true; }, 120); });
    popover.addEventListener('mouseenter', () => clearTimeout(timer));
    document.body.append(popover);
    window.__biliPopupPlayerNano.scan();
  });
  const popover = page.locator('#history-popover');
  const button = popover.locator('button[data-key="BV1test002"]');
  await popover.locator('img').hover();
  await expect(button).toBeVisible();
  await button.hover();
  // The host popup would disappear after its leave delay if the control were
  // still mounted in our unrelated, page-level overlay.
  await page.waitForTimeout(250);
  await expect(popover).toBeVisible();
  await button.click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});
}

test('mouse focus restored to a played cover does not pin its jump action', async ({ page }) => {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await page.getByRole('switch', { name: '点击封面播放', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.locator('#card-b .cover').click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '关闭播放器', exact: true }).click();
  await page.locator('h1').hover();
  const button = cardButton(page, 'BV1test002');
  await expect(button).toBeHidden();
  await expect(page.locator(`#${APP}-host`).getByText('上次播放', { exact: true })).toBeVisible();
  await page.locator('#card-b .cover').hover();
  await expect(button).toHaveText('跳转');
  await expect(button).toBeVisible();
  expect(errors).toEqual([]);
});

test('the native cursor hides when idle and moving inside the player restores it', async ({ page }) => {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await page.addStyleTag({ content: '.bpx-state-no-cursor video, .bpx-state-no-cursor .bpx-player-video-wrap, .bpx-state-no-cursor .bpx-player-video-perch { cursor:none!important; }' });
  await page.evaluate(id => {
    const content = '<div class="bpx-player-video-perch"><div class="bpx-player-video-wrap"><video></video></div></div>';
    document.getElementById(id + '-player').firstChild.classList.add('bpx-state-no-cursor');
    document.getElementById(id + '-player').firstChild.insertAdjacentHTML('beforeend', content);
    const host = document.createElement('div'); host.id = 'bilibili-player'; host.className = 'bpx-state-no-cursor'; host.innerHTML = content;
    document.getElementById('bofqi').append(host);
  }, APP);
  const frame = page.locator(`#${APP}-player-wrap`);
  await frame.hover();
  for (const selector of ['video', '.bpx-player-video-wrap', '.bpx-player-video-perch']) {
    await expect(page.locator(`#${APP}-player ${selector}`)).toHaveCSS('cursor', 'auto');
    await expect(page.locator(`#bilibili-player ${selector}`)).toHaveCSS('cursor', 'none');
  }
  await expect(frame).toHaveAttribute('data-controls-visible', 'false');
  await expect(page.locator(`#${APP}-player video`)).toHaveCSS('cursor', 'none');
  await frame.hover({ position: { x: 80, y: 80 } });
  await expect(page.locator(`#${APP}-player video`)).toHaveCSS('cursor', 'auto');
  expect(errors).toEqual([]);
});

test('backdrop closes on the first click after focus returns, including after reopening', async ({ page }) => {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  const dialog = page.getByRole('dialog', { name: '小窗播放器', exact: true });
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  const overlay = page.locator(`#${APP}-overlay`);
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await overlay.click({ position: { x: 5, y: 5 } });
  await expect(dialog).toBeHidden();

  // A focus change while the player is closed must not affect its next session.
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(dialog).toBeVisible();
  await overlay.click({ position: { x: 5, y: 5 } });
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});

test('close button works on the first click after focus returns', async ({ page }) => {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  const dialog = page.getByRole('dialog', { name: '小窗播放器', exact: true });
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await page.getByRole('button', { name: '关闭播放器', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});

test('backdrop ignores drags and interrupted presses without swallowing the next click', async ({ page }) => {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  const dialog = page.getByRole('dialog', { name: '小窗播放器', exact: true });
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  const frame = await page.locator(`#${APP}-player-wrap`).boundingBox();
  const inside = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  await page.mouse.move(inside.x, inside.y);
  await page.mouse.down();
  await page.mouse.move(5, 5);
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  await page.mouse.down();
  await page.mouse.move(inside.x, inside.y);
  await page.mouse.up();
  await expect(dialog).toBeVisible();

  await page.mouse.move(5, 5);
  await page.mouse.down();
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  await page.locator(`#${APP}-overlay`).click({ position: { x: 5, y: 5 } });
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});

test('embedded Web mode fills a 16:9 frame and remains enabled after switching parts', async ({ page }) => {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => window.__mockPlayback.screenKind)).toBe(2);
  const bounds = await page.locator(`#${APP}-player-wrap`).boundingBox();
  expect(Math.abs(bounds.height - bounds.width * 9 / 16)).toBeLessThanOrEqual(1);
  await expect(page.getByText('评论区测试内容')).toBeVisible();
  await page.getByRole('tab', { name: '分P', exact: true }).click();
  await page.getByRole('button', { name: '播放：2. 看见新的风景', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__biliPopupPlayerNano.getState().home.bootstrap.playerInfo.cid)).toBe(302);
  expect(await page.evaluate(() => window.__mockPlayback.screenKind)).toBe(2);
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  expect(errors).toEqual([]);
});

async function injectWideControl(page, selector) {
  await page.evaluate(selector => {
    const control = document.createElement('div');
    control.className = 'bpx-player-ctrl-wide'; control.setAttribute('role', 'button');
    control.setAttribute('aria-label', '宽屏'); control.tabIndex = 0;
    control.style.cssText = 'position:absolute;bottom:12px;right:40px;width:60px;height:28px;background:#444;color:white;cursor:pointer';
    control.textContent = '宽屏';
    window.__nativeWideClicks = 0;
    control.addEventListener('click', () => { window.__nativeWideClicks++; });
    document.querySelector(selector).append(control);
  }, selector);
}

test('wide mode returns to the sidebar without changing immersive playback or the selected tab', async ({ page }) => {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await page.getByRole('tab', { name: '分P', exact: true }).click();
  await injectWideControl(page, `#${APP}-player`);
  const overlay = page.locator(`#${APP}-overlay`);
  await page.getByRole('button', { name: '宽屏', exact: true }).click();
  await expect(overlay).not.toHaveClass(/--comments-right/);
  const video = await page.locator(`#${APP}-player-wrap`).boundingBox();
  const sidebar = await page.locator(`#${APP}-comments`).boundingBox();
  expect(sidebar.y).toBeGreaterThanOrEqual(video.y + video.height - 1);
  const restore = page.getByRole('button', { name: '恢复侧栏', exact: true });
  await restore.click();
  await expect(overlay).toHaveClass(/--comments-right/);
  await expect(page.getByRole('tab', { name: '分P', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: '宽屏', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(overlay).not.toHaveClass(/--comments-right/);
  await page.keyboard.press('Space');
  await expect(overlay).toHaveClass(/--comments-right/);
  expect(await page.evaluate(() => window.__nativeWideClicks)).toBe(0);
  expect(await page.evaluate(() => window.__mockPlayback.screenKind)).toBe(2);
  expect(await page.evaluate(() => window.__mockPlayback.created)).toBe(1);
  expect(errors).toEqual([]);
});
