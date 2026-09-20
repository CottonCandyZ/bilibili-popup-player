import { test, expect } from '@playwright/test';
import { APP, cardButton, loadFixture, mockPlayback } from './fixture.js';

async function openPlayer(page) {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByText('评论区测试内容')).toBeVisible();
  return errors;
}

test('clicking or activating the current tab locates the playing item without reloading', async ({ page }) => {
  const errors = await openPlayer(page);
  for (const [label, key] of [['分P', 'pages'], ['播放列表', 'playlist']]) {
    const tab = page.getByRole('tab', { name: label, exact: true });
    await tab.click();
    const list = page.locator(`#${APP}-${key}-list`);
    // A long queue, with the current item at the start.
    await list.evaluate(el => {
      for (let i = 0; i < 30; i++) {
        const row = document.createElement('div');
        row.textContent = '队列中的其他视频 ' + i;
        row.style.height = '60px';
        el.appendChild(row);
      }
    });
    for (const keyboard of [false, true]) {
      await list.evaluate(el => { el.scrollTop = el.scrollHeight; });
      await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(500);
      if (keyboard) { await tab.focus(); await page.keyboard.press('Enter'); }
      else await tab.click();
      await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeLessThan(10);
    }
  }
  expect(await page.evaluate(() => window.__mockPlayback.created)).toBe(1);
  expect(errors).toEqual([]);
});

test('bottom comments scroll from a full first-screen video without changing volume', async ({ page }) => {
  const errors = await openPlayer(page);
  await page.evaluate(id => {
    const root = document.getElementById(id + '-player');
    const wide = document.createElement('button');
    wide.className = 'bpx-player-ctrl-wide'; wide.textContent = '切换布局';
    wide.style.cssText = 'position:absolute;bottom:20px;right:20px';
    root.appendChild(wide);
    window.__wheelVolumeChanges = 0;
    root.firstChild.addEventListener('wheel', event => { window.__wheelVolumeChanges++; event.preventDefault(); }, { passive: false });
  }, APP);
  await page.getByRole('button', { name: '切换布局', exact: true }).click();
  await expect(page.locator(`#${APP}-overlay`)).not.toHaveAttribute('data-layout-animating', 'true');
  const content = page.locator(`#${APP}-content`), frame = page.locator(`#${APP}-player-wrap`);
  await expect(content).toHaveCSS('overflow-y', 'auto');
  const first = await frame.boundingBox(), viewport = await content.boundingBox();
  expect(Math.abs(first.height - viewport.height)).toBeLessThan(1);
  await frame.hover({ position: { x: 250, y: 180 } });
  await page.mouse.wheel(0, 450);
  await expect.poll(() => content.evaluate(el => el.scrollTop)).toBeGreaterThan(100);
  expect(await page.evaluate(() => window.__wheelVolumeChanges)).toBe(0);
  await content.evaluate(el => { el.scrollTop = 0; });
  await frame.hover();
  await page.getByRole('button', { name: '网页内全屏', exact: true }).click();
  await expect.poll(async () => Math.abs((await frame.boundingBox()).height - page.viewportSize().height)).toBeLessThan(1);
  await frame.hover({ position: { x: 250, y: 180 } });
  await page.mouse.wheel(0, 500);
  await expect.poll(() => content.evaluate(el => el.scrollTop)).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

test('embedded Web controls fit the video width rather than the browser viewport', async ({ page }) => {
  await openPlayer(page);
  await page.addStyleTag({ content: `
    .bpx-player-control-bottom { position:absolute;bottom:8px;display:flex;justify-content:space-between;width:100%;box-sizing:border-box;padding:0 12px; }
    .bpx-player-control-bottom-left { display:flex;flex:none;min-width:316px; }
    .bpx-player-control-bottom-center { flex:1;padding:0 60px; }
    .bpx-player-control-bottom-right { display:flex;min-width:370px; }
    .bpx-player-ctrl-btn { display:block;flex-shrink:0;width:54px;height:36px;padding:0;border:0; }
    .bpx-player-ctrl-time { width:120px; }
    .bpx-player-video-inputbar { width:260px; }
  ` });
  await page.evaluate(id => {
    const player = document.querySelector('#' + id + '-player .bpx-player-container');
    player.dataset.screen = 'web';
    player.innerHTML = `<div class="bpx-player-control-bottom">
      <div class="bpx-player-control-bottom-left"><button class="bpx-player-ctrl-btn bpx-player-ctrl-play">播放</button><div class="bpx-player-ctrl-time">00:20 / 10:00</div></div>
      <div class="bpx-player-control-bottom-center"><div class="bpx-player-video-inputbar">发送弹幕</div></div>
      <div class="bpx-player-control-bottom-right">${['quality','playbackrate','subtitle','volume','setting','pip','wide','web','full'].map(key => `<button class="bpx-player-ctrl-btn bpx-player-ctrl-${key}">${key}</button>`).join('')}</div>
    </div>`;
    const original = player.cloneNode(true); original.id = 'original-controls'; document.body.appendChild(original);
  }, APP);
  const frame = page.locator(`#${APP}-player-wrap`), controls = page.locator(`#${APP}-player .bpx-player-control-bottom-right`);
  for (const width of [1360, 1000, 920]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => {
      const video = await frame.boundingBox(), row = await controls.boundingBox();
      return row.x + row.width <= video.x + video.width - 5;
    }).toBe(true);
    await expect(page.locator(`#${APP}-player .bpx-player-ctrl-wide`)).toBeVisible();
    await expect(page.locator(`#${APP}-player .bpx-player-ctrl-full`)).toBeVisible();
  }
  await expect(page.locator('#original-controls .bpx-player-control-bottom-left')).toHaveCSS('min-width', '316px');
  await expect(page.locator('#original-controls .bpx-player-ctrl-wide')).toHaveCSS('width', '54px');
});

for (const [path, selector] of [
  ['/video/BV1test002/', '__playback-pip-button'],
  ['/bangumi/play/ep101', '__playback-pip-button'],
  ['https://live.bilibili.com/123', '__live-button'],
]) test(`the ${path} page has a direct picture-in-picture entry`, async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: {
    requestWindow() { window.__pipRequested = true; return new Promise(() => {}); },
  } }));
  await loadFixture(page, path);
  const button = page.locator(`.${APP}${selector}`);
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('aria-label', /画中画播放当前/);
  const box = await button.boundingBox();
  expect(page.viewportSize().height - box.y - box.height).toBe(76);
  await button.click();
  await expect.poll(() => page.evaluate(() => window.__pipRequested)).toBe(true);
  expect(await page.evaluate(() => window.__biliPopupPlayerNano.getState().mode)).toBe('home');
});

test('compact comments cover late replies and leave host-page comments unchanged', async ({ page }) => {
  await loadFixture(page);
  await mockPlayback(page);
  await page.evaluate(() => {
    function comment() {
      const el = document.createElement('bili-comments');
      const root = el.attachShadow({ mode: 'open' });
      root.innerHTML = '<style>:host{--bili-comments-font-size-content:15px}</style><bili-comment-renderer></bili-comment-renderer>';
      const thread = root.querySelector('bili-comment-renderer').attachShadow({ mode: 'open' });
      thread.innerHTML = '<bili-rich-text></bili-rich-text>';
      const text = thread.querySelector('bili-rich-text');
      text.style.setProperty('--bili-rich-text-line-height', '24px');
      text.attachShadow({ mode: 'open' }).innerHTML = '<style>:host{font-size:var(--bili-rich-text-font-size,15px);line-height:var(--bili-rich-text-line-height,24px)}</style><p>评论正文</p>';
      return el;
    }
    const host = comment(); host.id = 'original-comments'; document.body.appendChild(host);
    window.BiliComments = class {
      mount(el) { el.replaceChildren(comment()); return { methods: { reload() {} }, unmount() { el.replaceChildren(); } }; }
    };
  });
  await page.locator('#card-b .cover').hover(); await cardButton(page, 'BV1test002').click();
  const mount = page.locator(`#${APP}-comments-mount`);
  await expect(mount.locator('bili-rich-text')).toHaveCSS('font-size', '13px');
  await expect(mount.locator('bili-rich-text')).toHaveCSS('line-height', '21px');
  await expect(page.locator('#original-comments bili-rich-text')).toHaveCSS('font-size', '15px');
  // Replies loaded after scrolling/pagination still receive the same theme.
  await mount.locator('bili-comment-renderer').evaluate(el => {
    const text = document.createElement('bili-rich-text');
    text.id = 'late-reply';
    text.attachShadow({ mode: 'open' }).innerHTML = '<style>:host{font-size:var(--bili-rich-text-font-size,15px)}</style><p>后加载的回复</p>';
    el.shadowRoot.appendChild(text);
  });
  await expect(mount.locator('#late-reply')).toHaveCSS('font-size', '13px');
  await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await page.getByRole('switch', { name: '小窗播放', exact: true }).click();
  await expect(mount).toHaveCount(0);
  await expect(page.locator('#original-comments bili-rich-text')).toHaveCSS('font-size', '15px');
});
