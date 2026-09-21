import { test, expect } from '@playwright/test';
import { APP as A, cardButton, loadFixture, mockPlayback } from './fixture.js';

async function prepare(page, { classic, fullscreen = false } = {}) {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  if (classic !== undefined) await page.evaluate(({ A, classic }) => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth').get;
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() {
      if (this.dataset.scrollbarProbe === A) return this.clientWidth + (classic ? 14 : 0);
      return original.call(this);
    } });
  }, { A, classic });
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await page.locator('#' + A + '-player').evaluate(root => {
    window.__nativeFullscreen = 0; window.__nativeWheel = 0;
    root.firstChild.classList.add('bpx-player-video-wrap');
    root.firstChild.addEventListener('wheel', event => { window.__nativeWheel++; event.preventDefault(); }, { passive: false });
    for (const [key, x] of [['full', 16], ['wide', 100]]) {
      const button = document.createElement('button'); button.className = 'bpx-player-ctrl-' + key;
      button.textContent = key; button.style.cssText = `position:absolute;bottom:16px;right:${x}px;z-index:5`;
      if (key === 'full') button.addEventListener('click', () => window.__nativeFullscreen++);
      root.append(button);
    }
  });
  if (fullscreen) {
    await page.locator('#' + A + '-player-wrap').hover();
    await page.getByRole('button', { name: '网页内全屏', exact: true }).click();
  }
  return errors;
}

for (const layout of ['right', 'bottom']) test(`system fullscreen retains controls and the ${layout} content layout`, async ({ page }) => {
  const errors = await prepare(page, { fullscreen: layout === 'right' });
  await page.locator('#' + A + '-player .bpx-player-container').evaluate(player => {
    player.insertAdjacentHTML('beforeend', '<div class="bpx-player-shadow-progress-area" style="height:2px;background:#fff">细进度条</div><div class="bpx-player-progress-area" style="height:4px;background:#00a1d6">正常进度条</div>');
  });
  const shadowProgress = page.locator('#' + A + '-player .bpx-player-shadow-progress-area');
  const seekProgress = page.locator('#' + A + '-player .bpx-player-progress-area');
  await expect(shadowProgress).toBeVisible();
  const frame = page.locator('#' + A + '-player-wrap'), content = page.locator('#' + A + '-content');
  const dialog = page.locator('#' + A + '-dialog'), full = page.locator('.bpx-player-ctrl-full');
  if (layout === 'bottom') await page.locator('.bpx-player-ctrl-wide').click();
  await full.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe(A + '-dialog');
  await expect(shadowProgress).toBeHidden();
  await expect(seekProgress).toBeVisible();
  await expect.poll(() => dialog.evaluate(el => el.clientHeight === window.innerHeight)).toBe(true);
  await frame.hover();
  await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await expect(page.getByRole('button', { name: '自动适配布局', exact: true })).toBeVisible();
  expect(await page.locator('.' + A + '__settings__panel').evaluate(el => document.fullscreenElement.contains(el))).toBe(true);
  await page.getByRole('button', { name: '手柄快捷键', exact: true }).click();
  await expect(page.getByText('LB / RB', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.fullscreenElement?.id)).toBe(A + '-dialog');
  if (layout === 'right') {
    await page.getByRole('tab', { name: '播放列表', exact: true }).click();
    await expect(page.locator('#' + A + '-playlist-panel')).toBeVisible();
    await page.getByRole('button', { name: '收起到右下角', exact: true }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
    await expect(page.locator('#' + A + '-overlay')).not.toHaveAttribute('data-layout-animating', 'true');
    await frame.hover(); await page.getByRole('button', { name: '还原播放器', exact: true }).click();
    await expect.poll(() => dialog.evaluate(el => el.clientHeight === window.innerHeight)).toBe(true);
  } else {
    await page.locator('#' + A + '-comments-mount').evaluate(el => { el.innerHTML = '<div style="height:2600px">长评论</div>'; });
    await frame.hover({ position: { x: 240, y: 200 } });
    await page.mouse.wheel(0, 280);
    await expect.poll(() => content.evaluate(el => el.scrollTop)).toBeGreaterThan(150);
    expect(await page.evaluate(() => window.__nativeWheel)).toBe(0);
    await content.evaluate(el => { el.scrollTop = el.clientHeight + 20; });
    await expect(frame).toHaveAttribute('data-scroll-floating', 'true');
    await frame.hover(); await page.getByRole('button', { name: '回到视频', exact: true }).click();
    await expect(frame).toHaveAttribute('data-scroll-floating', 'false');
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
    await expect(dialog).toBeVisible();
  }
  await frame.hover(); await page.keyboard.press('f');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe(A + '-dialog');
  await full.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  await expect(shadowProgress).toBeVisible();
  await page.locator('.bpx-player-video-wrap').dblclick();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe(A + '-dialog');
  await frame.hover(); await page.getByRole('button', { name: '关闭播放器', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => window.__nativeFullscreen)).toBe(0);
  expect(errors).toEqual([]);
});

test('the lower watch page shows comments and lists together, with a single-column narrow layout', async ({ page }) => {
  const errors = await prepare(page);
  await page.locator('.bpx-player-ctrl-wide').click();
  const content = page.locator('#' + A + '-content');
  await content.evaluate(el => { el.scrollTop = el.clientHeight; });
  await expect(page.getByRole('tablist')).toBeHidden();
  const comments = page.locator('#' + A + '-comments-panel'), rail = page.locator('.' + A + '__sidebar-lists');
  expect((await rail.boundingBox()).x).toBeGreaterThan((await comments.boundingBox()).x + (await comments.boundingBox()).width);
  for (const label of ['分P', '播放列表', '相关推荐']) await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
  await expect(comments).not.toHaveAttribute('inert');
  await page.locator('#' + A + '-comments-mount').evaluate(el => {
    const button = document.createElement('button'); button.textContent = '回复评论';
    button.onclick = () => { button.textContent = '回复已展开'; }; el.append(button);
  });
  await page.getByRole('button', { name: '回复评论', exact: true }).click();
  await expect(page.getByRole('button', { name: '回复已展开', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 760, height: 900 });
  // ResizeObserver applies the new shell width on the next frame. Sample all
  // three boxes together once the narrow column has actually settled.
  await expect.poll(() => page.evaluate(A => {
    const intro = document.getElementById(A + '-video-intro').getBoundingClientRect();
    const rail = document.querySelector('.' + A + '__sidebar-lists').getBoundingClientRect();
    const mount = document.getElementById(A + '-comments-mount').getBoundingClientRect();
    return rail.y >= intro.bottom && mount.y >= rail.bottom;
  }, A)).toBe(true);
  expect(await content.evaluate(el => el.scrollWidth)).toBe(await content.evaluate(el => el.clientWidth));
  expect(errors).toEqual([]);
});

for (const classic of [true, false]) test(`${classic ? 'classic' : 'native overlay'} scrollbars keep content width and scroll interaction`, async ({ page }) => {
  const errors = await prepare(page, { classic });
  const comments = page.locator('#' + A + '-comments-panel');
  await page.locator('#' + A + '-comments-mount').evaluate(el => { el.innerHTML = '<div style="height:4000px">长评论</div>'; });
  await comments.evaluate(el => { el.scrollTop = 200; });
  if (classic) {
    await expect(comments).toHaveCSS('scrollbar-width', 'none');
    expect(await comments.evaluate(el => el.offsetWidth - el.clientWidth)).toBe(0);
    const commentBar = page.locator(`.${A}__scrollbar[aria-controls="${A}-comments-panel"]`);
    await expect(commentBar).toBeVisible();
    const panelBounds = await comments.boundingBox(), barBounds = await commentBar.boundingBox();
    expect(barBounds.x + barBounds.width).toBeCloseTo(panelBounds.x + panelBounds.width, 0);
    await expect(commentBar).toHaveAttribute('data-visible', 'false');
  } else await expect(comments).not.toHaveClass(/__virtual-scroll/);
  await page.locator('.bpx-player-ctrl-wide').click();
  const content = page.locator('#' + A + '-content'), dialog = page.locator('#' + A + '-dialog');
  await page.locator('#' + A + '-comments-mount').evaluate(el => { el.innerHTML = '<div style="height:4000px">长评论</div>'; });
  await expect(dialog).toHaveAttribute('data-scrollbars', classic ? 'overlay' : 'native');
  if (classic) await expect(content).toHaveCSS('scrollbar-width', 'none');
  else await expect(dialog.locator('.' + A + '__scrollbar-layer')).toHaveCount(0);
  await content.evaluate(el => { el.scrollTop = 260; });
  if (classic) {
    const bar = dialog.locator(`.${A}__scrollbar[aria-controls="${A}-content"]`);
    await expect(bar).toBeVisible();
    const thumb = await bar.locator('.' + A + '__scrollbar-thumb').boundingBox();
    await page.mouse.move(thumb.x + 2, thumb.y + thumb.height / 2);
    await page.mouse.down(); await page.mouse.move(thumb.x + 2, thumb.y + thumb.height / 2 + 90, { steps: 5 }); await page.mouse.up();
    await expect.poll(() => content.evaluate(el => el.scrollTop)).toBeGreaterThan(500);
    await page.mouse.move(10, 10);
    await expect(bar).toHaveAttribute('data-visible', 'false');
  }
  expect(errors).toEqual([]);
});

async function addNativeWebControl(page) {
  const root = page.locator('#' + A + '-player');
  await root.evaluate(root => {
    const web = document.createElement('button');
    web.className = 'bpx-player-ctrl-web bpx-state-entered';
    web.style.cssText = 'position:absolute;bottom:16px;right:170px';
    web.innerHTML = '<span class="bpx-player-ctrl-web-enter">进入</span><span class="bpx-player-ctrl-web-leave">退出</span>';
    const tips = document.createElement('div'); tips.className = 'bpx-player-tooltip-area';
    tips.innerHTML = '<div class="bpx-player-tooltip-item" data-name="ctrl:webscreen"><div class="bpx-player-tooltip-title">退出网页全屏</div></div>';
    web.addEventListener('mouseenter', () => { tips.firstChild.firstChild.textContent = '退出网页全屏'; });
    root.append(web, tips);
    window.dispatchEvent(new Event('resize'));
  });
}

for (const layout of ['right', 'bottom']) for (const webControl of ['header', 'native']) test(`system fullscreen buttons select web or window in ${layout} layout using the ${webControl} web control`, async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 1000 });
  const errors = await prepare(page);
  await addNativeWebControl(page);
  if (layout === 'bottom') await page.locator('.bpx-player-ctrl-wide').click();
  const root = page.locator('#' + A + '-player');
  const overlay = page.locator('#' + A + '-overlay');
  const dialog = page.locator('#' + A + '-dialog');
  const frame = page.locator('#' + A + '-player-wrap');
  const full = root.locator('.bpx-player-ctrl-full');
  const web = root.locator('.bpx-player-ctrl-web');
  const title = root.locator('.bpx-player-tooltip-title');
  const clickWeb = async () => {
    await frame.hover();
    if (webControl === 'native') await web.click();
    else await page.getByRole('button', { name: '网页内全屏', exact: true }).click();
  };
  const savedWebMode = () => page.evaluate(() => window.__biliPopupPlayerNano.getState().home.fullscreen);

  // A system-fullscreen exit must choose the pressed button's destination,
  // independently of whether it was entered from the window or web fullscreen.
  for (const fromWeb of [false, true]) {
    if (fromWeb) await clickWeb();
    await full.click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe(A + '-dialog');
    await expect(web).toHaveAttribute('aria-label', '网页全屏');
    await expect(web.locator('.bpx-player-ctrl-web-enter')).toBeVisible();
    await expect(web.locator('.bpx-player-ctrl-web-leave')).toBeHidden();
    await expect(title).toHaveText('网页全屏');
    await expect(full).toHaveAttribute('aria-label', '退出系统全屏');
    await clickWeb();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
    await expect.poll(savedWebMode).toBe(true);
    await expect(overlay).toHaveClass(new RegExp(A + '--fullscreen'));
    await expect.poll(() => dialog.evaluate(el => el.clientWidth === innerWidth && el.clientHeight === innerHeight)).toBe(true);
    await expect(web).toHaveAttribute('aria-label', '退出网页全屏');
    await expect(web.locator('.bpx-player-ctrl-web-leave')).toBeVisible();
    await expect(title).toHaveText('退出网页全屏');
    expect(await page.evaluate(() => localStorage.getItem('bili-popup-player-nano:home-fullscreen'))).toBe('1');

    await full.click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe(A + '-dialog');
    await full.click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
    await expect.poll(savedWebMode).toBe(false);
    await expect(overlay).not.toHaveClass(new RegExp(A + '--fullscreen'));
    await expect.poll(() => dialog.evaluate(el => el.clientWidth < innerWidth && el.clientHeight < innerHeight)).toBe(true);
    await expect(web).toHaveAttribute('aria-label', '网页全屏');
    await expect(full).toHaveAttribute('aria-label', '系统全屏');
    expect(await page.evaluate(() => localStorage.getItem('bili-popup-player-nano:home-fullscreen'))).toBe('0');
  }
  expect(await page.evaluate(() => window.__mockPlayback.created)).toBe(1);
  expect(await page.evaluate(() => window.__mockPlayback.paused)).toBe(0);
  expect(await page.evaluate(() => window.__mockPlayback.screenKind)).toBe(2);
  expect(errors).toEqual([]);
});

for (const fromWeb of [false, true]) test(`a refused fullscreen exit preserves the ${fromWeb ? 'web' : 'window'} preference`, async ({ page }) => {
  const errors = await prepare(page, { fullscreen: fromWeb });
  const full = page.locator('.bpx-player-ctrl-full');
  await full.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe(A + '-dialog');
  await page.evaluate(() => {
    window.__exitFullscreen = document.exitFullscreen;
    document.exitFullscreen = () => Promise.reject(new Error('Exit refused'));
  });
  if (fromWeb) await full.click();
  else {
    await page.locator('#' + A + '-player-wrap').hover();
    await page.getByRole('button', { name: '网页内全屏', exact: true }).click();
  }
  await expect(page.locator('#' + A + '-status')).toHaveText('无法切换系统全屏：Exit refused');
  expect(await page.evaluate(() => document.fullscreenElement?.id)).toBe(A + '-dialog');
  expect(await page.evaluate(() => window.__biliPopupPlayerNano.getState().home.fullscreen)).toBe(fromWeb);
  expect(await page.evaluate(() => localStorage.getItem('bili-popup-player-nano:home-fullscreen'))).toBe(fromWeb ? '1' : '0');
  await page.evaluate(() => { document.exitFullscreen = window.__exitFullscreen; });
  await full.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  expect(await page.evaluate(() => window.__biliPopupPlayerNano.getState().home.fullscreen)).toBe(false);
  expect(errors).toEqual([]);
});

test('native web fullscreen icons and hover text follow the shell while immersive playback stays enabled', async ({ page }) => {
  const errors = await prepare(page);
  await page.setViewportSize({ width: 1800, height: 1000 });
  await addNativeWebControl(page);
  const root = page.locator('#' + A + '-player');
  const web = root.locator('.bpx-player-ctrl-web'), title = root.locator('.bpx-player-tooltip-title');
  await web.hover();
  await expect(web).toHaveAttribute('aria-label', '网页全屏');
  await expect(web.locator('.bpx-player-ctrl-web-enter')).toBeVisible();
  await expect(web.locator('.bpx-player-ctrl-web-leave')).toBeHidden();
  await expect(title).toHaveText('网页全屏');
  await web.click();
  await expect(web).toHaveAttribute('aria-label', '退出网页全屏');
  await expect(web.locator('.bpx-player-ctrl-web-enter')).toBeHidden();
  await expect(web.locator('.bpx-player-ctrl-web-leave')).toBeVisible();
  await expect(title).toHaveText('退出网页全屏');
  await web.click();
  await expect(web).toHaveAttribute('aria-label', '网页全屏');
  await expect(title).toHaveText('网页全屏');
  expect(await page.evaluate(() => window.__mockPlayback.screenKind)).toBe(2);
  expect(errors).toEqual([]);
});
