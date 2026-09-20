import { test, expect } from '@playwright/test';
import { APP as A, cardButton, loadFixture, mockPlayback } from './fixture.js';

for (const fallback of [false, true]) test(`copy beside the title writes a clean URL (${fallback ? 'legacy fallback' : 'Clipboard API'})`, async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.locator('#card-b a').evaluateAll(links => links.forEach(link => { link.href += '?spm_id_from=333.1007&t=99&p=2#reply'; }));
  if (fallback) await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('permission unavailable'); }; });
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await page.locator(`#${A}-player-wrap`).hover();
  const link = page.locator(`#${A}-title`), copy = page.getByRole('button', { name: '复制视频链接', exact: true });
  const a = await link.boundingBox(), b = await copy.boundingBox();
  expect(b.x).toBeGreaterThanOrEqual(a.x + a.width);
  expect(Math.abs(a.y + a.height / 2 - b.y - b.height / 2)).toBeLessThan(1);
  await copy.click();
  await expect(page.getByRole('button', { name: '已复制', exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://www.bilibili.com/video/BV1test002/');
  expect(await page.evaluate(() => window.__mockPlayback.paused)).toBe(0);
  await expect(copy).toBeVisible();
  expect(errors).toEqual([]);
});
