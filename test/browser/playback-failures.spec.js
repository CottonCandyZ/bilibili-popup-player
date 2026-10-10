import { test, expect } from '@playwright/test';
import { APP, loadFixture, mockPlayback, cardButton } from './fixture.js';

const nativeCore = 'https://s1.hdslb.com/bfs/static/player/main/core.b237bb82.js';
const videoData = { aid: 200, bvid: 'BV1test002', cid: 301, title: '备用视频信息', owner: { mid: 100, name: 'UP' },
  pages: [{ cid: 301, page: 1, part: '第一 P' }, { cid: 302, page: 2, part: '第二 P' }] };

async function openHome(page) {
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
}

test('a blocked detail request uses basic info and still mounts player and comments', async ({ page }) => {
  const errors = await loadFixture(page, '/');
  await mockPlayback(page);
  await page.route('**/wbi/view/detail?**', route => route.abort('blockedbyclient'));
  await page.route('**/x/web-interface/view?**', route => route.fulfill({ json: { code: 0, data: videoData } }));
  await openHome(page);
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await expect(page.getByText('评论区测试内容', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__biliPopupPlayerNano.getState().home.bootstrap.diagnostics.source)).toBe('基本视频信息接口');
  expect(errors).toEqual([]);
});

test('all APIs failing uses native page data without executing a second player bundle', async ({ page }) => {
  const errors = await loadFixture(page, '/');
  await mockPlayback(page);
  await page.route('https://api.bilibili.com/**', route => route.abort('blockedbyclient'));
  await page.route('https://www.bilibili.com/video/BV1test002/**', route => route.fulfill({ contentType: 'text/html', body:
    `<script>window.__INITIAL_STATE__=${JSON.stringify({ videoData, p: 1 })};window.__unexpectedPageExecution=true;</script><script src="${nativeCore}"></script>` }));
  await openHome(page);
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await expect(page.getByText('评论区测试内容', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => Boolean(window.__unexpectedPageExecution))).toBe(false);
  expect(await page.evaluate(() => window.__biliPopupPlayerNano.getState().home.bootstrap.diagnostics.source)).toBe('原播放页');
  expect(errors).toEqual([]);
});

test('native hover core in flight is reused across hashes without duplicate bwp-video registration', async ({ page }) => {
  const errors = await loadFixture(page, '/');
  await mockPlayback(page);
  const requested = [];
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/player/main/core.*.js', async route => {
    requested.push(route.request().url());
    await pending;
    await route.fulfill({ contentType: 'text/javascript', body:
      `customElements.define('bwp-video', class extends HTMLElement {}); window.nano = window.__savedNano;` });
  });
  await page.evaluate(src => {
    window.__savedNano = window.nano;
    delete window.nano;
    const script = document.createElement('script');
    script.src = src;
    document.head.append(script);
  }, nativeCore);
  await expect.poll(() => requested.length).toBe(1);
  await openHome(page);
  await expect(page.getByText('评论区测试内容', { exact: true })).toBeVisible();
  expect(requested).toEqual([nativeCore]);
  expect(await page.evaluate(() => Boolean(window.__biliPopupPlayerNano.getState().home.player))).toBe(false);
  release();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  expect(requested).toEqual([nativeCore]);
  expect(errors).toEqual([]);
});

test('player core failure leaves comments available and shows a visible failure with the original link', async ({ page }) => {
  const errors = await loadFixture(page, '/');
  await mockPlayback(page);
  await page.evaluate(() => { window.__savedNano = window.nano; delete window.nano; });
  await page.route('**/player/main/core.*.js', route => route.abort('blockedbyclient'));
  await openHome(page);
  await expect(page.getByRole('alert')).toContainText('视频加载失败');
  await expect(page.getByText('评论区测试内容', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '打开原视频', exact: true })).toHaveAttribute('href', 'https://www.bilibili.com/video/BV1test002/');
  await page.route('**/player/main/core.*.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.nano = window.__savedNano;' }));
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await expect(page.getByRole('alert')).toBeHidden();
  expect(errors).toEqual([]);
});

test('a host core that completed without an API can be replaced on retry', async ({ page }) => {
  const errors = await loadFixture(page, '/');
  await mockPlayback(page);
  await page.route('**/player/main/core.*.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.__coreLoaded = true;' }));
  await page.evaluate(() => { window.__savedNano = window.nano; delete window.nano; });
  await page.addScriptTag({ url: nativeCore });
  await openHome(page);
  await expect(page.getByText('评论区测试内容', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('视频加载失败');
  expect(await page.evaluate(() => window.__biliPopupPlayerNano.getState().home.lastError.message)).toContain('脚本已加载，但组件接口不可用');
  await expect(page.locator('script[src*="/player/main/core."]')).toHaveCount(0);
  await page.route('**/player/main/core.*.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.nano = window.__savedNano;' }));
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await expect(page.getByRole('alert')).toBeHidden();
  expect(errors).toEqual([]);
});

test('a native core that already errored does not block a fresh core request', async ({ page }) => {
  const errors = await loadFixture(page, '/');
  await mockPlayback(page);
  await page.evaluate(() => { window.__savedNano = window.nano; delete window.nano; });
  const requested = [];
  await page.route('**/player/main/core.*.js', route => {
    requested.push(route.request().url());
    if (requested.length === 1) return route.abort('connectionfailed');
    return route.fulfill({ contentType: 'text/javascript', body: 'window.nano = window.__savedNano;' });
  });
  await page.addScriptTag({ url: nativeCore }).catch(() => {});
  await openHome(page);
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await expect(page.getByText('评论区测试内容', { exact: true })).toBeVisible();
  expect(requested).toHaveLength(2);
  expect(requested[0]).toBe(nativeCore);
  await expect(page.locator('script[src*="/player/main/core."]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('a native core that errors during popup startup is requested again on retry', async ({ page }) => {
  const errors = await loadFixture(page, '/');
  await mockPlayback(page);
  await page.evaluate(() => { window.__savedNano = window.nano; delete window.nano; });
  const requested = [];
  let fail;
  const pending = new Promise(resolve => { fail = resolve; });
  await page.route('**/player/main/core.*.js', async route => {
    requested.push(route.request().url());
    if (requested.length === 1) {
      await pending;
      return route.abort('connectionfailed');
    }
    return route.fulfill({ contentType: 'text/javascript', body: 'window.nano = window.__savedNano;' });
  });
  await page.evaluate(src => {
    const script = document.createElement('script');
    script.src = src;
    document.head.append(script);
  }, nativeCore);
  await expect.poll(() => requested.length).toBe(1);
  await openHome(page);
  await expect(page.getByText('评论区测试内容', { exact: true })).toBeVisible();
  fail();
  await expect(page.getByRole('alert')).toContainText('视频加载失败');
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await expect(page.getByRole('alert')).toBeHidden();
  expect(requested).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('retry after a timeout keeps reusing a native core that is still in flight', async ({ page }) => {
  const errors = await loadFixture(page, '/');
  await mockPlayback(page);
  await page.evaluate(() => { window.__savedNano = window.nano; delete window.nano; });
  const requested = [];
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/player/main/core.*.js', async route => {
    requested.push(route.request().url());
    await pending;
    return route.fulfill({ contentType: 'text/javascript', body:
      `customElements.define('bwp-video', class extends HTMLElement {}); window.nano = window.__savedNano;` });
  });
  await page.evaluate(src => {
    const script = document.createElement('script');
    script.src = src;
    document.head.append(script);
  }, nativeCore);
  await expect.poll(() => requested.length).toBe(1);
  await page.clock.install();
  await openHome(page);
  await expect(page.getByText('评论区测试内容', { exact: true })).toBeVisible();
  await page.clock.fastForward(15001);
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__biliPopupPlayerNano.getState().home.ui.status.textContent)).toBe('准备就绪');
  expect(requested).toEqual([nativeCore]);
  release();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await expect(page.getByRole('alert')).toBeHidden();
  expect(requested).toEqual([nativeCore]);
  expect(errors).toEqual([]);
});

test('retry cannot re-register player components after a core finished without its API', async ({ page }) => {
  const errors = await loadFixture(page, '/');
  await mockPlayback(page);
  await page.evaluate(() => delete window.nano);
  const requested = [];
  await page.route('**/player/main/core.*.js', route => {
    requested.push(route.request().url());
    return route.fulfill({ contentType: 'text/javascript', body: `customElements.define('bwp-video', class extends HTMLElement {});` });
  });
  await page.addScriptTag({ url: nativeCore });
  await openHome(page);
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__biliPopupPlayerNano.getState().home.lastError?.message)).toContain('请刷新页面后重试');
  expect(requested).toEqual([nativeCore]);
  expect(errors).toEqual([]);
});

test('all-source failure shows an error and retry starts a fresh playback attempt', async ({ page }) => {
  const errors = await loadFixture(page, '/');
  await mockPlayback(page);
  await page.route('https://api.bilibili.com/**', route => route.fulfill({ json: { code: -352, message: '风控校验失败' } }));
  await openHome(page);
  await expect(page.getByRole('alert')).toContainText('视频加载失败');
  expect(await page.evaluate(() => window.__biliPopupPlayerNano.getState().home.lastError.diagnostics[0].code)).toBe(-352);
  await mockPlayback(page);
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
  await expect(page.getByRole('alert')).toBeHidden();
  expect(await page.evaluate(() => window.__biliPopupPlayerNano.getState().home.lastError)).toBeNull();
  expect(errors).toEqual([]);
});
