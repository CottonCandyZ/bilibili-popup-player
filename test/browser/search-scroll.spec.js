import { test, expect } from '@playwright/test';
import { cardButton, loadFixture, mockPlayback } from './fixture.js';

async function prepare(page, rootOverflow = false) {
  const errors = await loadFixture(page, 'https://search.bilibili.com/all?keyword=test&page=2');
  await mockPlayback(page);
  // The search site sizes both roots to the viewport, with body overflow
  // propagated to the viewport while html remains overflow: visible.
  await page.addStyleTag({ content: rootOverflow
    ? 'html{height:100%;overflow-y:scroll}body{height:auto;overflow:visible}'
    : 'html,body{height:100%}body{overflow-y:scroll}' });
  await page.evaluate(() => {
    window.scrollTo(0, 400);
    window.__pageScrollPositions = [];
    const sample = () => { window.__pageScrollPositions.push(scrollY); requestAnimationFrame(sample); };
    requestAnimationFrame(sample);
  });
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(400);
  return errors;
}

for (const rootOverflow of [false, true]) test(`${rootOverflow ? 'root' : 'search body'} scrolling survives player open, switch, minimize, restore and close`, async ({ page }) => {
  const errors = await prepare(page, rootOverflow);
  async function expectPosition(y) {
    expect(await page.evaluate(() => scrollY)).toBe(y);
    expect(await page.evaluate(() => window.__pageScrollPositions.every(value => value > 0))).toBe(true);
  }
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await expectPosition(400);
  await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await expect(page.getByRole('switch', { name: '点击封面播放', exact: true })).toBeVisible();
  await expectPosition(400);
  await page.keyboard.press('Escape');
  await page.mouse.move(8, 8);
  await page.mouse.wheel(0, 250);
  await page.waitForTimeout(150);
  await expectPosition(400);

  await page.getByRole('tab', { name: '分P', exact: true }).click();
  await page.getByRole('button', { name: '播放：2. 看见新的风景', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('bpn_p')).toBe('2');
  await expectPosition(400);

  await page.getByRole('button', { name: '收起到右下角', exact: true }).click();
  await expectPosition(400);
  const mini = page.getByRole('dialog', { name: '迷你播放器', exact: true });
  await expect.poll(() => mini.evaluate(el => el.getAnimations().length)).toBe(0);
  await page.mouse.move(40, 400);
  await page.mouse.wheel(0, 250);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(650);
  await mini.hover();
  await page.getByRole('button', { name: '还原播放器', exact: true }).click();
  await expectPosition(650);
  const dialog = page.getByRole('dialog', { name: '小窗播放器', exact: true });
  await expect.poll(() => dialog.evaluate(el => el.getAnimations().length)).toBe(0);
  await page.getByRole('button', { name: '关闭播放器', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expectPosition(650);
  expect(page.url()).toBe('https://search.bilibili.com/all?keyword=test&page=2');
  expect(await page.evaluate(() => ({ html: document.documentElement.style.overflow, body: document.body.style.overflow }))).toEqual({ html: '', body: '' });
  await page.mouse.move(40, 400);
  await page.mouse.wheel(0, -250);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(400);
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(dialog).toBeVisible();
  await expectPosition(400);
  expect(errors).toEqual([]);
});

for (const rootOverflow of [false, true]) test(`cards below the ${rootOverflow ? 'root' : 'search body'} box still expose their playback button`, async ({ page }) => {
  const errors = await prepare(page, rootOverflow);
  await page.addStyleTag({ content: '.cards{margin-top:1000px}' });
  await page.evaluate(() => window.scrollTo(0, 1400));
  await page.locator('#card-b .cover').hover();
  expect(await page.evaluate(() => scrollY)).toBe(1400);
  await expect(cardButton(page, 'BV1test002')).toBeVisible();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => scrollY)).toBe(1400);
  expect(errors).toEqual([]);
});

test('disabling an open player restores the host overflow values and priorities', async ({ page }) => {
  const errors = await prepare(page);
  await page.evaluate(() => {
    document.body.style.setProperty('overflow-x', 'hidden');
    document.body.style.setProperty('overflow-y', 'scroll', 'important');
  });
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await page.evaluate(() => window.__biliPopupPlayerNano.setEnabled(false));
  expect(await page.evaluate(() => ({
    y: scrollY,
    x: document.body.style.getPropertyValue('overflow-x'),
    xPriority: document.body.style.getPropertyPriority('overflow-x'),
    yValue: document.body.style.getPropertyValue('overflow-y'),
    yPriority: document.body.style.getPropertyPriority('overflow-y'),
  }))).toEqual({ y: 400, x: 'hidden', xPriority: '', yValue: 'scroll', yPriority: 'important' });
  expect(errors).toEqual([]);
});
