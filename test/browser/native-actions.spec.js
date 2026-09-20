import { test, expect } from '@playwright/test';
import { APP as A, cardButton, loadFixture, mockPlayback } from './fixture.js';

async function openPlayer(page, context, kind = 'home') {
  const errors = await loadFixture(page, '/');
  await mockPlayback(page);
  const requests = [];
  const responses = { fail: false };
  await page.route('https://api.bilibili.com/**', route => {
    const request = route.request(), url = request.url();
    if (request.method() === 'POST') {
      requests.push({ path: new URL(url).pathname, body: Object.fromEntries(new URLSearchParams(request.postData())) });
      if (responses.holdFollow && url.includes('/relation/modify')) { responses.pendingRoute = route; return; }
      return route.fulfill({ json: responses.fail ? { code: -400, message: '模拟操作失败' } : { code: 0, data: {} } });
    }
    if (url.includes('/fav/folder/created/list-all')) return route.fulfill({ json: { code: 0, data: { list: [{ id: 901, title: '默认收藏夹', fav_state: 0 }] } } });
    return route.fallback();
  });
  await page.evaluate(() => {
    document.cookie = 'bili_jct=test-csrf;path=/';
    window.__nativeActions = { callbacks: [], bindings: [], states: [] };
    const log = window.__nativeActions, create = window.nano.createPlayer;
    window.nano.EventType.Player_Virtual_Action = 'Player_Virtual_Action';
    window.nano.InternalKind = { Like: 0, Coin: 1, Triple: 2, Follow: 3, Collect: 4, UpInfo: 6, Manuscript: 7 };
    window.nano.createPlayer = setting => {
      const player = create(setting), connect = player.connect, reload = player.reload, listeners = new Set();
      let current = setting;
      const render = () => {
        const root = current.element.firstChild, doc = root.ownerDocument;
        root.style.position = 'relative';
        const area = doc.createElement('div');
        area.className = 'bpx-player-video-area';
        area.style.cssText = 'position:absolute;inset:100px 0 60px;display:grid;place-items:center';
        // Command danmaku controls are divs inside the video surface, not buttons.
        area.innerHTML = '<div class="bpx-player-cmd-dm-wrap" style="pointer-events:auto;display:flex;gap:24px"><div class="native-follow">关注</div><div class="native-like">点赞</div><div class="native-coin">投币</div><div class="native-collect">收藏</div><div class="native-triple">三连</div></div>';
        area.querySelectorAll('[class^="native-"]').forEach((node, index) => node.addEventListener('click', event => {
          event.stopPropagation();
          if (index === 0) node.dataset.followed = String(!log.states.at(-1)?.[3]);
          player.emitAction([3, 0, 1, 4, 2][index], index === 0 ? { fid: 100, act: log.states.at(-1)?.[3] ? 2 : 1 } : {});
        }));
        root.append(area);
        log.settings = current.viewInfo;
      };
      Object.assign(player, {
        on(type, handler) { if (type === 'Player_Virtual_Action') { listeners.add(handler); log.bindings.push(handler); } },
        off(type, handler) { listeners.delete(handler); },
        setState(state) { log.states.push(state); },
        danmaku: { getDanmakuX: () => ({ updateState() {
          const node = current.element.querySelector('.native-follow');
          if (node) node.dataset.followed = String(Boolean(log.states.at(-1)?.[3]));
        } }) },
        connect() { connect(); render(); },
        reload(next) { reload(next); current = next; connect(); render(); },
        emitAction(kind, data = {}) {
          const detail = { kind, data: { ...data, success: result => log.callbacks.push({ kind, ...result }), fail: result => log.callbacks.push({ kind, ...result }) } };
          listeners.forEach(handler => handler({ detail }));
        },
      });
      return player;
    };
  });
  let surface = page;
  if (kind === 'pip') {
    await context.route('https://s1.hdslb.com/**', route => route.abort());
    await page.evaluate(() => Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: {
      requestWindow() {
        const win = window.open('about:blank', '_blank', 'popup,width=1100,height=760');
        win.nano = window.nano; win.BiliComments = window.BiliComments;
        return Promise.resolve(win);
      },
    } }));
    await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
    await page.getByRole('radio', { name: '独立小窗', exact: true }).click();
    await page.keyboard.press('Escape');
    const popup = page.waitForEvent('popup');
    await page.locator('#card-b .cover').hover();
    await cardButton(page, 'BV1test002').click();
    surface = await popup;
    surface.on('pageerror', error => errors.push(error.message));
  } else {
    await page.locator('#card-b .cover').hover();
    await cardButton(page, 'BV1test002').click();
  }
  await expect(surface.locator('.native-follow')).toBeVisible();
  await expect.poll(() => page.evaluate(kind => window.__biliPopupPlayerNano.getState()[kind].bootstrap.__biliPopupPlayerNanoActions?.loaded, kind)).toBe(true);
  const emit = (action, data = {}) => page.evaluate(({ kind, action, data }) => window.__biliPopupPlayerNano.getState()[kind].player.emitAction(action, data), { kind, action, data });
  const state = () => page.evaluate(() => window.__nativeActions.states.at(-1));
  return { errors, requests, responses, surface, emit, state };
}

for (const kind of ['home', 'pip']) {
  test(`${kind} reload detaches old native handlers and binds exactly once`, async ({ page, context }) => {
    const { errors, requests, surface } = await openPlayer(page, context, kind);
    await surface.getByRole('tab', { name: '分P', exact: true }).click();
    await surface.getByRole('button', { name: '播放：2. 看见新的风景', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__nativeActions.bindings.length)).toBe(2);
    await page.evaluate(() => window.__nativeActions.bindings[0]({ detail: { kind: 3, data: { fid: 100, act: 1 } } }));
    await surface.locator('.native-like').click();
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0].path).toBe('/x/web-interface/archive/like');
    expect(errors).toEqual([]);
  });

  test(`${kind} native follow and triple widgets execute once and synchronize with the intro`, async ({ page, context }) => {
    const { errors, requests, surface, state } = await openPlayer(page, context, kind);
    expect(await page.evaluate(() => window.__nativeActions.settings.storyInfo)).toMatchObject({ likeDisable: false, coinDisable: false, collectDisable: false });
    const pausedBefore = await page.evaluate(() => window.__mockPlayback.paused);
    await surface.locator('.native-follow').click();
    await expect.poll(async () => (await state())[3]).toBe(true);
    await expect(surface.getByRole('button', { name: '取消关注 UP 主', exact: true })).toHaveAttribute('data-label', '已关注');
    await surface.locator('.native-follow').click();
    await expect.poll(async () => (await state())[3]).toBe(false);
    await surface.locator('.native-like').click();
    await expect.poll(async () => (await state())[7].likeStatus).toBe(true);
    await surface.locator('.native-triple').click();
    await expect.poll(async () => (await state())[7]).toMatchObject({ likeStatus: true, coinStatus: true, collectStatus: true });
    expect(requests.map(r => r.path)).toEqual(['/x/relation/modify', '/x/relation/modify', '/x/web-interface/archive/like', '/x/web-interface/archive/like/triple']);
    expect(requests.slice(0, 2).map(r => r.body.act)).toEqual(['1', '2']);
    expect(await page.evaluate(() => window.__nativeActions.callbacks)).toHaveLength(4);
    expect(await page.evaluate(() => window.__mockPlayback.paused)).toBe(pausedBefore);
    expect(errors).toEqual([]);
  });

  test(`${kind} native coin and favorite open existing dialogs before submitting`, async ({ page, context }) => {
    const { errors, requests, surface, state } = await openPlayer(page, context, kind);
    if (kind === 'home') await surface.locator(`#${A}-dialog`).evaluate(el => el.requestFullscreen());
    await surface.locator('.native-coin').click();
    const coin = surface.getByRole('dialog', { name: '投币', exact: true });
    await expect(coin).toBeVisible();
    expect(requests).toHaveLength(0);
    await coin.getByRole('button', { name: '确定', exact: true }).click();
    await expect.poll(async () => (await state())[7].coinStatus).toBe(true);
    await surface.locator('.native-collect').click();
    const favorite = surface.getByRole('dialog', { name: '添加到收藏夹', exact: true });
    await expect(favorite).toBeVisible();
    await favorite.getByText('默认收藏夹', { exact: true }).click();
    await expect(favorite.getByRole('checkbox', { name: /默认收藏夹/ })).toBeChecked();
    await favorite.getByRole('button', { name: '确定', exact: true }).click();
    await expect.poll(async () => (await state())[7].collectStatus).toBe(true);
    expect(requests.map(r => r.path)).toEqual(['/x/web-interface/coin/add', '/x/v3/fav/resource/deal']);
    expect(errors).toEqual([]);
  });
}

test('failed native follow/like operations preserve state and invoke failure callbacks', async ({ page, context }) => {
  const { errors, requests, responses, surface, state } = await openPlayer(page, context);
  responses.fail = true;
  await surface.locator('.native-follow').click();
  await expect.poll(() => page.evaluate(() => window.__nativeActions.callbacks.length)).toBe(1);
  await surface.locator('.native-like').click();
  await expect.poll(() => page.evaluate(() => window.__nativeActions.callbacks.length)).toBe(2);
  expect(await state()).toMatchObject({ 3: false, 7: { likeStatus: false, coinStatus: false, collectStatus: false } });
  await expect(surface.locator('.native-follow')).toHaveAttribute('data-followed', 'false');
  expect(await page.evaluate(() => window.__nativeActions.callbacks.every(r => !r.ok && r.message.includes('模拟操作失败')))).toBe(true);
  expect(requests).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('native triple hold cancellation and closing never submit a triple request', async ({ page, context }) => {
  const { errors, requests, emit } = await openPlayer(page, context);
  await emit(2, { action: 'cancel' });
  await emit(2, { action: 'start' });
  await emit(2, { action: 'cancel' });
  await page.waitForTimeout(800);
  expect(requests).toHaveLength(0);
  await emit(2, { action: 'start' });
  await page.evaluate(() => window.__biliPopupPlayerNano.close());
  await page.waitForTimeout(800);
  expect(requests).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('a follow response for the previous video never follows the next video owner', async ({ page, context }) => {
  const { errors, requests, responses, surface } = await openPlayer(page, context);
  await page.route('**/x/web-interface/wbi/view/detail?**', route => {
    if (!route.request().url().includes('BV1test003')) return route.fallback();
    return route.fulfill({ json: { code: 0, data: { View: {
      aid: 201, bvid: 'BV1test003', cid: 303, title: '下一站，慢慢走', owner: { mid: 101, name: '另一位 UP 主' },
      pages: [{ page: 1, cid: 303, part: '下一站，慢慢走', duration: 180 }], req_user: { attention: 0 },
    }, Related: [] } } });
  });
  responses.holdFollow = true;
  await surface.locator('.native-follow').click();
  await expect.poll(() => requests.length).toBe(1);
  await surface.getByRole('tab', { name: '相关推荐', exact: true }).click();
  await surface.getByRole('button', { name: '播放：下一站，慢慢走', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__biliPopupPlayerNano.getState().home.bootstrap.playerInfo.aid)).toBe(201);
  await responses.pendingRoute.fulfill({ json: { code: 0 } });
  await expect.poll(() => page.evaluate(() => window.__biliPopupPlayerNano.getState().home.followBusy)).toBe(false);
  expect(await page.evaluate(() => window.__biliPopupPlayerNano.getState().home.bootstrap.initialState.videoData.req_user.attention)).toBe(0);
  expect(errors).toEqual([]);
});
