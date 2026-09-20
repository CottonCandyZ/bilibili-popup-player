import { test, expect } from '@playwright/test';
import { APP as A, cardButton, loadFixture, mockPlayback } from './fixture.js';

for (const kind of ['home', 'pip']) test(`${kind} disables volume wheels at the scroll boundary and in fullscreen`, async ({ page, context }) => {
  const errors = await loadFixture(page, kind === 'home' ? '/bangumi/play/ep101' : '/video/BV1test002/');
  await mockPlayback(page);
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
    await page.locator('#card-b .cover').hover();
    await cardButton(page, 'BV1test002').click();
  }
  await expect(surface.getByText('播放器测试画面', { exact: false })).toBeVisible();
  const root = surface.locator(kind === 'home' ? `#${A}-player` : '#bilibili-player');
  const frame = surface.locator(kind === 'home' ? `#${A}-player-wrap` : '#stage');
  const content = surface.locator(kind === 'home' ? `#${A}-content` : '#layout');
  await root.evaluate(root => {
    window.__wheelChanges = 0; window.__commentWheels = 0; window.__muteClicks = 0; window.__sliderValue = 50;
    const controls = document.createElement('div');
    controls.style.cssText = 'position:absolute;bottom:20px;left:20px;display:flex;gap:12px';
    controls.innerHTML = '<button class="bpx-player-ctrl-wide">布局</button><div class="bpx-player-ctrl-volume"><button>静音测试</button><input aria-label="音量测试" type="range" min="0" max="100" value="50" style="width:140px"></div>';
    root.firstChild.append(controls);
    controls.querySelector('.bpx-player-ctrl-volume button').onclick = () => { window.__muteClicks++; };
    controls.querySelector('input').oninput = event => { window.__sliderValue = Number(event.target.value); };
    // Native players can listen on the root in capture phase and on the volume
    // control itself. Neither should receive wheel events from our frame.
    for (const type of ['wheel', 'mousewheel', 'DOMMouseScroll']) {
      for (const node of [root, controls.querySelector('.bpx-player-ctrl-volume')]) {
        node.addEventListener(type, event => { window.__wheelChanges++; event.preventDefault(); }, { capture: true, passive: false });
      }
      // Nano also listens on the document: comments are outside the video frame
      // but must not reach this global volume handler, including legacy events.
      document.addEventListener(type, () => { window.__wheelChanges++; }, { passive: true });
    }
  });
  await root.locator('.bpx-player-ctrl-wide').click();
  await expect(content).toHaveCSS('overflow-y', 'auto');
  await surface.locator(kind === 'home' ? `#${A}-comments-mount` : '#comments-mount').evaluate(el => {
    const host = document.createElement('div');
    el.replaceChildren(host);
    host.attachShadow({ mode: 'open' }).innerHTML = '<div id="wheel-comment-body" style="height:2600px">长评论</div>';
    host.shadowRoot.firstChild.addEventListener('wheel', () => { window.__commentWheels++; });
  });

  for (const fullscreen of [false, true]) {
    if (fullscreen) {
      if (kind === 'home') await surface.locator(`#${A}-dialog`).evaluate(el => el.requestFullscreen());
      else await root.evaluate(el => el.requestFullscreen());
      await expect.poll(() => surface.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    }
    // Only the shell has scrollable comments when fullscreen is owned by it.
    if (kind === 'home' || !fullscreen) {
      await content.evaluate(el => { el.scrollTop = 0; });
      await frame.hover({ position: { x: 180, y: 180 } });
      await surface.mouse.wheel(0, 260);
      await expect.poll(() => content.evaluate(el => el.scrollTop)).toBeGreaterThan(150);
      await surface.mouse.move((await frame.boundingBox()).x + 150, (await content.boundingBox()).y + 60);
      await surface.mouse.wheel(0, -800);
      await expect.poll(() => content.evaluate(el => el.scrollTop)).toBe(0);

      // Scroll over the comments themselves, while the video floats, and then
      // cross the boundary back into the full-size video without moving the mouse.
      const comments = surface.locator('#wheel-comment-body');
      const commentTop = await comments.evaluate((el, contentId) => {
        const scroller = document.getElementById(contentId);
        return el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      }, kind === 'home' ? A + '-content' : 'layout');
      await content.evaluate((el, top) => { el.scrollTop = top; }, commentTop);
      await expect(frame).toHaveAttribute('data-scroll-floating', 'true');
      const box = await content.boundingBox();
      await surface.mouse.move(box.x + 70, box.y + 70);
      const before = await surface.evaluate(() => window.__commentWheels);
      await surface.mouse.wheel(0, 240);
      await expect.poll(() => content.evaluate(el => el.scrollTop)).toBeGreaterThan(commentTop + 100);
      expect(await surface.evaluate(() => window.__commentWheels)).toBeGreaterThan(before);
      const prevented = await comments.evaluate(el => ['wheel', 'mousewheel', 'DOMMouseScroll'].map(type => {
        const event = new WheelEvent(type, { bubbles: true, composed: true, cancelable: true, deltaY: -200 });
        el.dispatchEvent(event);
        return event.defaultPrevented;
      }));
      expect(prevented).toEqual([false, false, false]);
      expect(await surface.evaluate(() => window.__wheelChanges)).toBe(0);
      await surface.mouse.wheel(0, -10000);
      await expect.poll(() => content.evaluate(el => el.scrollTop)).toBe(0);
      await expect(frame).toHaveAttribute('data-scroll-floating', 'false');
    }
    const volume = root.locator('.bpx-player-ctrl-volume');
    await volume.hover();
    for (const delta of [-200, -200, 200]) {
      await surface.mouse.wheel(0, delta);
      await content.evaluate(el => { el.scrollTop = 0; });
    }
    const prevented = await volume.evaluate(el => ['wheel', 'mousewheel', 'DOMMouseScroll'].map(type => {
      const event = new WheelEvent(type, { bubbles: true, cancelable: true, deltaY: -200 });
      el.dispatchEvent(event);
      return event.defaultPrevented;
    }));
    expect(prevented).toEqual([false, false, false]);
    expect(await surface.evaluate(() => window.__wheelChanges)).toBe(0);
    if (fullscreen) await surface.evaluate(() => document.exitFullscreen());
  }
  await root.getByRole('button', { name: '静音测试', exact: true }).click();
  expect(await surface.evaluate(() => window.__muteClicks)).toBe(1);
  const slider = root.getByRole('slider', { name: '音量测试', exact: true });
  await slider.click({ position: { x: 110, y: 8 } });
  expect(await surface.evaluate(() => window.__sliderValue)).toBeGreaterThan(60);
  const box = await slider.boundingBox();
  await surface.mouse.move(box.x + 110, box.y + box.height / 2);
  await surface.mouse.down(); await surface.mouse.move(box.x + 25, box.y + box.height / 2, { steps: 4 }); await surface.mouse.up();
  expect(await surface.evaluate(() => window.__sliderValue)).toBeLessThan(30);
  expect(errors).toEqual([]);
  if (kind === 'pip') await surface.close();
});
