import { test, expect } from '@playwright/test';
import { APP as A, cardButton, loadFixture, mockPlayback } from './fixture.js';

for (const kind of ['home', 'pip']) for (const layout of ['right', 'bottom']) {
  test(`${kind} ${layout} playlist keeps card positions when last-played moves`, async ({ page, context }, testInfo) => {
    const errors = await loadFixture(page, '/video/BV1test001/');
    await mockPlayback(page);
    const cards = Array.from({ length: 5 }, (_, index) => ({
      bvid: 'BV1test00' + (index + 2), aid: index + 200, cid: index + 300,
      title: index % 2 ? '有两行标题的视频：一起在日常生活里发现有趣的事物' : '留一点时间给自己',
      desc: '在日常里，发现新的视角', pic: '', owner: { mid: 100, name: '日常观察室' }, stat: { view: 10240, danmaku: 120 },
    }));
    await context.route('https://api.bilibili.com/**', route => route.fulfill({ json: { code: 0, data: {} } }));
    await page.route('https://api.bilibili.com/**', route => {
      const url = new URL(route.request().url()), card = cards.find(card => card.bvid === url.searchParams.get('bvid')) || cards[0];
      const pages = [{ cid: card.cid, page: 1, part: card.title, duration: 180 }];
      return route.fulfill({ json: { code: 0, data: url.pathname.includes('/pagelist') ? pages : url.pathname.includes('/view/detail') ? { View: { ...card, pages }, Related: [] } : {} } });
    });
    await page.evaluate(cards => {
      document.querySelector('.cards').innerHTML = cards.map(card => `<article class="bili-video-card" style="width:238px">
        <a class="cover" href="/video/${card.bvid}/" title="${card.title}"><img alt="${card.title}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3Crect width='320' height='180' fill='%238dacb1'/%3E%3C/svg%3E">
          <span class="bili-video-card__stats--text">1万</span><span class="bili-video-card__stats--text">120</span><span class="bili-video-card__stats__duration">03:00</span>
        </a><h3 class="bili-video-card__info--tit" title="${card.title}"><a href="/video/${card.bvid}/">${card.title}</a></h3><span class="bili-video-card__info--author">日常观察室</span></article>`).join('');
      window.__biliPopupPlayerNano.scan();
    }, cards);
    let surface = page;
    if (kind === 'pip') {
      await context.route('https://s1.hdslb.com/**', route => route.abort());
      await page.evaluate(() => Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: {
        requestWindow() {
          const win = window.open('about:blank', '_blank', 'popup,width=1000,height=700');
          win.nano = window.nano; win.BiliComments = window.BiliComments;
          return Promise.resolve(win);
        },
      } }));
      const ready = page.waitForEvent('popup');
      await page.locator('.' + A + '__playback-pip-button').click();
      surface = await ready;
      surface.on('pageerror', error => errors.push(error.message));
    } else {
      await page.locator('.cards .cover').first().hover();
      await cardButton(page, cards[0].bvid).click();
    }
    await expect(surface.getByText('播放器测试画面', { exact: false })).toBeVisible();
    if (layout === 'bottom') {
      await surface.locator(kind === 'home' ? `#${A}-player` : '#bilibili-player').evaluate(root => {
        const button = document.createElement('button');
        button.className = 'bpx-player-ctrl-wide'; button.textContent = '切换布局';
        button.style.cssText = 'position:absolute;bottom:20px;left:20px';
        root.append(button);
      });
      await surface.locator('.bpx-player-ctrl-wide').click();
      if (kind === 'home') await expect(surface.locator('#' + A + '-overlay')).not.toHaveAttribute('data-layout-animating', 'true');
    } else await surface.getByRole('tab', { name: '播放列表', exact: true }).click();
    const list = surface.locator(kind === 'home' ? `#${A}-playlist-list` : '#playlist-list');
    const items = list.locator('.' + A + '__playlist-card');
    await expect(items).toHaveCount(cards.length);
    const geometry = () => items.evaluateAll(items => items.map(el => {
      const rect = el.getBoundingClientRect(), list = el.parentElement;
      return { y: rect.y - list.getBoundingClientRect().y + list.scrollTop, height: rect.height };
    }));
    const initial = await geometry();
    // Watch every animation frame during real selection/loading transitions,
    // not just the final settled layout after the marker has moved.
    await list.evaluate(el => {
      window.__playlistHeights = [];
      window.__samplePlaylist = true;
      const sample = () => {
        window.__playlistHeights.push([...el.children].map(item => item.getBoundingClientRect().height));
        if (window.__samplePlaylist) requestAnimationFrame(sample);
      };
      sample();
    });
    for (const [previous, next] of [[0, 1], [1, 2], [2, 0]]) {
      await items.nth(next).click();
      await expect(list.locator(`[data-bvid="${cards[previous].bvid}"] .${A}__playlist-last-played`)).toHaveText('上次播放');
      await expect(list.locator('.' + A + '__playlist-last-played')).toHaveCount(1);
      const marker = list.locator('.' + A + '__playlist-last-played');
      const badgeBox = await marker.boundingBox(), coverBox = await marker.locator('..').boundingBox();
      expect(badgeBox.x).toBeGreaterThan(coverBox.x);
      expect(badgeBox.y).toBeGreaterThan(coverBox.y);
      expect(badgeBox.y + badgeBox.height).toBeLessThan(coverBox.y + coverBox.height);
      expect(await geometry()).toEqual(initial);
    }
    const frames = await surface.evaluate(() => { window.__samplePlaylist = false; return window.__playlistHeights; });
    for (const heights of frames) expect(heights).toEqual(initial.map(item => item.height));
    await list.screenshot({ path: testInfo.outputPath('playlist.png') });
    expect(errors).toEqual([]);
    if (kind === 'pip') await surface.close();
  });
}
