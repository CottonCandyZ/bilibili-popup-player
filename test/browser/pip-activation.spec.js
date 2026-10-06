import { test, expect } from '@playwright/test';
import { APP, cardButton, loadFixture, mockPlayback } from './fixture.js';

for (const entry of ['card', 'cover', 'playback page', 'home player']) {
  test(`native Document PiP opens during the ${entry} click`, async ({ page, context }) => {
    await page.addInitScript(({ app, entry }) => {
      localStorage.setItem(`${app}:mode`, entry === 'home player' ? 'home' : 'pip');
      if (entry === 'cover') localStorage.setItem(`${app}:direct-click`, '1');
      const api = window.documentPictureInPicture;
      if (!api?.requestWindow) return;
      const request = api.requestWindow;
      api.requestWindow = function (options) {
        window.__pipActivation = navigator.userActivation.isActive;
        return request.call(this, options).then(win => {
          win.nano = window.nano;
          win.BiliComments = window.BiliComments;
          return win;
        });
      };
    }, { app: APP, entry });
    const errors = await loadFixture(page, entry === 'playback page' ? '/video/BV1test002/' : '/');
    test.skip(!await page.evaluate(() => typeof window.documentPictureInPicture?.requestWindow === 'function'), 'Document PiP unavailable');
    await mockPlayback(page);
    await context.route('https://s1.hdslb.com/**', route => route.abort());
    if (entry === 'playback page') {
      await page.locator(`.${APP}__playback-pip-button`).click();
    } else if (entry === 'cover') {
      await page.locator('#card-b .cover').click();
    } else {
      await page.locator('#card-b .cover').hover();
      await cardButton(page, 'BV1test002').click();
      if (entry === 'home player') {
        await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
        await page.getByRole('button', { name: '切换到独立小窗', exact: true }).click();
      }
    }
    await expect.poll(() => page.evaluate(() => Boolean(window.__biliPopupPlayerNano.getState().pip.player))).toBe(true);
    expect(await page.evaluate(() => window.__pipActivation)).toBe(true);
    await page.evaluate(() => window.documentPictureInPicture.window.close());
    expect(errors).toEqual([]);
  });
}

for (const source of ['external', 'home']) {
  test(`PiP reserves activation before calling the ${source} player pause handler`, async ({ page, context }) => {
    const errors = await loadFixture(page, source === 'external' ? '/video/BV1test002/' : '/');
    test.skip(!await page.evaluate(() => typeof window.documentPictureInPicture?.requestWindow === 'function'), 'Document PiP unavailable');
    await mockPlayback(page);
    await context.route('https://s1.hdslb.com/**', route => route.abort());
    if (source === 'home') {
      await page.locator('#card-b .cover').hover();
      await cardButton(page, 'BV1test002').click();
      await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
    }
    await page.evaluate(source => {
      // A host SDK callback can consume activation synchronously. Simulate that
      // with a real consuming API; this is not a claim about Bilibili's login SDK.
      const player = source === 'home' ? window.__biliPopupPlayerNano.getState().home.player : (window.player = {});
      player.pause = () => {
        window.__pauseCalled = true;
        window.open('about:blank', '_blank')?.close();
      };
      const api = window.documentPictureInPicture;
      const request = api.requestWindow;
      api.requestWindow = function (options) {
        window.__pipBeforePause = !window.__pauseCalled;
        return request.call(this, options).then(win => {
          win.nano = window.nano;
          win.BiliComments = window.BiliComments;
          return win;
        });
      };
    }, source);
    if (source === 'external') await page.locator(`.${APP}__playback-pip-button`).click();
    else await page.getByRole('button', { name: '切换到独立小窗', exact: true }).click();
    expect(await page.evaluate(() => window.__pipBeforePause)).toBe(true);
    await expect.poll(() => page.evaluate(() => Boolean(window.__biliPopupPlayerNano.getState().pip.player))).toBe(true);
    expect(await page.evaluate(() => window.__pauseCalled)).toBe(true);
    await page.evaluate(() => window.documentPictureInPicture.window.close());
    expect(errors).toEqual([]);
  });
}

test('a rejected PiP request falls back to the in-page player and retains the error', async ({ page }) => {
  await page.addInitScript(app => {
    localStorage.setItem(`${app}:mode`, 'pip');
    Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: {
      requestWindow() { return Promise.reject(new DOMException('Test denial', 'NotAllowedError')); },
    } });
  }, APP);
  const errors = await loadFixture(page, '/');
  await mockPlayback(page);
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => {
    const state = window.__biliPopupPlayerNano.getState();
    return { error: state.pip.lastError, mode: state.mode, bvid: state.home.bootstrap.playerInfo.bvid };
  })).toEqual({ error: { name: 'NotAllowedError', message: 'Test denial' }, mode: 'pip', bvid: 'BV1test002' });
  expect(errors).toEqual([]);
});

test('a late PiP rejection cannot open a fallback after disabling', async ({ page }) => {
  await page.addInitScript(app => {
    localStorage.setItem(`${app}:mode`, 'pip');
    Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: {
      requestWindow() { return new Promise((_, reject) => { window.__rejectPip = reject; }); },
    } });
  }, APP);
  const errors = await loadFixture(page, '/');
  await mockPlayback(page);
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await page.evaluate(() => {
    window.__biliPopupPlayerNano.setEnabled(false);
    window.__rejectPip(new DOMException('Test denial', 'NotAllowedError'));
  });
  await expect(page.getByRole('dialog', { name: '小窗播放器', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
