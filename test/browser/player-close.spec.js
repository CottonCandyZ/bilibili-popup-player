import { test, expect } from '@playwright/test';
import { APP, cardButton, loadFixture, mockPlayback } from './fixture.js';

for (const minimized of [false, true]) for (const reducedMotion of ['no-preference', 'reduce']) for (const closeWith of ['button', 'Escape']) {
  test(`closing the ${minimized ? 'mini' : 'full'} home player via ${closeWith} hides its picture with ${reducedMotion} motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    const errors = await loadFixture(page, '/');
    await mockPlayback(page);
    await page.locator('#card-b .cover').hover();
    await cardButton(page, 'BV1test002').click();
    const overlay = page.locator(`#${APP}-overlay`);
    const picture = page.getByText('播放器测试画面', { exact: false });
    await expect(picture).toBeVisible();
    await page.evaluate(() => { window.__retainedHomePlayer = window.__biliPopupPlayerNano.getState().home.player; });
    if (minimized) {
      await page.getByRole('button', { name: '收起到右下角', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '迷你播放器', exact: true })).toBeVisible();
      await expect.poll(() => page.locator(`#${APP}-dialog`).evaluate(el => el.getAnimations().length)).toBe(0);
      await page.locator(`#${APP}-player-wrap`).hover();
    }
    if (closeWith === 'Escape') {
      // The modeless mini player only handles shortcuts when it has focus.
      await page.locator(`#${APP}-dialog`).focus();
      await page.keyboard.press('Escape');
    } else await page.getByRole('button', { name: '关闭播放器', exact: true }).click();
    // The close fade ends by setting hidden. Its CSS must also suppress the
    // minimized layout, which is kept on the mounted player for the fade.
    await expect(overlay).toHaveAttribute('hidden', '');
    await expect(overlay).toBeHidden();
    await expect(picture).toBeHidden();
    expect(await page.evaluate(() => window.__mockPlayback.paused)).toBe(1);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe('hidden');
    await page.locator('#card-b .cover').hover();
    await cardButton(page, 'BV1test002').click();
    await expect(page.getByRole('dialog', { name: '小窗播放器', exact: true })).toBeVisible();
    await expect(picture).toBeVisible();
    expect(await page.evaluate(() => window.__retainedHomePlayer === window.__biliPopupPlayerNano.getState().home.player)).toBe(true);
    expect(await page.evaluate(() => window.__mockPlayback.created)).toBe(1);
    expect(errors).toEqual([]);
  });
}
