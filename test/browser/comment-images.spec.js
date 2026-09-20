import { test, expect } from '@playwright/test';
import { APP as A, cardButton, loadFixture, mockPlayback } from './fixture.js';

// Reproduce the SDK contract: pictures live in nested shadow roots, while the
// lazily loaded lightbox and its accessory are appended directly to body.
async function installGalleryFixture(surface) {
  await surface.addStyleTag({ content: `
    .pswp { position:fixed; inset:0; z-index:100000; background:#101318dd; }
    .pswp__img { position:absolute; width:320px; height:240px; left:50%; top:50%; transform:translate(-50%,-50%); background:#356078; color:white; }
    .pswp__button { position:absolute; width:40px; height:40px; border:0; background:#333; color:white; }
    .pswp__button--close { top:16px; right:16px; }
    .pswp__button--arrow--prev { top:50%; left:16px; }
    .pswp__button--arrow--next { top:50%; right:16px; }
    bili-comment-picture-goods-overlay { position:fixed; bottom:16px; left:50%; z-index:100001; pointer-events:none; color:white; }
  ` });
  await surface.evaluate(A => {
    window.__imagePreview = { index: 0, opened: 0, keys: [] };
    window.__nativeImageKeys = [];
    window.addEventListener('keyup', event => {
      if ([' ', 'f', 'j', 'k', 'l'].includes(event.key)) window.__nativeImageKeys.push(event.key);
    });
    window.__openCommentImage = async () => {
      await new Promise(resolve => setTimeout(resolve, 40));
      const log = window.__imagePreview;
      log.index = 0;
      log.opened++;
      const root = document.createElement('div');
      root.className = 'pswp pswp--open';
      root.tabIndex = -1;
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-label', '评论图片预览');
      root.innerHTML = '<div class="pswp__img">图片 1</div><button class="pswp__button pswp__button--close" aria-label="关闭图片">×</button><button class="pswp__button pswp__button--arrow--prev" aria-label="上一张图片">←</button><button class="pswp__button pswp__button--arrow--next" aria-label="下一张图片">→</button>';
      const accessory = document.createElement('bili-comment-picture-goods-overlay');
      accessory.textContent = '图片附加信息';
      const close = () => {
        document.removeEventListener('keydown', keydown);
        root.remove(); accessory.remove();
      };
      const change = delta => {
        log.index = (log.index + delta + 2) % 2;
        root.querySelector('.pswp__img').textContent = '图片 ' + (log.index + 1);
      };
      const keydown = event => {
        log.keys.push(event.key);
        if (event.key === 'ArrowRight') change(1);
        else if (event.key === 'ArrowLeft') change(-1);
        else if (event.key === 'Escape') close();
        else return;
        event.preventDefault(); event.stopPropagation();
      };
      root.querySelector('.pswp__button--close').onclick = close;
      root.querySelector('.pswp__button--arrow--prev').onclick = () => change(-1);
      root.querySelector('.pswp__button--arrow--next').onclick = () => change(1);
      document.addEventListener('keydown', keydown);
      // Both orders occur with asynchronous SDK initialization.
      for (const node of log.opened % 2 ? [accessory, root] : [root, accessory]) document.body.append(node);
      setTimeout(() => root.isConnected && root.focus(), 60);
    };
    const mount = document.getElementById(A + '-comments-mount') || document.getElementById('comments-mount');
    const thread = document.createElement('bili-comment-renderer');
    const pictures = document.createElement('bili-comment-pictures-renderer');
    pictures.attachShadow({ mode: 'open' }).innerHTML = '<button style="margin:12px;height:70px" aria-label="打开评论图片">评论图片缩略图</button>';
    pictures.shadowRoot.querySelector('button').onclick = window.__openCommentImage;
    thread.attachShadow({ mode: 'open' }).append(pictures);
    mount.prepend(thread);
  }, A);
}

async function openPlayer(page) {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.evaluate(() => {
    const create = window.nano.createPlayer;
    window.__imageMedia = { seeks: 0, volume: .5, paused: false };
    const media = window.__imageMedia;
    window.nano.createPlayer = setting => Object.assign(create(setting), {
      seek() { media.seeks++; },
      getVolume: () => media.volume, setVolume(value) { media.volume = value; },
      isPaused: () => media.paused, pause() { media.paused = true; }, play() { media.paused = false; },
    });
  });
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  return errors;
}

async function verifyPreview(page, fullscreen = false) {
  await page.getByRole('button', { name: '打开评论图片', exact: true }).click();
  const preview = page.getByRole('dialog', { name: '评论图片预览', exact: true });
  const close = page.getByRole('button', { name: '关闭图片', exact: true });
  await expect(preview).toBeFocused();
  expect(await preview.evaluate(el => el.closest('#bili-popup-player-nano-content, #layout'))).toBeNull();
  if (fullscreen) expect(await preview.evaluate(el => document.fullscreenElement?.contains(el))).toBe(true);
  const box = await preview.boundingBox();
  expect(box.x).toBe(0); expect(box.y).toBe(0);
  expect(box.width).toBe(page.viewportSize().width);
  expect(box.height).toBe(page.viewportSize().height);
  // A broad pswp class selector used to turn every button into a full-screen
  // fixed element. Check actual geometry and hit targets, not just z-index.
  expect((await close.boundingBox()).width).toBe(40);
  expect((await preview.locator('.pswp__img').boundingBox()).width).toBe(320);
  for (const target of [close, page.getByRole('button', { name: '下一张图片' })]) {
    expect(await target.evaluate(el => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    })).toBe(true);
  }
  await page.keyboard.press('ArrowRight');
  await expect(preview.locator('.pswp__img')).toHaveText('图片 2');
  await page.keyboard.press('ArrowLeft');
  await expect(preview.locator('.pswp__img')).toHaveText('图片 1');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  await page.keyboard.press('f');
  expect(await page.evaluate(() => window.__imageMedia)).toEqual({ seeks: 0, volume: .5, paused: false });
  expect(await page.evaluate(() => window.__nativeImageKeys)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(preview).toHaveCount(0);
  await expect(page.locator('bili-comment-picture-goods-overlay')).toHaveCount(0);
  if (fullscreen) expect(await page.evaluate(() => document.fullscreenElement?.id)).toBe(A + '-dialog');
  await page.getByRole('button', { name: '打开评论图片', exact: true }).click();
  await expect(preview).toBeFocused();
  await close.click();
  await expect(preview).toHaveCount(0);
}

for (const mode of ['popup', 'web-fullscreen', 'system-sidebar', 'system-bottom']) test(`${mode} comment images cover the player with working controls and independent shortcuts`, async ({ page }) => {
  const errors = await openPlayer(page);
  if (mode === 'web-fullscreen') {
    await page.locator(`#${A}-player-wrap`).hover();
    await page.getByRole('button', { name: '网页内全屏', exact: true }).click();
    await expect(page.locator(`#${A}-overlay`)).not.toHaveAttribute('data-layout-animating', 'true');
  }
  if (mode === 'system-bottom') {
    await page.locator(`#${A}-player`).evaluate(el => el.insertAdjacentHTML('beforeend', '<button class="bpx-player-ctrl-wide" style="position:absolute;bottom:20px;left:20px">宽屏</button>'));
    await page.getByRole('button', { name: '宽屏', exact: true }).click();
    await expect(page.locator(`#${A}-overlay`)).not.toHaveAttribute('data-layout-animating', 'true');
  }
  const fullscreen = mode.startsWith('system-');
  if (fullscreen) await page.locator(`#${A}-dialog`).evaluate(el => el.requestFullscreen());
  await installGalleryFixture(page);
  await verifyPreview(page, fullscreen);
  if (fullscreen) {
    await page.evaluate(() => document.exitFullscreen());
    await verifyPreview(page);
  }
  await expect(page.locator(`#${A}-dialog`)).toBeVisible();
  expect(errors).toEqual([]);
});

test('an unrelated page gallery is not moved into the player shell', async ({ page }) => {
  const errors = await openPlayer(page);
  await installGalleryFixture(page);
  await page.evaluate(() => window.__openCommentImage());
  await expect(page.locator('body > .pswp')).toBeVisible();
  expect(await page.locator('.pswp').getAttribute(`data-${A}-comment-preview`)).toBeNull();
  expect(await page.locator('bili-comment-picture-goods-overlay').evaluate(el => el.parentElement === document.body)).toBe(true);
  await page.getByRole('button', { name: '关闭图片' }).click();
  await verifyPreview(page);
  expect(errors).toEqual([]);
});

test('Document PiP keeps the image preview and its keyboard handling in its own window', async ({ page, context }) => {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await context.route('https://s1.hdslb.com/**', route => route.abort());
  await page.evaluate(() => {
    const create = window.nano.createPlayer;
    const media = window.__imageMedia = { seeks: 0, volume: .5, paused: false };
    window.nano.createPlayer = setting => Object.assign(create(setting), {
      seek() { media.seeks++; },
      getVolume: () => media.volume, setVolume(value) { media.volume = value; },
      isPaused: () => media.paused, pause() { media.paused = true; }, play() { media.paused = false; },
    });
    Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: {
      requestWindow() {
        const win = window.open('about:blank', '_blank', 'popup,width=1000,height=700');
        win.nano = window.nano; win.BiliComments = window.BiliComments; win.__imageMedia = media;
        return Promise.resolve(win);
      },
    } });
  });
  await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await page.getByRole('radio', { name: /独立小窗/ }).click();
  await page.keyboard.press('Escape');
  await page.locator('#card-b .cover').hover();
  const ready = page.waitForEvent('popup');
  await cardButton(page, 'BV1test002').click();
  const pip = await ready;
  pip.on('pageerror', error => errors.push(error.message));
  await expect(pip.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await installGalleryFixture(pip);
  await verifyPreview(pip);
  expect(await page.locator('.pswp').count()).toBe(0);
  expect(errors).toEqual([]);
  await pip.close();
});
