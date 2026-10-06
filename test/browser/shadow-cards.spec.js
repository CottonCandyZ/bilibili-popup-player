import { test, expect } from '@playwright/test';
import { APP, cardButton, loadFixture, mockPlayback } from './fixture.js';

// Mirrors BewlyCat's open root, separate scroller, nested title link, preview
// siblings and cover statistics. All links and media remain local fixtures.
async function loadShadowCards(page) {
  const errors = await loadFixture(page, '/', { disabled: true });
  await mockPlayback(page);
  await page.evaluate(() => {
    const cover = document.querySelector('#card-b img').src;
    document.querySelector('main').style.display = 'none';
    document.querySelector('header').style.display = 'none';
    const host = document.createElement('div');
    host.id = 'bewly';
    host.style.cssText = 'position:fixed;inset:0;background:#eee';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      *{box-sizing:border-box}a{color:inherit;text-decoration:none}
      #viewport{height:100vh;overflow:auto;padding:24px}
      #grid{display:grid;grid-template-columns:repeat(3,238px);gap:30px;width:max-content}
      .video-card{position:relative;width:238px}
      [data-layout-edit-target="video-card-cover"]{position:relative;width:238px;height:134px;overflow:hidden}
      picture,img{display:block;width:100%;height:100%}
      .preview{position:absolute;inset:0;background:#1231}
      .video-card-cover-stats{position:absolute;bottom:0;left:0;right:0;color:white;pointer-events:none}
      h3{font:14px system-ui;margin:8px 0}.channel-name{font:12px system-ui}
      .watch-later{position:absolute;top:0;right:0}.spacer{height:1000px}
    </style><div id="viewport"><div id="grid"></div><div class="spacer"></div></div>`;
    for (let index = 0; index < 15; index++) {
      const bvid = index ? `BV1shadow${index}` : 'BV1test002';
      const card = document.createElement('div');
      card.id = `shadow-card-${index}`;
      card.className = 'video-card';
      card.innerHTML = `<a href="/video/${bvid}/"><div data-layout-edit-target="video-card-cover"><picture><img src="${cover}" alt=""></picture><div class="preview"></div><button class="watch-later">稍后再看</button><div class="video-card-cover-stats"><span class="cover-stat-view"><span class="video-card-cover-stats__value">1.2万</span></span><span class="cover-stat-danmaku"><span class="video-card-cover-stats__value">345</span></span><span class="video-card-cover-stats__item--duration">03:25</span></div></div><h3 class="video-card-title" title="扩展卡片 ${index}"><a href="/video/${bvid}/">扩展卡片 ${index}</a></h3><a class="channel-name" href="https://space.bilibili.com/123">测试作者</a></a>`;
      card.querySelectorAll('a[href*="/video/"]').forEach(link => link.addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation();
        window.__nativeCardClicks = (window.__nativeCardClicks || 0) + 1;
      }));
      root.querySelector('#grid').append(card);
    }
    document.body.append(host);
    window.__biliPopupPlayerNano.setEnabled(true);
  });
  return errors;
}

const button = (page, key = 'BV1test002') => page.locator(`button.${APP}__button[data-key="${key}"]`);
const cover = page => page.locator('#shadow-card-0 [data-layout-edit-target="video-card-cover"]');

for (const path of ['/c/douga/', '/v/popular/all', '/v/channel/3', '/list/123', '/festival/example']) {
  test(`ordinary video cards work outside the old path whitelist: ${path}`, async ({ page }) => {
    const errors = await loadFixture(page, path);
    await page.locator('#card-b .cover').hover();
    await expect(cardButton(page, 'BV1test002')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('Bewly-style previews open the popup with complete playlist metadata', async ({ page }) => {
  const errors = await loadShadowCards(page);
  await cover(page).hover();
  await expect(button(page)).toBeVisible();
  await expect(button(page)).toHaveAccessibleName('小窗播放：扩展卡片 0');
  await button(page).click();
  await expect(page.getByRole('dialog', { name: '小窗播放器', exact: true })).toBeVisible();
  const playlist = await page.evaluate(() => window.__biliPopupPlayerNano.getState().home.playlistCards);
  expect(playlist).toHaveLength(15);
  expect(playlist[0]).toMatchObject({ title: '扩展卡片 0', subtitle: '测试作者', duration: '03:25', stats: '1.2万 345' });
  expect(await page.evaluate(() => window.__nativeCardClicks || 0)).toBe(0);
  expect(errors).toEqual([]);
});

for (const layout of ['vertical', 'horizontal']) {
  test(`BewlyBewly ${layout} covers support preview clicks and card actions`, async ({ page }) => {
    const errors = await loadShadowCards(page);
    // VideoCard.vue / Picture.vue in BewlyBewly/BewlyBewly at d421435:
    // the preview video is a sibling of picture inside a *-card-cover div.
    await page.locator('#shadow-card-0').evaluate((card, layout) => {
      const cover = card.querySelector('[data-layout-edit-target]');
      cover.removeAttribute('data-layout-edit-target');
      cover.className = `${layout}-card-cover`;
      cover.style.cssText = 'position:relative;width:238px;height:134px';
      const video = document.createElement('video');
      video.className = 'preview';
      video.style.cssText = 'width:100%;height:100%;pointer-events:auto';
      cover.querySelector('.preview').replaceWith(video);
      card.querySelector('h3').removeAttribute('class');
      card.querySelector('h3').removeAttribute('title');
      card.querySelector('h3 a').title = '扩展卡片 0';
    }, layout);
    await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
    await page.getByRole('switch', { name: '点击封面播放', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.locator('#shadow-card-0 .watch-later').click();
    expect(await page.evaluate(() => window.__nativeCardClicks)).toBe(1);
    await page.locator('#shadow-card-0 .preview').click({ position: { x: 80, y: 50 } });
    await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => window.__nativeCardClicks)).toBe(1);
    expect(errors).toEqual([]);
  });
}

test('composed cover clicks respect normal links, modifiers and card actions', async ({ page }) => {
  await loadShadowCards(page);
  await cover(page).click({ position: { x: 60, y: 40 } });
  expect(await page.evaluate(() => window.__nativeCardClicks)).toBe(1);
  await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await page.getByRole('switch', { name: '点击封面播放', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.locator('#shadow-card-0 .watch-later').click();
  expect(await page.evaluate(() => window.__nativeCardClicks)).toBe(2);
  await cover(page).click({ position: { x: 60, y: 40 }, modifiers: ['Control'] });
  expect(await page.evaluate(() => window.__nativeCardClicks)).toBe(3);
  await cover(page).click({ position: { x: 60, y: 40 } });
  await expect(page.getByRole('dialog', { name: '小窗播放器', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__nativeCardClicks)).toBe(3);
  await page.getByRole('button', { name: '关闭播放器', exact: true }).click();
  await cover(page).hover();
  await button(page).click();
  expect(await page.evaluate(() => window.__nativeCardClicks)).toBe(4);
  await expect(page.getByRole('dialog', { name: '小窗播放器', exact: true })).toBeHidden();
});

test('shadow scrolling updates a stationary hover and never leaks controls through layers', async ({ page }) => {
  await loadShadowCards(page);
  await cover(page).hover();
  await expect(button(page)).toBeVisible();
  await page.evaluate(() => { document.querySelector('#bewly').shadowRoot.querySelector('#viewport').scrollTop = 200; });
  await expect(button(page)).toBeHidden();
  await page.evaluate(() => { document.querySelector('#bewly').shadowRoot.querySelector('#viewport').scrollTop = 0; });
  await expect(button(page)).toBeVisible();
  for (const shadow of [false, true]) {
    await page.evaluate(shadow => {
      const layer = document.createElement('div');
      layer.id = 'occluder'; layer.style.cssText = 'position:fixed;inset:0;background:#0003;z-index:100';
      (shadow ? document.querySelector('#bewly').shadowRoot : document.body).append(layer);
    }, shadow);
    await expect(button(page)).toBeHidden();
    await page.locator('#occluder').evaluate(element => element.remove());
    await expect(button(page)).toBeVisible();
  }
  await page.locator('#bewly').evaluate(element => { element.style.height = '90px'; element.style.overflow = 'hidden'; });
  await expect(button(page)).toBeHidden();
});

test('late nested roots, recycled cards and re-enable retain exactly one live binding', async ({ page }) => {
  const errors = await loadShadowCards(page);
  await page.evaluate(() => {
    const root = document.querySelector('#bewly').shadowRoot;
    const host = document.createElement('section'); host.id = 'nested-host';
    root.querySelector('#grid').prepend(host);
    const nested = host.attachShadow({ mode: 'open' });
    nested.append(root.querySelector('style').cloneNode(true), root.querySelector('#shadow-card-0'));
  });
  await cover(page).hover();
  await expect(button(page)).toBeVisible();
  await page.locator('#shadow-card-0 a[href*="/video/"]').evaluateAll(links => links.forEach(link => { link.href = '/video/BV1recycled/'; }));
  await expect(button(page, 'BV1recycled')).toHaveCount(1);
  await expect(button(page)).toHaveCount(0);
  await page.evaluate(() => { window.__biliPopupPlayerNano.setEnabled(false); });
  await expect(button(page, 'BV1recycled')).toHaveCount(0);
  await page.evaluate(() => { window.__biliPopupPlayerNano.setEnabled(true); });
  await expect(button(page, 'BV1recycled')).toHaveCount(1);
  await page.locator('#nested-host').evaluate(element => element.remove());
  await expect(button(page, 'BV1recycled')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('shadow boundaries do not bypass excluded dialogs and episode lists', async ({ page }) => {
  await loadShadowCards(page);
  await page.locator('#bewly').evaluate(element => { element.setAttribute('role', 'dialog'); });
  await page.evaluate(() => window.__biliPopupPlayerNano.scan());
  await expect(button(page)).toHaveCount(0);
  await page.locator('#bewly').evaluate(element => { element.removeAttribute('role'); element.className = 'ep-list'; });
  await page.evaluate(() => window.__biliPopupPlayerNano.scan());
  await expect(button(page)).toHaveCount(0);
});

test('cached shadow panels become playable again after only their visibility changes', async ({ page }) => {
  await page.clock.install();
  await loadShadowCards(page);
  // Exhaust startup retries so they cannot mask a missing visibility rescan.
  await page.clock.runFor(13000);
  await cover(page).hover();
  await expect(button(page)).toBeVisible();
  // A route update can scan while Vue keeps a hidden list mounted.
  await page.locator('#viewport').evaluate(element => { element.style.display = 'none'; });
  await page.evaluate(() => window.__biliPopupPlayerNano.scan());
  await expect(button(page)).toHaveCount(0);
  await page.clock.runFor(1000);
  await page.clock.resume();
  await page.locator('#viewport').evaluate(element => { element.style.display = ''; });
  await expect(button(page)).toBeVisible();
});

test('portrait anime cards include their rank overlay without treating episode cells as covers', async ({ page }) => {
  await loadShadowCards(page);
  await page.locator('#shadow-card-0').evaluate(card => {
    const img = card.querySelector('img');
    card.replaceChildren();
    const link = document.createElement('a'); link.href = '/bangumi/play/ss123';
    const poster = document.createElement('div'); poster.setAttribute('aspect', '12/16');
    poster.style.cssText = 'position:relative;width:220px;height:293px';
    poster.append(img);
    const rank = document.createElement('span');
    rank.style.cssText = 'position:absolute;inset:auto 0 0;height:120px;background:#0004';
    rank.textContent = '1'; poster.append(rank);
    link.append(poster); card.append(link);
  });
  await page.locator('#shadow-card-0 [aspect]').hover();
  await expect(button(page, 'ogv:ss:123')).toBeVisible();
});
