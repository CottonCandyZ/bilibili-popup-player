import { test, expect } from '@playwright/test';
import { APP as A, cardButton, loadFixture, mockPlayback } from './fixture.js';

async function prepare(page) {
  const errors = await loadFixture(page, '/video/BV1test001/');
  await mockPlayback(page);
  return errors;
}

async function openHome(page) {
  await page.locator('#card-b .cover').hover();
  await cardButton(page, 'BV1test002').click();
  await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
}

for (const kind of ['home', 'pip']) test(`${kind} sidebar loads comments below the fold without scrolling`, async ({ page, context }) => {
  const errors = await prepare(page);
  // Model the SDK's lazy-loading contract, with comments below a long intro.
  await page.evaluate(() => {
    window.BiliComments = class {
      constructor(props) { this.props = props; }
      mount(element) {
        this.mountElement = element;
        const doc = element.ownerDocument, win = doc.defaultView;
        const intro = element.previousElementSibling;
        intro.style.cssText = 'min-height:1500px;flex-shrink:0';
        this.content = doc.createElement('div');
        this.content.style.height = '100px';
        element.append(this.content);
        const load = () => { this.content.textContent = '评论已请求'; this.observer?.disconnect(); };
        if (!this.props.lazyLoad) load();
        else {
          this.content.textContent = '等待进入可见区域';
          this.observer = new win.IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) load();
          }, { root: this.props.scrollContainer });
          this.observer.observe(this.content);
        }
        return this;
      }
      unmount() { this.observer?.disconnect(); this.mountElement.textContent = ''; }
    };
  });
  let target = page;
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
    target = await ready;
    target.on('pageerror', error => errors.push(error.message));
  } else await openHome(page);
  const id = name => kind === 'home' ? A + '-' + name : name;
  const mount = target.locator('#' + id('comments-mount'));
  const panel = target.locator('#' + id('comments-panel'));
  await expect(mount).toHaveText('评论已请求');
  expect(await panel.evaluate(el => el.scrollTop)).toBe(0);
  expect((await mount.boundingBox()).y).toBeGreaterThan((await panel.boundingBox()).y + (await panel.boundingBox()).height);

  await target.locator('#' + (kind === 'home' ? A + '-player' : 'bilibili-player')).evaluate(root => {
    const button = root.ownerDocument.createElement('button');
    button.className = 'bpx-player-ctrl-wide'; button.textContent = '切换布局';
    button.style.cssText = 'position:absolute;bottom:16px;right:16px';
    root.append(button);
  });
  const toggle = target.locator('.bpx-player-ctrl-wide');
  await toggle.click();
  await expect(mount).toHaveText('等待进入可见区域');
  await toggle.click();
  await expect(mount).toHaveText('评论已请求');
  expect(await panel.evaluate(el => el.scrollTop)).toBe(0);
  if (kind === 'pip') await target.close();
  expect(errors).toEqual([]);
});

test('homepage titles come from the whole card instead of the nested cover link', async ({ page }) => {
  const errors = await loadFixture(page, '/');
  await mockPlayback(page);
  const titles = ['首页真实标题', '如何使用添加至稍后再看功能', '没有标题链接的视频', '稍后挂载的真实标题'];
  await page.evaluate(titles => {
    document.querySelector('#extra').innerHTML = titles.map((title, i) => `<div class="feed-card"><div class="bili-video-card is-rcmd enable-no-interest" style="width:238px"><div class="bili-video-card__wrap">
      <div class="bili-video-card__no-interest" style="display:none"><span class="no-interest-title">不感兴趣</span><span class="no-interest-desc">将减少此类内容推荐</span><button>撤销</button></div>
      <a class="bili-video-card__image--link" href="/video/BV1home00${i}/"><div class="bili-video-card__image" style="width:238px;height:134px">
        <div class="bili-video-card__image--wrap">
          <div class="bili-watch-later--wrap"><div class="bili-watch-later" style="display:none"><span class="bili-watch-later__tip--lab">添加至稍后再看</span></div></div>
          <picture class="bili-video-card__cover" style="display:block;width:238px;height:134px"><img alt="" style="width:238px;height:134px" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></picture>
        </div>
        <div class="bili-video-card__stats"><span class="bili-video-card__stats--text">114.8万</span><span class="bili-video-card__stats--text">769</span><span class="bili-video-card__stats__duration">05:22</span></div>
      </div></a>
      <div class="bili-video-card__info"><div class="bili-video-card__info--right">${i === 3 ? '' : `<h3 class="bili-video-card__info--tit" title="${title}">${i === 2 ? title : `<a href="/video/BV1home00${i}/">${title}</a>`}</h3>`}</div></div>
    </div></div></div>`).join('');
    window.__biliPopupPlayerNano.scan();
  }, titles);
  await expect(cardButton(page, 'BV1home003')).toHaveAttribute('aria-label', '小窗播放：Bilibili 视频');
  await page.locator('a[href="/video/BV1home003/"]').evaluate((link, title) => {
    const heading = document.createElement('h3');
    heading.className = 'bili-video-card__info--tit';
    heading.textContent = title;
    link.parentElement.querySelector('.bili-video-card__info--right').append(heading);
  }, titles[3]);
  for (const [i, title] of titles.entries()) {
    await expect(cardButton(page, `BV1home00${i}`)).toHaveCount(1);
    await expect(cardButton(page, `BV1home00${i}`)).toHaveAttribute('aria-label', `小窗播放：${title}`);
  }
  await openHome(page);
  await page.getByRole('tab', { name: '播放列表', exact: true }).click();
  const playlist = page.locator('#' + A + '-playlist-list');
  for (const [i, title] of titles.entries()) {
    const card = playlist.locator(`[data-bvid="BV1home00${i}"]`);
    await expect(card.locator('.' + A + '__playlist-title-text')).toHaveText(title);
    await expect(card.locator('.' + A + '__playlist-stats')).toContainText('114.8万');
    await expect(card.locator('.' + A + '__playlist-duration')).toHaveText('05:22');
  }
  expect(errors).toEqual([]);
});

test('playlist titles ignore cover overlays and every list scrolls to the sidebar edge', async ({ page }) => {
  const errors = await prepare(page);
  await page.evaluate(() => {
    const holder = document.querySelector('#extra');
    holder.innerHTML = Array.from({ length: 18 }, (_, i) => `<article class="bili-video-card" style="width:238px">
      <a href="/video/BV1case${String(i).padStart(3, '0')}/"><div class="bili-video-card__image" style="width:238px;height:134px;background:linear-gradient(#ccc,#ddd)">
        <span role="tooltip" class="title">添加至稍后再看</span><span class="bili-video-card__stats--text">114.8万</span><span class="bili-video-card__stats--text">769</span><span class="bili-video-card__stats__duration">05:22</span><span>正在缓冲…00:00 / 05:22</span>
      </div></a>
      <h3 class="bili-video-card__info--tit" title="真实视频标题 ${i}"><a href="/video/BV1case${String(i).padStart(3, '0')}/">真实视频标题 ${i}</a></h3>
    </article>`).join('');
    window.__biliPopupPlayerNano.scan();
  });
  await openHome(page);
  await page.getByRole('tab', { name: '播放列表', exact: true }).click();
  const playlist = page.locator('#' + A + '-playlist-list');
  for (let i = 0; i < 18; i++) {
    await expect(playlist.locator(`[data-bvid="BV1case${String(i).padStart(3, '0')}"] .${A}__playlist-title-text`)).toHaveText('真实视频标题 ' + i);
  }
  await expect(playlist).not.toContainText('添加至稍后再看');
  await expect(playlist).not.toContainText('正在缓冲');
  await expect(playlist.locator(`[data-bvid="BV1case000"] .${A}__playlist-stats`)).toContainText('114.8万');

  for (const [label, key] of [['播放列表', 'playlist'], ['分P', 'pages'], ['相关推荐', 'recommend']]) {
    await page.getByRole('tab', { name: label, exact: true }).click();
    const list = page.locator('#' + A + '-' + key + '-list');
    await list.evaluate(el => {
      const tail = document.createElement('div'); tail.style.height = '2000px'; tail.textContent = '列表末尾'; el.append(tail);
    });
    const sidebar = await page.locator('#' + A + '-comments').boundingBox();
    const box = await list.boundingBox();
    expect(Math.abs(box.x - sidebar.x)).toBeLessThan(1);
    expect(Math.abs(box.x + box.width - sidebar.x - sidebar.width)).toBeLessThan(1);
    expect(Math.abs(box.y + box.height - sidebar.y - sidebar.height)).toBeLessThan(1);
    await list.evaluate(el => { el.scrollTop = el.scrollHeight; });
    const tail = await list.locator(':scope > :last-child').boundingBox();
    expect(Math.abs(tail.y + tail.height - box.y - box.height)).toBeLessThan(1);
  }
  expect(errors).toEqual([]);
});
