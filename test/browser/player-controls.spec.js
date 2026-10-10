import { test, expect } from '@playwright/test';
import { APP as A, cardButton, loadFixture, mockPlayback } from './fixture.js';

async function openPlayer(page, context, kind) {
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
  const frame = surface.locator(kind === 'home' ? `#${A}-player-wrap` : '#stage');
  const toolbar = surface.locator(kind === 'home' ? `#${A}-header` : `.${A}__pip-tools`);
  // Model the native contract: its own idle state plus actual control hover.
  // Our adapter must consume it, without imposing a fixed disappearance delay.
  await frame.locator('.bpx-player-container').evaluate(root => {
    root.style.position = 'relative';
    const control = document.createElement('div');
    control.className = 'bpx-player-control-wrap';
    control.style.cssText = 'position:absolute;bottom:0;left:0;right:0;height:40px';
    control.innerHTML = '<div class="bpx-player-control-bottom" style="height:100%">原生播控</div>';
    root.append(control);
    let idle = false, hovered = false;
    const sync = () => {
      root.dataset.ctrlHidden = String(idle && !hovered);
      control.firstChild.style.opacity = idle && !hovered ? '0' : '1';
      control.firstChild.style.transition = idle && !hovered ? 'opacity .12s linear' : 'opacity .2s ease-in';
    };
    window.__nativeIdle = value => { idle = value; sync(); };
    control.addEventListener('mouseenter', () => { hovered = true; sync(); });
    control.addEventListener('mouseleave', () => { hovered = false; sync(); });
    sync();
  });
  await frame.hover({ position: { x: 100, y: 130 } });
  return { surface, errors, frame, toolbar, native: frame.locator('.bpx-player-container') };
}

for (const kind of ['home', 'pip']) {
  test(`${kind} statistics leave the toolbar usable and preserve its native auto-hide`, async ({ page, context }) => {
    const { surface, errors, frame, toolbar, native } = await openPlayer(page, context, kind);
    await native.evaluate(root => {
      const info = document.createElement('div');
      info.className = 'bpx-player-info-container';
      info.hidden = true;
      info.style.cssText = 'position:absolute;left:10px;width:300px;height:100px;background:#222;color:white;z-index:80';
      info.innerHTML = '<span class="bpx-player-info-close" style="position:absolute;top:10px;right:10px;cursor:pointer">关闭统计信息</span>';
      info.firstChild.addEventListener('click', () => { info.hidden = true; });
      root.append(info);
    });
    const info = native.locator('.bpx-player-info-container');
    await expect(toolbar).toBeVisible();
    await info.evaluate(el => { el.hidden = false; });
    await expect(toolbar).toBeVisible();
    await expect(toolbar).toHaveCSS('opacity', '1');
    const panelBox = await info.boundingBox(), toolbarBox = await toolbar.boundingBox();
    expect(panelBox.y).toBeGreaterThanOrEqual(toolbarBox.y + toolbarBox.height);
    await expect(frame).toHaveAttribute('data-controls-visible', 'true');
    await expect(native.locator('.bpx-player-control-bottom')).toHaveCSS('opacity', '1');
    await surface.getByRole('button', { name: '小窗播放设置', exact: true }).click();
    await expect(surface.locator(`.${A}__settings__panel`)).toBeVisible();
    await expect(info).toBeVisible();
    await surface.keyboard.press('Escape');
    await expect(surface.locator(`.${A}__settings__panel`)).toBeHidden();
    // Escape restores keyboard focus to the toolbar, which deliberately pins
    // the controls. A pointer press in the panel releases that focus.
    await info.click({ position: { x: 20, y: 60 } });
    await frame.hover({ position: { x: 200, y: 210 } });
    await surface.evaluate(() => window.__nativeIdle(true));
    await expect(frame).toHaveAttribute('data-controls-visible', 'false');
    await expect(toolbar).toHaveCSS('opacity', '0');
    await expect(info).toBeVisible();
    await surface.evaluate(() => window.__nativeIdle(false));
    await expect(toolbar).toHaveCSS('opacity', '1');
    await info.locator('.bpx-player-info-close').click();
    await expect(info).toBeHidden();
    await expect(toolbar).toBeVisible();
    await info.evaluate(el => { el.hidden = false; });
    await expect(toolbar).toBeVisible();
    await info.evaluate(el => { el.style.display = 'none'; });
    await expect(toolbar).toBeVisible();
    await info.evaluate(el => { el.style.display = ''; });
    await expect(toolbar).toBeVisible();
    await info.evaluate(el => { const replacement = el.cloneNode(true); replacement.hidden = true; el.replaceWith(replacement); });
    await expect(toolbar).toBeVisible();
    await info.evaluate(el => { el.hidden = false; });
    await expect(toolbar).toBeVisible();
    await info.evaluate(el => el.remove());
    await expect(toolbar).toBeVisible();
    expect(errors).toEqual([]);
  });

  test(`${kind} mini buttons outside the native control bar hold both bars visible`, async ({ page, context }) => {
    const { surface, frame, native } = await openPlayer(page, context, kind);
    await native.evaluate(root => {
      const play = document.createElement('button');
      play.className = 'bpx-player-ctrl-btn-play-icon-mini';
      play.textContent = '播放';
      // Place the standalone control outside the native hover region.
      play.style.cssText = 'position:absolute;top:120px;left:80px;width:32px;height:32px';
      root.append(play);
    });
    await native.locator('.bpx-player-ctrl-btn-play-icon-mini').hover();
    await surface.evaluate(() => window.__nativeIdle(true));
    await expect(native).toHaveAttribute('data-ctrl-hidden', 'false');
    await expect(frame).toHaveAttribute('data-controls-visible', 'true');
    await frame.hover({ position: { x: 200, y: 160 } });
    await expect(native).toHaveAttribute('data-ctrl-hidden', 'true');
    await expect(frame).toHaveAttribute('data-controls-visible', 'false');
  });

  test(`${kind} toolbar follows early and late native hiding, including fade timing`, async ({ page, context }) => {
    const { surface, errors, frame, toolbar, native } = await openPlayer(page, context, kind);
    await surface.evaluate(() => window.__nativeIdle(true));
    await expect(frame).toHaveAttribute('data-controls-visible', 'false');
    await expect(toolbar).toHaveCSS('opacity', '0');
    await expect(toolbar).toHaveCSS('transition', await native.locator('.bpx-player-control-bottom').evaluate(el => getComputedStyle(el).transition));
    await surface.evaluate(() => window.__nativeIdle(false));
    await expect(frame).toHaveAttribute('data-controls-visible', 'true');
    // The previous independent 2.2s timer must not hide the toolbar here.
    await surface.waitForTimeout(2600);
    await expect(frame).toHaveAttribute('data-controls-visible', 'true');
    await expect(toolbar).toHaveCSS('opacity', '1');
    await surface.evaluate(() => window.__nativeIdle(true));
    await expect(frame).toHaveAttribute('data-controls-visible', 'false');
    expect(errors).toEqual([]);
  });

  test(`${kind} hovering either bar and using settings keeps native and added controls visible`, async ({ page, context }) => {
    const { surface, errors, frame, toolbar, native } = await openPlayer(page, context, kind);
    await native.locator('.bpx-player-control-wrap').hover();
    await surface.evaluate(() => window.__nativeIdle(true));
    await surface.waitForTimeout(2400);
    await expect(frame).toHaveAttribute('data-controls-visible', 'true');
    const settings = surface.getByRole('button', { name: '小窗播放设置', exact: true });
    await settings.hover();
    await expect(native).toHaveAttribute('data-ctrl-hidden', 'false');
    await settings.click();
    await surface.mouse.move(4, 4);
    await surface.waitForTimeout(2400);
    await expect(native).toHaveAttribute('data-ctrl-hidden', 'false');
    await expect(toolbar).toHaveCSS('opacity', '1');
    // Dismiss through the mask, keeping the pointer outside both bars.
    const box = await frame.boundingBox();
    await surface.mouse.click(box.x + 100, box.y + 130);
    await expect(surface.locator(`.${A}__settings__panel`)).toBeHidden();
    await expect(native).toHaveAttribute('data-ctrl-hidden', 'true');
    await expect(frame).toHaveAttribute('data-controls-visible', 'false');
    expect(errors).toEqual([]);
  });

  test(`${kind} switching the native player detaches the old visibility source`, async ({ page, context }) => {
    const { surface, errors, frame, native } = await openPlayer(page, context, kind);
    await native.evaluate(root => {
      window.__oldControlPlayer = root;
      const next = root.cloneNode(true);
      next.dataset.ctrlHidden = 'true';
      root.replaceWith(next);
    });
    await expect(frame).toHaveAttribute('data-controls-visible', 'false');
    await surface.evaluate(() => { window.__oldControlPlayer.dataset.ctrlHidden = 'false'; });
    await expect(frame).toHaveAttribute('data-controls-visible', 'false');
    await native.evaluate(root => { root.dataset.ctrlHidden = 'false'; });
    await expect(frame).toHaveAttribute('data-controls-visible', 'true');
    expect(errors).toEqual([]);
  });
}
