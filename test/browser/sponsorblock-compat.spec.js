import { test, expect } from '@playwright/test';
import { APP, cardButton, loadFixture, mockPlayback } from './fixture.js';

// Contract taken from BilibiliSponsorBlock 0.17.1's document/document.ts and
// player/PlayerSurface.ts. The host bridge deliberately returns stale metadata.
async function setup(page, path = '/') {
  const errors = await loadFixture(page, path);
  await mockPlayback(page);
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'bilibili-player';
    const externalVideo = document.querySelector('#bofqi video');
    externalVideo.before(host);
    host.append(externalVideo);
    window.__originalHost = host;
    window.__originalState = window.__INITIAL_STATE__ = { bvid: 'BV1original', cid: 101, upData: { mid: 999 } };
    window.__originalPlayer = window.player = { getManifest: () => ({ bvid: 'BV1original', cid: 101 }) };
    window.__sbResponses = [];
    window.__sbHostRequests = [];
    window.__sbNavigation = [];
    window.addEventListener('message', event => {
      const data = event.data;
      if (data?.source === 'sponsorblock' && data.type === 'navigation') window.__sbNavigation.push(data);
      if (data?.source !== 'biliSponsorBlock') return;
      if (!data.responseType) { window.__sbResponses.push(data); return; }
      window.__sbHostRequests.push(data);
      const value = data.type === 'getBvID' ? 'BV1original+101' : data.type === 'getVideoInfoOnplayer' ? window.player.getManifest() : 'host';
      window.postMessage({ source: 'biliSponsorBlock', type: data.responseType, id: data.id, data: value }, location.origin);
    });
    const create = window.nano.createPlayer;
    window.nano.createPlayer = setting => {
      const player = create(setting);
      let current = setting;
      const render = () => {
        player.connect();
        const doc = current.element.ownerDocument;
        const area = doc.createElement('div');
        area.className = 'bpx-player-video-area';
        const video = doc.createElement('video');
        Object.defineProperties(video, { duration: { get: () => 180 }, readyState: { get: () => 4 } });
        video.dataset.cid = current.cid;
        area.append(video);
        current.element.firstElementChild.append(area);
      };
      return { ...player, connect: render, reload(next) { current = next; render(); } };
    };
  });
  return errors;
}

async function request(page, type = 'getBvID', responseType = 'returnBvID', payload) {
  return page.evaluate(({ type, responseType, payload }) => new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => { window.removeEventListener('message', listener); reject(new Error(`No response for ${type}`)); }, 2000);
    const listener = event => {
      if (event.data?.source !== 'biliSponsorBlock' || event.data.id !== id || event.data.type !== responseType) return;
      clearTimeout(timer);
      window.removeEventListener('message', listener);
      const value = event.data.data;
      resolve(value instanceof Map ? [...value] : value);
    };
    window.addEventListener('message', listener);
    window.postMessage({ source: 'biliSponsorBlock', type, responseType, id, payload }, location.origin);
  }), { type, responseType, payload });
}

async function openHome(page) {
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
}

test('without SponsorBlock the native player ID and globals are untouched', async ({ page }) => {
  const errors = await setup(page);
  await openHome(page);
  expect(await page.evaluate(() => ({
    original: document.getElementById('bilibili-player') === window.__originalHost,
    state: window.__INITIAL_STATE__ === window.__originalState,
    player: window.player === window.__originalPlayer,
  }))).toEqual({ original: true, state: true, player: true });
  expect(errors).toEqual([]);
});

for (const detect of ['before opening', 'after opening']) {
  test(`home media and metadata match when SponsorBlock is detected ${detect}`, async ({ page }) => {
    const errors = await setup(page);
    if (detect === 'before opening') expect(await request(page)).toBe('BV1original+101');
    await openHome(page);
    expect(await request(page)).toBe('BV1test002+301');
    expect(await request(page, 'getVideoInfoOnplayer', 'returnVideoInfo')).toEqual({ aid: 200, bvid: 'BV1test002', cid: 301, p: 1 });
    expect(await request(page, 'getChannelID', 'returnChannelID')).toBe(100);
    expect(await request(page, 'getDescription', 'returnDescription')).toBe('在日常里，发现新的视角。');
    expect(await request(page, 'getCidMap', 'returnCidMap', 'BV1test002')).toEqual([[1, 301], [2, 302]]);
    expect(await request(page, 'getCidFromBvid', 'returnCidFromBvid', { bvid: 'BV1test002', page: 2 })).toBe(302);
    expect(await request(page, 'getCidFromBvid', 'returnCidFromBvid', { bvid: 'BV1another', page: 1 })).toBe('host');
    const selected = await page.evaluate(() => {
      // Same selector and exclusion rules as PagePlayerSurface.findVideo().
      const video = [...document.querySelectorAll('#bilibili-player video')].find(video =>
        !video.classList.contains('bpx-player-seamless-replacement') && !video.closest('.v-recommend-inline-player'));
      video.currentTime = 60;
      return {
        cid: video.dataset.cid, time: video.currentTime, hostTime: window.__originalHost.querySelector('video').currentTime,
        roots: document.querySelectorAll('#bilibili-player').length,
        globals: window.__INITIAL_STATE__ === window.__originalState && window.player === window.__originalPlayer,
      };
    });
    expect(selected).toEqual({ cid: '301', time: 60, hostTime: 0, roots: 1, globals: true });
    await expect.poll(() => page.evaluate(() => window.__sbNavigation.at(-1)?.videoID)).toBe('BV1test002+301');
    expect(await page.evaluate(() => {
      const counts = new Map();
      for (const response of window.__sbResponses) counts.set(response.id, (counts.get(response.id) || 0) + 1);
      return [...counts.values()].every(count => count === 1);
    })).toBe(true);
    expect(errors).toEqual([]);
  });
}

for (const close of ['close', 'disable', 'destroy']) {
  test(`${close} restores the host ID and stops overriding metadata; reopening has one response`, async ({ page }) => {
    const errors = await setup(page);
    await request(page);
    await openHome(page);
    expect(await request(page)).toBe('BV1test002+301');
    await page.evaluate(close => {
      const api = window.__biliPopupPlayerNano;
      if (close === 'disable') api.setEnabled(false);
      else api[close]();
    }, close);
    expect(await page.evaluate(() => document.getElementById('bilibili-player') === window.__originalHost)).toBe(true);
    expect(await request(page)).toBe('BV1original+101');
    if (close !== 'destroy') {
      if (close === 'disable') await page.evaluate(() => window.__biliPopupPlayerNano.setEnabled(true));
      await openHome(page);
      expect(await request(page)).toBe('BV1test002+301');
    }
    expect(errors).toEqual([]);
  });
}

test('new host roots are reserved and site changes to their IDs survive cleanup', async ({ page }) => {
  const errors = await setup(page);
  await request(page);
  await openHome(page);
  await page.evaluate(() => {
    window.__newHost = document.createElement('div');
    window.__newHost.id = 'bilibili-player';
    document.querySelector('#bofqi').append(window.__newHost);
  });
  await expect(page.locator('#bilibili-player')).toHaveCount(1);
  await page.evaluate(() => {
    window.__originalHost.id = 'site-renamed-player';
    window.__biliPopupPlayerNano.close();
  });
  expect(await page.evaluate(() => [window.__originalHost.id, window.__newHost.id])).toEqual(['site-renamed-player', 'bilibili-player']);
  expect(errors).toEqual([]);
});

test('native internal part changes update the bridge without reloading the player', async ({ page }) => {
  const errors = await setup(page);
  await request(page);
  await page.evaluate(() => {
    const create = window.nano.createPlayer;
    window.nano.EventType.Player_Committed = 'committed';
    window.nano.createPlayer = setting => {
      const player = create(setting), listeners = new Set();
      let manifest = { aid: setting.aid, bvid: setting.bvid, cid: setting.cid, p: 1 };
      window.__changeNativePart = (p = 2) => {
        manifest = { ...manifest, cid: p === 2 ? 302 : 301, p };
        setting.element.querySelector('video').dataset.cid = String(manifest.cid);
        for (const listener of listeners) listener();
      };
      return { ...player, getManifest: () => manifest,
        on(type, listener) { if (type === 'committed') listeners.add(listener); },
        off(type, listener) { listeners.delete(listener); },
      };
    };
  });
  await openHome(page);
  await page.evaluate(() => window.__changeNativePart());
  await expect.poll(() => request(page)).toBe('BV1test002+302');
  expect(await request(page, 'getVideoInfoOnplayer', 'returnVideoInfo')).toEqual({ aid: 200, bvid: 'BV1test002', cid: 302, p: 2 });
  expect(await page.evaluate(() => window.__mockPlayback.created)).toBe(1);
  await page.evaluate(() => {
    window.__biliPopupPlayerNano.close();
    window.__changeNativePart(1);
  });
  // Late native events from the retained instance must not reclaim a closed UI.
  await expect.poll(() => page.evaluate(() => window.__biliPopupPlayerNano.getState().home.navigateSyncTimer)).toBe(0);
  expect(await page.evaluate(() => window.__biliPopupPlayerNano.getState().home.bootstrap.playerInfo.cid)).toBe(302);
  await expect(page).toHaveURL('https://www.bilibili.com/');
  expect(await request(page)).toBe('BV1original+101');
  expect(await page.evaluate(() => document.getElementById('bilibili-player') === window.__originalHost)).toBe(true);
  expect(errors).toEqual([]);
});

test('native playback-page media stays paused while the popup receives skip seeks', async ({ page }) => {
  const errors = await setup(page, '/video/BV1original/');
  await request(page);
  await openHome(page);
  expect(await request(page)).toBe('BV1test002+301');
  const identity = await page.evaluate(() => {
    const video = document.querySelector('#bilibili-player video');
    video.currentTime = 60;
    return { cid: video.dataset.cid, hostTime: window.__originalHost.querySelector('video').currentTime };
  });
  expect(identity).toEqual({ cid: '301', hostTime: 0 });
  await page.evaluate(() => window.__biliPopupPlayerNano.close());
  expect(await request(page)).toBe('BV1original+101');
  expect(await page.evaluate(() => document.getElementById('bilibili-player') === window.__originalHost)).toBe(true);
  expect(errors).toEqual([]);
});

test('switching to Document PiP routes identity to its current part and releases it on close', async ({ page, context }) => {
  const errors = await setup(page);
  test.skip(!await page.evaluate(() => typeof window.documentPictureInPicture?.requestWindow === 'function'), 'Document PiP unavailable');
  await request(page);
  await openHome(page);
  expect(await request(page)).toBe('BV1test002+301');
  await context.route('https://s1.hdslb.com/**', route => route.abort());
  await page.evaluate(() => {
    const api = window.documentPictureInPicture, original = api.requestWindow;
    api.requestWindow = function (options) {
      return original.call(this, options).then(win => {
        win.nano = window.nano; win.BiliComments = window.BiliComments;
        return win;
      });
    };
  });
  await page.getByRole('button', { name: '切换到独立小窗', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__biliPopupPlayerNano.getState().pip.player))).toBe(true);
  expect(await request(page)).toBe('BV1test002+301');
  expect(await page.evaluate(() => document.getElementById('bilibili-player') === window.__originalHost)).toBe(true);
  // Switching parts reloads the player while keeping the same PiP window.
  await page.evaluate(() => {
    const state = window.__biliPopupPlayerNano.getState();
    const part = state.pip.win.document.querySelector('[data-cid="302"]');
    if (!part) throw new Error('Second part missing');
    part.click();
  });
  await expect.poll(() => request(page)).toBe('BV1test002+302');
  await page.evaluate(() => window.documentPictureInPicture.window.close());
  expect(await request(page)).toBe('BV1test002+301');
  expect(await page.evaluate(() => document.getElementById('bilibili-player') === window.__originalHost)).toBe(false);
  await page.evaluate(() => window.__biliPopupPlayerNano.close());
  expect(await request(page)).toBe('BV1original+101');
  expect(errors).toEqual([]);
});
