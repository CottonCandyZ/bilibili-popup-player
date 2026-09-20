import { test, expect } from '@playwright/test';
import { APP as A, cardButton, loadFixture, mockPlayback } from './fixture.js';

async function openPlayer(page) {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await page.evaluate(A => {
    const wide = document.createElement('button');
    wide.className = 'bpx-player-ctrl-wide'; wide.textContent = '布局';
    wide.style.cssText = 'position:absolute;bottom:16px;right:16px';
    document.getElementById(A + '-player').append(wide);
  }, A);
  return errors;
}

async function longComments(page, id = A + '-comments-mount') {
  await page.locator('#' + id).evaluate(el => {
    el.innerHTML = '<div style="height:3000px;padding:20px">可以滚动的长评论</div>';
  });
}

test('tab switches never lay out two panels in the same animation frame', async ({ page }) => {
  const errors = await openPlayer(page);
  await longComments(page);
  await page.evaluate(A => {
    window.__tabFrames = [];
    window.__observeTabs = true;
    function sample() {
      const panels = [...document.querySelectorAll('.' + A + '__comments-panel')].filter(el => el.getClientRects().length);
      const list = document.getElementById(A + '-playlist-panel');
      window.__tabFrames.push({ count: panels.length, listY: list.getClientRects().length ? list.getBoundingClientRect().y : null });
      if (window.__observeTabs) requestAnimationFrame(sample);
    }
    sample();
  }, A);
  await page.getByRole('tab', { name: '播放列表', exact: true }).click();
  await page.waitForTimeout(160);
  const frames = await page.evaluate(() => { window.__observeTabs = false; return window.__tabFrames; });
  expect(frames.every(frame => frame.count === 1)).toBe(true);
  const positions = frames.map(frame => frame.listY).filter(y => y !== null);
  expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(.1);
  expect((await page.getByRole('tablist').boundingBox()).height).toBeLessThanOrEqual(36);
  expect(errors).toEqual([]);
});

test('bottom comments keep scrolling and dock the same player only after the video leaves view', async ({ page }) => {
  const errors = await openPlayer(page);
  await page.locator('.bpx-player-ctrl-wide').click();
  await expect(page.locator('#' + A + '-overlay')).not.toHaveAttribute('data-layout-animating', 'true');
  await longComments(page);
  const content = page.locator('#' + A + '-content'), frame = page.locator('#' + A + '-player-wrap');
  const view = await content.boundingBox(), height = (await frame.boundingBox()).height;
  await content.evaluate((el, height) => { el.scrollTop = height - 180; }, height);
  await expect(frame).toHaveAttribute('data-scroll-floating', 'false');
  await page.mouse.move(view.x + 80, view.y + 260);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => content.evaluate(el => el.scrollTop)).toBeGreaterThan(height);
  await expect(frame).toHaveAttribute('data-scroll-floating', 'true');
  await expect.poll(async () => (await frame.boundingBox()).width).toBe(400);
  await expect.poll(async () => (await frame.boundingBox()).x).toBe(page.viewportSize().width - 416);
  await expect.poll(async () => (await frame.boundingBox()).y).toBe(page.viewportSize().height - 241);
  const scrollHeight = await content.evaluate(el => el.scrollHeight);
  const scrollTop = await content.evaluate(el => el.scrollTop);
  await page.mouse.wheel(0, 320);
  await expect.poll(() => content.evaluate(el => el.scrollTop)).toBeGreaterThan(scrollTop + 200);
  expect(await content.evaluate(el => el.scrollHeight)).toBe(scrollHeight);
  await content.evaluate((el, height) => { el.scrollTop = height; }, height);
  await expect(page.getByRole('heading', { name: '播放列表', exact: true })).toBeVisible();
  await expect(page.locator('#' + A + '-comments-panel')).not.toHaveAttribute('inert');
  await expect(frame).toHaveAttribute('data-scroll-floating', 'true');
  expect(Math.abs(await content.evaluate(el => el.scrollTop) - height)).toBeLessThan(1);
  await frame.hover();
  await page.getByRole('button', { name: '回到视频', exact: true }).click();
  await expect(frame).toHaveAttribute('data-scroll-floating', 'false');
  await expect.poll(() => content.evaluate(el => el.scrollTop)).toBe(0);
  expect(Math.abs((await frame.boundingBox()).height - (await content.boundingBox()).height)).toBeLessThan(1);
  expect(await page.evaluate(() => window.__mockPlayback.created)).toBe(1);
  expect(errors).toEqual([]);
});

test('Document PiP also floats above bottom comments and restores without a new player', async ({ page, context }) => {
  const errors = await loadFixture(page, '/video/BV1test002/');
  await mockPlayback(page);
  await context.route('https://s1.hdslb.com/**', route => route.abort());
  await page.evaluate(() => Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: {
    requestWindow() {
      const win = window.open('about:blank', '_blank', 'popup,width=1000,height=700');
      win.nano = window.nano; win.BiliComments = window.BiliComments;
      return Promise.resolve(win);
    },
  } }));
  const popupReady = page.waitForEvent('popup');
  await page.locator('.' + A + '__playback-pip-button').click();
  const popup = await popupReady;
  popup.on('pageerror', error => errors.push(error.message));
  await expect(popup.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await popup.evaluate(() => {
    const wide = document.createElement('button'); wide.className = 'bpx-player-ctrl-wide'; wide.textContent = '布局';
    wide.style.cssText = 'position:absolute;bottom:16px;right:16px';
    document.getElementById('bilibili-player').append(wide);
  });
  const motion = await popup.evaluate(async () => {
    const slot = document.getElementById('stage-slot'), root = document.getElementById('bilibili-player');
    const before = slot.getBoundingClientRect().width;
    document.querySelector('.bpx-player-ctrl-wide').click();
    const first = slot.getBoundingClientRect().width;
    const frames = [];
    while (document.body.dataset.layoutAnimating) {
      frames.push({ width: slot.getBoundingClientRect().width, nativeWidth: root.clientWidth, widthForLayout: slot.clientWidth });
      await new Promise(requestAnimationFrame);
    }
    return { before, first, frames };
  });
  expect(Math.abs(motion.before - motion.first)).toBeLessThan(1);
  expect(new Set(motion.frames.map(frame => Math.round(frame.width))).size).toBeGreaterThan(3);
  expect(motion.frames.every(frame => Math.abs(frame.nativeWidth - frame.widthForLayout) < 1)).toBe(true);
  await longComments(popup, 'comments-mount');
  // Native video/danmaku layers have their own high stacking levels. They must
  // remain below our window controls, including while the player is floating.
  await popup.locator('#bilibili-player').evaluate(player => {
    const videoLayer = document.createElement('div');
    videoLayer.style.cssText = 'position:absolute;inset:0;z-index:9999;background:#000';
    player.append(videoLayer);
  });
  const stage = popup.locator('#stage'), layout = popup.locator('#layout');
  await layout.evaluate(el => { el.scrollTop = el.clientHeight + 150; });
  await expect(stage).toHaveAttribute('data-scroll-floating', 'true');
  await expect.poll(async () => (await stage.boundingBox()).width).toBe(400);
  await stage.hover();
  await popup.getByRole('button', { name: '回到视频', exact: true }).click();
  await expect(stage).toHaveAttribute('data-scroll-floating', 'false');
  await expect.poll(() => layout.evaluate(el => el.scrollTop)).toBe(0);
  expect(Math.abs((await stage.boundingBox()).height - (await layout.boundingBox()).height)).toBeLessThan(1);
  expect(await page.evaluate(() => window.__mockPlayback.created)).toBe(1);
  await popup.close();
  expect(errors).toEqual([]);
});

for (const layout of ['right', 'bottom']) test(`restoring the mini player preserves ${layout} layout bounds throughout its animation`, async ({ page }) => {
  const errors = await openPlayer(page);
  if (layout === 'bottom') await page.locator('.bpx-player-ctrl-wide').click();
  await page.getByRole('button', { name: '收起到右下角', exact: true }).click();
  const overlay = page.locator('#' + A + '-overlay');
  await expect(overlay).not.toHaveAttribute('data-layout-animating', 'true');
  await page.locator('#' + A + '-player-wrap').hover();
  await page.evaluate(A => {
    window.__restoreSamples = [];
    document.querySelector('#' + A + '-header .' + A + '__minimize-button').click();
    function sample() {
      const overlay = document.getElementById(A + '-overlay');
      const content = document.getElementById(A + '-content');
      const slot = document.getElementById(A + '-player-slot');
      const comments = document.getElementById(A + '-comments');
      const frame = document.getElementById(A + '-player-wrap').getBoundingClientRect();
      const viewport = content.getBoundingClientRect();
      const pane = comments.getBoundingClientRect();
      window.__restoreSamples.push({ animating: overlay.dataset.layoutAnimating === 'true', content: parseFloat(getComputedStyle(content).height), slot: parseFloat(getComputedStyle(slot).height), comments: getComputedStyle(comments).visibility, videoBottom: frame.bottom, paneTop: pane.top, viewportBottom: viewport.bottom });
      // Resize callbacks also run during the FLIP transform in the real player.
      window.dispatchEvent(new Event('resize'));
      if (overlay.dataset.layoutAnimating) requestAnimationFrame(sample);
    }
    sample();
  }, A);
  await expect(overlay).not.toHaveAttribute('data-layout-animating', 'true');
  const samples = await page.evaluate(() => window.__restoreSamples);
  expect(samples.some(s => s.animating)).toBe(true);
  expect(samples.filter(s => s.animating).every(s => s.comments === 'hidden')).toBe(true);
  expect(samples.every(s => Math.abs(s.content - s.slot) < 1)).toBe(true);
  if (layout === 'bottom') {
    // Even without visibility:hidden, no comments occupy the animated box.
    expect(samples.every(s => Math.abs(s.videoBottom - s.viewportBottom) < 1)).toBe(true);
    expect(samples.every(s => s.paneTop >= s.viewportBottom - 1)).toBe(true);
  }
  const frame = await page.locator('#' + A + '-player-wrap').boundingBox(), content = await page.locator('#' + A + '-content').boundingBox();
  expect(Math.abs(frame.height - content.height)).toBeLessThan(1);
  await expect(page.locator('#' + A + '-comments')).toHaveCSS('visibility', 'visible');
  expect(await page.evaluate(() => window.__mockPlayback.created)).toBe(1);
  await page.evaluate(A => {
    const collapse = [...document.querySelectorAll('.' + A + '__minimize-button')].find(el => el.getClientRects().length);
    collapse.click();
    document.querySelector('#' + A + '-header .' + A + '__header-button--close').click();
  }, A);
  await expect(page.getByRole('dialog', { name: '迷你播放器', exact: true })).toBeHidden();
  await page.locator('#card-b .cover').hover(); await cardButton(page, 'BV1test002').click();
  await expect(page.locator('#' + A + '-comments')).toHaveCSS('visibility', 'visible');
  expect(errors).toEqual([]);
});

test('crossing the narrow breakpoint keeps a full first-screen player and restores the sidebar', async ({ page }) => {
  await openPlayer(page);
  const frame = page.locator('#' + A + '-player-wrap'), content = page.locator('#' + A + '-content');
  for (const width of [899, 900, 901, 760, 1200]) {
    await page.setViewportSize({ width, height: 877 });
    await expect.poll(async () => Math.abs((await frame.boundingBox()).height - (await content.boundingBox()).height)).toBeLessThan(1);
    await expect(content).toHaveCSS('display', width <= 900 ? 'block' : 'grid');
    const video = await frame.boundingBox(), comments = await page.locator('#' + A + '-comments').boundingBox();
    if (width <= 900) expect(comments.y).toBeGreaterThanOrEqual(video.y + video.height - 1);
    else expect(comments.x).toBeGreaterThanOrEqual(video.x + video.width);
  }
  expect(await page.evaluate(() => window.__mockPlayback.created)).toBe(1);
});

for (const layout of ['right', 'bottom']) test(`web fullscreen survives collapse, close and reload in ${layout} layout`, async ({ page }) => {
  const errors = await openPlayer(page);
  if (layout === 'bottom') await page.locator('.bpx-player-ctrl-wide').click();
  const frame = page.locator('#' + A + '-player-wrap');
  const overlay = page.locator('#' + A + '-overlay');
  const dialog = page.locator('#' + A + '-dialog');
  const assertFullscreen = async () => {
    await expect(overlay).not.toHaveAttribute('data-layout-animating', 'true');
    await expect.poll(async () => (await dialog.boundingBox()).width).toBe(page.viewportSize().width);
    await expect.poll(async () => (await dialog.boundingBox()).height).toBe(page.viewportSize().height);
    const viewport = await page.locator('#' + A + '-content').boundingBox();
    expect(Math.abs((await frame.boundingBox()).height - viewport.height)).toBeLessThan(1);
  };
  const reopen = async () => {
    await page.locator('#card-b .cover').hover();
    await cardButton(page, 'BV1test002').click();
  };
  await frame.hover();
  await page.getByRole('button', { name: '网页内全屏', exact: true }).click();
  await assertFullscreen();
  await frame.hover();
  await page.getByRole('button', { name: '收起到右下角', exact: true }).click();
  await expect(overlay).not.toHaveAttribute('data-layout-animating', 'true');
  await frame.hover();
  await page.getByRole('button', { name: '还原播放器', exact: true }).click();
  await assertFullscreen();
  await frame.hover();
  await page.getByRole('button', { name: '关闭播放器', exact: true }).click();
  await reopen();
  await assertFullscreen();
  await frame.hover();
  await page.getByRole('button', { name: '收起到右下角', exact: true }).click();
  await expect(overlay).not.toHaveAttribute('data-layout-animating', 'true');
  await frame.hover();
  await page.getByRole('button', { name: '关闭播放器', exact: true }).click();
  await reopen();
  await assertFullscreen();
  expect(await page.evaluate(() => window.__mockPlayback.created)).toBe(1);

  // The preference also survives navigating/reloading the host page.
  await openPlayer(page);
  await assertFullscreen();
  await frame.hover();
  await page.getByRole('button', { name: '退出网页内全屏', exact: true }).click();
  await expect(overlay).not.toHaveAttribute('data-layout-animating', 'true');
  const normal = await dialog.boundingBox();
  expect(normal.width).toBeLessThan(page.viewportSize().width);
  await frame.hover();
  await page.getByRole('button', { name: '关闭播放器', exact: true }).click();
  await reopen();
  await expect.poll(async () => (await dialog.boundingBox()).width).toBe(normal.width);
  expect(await page.evaluate(() => localStorage.getItem('bili-popup-player-nano:home-fullscreen'))).toBe('0');
  expect(errors).toEqual([]);
});

for (const layout of ['right', 'bottom']) test(`web fullscreen animates both directions without hiding ${layout} comments`, async ({ page }) => {
  const errors = await openPlayer(page);
  if (layout === 'bottom') await page.locator('.bpx-player-ctrl-wide').click();
  await expect(page.locator('#' + A + '-overlay')).not.toHaveAttribute('data-layout-animating', 'true');
  const dialog = page.locator('#' + A + '-dialog');
  const normal = await dialog.boundingBox();
  for (const fullscreen of [true, false]) {
    const samples = await page.evaluate(A => new Promise(resolve => {
      const ui = window.__biliPopupPlayerNano.getState().home.ui;
      ui.fullscreen.click();
      const samples = [];
      function sample() {
        const box = ui.dialog.getBoundingClientRect();
        const content = ui.content.getBoundingClientRect();
        const video = ui.playerWrap.getBoundingClientRect();
        const comments = ui.comments.getBoundingClientRect();
        samples.push({ width: box.width, height: box.height, videoBottom: video.bottom, contentBottom: content.bottom,
          commentsTop: comments.top, commentsVisible: getComputedStyle(ui.comments).visibility,
          slotHeight: parseFloat(getComputedStyle(ui.playerSlot).height), contentHeight: parseFloat(getComputedStyle(ui.content).height) });
        window.dispatchEvent(new Event('resize'));
        if (ui.overlay.dataset.layoutAnimating) requestAnimationFrame(sample);
        else resolve(samples);
      }
      sample();
    }), A);
    const viewport = page.viewportSize();
    expect(samples.some(s => s.width > normal.width + 1 && s.width < viewport.width - 1)).toBe(true);
    expect(samples.every(s => s.commentsVisible === 'visible')).toBe(true);
    expect(samples.every(s => Math.abs(s.slotHeight - s.contentHeight) < 1)).toBe(true);
    if (layout === 'bottom') {
      expect(samples.every(s => Math.abs(s.videoBottom - s.contentBottom) < 1)).toBe(true);
      expect(samples.every(s => s.commentsTop >= s.contentBottom - 1)).toBe(true);
    }
    const final = samples.at(-1);
    expect(Math.abs(final.width - (fullscreen ? viewport.width : normal.width))).toBeLessThan(1);
    expect(Math.abs(final.height - (fullscreen ? viewport.height : normal.height))).toBeLessThan(1);
  }
  expect(await page.evaluate(() => window.__mockPlayback.created)).toBe(1);
  expect(errors).toEqual([]);
});

test('web fullscreen can reverse mid-animation and closing clears the transition', async ({ page }) => {
  const errors = await openPlayer(page);
  const continuity = await page.evaluate(async () => {
    const ui = window.__biliPopupPlayerNano.getState().home.ui;
    ui.fullscreen.click();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const before = ui.dialog.getBoundingClientRect().toJSON();
    ui.fullscreen.click();
    const after = ui.dialog.getBoundingClientRect().toJSON();
    return { before, after };
  });
  for (const key of ['x', 'y', 'width', 'height']) expect(Math.abs(continuity.before[key] - continuity.after[key])).toBeLessThan(1);
  const overlay = page.locator('#' + A + '-overlay');
  await expect(overlay).not.toHaveAttribute('data-layout-animating', 'true');
  await expect(overlay).not.toHaveClass(/--fullscreen/);
  await page.evaluate(() => {
    const ui = window.__biliPopupPlayerNano.getState().home.ui;
    ui.fullscreen.click();
    ui.close.click();
  });
  await expect(overlay).not.toHaveAttribute('data-layout-animating', 'true');
  await expect(page.getByRole('dialog', { name: '小窗播放器', exact: true })).toBeHidden();
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.locator('#' + A + '-comments')).toHaveCSS('visibility', 'visible');
  await expect(page.locator('#' + A + '-dialog')).toHaveCSS('transform', 'none');
  expect(await page.evaluate(() => window.__mockPlayback.created)).toBe(1);
  expect(errors).toEqual([]);
});

test('web fullscreen respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await openPlayer(page);
  const state = await page.evaluate(() => {
    const ui = window.__biliPopupPlayerNano.getState().home.ui;
    ui.fullscreen.click();
    return { width: ui.dialog.getBoundingClientRect().width, animating: ui.overlay.dataset.layoutAnimating, transform: getComputedStyle(ui.dialog).transform };
  });
  expect(state.width).toBe(page.viewportSize().width);
  expect(state.animating).toBeUndefined();
  expect(state.transform).toBe('none');
  await page.locator('.bpx-player-ctrl-wide').click();
  await expect(page.locator('#' + A + '-overlay')).not.toHaveAttribute('data-layout-animating', 'true');
  await expect(page.locator('#' + A + '-player-slot')).toHaveCSS('transform', 'none');
  expect(errors).toEqual([]);
});

for (const fullscreen of ['window', 'web', 'system']) test(`wide and sidebar resize continuously in ${fullscreen} mode`, async ({ page }) => {
  const errors = await openPlayer(page);
  if (fullscreen === 'web') {
    await page.getByRole('button', { name: '网页内全屏', exact: true }).click();
    await expect(page.locator('#' + A + '-overlay')).not.toHaveAttribute('data-layout-animating', 'true');
  }
  if (fullscreen === 'system') await page.locator('#' + A + '-dialog').evaluate(el => el.requestFullscreen());
  for (const layout of ['bottom', 'right']) {
    const samples = await page.evaluate(A => new Promise(resolve => {
      const ui = window.__biliPopupPlayerNano.getState().home.ui;
      const before = ui.playerSlot.getBoundingClientRect().toJSON();
      document.querySelector('.bpx-player-ctrl-wide').click();
      const after = ui.playerSlot.getBoundingClientRect().toJSON();
      const frames = [];
      const sample = () => {
        frames.push({ ...ui.playerSlot.getBoundingClientRect().toJSON(), commentsTop: ui.comments.getBoundingClientRect().top, contentBottom: ui.content.getBoundingClientRect().bottom });
        if (ui.overlay.dataset.layoutAnimating) requestAnimationFrame(sample);
        else resolve({ before, after, frames });
      };
      sample();
    }), A);
    for (const key of ['x', 'y', 'width', 'height']) expect(Math.abs(samples.before[key] - samples.after[key])).toBeLessThan(1);
    const widths = samples.frames.map(frame => frame.width);
    expect(new Set(widths.map(width => Math.round(width))).size).toBeGreaterThan(3);
    if (layout === 'bottom') expect(samples.frames.every(frame => frame.commentsTop >= frame.contentBottom - 1)).toBe(true);
  }
  const reversal = await page.evaluate(async A => {
    const ui = window.__biliPopupPlayerNano.getState().home.ui;
    document.querySelector('.bpx-player-ctrl-wide').click();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const before = ui.playerSlot.getBoundingClientRect().toJSON();
    document.querySelector('.bpx-player-ctrl-wide').click();
    return { before, after: ui.playerSlot.getBoundingClientRect().toJSON() };
  }, A);
  for (const key of ['x', 'y', 'width', 'height']) expect(Math.abs(reversal.before[key] - reversal.after[key])).toBeLessThan(1);
  await expect(page.locator('#' + A + '-overlay')).not.toHaveAttribute('data-layout-animating', 'true');
  expect(await page.evaluate(() => window.__mockPlayback.created)).toBe(1);
  expect(errors).toEqual([]);
});

for (const kind of ['home', 'pip']) test(`${kind} sidebar divider stays behind the video during resize and remains draggable afterward`, async ({ page, context }) => {
  let playerPage = page, errors;
  if (kind === 'home') errors = await openPlayer(page);
  else {
    errors = await loadFixture(page, '/video/BV1test002/'); await mockPlayback(page);
    await context.route('https://s1.hdslb.com/**', route => route.abort());
    await page.evaluate(() => Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: {
      requestWindow() {
        const win = window.open('about:blank', '_blank', 'popup,width=1000,height=700');
        win.nano = window.nano; win.BiliComments = window.BiliComments;
        return Promise.resolve(win);
      },
    } }));
    const ready = page.waitForEvent('popup');
    await page.locator('.' + A + '__playback-pip-button').click(); playerPage = await ready;
    playerPage.on('pageerror', error => errors.push(error.message));
    await expect(playerPage.getByText('播放器测试画面', { exact: false })).toBeVisible();
    await playerPage.evaluate(() => {
      const wide = document.createElement('button'); wide.className = 'bpx-player-ctrl-wide';
      document.getElementById('bilibili-player').append(wide);
    });
  }
  const ids = kind === 'home' ? { shell: A + '-dialog', slot: A + '-player-slot', divider: A + '-comments-resizer', root: A + '-overlay' } : { shell: 'shell', slot: 'stage-slot', divider: 'comments-resizer', root: null };
  const animating = ids.root ? playerPage.locator('#' + ids.root) : playerPage.locator('body');
  await playerPage.locator('.bpx-player-ctrl-wide').evaluate(el => el.click());
  await expect(animating).not.toHaveAttribute('data-layout-animating', 'true');
  const frames = await playerPage.evaluate(ids => {
    const shell = document.getElementById(ids.shell), slot = document.getElementById(ids.slot), divider = document.getElementById(ids.divider);
    document.querySelector('.bpx-player-ctrl-wide').click();
    const animations = [...shell.getAnimations(), ...slot.getAnimations()];
    for (const animation of animations) animation.pause();
    const frames = [0, 50, 100].map(time => {
      for (const animation of animations) animation.currentTime = time;
      const d = divider.getBoundingClientRect(), s = slot.getBoundingClientRect();
      const x = d.left + 3, y = d.top + d.height / 2;
      return { overlap: s.right > x, videoOnTop: slot.contains(document.elementFromPoint(x, y)) };
    });
    for (const animation of animations) animation.play();
    return frames;
  }, ids);
  expect(frames).toHaveLength(3);
  expect(frames.every(frame => frame.overlap && frame.videoOnTop)).toBe(true);
  await expect(animating).not.toHaveAttribute('data-layout-animating', 'true');
  const divider = playerPage.locator('#' + ids.divider);
  const rect = await divider.boundingBox();
  const width = await playerPage.locator('#' + ids.slot).evaluate(el => el.clientWidth);
  await playerPage.mouse.move(rect.x + 4, rect.y + rect.height / 2);
  expect(await divider.evaluate(el => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.x + 4, r.y + r.height / 2) === el; })).toBe(true);
  await playerPage.mouse.down(); await playerPage.mouse.move(rect.x - 56, rect.y + rect.height / 2, { steps: 5 }); await playerPage.mouse.up();
  await expect.poll(() => playerPage.locator('#' + ids.slot).evaluate(el => el.clientWidth)).toBeLessThan(width - 30);
  if (kind === 'pip') await playerPage.close();
  expect(errors).toEqual([]);
});

test('settings include layout actions next to collapse and close', async ({ page }) => {
  await openPlayer(page);
  await expect(page.getByRole('button', { name: '更多操作', exact: true })).toHaveCount(0);
  const settings = page.getByRole('button', { name: '小窗播放设置', exact: true });
  const collapse = page.getByRole('button', { name: '收起到右下角', exact: true });
  const close = page.getByRole('button', { name: '关闭播放器', exact: true });
  expect((await settings.boundingBox()).x).toBeLessThan((await collapse.boundingBox()).x);
  expect((await collapse.boundingBox()).x).toBeLessThan((await close.boundingBox()).x);
  await expect(page.locator('.' + A + '__sidebar-heading').getByRole('button', { name: '关闭播放器', exact: true })).toBeVisible();
  await expect(page.locator('#' + A + '-header').getByRole('button', { name: '关闭播放器', exact: true })).toBeHidden();
  await settings.click();
  await expect(page.getByRole('button', { name: '自动适配布局', exact: true })).toBeVisible();
  await expect(page.getByRole('switch', { name: '小窗播放', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settings).toBeFocused();
  await page.locator('.bpx-player-ctrl-wide').click();
  await page.locator('#' + A + '-player-wrap').hover();
  await expect(page.locator('#' + A + '-header').getByRole('button', { name: '关闭播放器', exact: true })).toBeVisible();
  await expect(page.locator('.' + A + '__sidebar-heading').getByRole('button', { name: '关闭播放器', exact: true })).toBeHidden();
});

test('full navigation controls and long quality labels fit at the former clipping breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openPlayer(page);
  await page.addStyleTag({ content: `
    .bpx-player-control-bottom { position:absolute;bottom:8px;display:flex;justify-content:space-between;width:100%;box-sizing:border-box;padding:0 12px; }
    .bpx-player-control-bottom-left { display:flex;flex:none;min-width:316px; }
    .bpx-player-control-bottom-center { flex:1;padding:0 60px; }
    .bpx-player-control-bottom-right { display:flex;min-width:370px; }
    .bpx-player-ctrl-btn { display:block;flex-shrink:0;width:54px;height:36px;padding:0;border:0; }
    .bpx-player-ctrl-time { width:120px; }
    .bpx-player-ctrl-quality { width:108px; }
    .bpx-player-ctrl-playbackrate { width:66px; }
    .bpx-player-ctrl-quality-result { font-size:14px; }
    .bpx-player-ctrl-playbackrate-result { font-size:16px; }
    .bpx-player-container { box-shadow:0 0 8px #e5e9ef; }
    .bpx-player-sending-area::before { display:block;content:'';height:1px;background:#f4f4f4;margin-bottom:-1px; }
  ` });
  await page.evaluate(A => {
    const root = document.querySelector('#' + A + '-player .bpx-player-container');
    root.dataset.screen = 'web';
    root.innerHTML = `<div class="bpx-player-control-bottom"><div class="bpx-player-control-bottom-left">${['prev','play','next'].map(key => `<button class="bpx-player-ctrl-btn bpx-player-ctrl-${key}">${key}</button>`).join('')}<div class="bpx-player-ctrl-time">00:20 / 10:00</div></div><div class="bpx-player-control-bottom-center"></div><div class="bpx-player-control-bottom-right">${['quality','playbackrate','subtitle','volume','setting','pip','wide','web','full'].map(key => `<button class="bpx-player-ctrl-btn bpx-player-ctrl-${key}">${key === 'quality' ? '1080P 高码率' : key}</button>`).join('')}</div></div><div class="bpx-player-sending-area"></div>`;
    for (const key of ['quality','playbackrate']) {
      const button = root.querySelector('.bpx-player-ctrl-' + key);
      const result = document.createElement('span'); result.className = 'bpx-player-ctrl-' + key + '-result';
      result.textContent = button.textContent; button.replaceChildren(result);
    }
  }, A);
  const frame = page.locator('#' + A + '-player-wrap'), root = page.locator('#' + A + '-player');
  for (const width of [1000, 961, 960, 901, 800, 761, 760, 561, 560]) {
    await page.evaluate(({ A, width }) => { window.__biliPopupPlayerNano.getState().modalSize = { width: width + 308, height: 600 }; window.dispatchEvent(new Event('resize')); }, { A, width });
    await expect.poll(() => frame.evaluate(el => el.clientWidth)).toBe(width);
    const bounds = await frame.boundingBox();
    for (const control of await root.locator('.bpx-player-ctrl-btn').all()) {
      const box = await control.boundingBox();
      if (!box) continue;
      expect(box.x).toBeGreaterThanOrEqual(bounds.x);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width - 5);
      expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height);
    }
    await expect(root.locator('.bpx-player-sending-area')).toHaveCSS('display', 'none');
    await expect(root.locator('.bpx-player-container')).toHaveCSS('box-shadow', 'none');
    await expect(root.locator('.bpx-player-ctrl-quality-result')).toHaveCSS('font-size', await root.locator('.bpx-player-ctrl-playbackrate-result').evaluate(el => getComputedStyle(el).fontSize));
  }
});
