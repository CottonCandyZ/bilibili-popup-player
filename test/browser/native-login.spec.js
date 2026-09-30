import { test, expect } from '@playwright/test';
import { APP as A, cardButton, loadFixture, mockPlayback } from './fixture.js';

async function openPlayer(page) {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await page.addStyleTag({ content: '.bili-mini-mask{display:flex;position:fixed;inset:0;z-index:10010;background:#0009;align-items:center;justify-content:center}.login-panel{padding:30px;background:white}.bili-mini-close-icon{padding:10px;cursor:pointer}' });
  await page.evaluate(A => {
    const anchor = document.createComment('MiniLogin mount');
    document.body.append(anchor);
    let current = anchor;
    // Vue keeps a placeholder for its next render, rather than remounting the
    // SDK every time. The portal must preserve this after closing/disabling.
    window.__openNativeLogin = () => {
      const mask = document.createElement('div'); mask.className = 'bili-mini-mask';
      mask.innerHTML = '<div class="login-panel"><div class="bili-mini-close-icon">关闭</div><label>测试账号<input aria-label="测试账号"></label><button>切换登录方式</button></div>';
      mask.querySelector('.bili-mini-close-icon').onclick = () => {
        const placeholder = document.createComment('MiniLogin closed');
        mask.replaceWith(placeholder); current = placeholder;
      };
      current.replaceWith(mask); current = mask;
    };
    const comments = document.getElementById(A + '-comments-mount');
    const editor = document.createElement('bili-comment-box');
    editor.attachShadow({ mode: 'open' }).innerHTML = '<button>打开登录</button>';
    editor.shadowRoot.querySelector('button').onclick = () => setTimeout(window.__openNativeLogin, 20);
    comments.prepend(editor);
    window.__nativeLoginKeys = [];
    for (const type of ['keydown', 'keyup']) window.addEventListener(type, event => {
      if (['f', 'j', 'k', 'l', ' ', 'ArrowLeft'].includes(event.key)) window.__nativeLoginKeys.push(event.key);
    });
  }, A);
  return errors;
}

for (const fullscreen of [false, true]) test(`comment login is clickable and keeps typing away from playback (${fullscreen ? 'system fullscreen' : 'popup'})`, async ({ page }) => {
  const errors = await openPlayer(page);
  if (fullscreen) await page.locator(`#${A}-dialog`).evaluate(element => element.requestFullscreen());
  await page.getByRole('button', { name: '打开登录', exact: true }).click();
  const login = page.getByRole('dialog', { name: '登录哔哩哔哩', exact: true });
  await expect(login).toBeFocused();
  expect(await login.evaluate(element => {
    const rect = element.querySelector('input').getBoundingClientRect();
    return element.contains(document.elementFromPoint(rect.x + 10, rect.y + 10));
  })).toBe(true);
  if (fullscreen) expect(await login.evaluate(element => document.fullscreenElement.contains(element))).toBe(true);
  const input = page.getByRole('textbox', { name: '测试账号' });
  await input.click();
  await input.pressSequentially('fjkl');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Space');
  expect(await input.inputValue()).toBe('fjk l');
  expect(await page.evaluate(() => window.__nativeLoginKeys)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(login).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: '小窗播放器', exact: true })).toBeVisible();
  // Repeated open/close must not strand the SDK's Vue placeholder.
  await page.getByRole('button', { name: '打开登录', exact: true }).click();
  await expect(login).toBeVisible();
  await page.getByRole('button', { name: '关闭登录窗口', exact: true }).press('Enter');
  await expect(login).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('native page login is not adopted and the SDK can reopen after disabling', async ({ page }) => {
  const errors = await openPlayer(page);
  await page.getByRole('button', { name: '打开登录', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '登录哔哩哔哩' })).toBeVisible();
  await page.evaluate(() => window.__biliPopupPlayerNano.setEnabled(false));
  await expect(page.locator('.bili-mini-mask')).toHaveCount(0);
  await page.evaluate(() => window.__openNativeLogin());
  await expect(page.locator('.bili-mini-mask')).toBeVisible();
  expect(await page.locator('.bili-mini-mask').evaluate(element => !element.closest('#bili-popup-player-nano-dialog'))).toBe(true);
  await page.locator('.bili-mini-close-icon').click();
  expect(errors).toEqual([]);
});
