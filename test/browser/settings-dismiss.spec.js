import { test, expect } from '@playwright/test';
import { APP as A, cardButton, loadFixture, mockPlayback } from './fixture.js';

const trigger = page => page.getByRole('button', { name: '小窗播放设置', exact: true });
const panel = page => page.locator(`.${A}__settings__panel`);

async function clickThroughMask(page, target) {
  const rect = await target.boundingBox();
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
}

async function setupPlayer(page, { classicScrollbar = false } = {}) {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  if (classicScrollbar) await page.evaluate(A => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth').get;
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() {
      return this.dataset.scrollbarProbe === A ? this.clientWidth + 14 : original.call(this);
    } });
  }, A);
  await page.evaluate(() => {
    const create = window.nano.createPlayer;
    window.nano.createPlayer = setting => {
      const player = create(setting), connect = player.connect;
      player.isPaused = () => false;
      player.connect = () => {
        connect();
        setting.element.firstChild.classList.add('bpx-player-video-area');
      };
      return player;
    };
  });
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  return errors;
}

test('floating settings dismiss on an outside press without activating the page underneath', async ({ page }) => {
  const errors = await loadFixture(page);
  await page.locator('h1').evaluate(el => el.addEventListener('click', event => {
    window.__underlyingClicked = true;
    event.stopImmediatePropagation();
  }));
  await trigger(page).click();
  await expect(panel(page)).toBeVisible();
  await clickThroughMask(page, page.locator('h1'));
  await expect(panel(page)).toBeHidden();
  expect(await page.evaluate(() => !!window.__underlyingClicked)).toBe(false);
  // The mask must be removed again so the next deliberate press works.
  await page.locator('h1').click();
  expect(await page.evaluate(() => window.__underlyingClicked)).toBe(true);
  expect(errors).toEqual([]);
});

for (const mode of ['popup', 'mini', 'fullscreen']) test(`${mode} settings close on video and outside clicks without pausing or closing playback`, async ({ page }) => {
  const errors = await setupPlayer(page);
  const frame = page.locator(`#${A}-player-wrap`);
  const dialog = page.locator(`#${A}-dialog`);
  if (mode === 'mini') await page.getByRole('button', { name: '收起到右下角', exact: true }).click();
  if (mode === 'fullscreen') await dialog.evaluate(el => el.requestFullscreen());
  await frame.hover();
  await trigger(page).click();
  await page.getByRole('switch', { name: '联播倒计时', exact: true }).click();
  await expect(panel(page)).toBeVisible();
  await clickThroughMask(page, frame);
  await expect(panel(page)).toBeHidden();
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.__mockPlayback.paused)).toBe(0);
  if (mode === 'fullscreen') expect(await page.evaluate(() => document.fullscreenElement?.id)).toBe(A + '-dialog');

  await frame.hover();
  await trigger(page).click();
  if (mode === 'fullscreen') await clickThroughMask(page, page.locator(`#${A}-comments`));
  else await page.mouse.click(10, 10);
  await expect(panel(page)).toBeHidden();
  await expect(dialog).toBeVisible();
  // Keep the existing trigger toggle and Escape behavior.
  await frame.hover();
  await trigger(page).click();
  await trigger(page).click();
  await expect(panel(page)).toBeHidden();
  await trigger(page).click();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(dialog).toBeVisible();
  expect(errors).toEqual([]);
});

test('Document PiP settings dismiss inside their own document', async ({ page, context }) => {
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
  await trigger(page).click();
  await page.getByRole('radio', { name: /独立小窗/ }).click();
  await page.keyboard.press('Escape');
  await page.locator('#card-b .cover').hover();
  const popupPromise = page.waitForEvent('popup');
  await cardButton(page, 'BV1test002').click();
  const popup = await popupPromise;
  popup.on('pageerror', error => errors.push(error.message));
  await expect(popup.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await popup.locator('#stage').hover();
  await trigger(popup).click();
  await clickThroughMask(popup, popup.locator('#stage'));
  await expect(panel(popup)).toBeHidden();
  await expect(popup.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await popup.close();
  expect(errors).toEqual([]);
});

test('the settings mask also blocks scrollbar track presses until dismissed', async ({ page }) => {
  const errors = await setupPlayer(page, { classicScrollbar: true });
  const comments = page.locator(`#${A}-comments-panel`);
  await page.locator(`#${A}-comments-mount`).evaluate(el => { el.innerHTML = '<div style="height:4000px">长评论</div>'; });
  await comments.evaluate(el => { el.scrollTop = 800; });
  const bar = page.locator(`.${A}__scrollbar[aria-controls="${A}-comments-panel"]`);
  await expect(bar).toBeVisible();
  const rect = await bar.boundingBox();
  const scrollTop = await comments.evaluate(el => el.scrollTop);
  await page.locator(`#${A}-player-wrap`).hover();
  await trigger(page).click();
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height - 12);
  await expect(panel(page)).toBeHidden();
  expect(await comments.evaluate(el => el.scrollTop)).toBe(scrollTop);
  expect(errors).toEqual([]);
});
