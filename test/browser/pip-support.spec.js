import { test, expect } from '@playwright/test';
import { APP, cardButton, loadFixture, mockPlayback } from './fixture.js';

// This verifies capability gating independently of the underlying test engine.
test.use({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:151.0) Gecko/20100101 Firefox/151.0' });

test('Firefox with the Document PiP API can choose and open an independent player', async ({ page, context }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: {
    requestWindow() {
      window.__pipReceiverCorrect = this === window.documentPictureInPicture;
      const win = window.open('about:blank', '_blank', 'popup,width=960,height=600');
      win.nano = window.nano;
      win.BiliComments = window.BiliComments;
      return Promise.resolve(win);
    },
  } }));
  const errors = await loadFixture(page, '/');
  await mockPlayback(page);
  await context.route('https://s1.hdslb.com/**', route => route.abort());
  await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  const pipMode = page.getByRole('radio', { name: '独立小窗', exact: true });
  await expect(pipMode).toBeEnabled();
  await pipMode.click();
  await page.keyboard.press('Escape');
  await page.locator('#card-b .cover').hover();
  const popupPromise = page.waitForEvent('popup');
  await cardButton(page, 'BV1test002').click();
  const popup = await popupPromise;
  await expect(popup.getByText('播放器测试画面', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => window.__pipReceiverCorrect)).toBe(true);
  await popup.close();
  expect(errors).toEqual([]);
});

test('Firefox without the API falls back even when the independent player preference was saved', async ({ page }) => {
  await page.addInitScript(app => {
    Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: undefined });
    localStorage.setItem(`${app}:mode`, 'pip');
  }, APP);
  const errors = await loadFixture(page, '/');
  await mockPlayback(page);
  await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await expect(page.getByRole('radio', { name: '独立小窗', exact: true })).toBeDisabled();
  await expect(page.getByRole('radio', { name: '网页小窗', exact: true })).toBeChecked();
  await page.keyboard.press('Escape');
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByRole('dialog', { name: '小窗播放器', exact: true })).toBeVisible();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});
