import { test, expect } from '@playwright/test';
import { APP as A, cardButton, loadFixture, mockPlayback } from './fixture.js';

async function openMini(page, context, mode, legacy) {
  await page.addInitScript(app => {
    localStorage.setItem(`${app}:home-comment-layout`, 'bottom');
    localStorage.setItem(`${app}:pip-comment-layout`, 'bottom');
  }, A);
  const errors = await loadFixture(page, '/');
  await mockPlayback(page);
  let surface = page;
  if (mode === 'pip-scroll') {
    await context.route('https://s1.hdslb.com/**', route => route.abort());
    await page.evaluate(() => Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: {
      requestWindow() {
        const win = window.open('about:blank', '_blank', 'popup,width=960,height=700');
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
  await expect(surface.getByText('播放器测试画面', { exact: false })).toBeVisible();
  const frame = surface.locator(mode === 'pip-scroll' ? '#stage' : `#${A}-player-wrap`);
  await frame.locator('.bpx-player-container').evaluate((root, legacy) => {
    // Native TinyView sets display:none on the entire regular control entity.
    // Recent runtimes do not necessarily create the separate mini widget.
    root.style.cssText = 'position:relative;height:100%';
    root.dataset.screen = 'web';
    root.dataset.ctrlHidden = 'false';
    const icon = '<span class="bpx-common-svg-icon"><svg viewBox="0 0 28 28"><path d="M8 5 23 14 8 23Z"/></svg></span>';
    root.innerHTML = `<div class="bpx-player-video-area" style="height:100%">
      <div class="bpx-player-control-wrap">
        <div class="bpx-player-control-mask" style="display:none"></div>
        <div class="bpx-player-control-entity" style="display:none">
          <div class="bpx-player-control-top">进度条</div>
          <div class="bpx-player-control-bottom">
            <div class="bpx-player-control-bottom-left"><button class="bpx-player-ctrl-btn bpx-player-ctrl-play" aria-label="播放/暂停"><div class="bpx-player-ctrl-btn-icon">${icon}</div></button><button class="bpx-player-ctrl-next">下一集</button></div>
            <div class="bpx-player-control-bottom-center">弹幕输入</div>
            <div class="bpx-player-control-bottom-right"><button class="bpx-player-ctrl-quality">画质</button><button class="bpx-player-ctrl-btn bpx-player-ctrl-volume" aria-label="音量"><div class="bpx-player-ctrl-btn-icon bpx-player-ctrl-volume-icon">${icon}</div><div class="bpx-player-ctrl-btn-icon bpx-player-ctrl-muted-icon" style="display:none">${icon}</div><div class="bpx-player-ctrl-volume-box">音量滑杆</div></button></div>
          </div>
        </div>
      </div>
      ${legacy ? `<div class="bpx-player-ctrl-btn-play-icon-mini" style="display:none">旧播放控件</div><div class="bpx-player-ctrl-volume-icon-mini">旧音量控件</div>` : ''}
    </div>`;
    const log = window.__miniNative = { paused: false, muted: false, playClicks: 0, muteClicks: 0 };
    root.querySelector('.bpx-player-control-bottom .bpx-player-ctrl-play').addEventListener('click', () => {
      log.playClicks++; log.paused = !log.paused;
      root.querySelector('.bpx-player-control-entity').style.display = 'none';
      const old = root.querySelector('.bpx-player-ctrl-btn-play-icon-mini');
      if (old) old.style.display = log.paused ? '' : 'none';
    });
    const volume = root.querySelector('.bpx-player-control-bottom .bpx-player-ctrl-volume');
    volume.addEventListener('click', () => {
      log.muteClicks++; log.muted = !log.muted;
      volume.querySelector('.bpx-player-ctrl-volume-icon').style.display = log.muted ? 'none' : '';
      volume.querySelector('.bpx-player-ctrl-muted-icon').style.display = log.muted ? '' : 'none';
    });
    root.addEventListener('mousemove', () => { root.dataset.ctrlHidden = 'false'; });
    root.querySelector('.bpx-player-control-wrap').addEventListener('mouseenter', () => { root.dataset.ctrlHidden = 'false'; });
  }, legacy);
  if (mode === 'home-manual') {
    await surface.getByRole('button', { name: '收起到右下角', exact: true }).click();
    await expect(surface.locator(`#${A}-overlay`)).not.toHaveAttribute('data-layout-animating', 'true');
  } else {
    const content = surface.locator(mode === 'pip-scroll' ? '#layout' : `#${A}-content`);
    await surface.locator(mode === 'pip-scroll' ? '#comments' : `#${A}-comments`).evaluate(el => { el.style.minHeight = '2000px'; });
    await content.evaluate(el => { el.scrollTop = 1100; });
    await expect(frame).toHaveAttribute('data-scroll-floating', 'true');
  }
  await frame.hover({ position: { x: 180, y: 110 } });
  return { surface, frame, errors };
}

for (const mode of ['home-manual', 'home-scroll', 'pip-scroll']) {
  for (const legacy of [false, true]) {
    test(`${mode}: native play/mute work with ${legacy ? 'hidden legacy mini widgets' : 'no mini widgets'}`, async ({ page, context }) => {
      const { surface, frame, errors } = await openMini(page, context, mode, legacy);
      const bar = frame.locator('.bpx-player-control-bottom');
      const play = bar.getByRole('button', { name: '播放/暂停', exact: true });
      const volume = bar.getByRole('button', { name: '音量', exact: true });
      for (const button of [play, volume]) {
        await expect(button).toBeVisible();
        // Scroll docking has its own scale animation after the floating flag.
        await expect.poll(async () => {
          const rect = await button.boundingBox();
          return [rect?.width, rect?.height];
        }).toEqual([32, 32]);
        expect(await button.evaluate(el => {
          const r = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        })).toBe(true);
      }
      await expect(bar.getByText('弹幕输入')).toBeHidden();
      await expect(bar.getByText('音量滑杆')).toBeHidden();
      await expect(bar.getByText('画质', { exact: true })).toBeHidden();
      await expect(frame.locator('.bpx-player-ctrl-btn-play-icon-mini')).toBeHidden();
      await expect(frame.locator('.bpx-player-ctrl-volume-icon-mini')).toBeHidden();
      for (const paused of [true, false, true, false]) {
        await play.click();
        expect(await surface.evaluate(() => window.__miniNative.paused)).toBe(paused);
        await expect(play).toBeVisible();
      }
      for (const muted of [true, false, true, false]) {
        await volume.click();
        expect(await surface.evaluate(() => window.__miniNative.muted)).toBe(muted);
        await expect(volume.locator(muted ? '.bpx-player-ctrl-muted-icon' : '.bpx-player-ctrl-volume-icon')).toBeVisible();
        await expect(volume.locator(muted ? '.bpx-player-ctrl-volume-icon' : '.bpx-player-ctrl-muted-icon')).toBeHidden();
      }
      await frame.hover({ position: { x: 180, y: 110 } });
      await frame.locator('.bpx-player-container').evaluate(root => { root.dataset.ctrlHidden = 'true'; });
      await expect(play).toBeHidden(); await expect(volume).toBeHidden();
      await frame.hover({ position: { x: 185, y: 110 } });
      await expect(play).toBeVisible(); await expect(volume).toBeVisible();
      expect(await surface.evaluate(() => [window.__miniNative.playClicks, window.__miniNative.muteClicks])).toEqual([4, 4]);
      expect(errors).toEqual([]);
    });
  }
}
