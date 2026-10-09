import { test, expect } from '@playwright/test';
import { APP, cardButton, loadFixture, mockPlayback } from './fixture.js';

async function openPlayer(page) {
  await mockPlayback(page);
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
}

test('background blur is enabled by default behind a collapsed effects section and changes without restarting playback', async ({ page }) => {
  const errors = await loadFixture(page);
  await openPlayer(page);
  const overlay = page.locator(`#${APP}-overlay`);
  const backdrop = overlay.locator(`.${APP}__backdrop`);
  await expect(backdrop).toHaveCSS('backdrop-filter', 'blur(8px)');
  await page.evaluate(() => { window.__originalPlayer = window.__biliPopupPlayerNano.getState().home.player; });
  await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await expect(page.getByRole('switch', { name: '背景模糊', exact: true })).toBeHidden();
  await page.getByRole('button', { name: '显示效果', exact: true }).click();
  const toggle = page.getByRole('switch', { name: '背景模糊', exact: true });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(backdrop).toHaveCSS('backdrop-filter', 'none');
  await expect(backdrop).toHaveCSS('background-color', 'rgba(17, 17, 17, 0.6)');
  await toggle.click();
  await expect(backdrop).toHaveCSS('backdrop-filter', 'blur(8px)');
  await expect(backdrop).toHaveCSS('background-color', 'rgba(17, 17, 17, 0.4)');
  expect(await page.evaluate(() => window.__originalPlayer === window.__biliPopupPlayerNano.getState().home.player)).toBe(true);
  expect(errors).toEqual([]);
});

test('disabled background blur survives reload and minimize/restore', async ({ page }) => {
  await loadFixture(page);
  await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await page.getByRole('button', { name: '显示效果', exact: true }).click();
  await page.getByRole('switch', { name: '背景模糊', exact: true }).click();
  expect(await page.evaluate(id => localStorage.getItem(id + ':background-blur'), APP)).toBe('0');
  const errors = await loadFixture(page);
  await openPlayer(page);
  const overlay = page.locator(`#${APP}-overlay`);
  const backdrop = overlay.locator(`.${APP}__backdrop`);
  await expect(backdrop).toHaveCSS('backdrop-filter', 'none');
  await page.getByRole('button', { name: '收起到右下角', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '迷你播放器', exact: true })).toBeVisible();
  await expect(backdrop).toHaveCSS('background-color', 'rgba(17, 17, 17, 0)');
  await expect(backdrop).toBeHidden();
  await expect.poll(() => page.locator(`#${APP}-dialog`).evaluate(el => el.getAnimations().length)).toBe(0);
  await page.locator(`#${APP}-player-wrap`).hover();
  await page.getByRole('button', { name: '还原播放器', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '小窗播放器', exact: true })).toBeVisible();
  await expect(backdrop).toHaveCSS('backdrop-filter', 'none');
  await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await page.getByRole('button', { name: '显示效果', exact: true }).click();
  await expect(page.getByRole('switch', { name: '背景模糊', exact: true })).not.toBeChecked();
  expect(errors).toEqual([]);
});
