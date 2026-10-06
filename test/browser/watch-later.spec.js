import { test, expect } from '@playwright/test';
import { APP, loadFixture, mockPlayback } from './fixture.js';

// Native URLs/card classes: watchlater's index.b6f87aaf / 374.afee6aad bundles.
// BewlyBewly: WatchLater.vue and WatchLaterPop.vue at d421435.
async function loadWatchLater(page, shadow) {
  const errors = await loadFixture(page, '/watchlater/list', { disabled: true });
  await mockPlayback(page);
  await page.evaluate(({ shadow }) => {
    const cover = document.querySelector('#card-b img').src;
    document.querySelector('main').style.display = 'none';
    const host = document.createElement('div'); host.id = 'watch-later-fixture';
    const root = shadow ? host.attachShadow({ mode: 'open' }) : host;
    root.innerHTML = `<style>
      #later-scroll{height:320px;overflow:auto;padding:20px;width:650px}
      .later-row{display:flex;gap:16px;margin-bottom:20px;width:600px;color:inherit;text-decoration:none}
      .later-row img{display:block;width:100%;height:100%}
      .later-row .cover,[aspect-video]{display:block;position:relative;width:238px;height:134px;flex-shrink:0}
      .later-row h3{margin:8px 0;font-size:16px}.later-row .remove{position:absolute;right:4px;top:4px}
      .progress{position:absolute;bottom:0;height:5px;width:100%;background:#f69}
    </style><div id="later-scroll"></div>`;
    for (let i = 0; i < 3; i++) {
      const bvid = i ? `BV1later00${i}` : 'BV1test002';
      const href = `/list/watchlater/?bvid=${bvid}&oid=${200 + i}&watchlater_cfg=%7B%7D`;
      const row = document.createElement(shadow ? 'a' : 'article');
      row.id = `later-${i}`; row.className = shadow ? 'later-row group' : 'later-row video-card';
      if (shadow) row.href = href;
      row.innerHTML = shadow
        ? `<div aspect-video><img src="${cover}" alt="稍后视频 ${i}"><div class="progress"></div><button class="remove">移除</button></div><section><h3>稍后视频 ${i}</h3></section>`
        : `<a class="cover" href="${href}"><img src="${cover}"><button class="remove">移除</button></a><section><a class="title" href="${href}">稍后视频 ${i}</a></section>`;
      row.querySelector('.remove').addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); row.remove(); });
      root.querySelector('#later-scroll').append(row);
    }
    const all = document.createElement('a'); all.id = 'play-all'; all.href = '/list/watchlater'; all.textContent = '播放全部';
    root.append(all); document.body.append(host);
    window.__biliPopupPlayerNano.setEnabled(true);
  }, { shadow });
  return errors;
}

const button = (page, key = 'BV1test002') => page.locator(`button.${APP}__button[data-key="${key}"]`);

for (const shadow of [false, true]) {
  test(`${shadow ? 'BewlyBewly' : 'native'} watch-later cards play the selected video and retain the list`, async ({ page }) => {
    const errors = await loadWatchLater(page, shadow);
    await page.locator('#later-0 img').hover();
    await expect(button(page)).toBeVisible();
    await button(page).click();
    await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
    const cards = await page.evaluate(() => window.__biliPopupPlayerNano.getState().home.playlistCards);
    expect(cards.map(card => card.bvid)).toEqual(['BV1test002', 'BV1later001', 'BV1later002']);
    expect(cards[0]).toMatchObject({ title: '稍后视频 0', href: 'https://www.bilibili.com/video/BV1test002/' });
    expect(new URL(page.url()).pathname).toBe('/watchlater/list');
    await expect(page.locator('#later-0')).toBeAttached();
    expect(errors).toEqual([]);
  });

  test(`${shadow ? 'BewlyBewly' : 'native'} watch-later cards refresh after scrolling, recycling and removal`, async ({ page }) => {
    const errors = await loadWatchLater(page, shadow);
    await page.locator('#later-0 img').hover();
    await expect(button(page)).toBeVisible();
    await page.locator('#later-scroll').evaluate(el => { el.scrollTop = 200; });
    await expect(button(page)).toBeHidden();
    await page.locator('#later-scroll').evaluate(el => { el.scrollTop = 0; });
    await expect(button(page)).toBeVisible();
    await page.locator('#later-0').evaluate(row => {
      const links = row.matches('a') ? [row] : [...row.querySelectorAll('a')];
      for (const link of links) link.href = '/list/watchlater?bvid=BV1recycled';
    });
    await expect(button(page, 'BV1recycled')).toHaveCount(1);
    await expect(button(page)).toHaveCount(0);
    await page.locator('#later-0 .remove').click();
    await expect(button(page, 'BV1recycled')).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: '小窗播放器', exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
