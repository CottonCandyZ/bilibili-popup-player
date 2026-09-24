import { test, expect } from '@playwright/test';
import { getEmbeddedPlayerCss } from '../../src/embedded-player-style.js';
import { APP } from '../../src/constants.js';

// Headless Chromium can verify the compositing dependency and native state, but
// the Windows fullscreen overlay regression also requires an uncaptured display.
for (const kind of ['home', 'pip']) test(`${kind} fullscreen preserves danmaku compositing and native visibility`, async ({ page }) => {
  const shell = kind === 'home' ? `${APP}-dialog` : 'system-shell';
  const root = kind === 'home' ? `${APP}-player` : 'bilibili-player';
  await page.setContent(`<style>
    #${shell} { position:relative; width:800px; height:450px; background:black; }
    #${shell}:fullscreen { width:100vw; height:100vh; }
    #${root}, .bpx-player-container, .bpx-player-video-area { position:relative; width:100%; height:100%; }
    video, .bpx-player-dm-mask-wrap, .bpx-player-row-dm-wrap { position:absolute; inset:0; width:100%; height:100%; }
    .bpx-player-dm-mask-wrap { z-index:2; }
    .bpx-player-row-dm-wrap { contain:paint; }
    .test-danmaku { position:absolute; top:4px; left:24px; color:white; animation:roll 60s linear infinite; }
    @keyframes roll { to { transform:translateX(500px); } }
    .bpx-player-control-bottom { position:absolute; bottom:0; width:100%; height:40px; z-index:75; background:#0008; opacity:1; transition:opacity .2s; }
    [data-ctrl-hidden="true"] .bpx-player-control-bottom { opacity:0; }
    ${getEmbeddedPlayerCss()}
  </style><div ${kind === 'pip' ? 'data-bili-popup-ui="pip"' : ''}>
    <div id="${shell}"><div id="${root}"><div class="bpx-player-container" data-ctrl-hidden="false">
      <div class="bpx-player-video-area"><video muted></video>
        <div class="bpx-player-dm-mask-wrap"><div class="bpx-player-row-dm-wrap"><span class="test-danmaku">全屏弹幕</span></div></div>
        <div class="bpx-player-control-bottom">播控</div>
      </div>
    </div></div></div>
  </div><div id="host-player"><div class="bpx-player-dm-mask-wrap"></div></div>`);
  const mask = page.locator(`#${root} .bpx-player-dm-mask-wrap`);
  const bullet = page.locator('.test-danmaku');
  await expect(mask).toHaveCSS('backdrop-filter', 'none');
  await bullet.evaluate(el => { window.__existingDanmaku = { node: el, animation: el.getAnimations()[0] }; });

  const cdp = await page.context().newCDPSession(page);
  let layers = [];
  cdp.on('LayerTree.layerTreeDidChange', event => { if (event.layers) layers = event.layers; });
  await cdp.send('DOM.enable');
  await cdp.send('LayerTree.enable');
  const { root: documentNode } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: documentNode.nodeId, selector: `#${root} .bpx-player-dm-mask-wrap` });
  const { node } = await cdp.send('DOM.describeNode', { nodeId });
  const layer = () => layers.find(item => item.backendNodeId === node.backendNodeId);

  await page.locator('#' + shell).evaluate(el => el.requestFullscreen());
  await expect.poll(() => !!layer()).toBe(true);
  const layerId = layer().layerId;
  expect((await cdp.send('LayerTree.compositingReasons', { layerId })).compositingReasonIds).toContain('BackdropFilter');
  for (const hidden of ['true', 'false', 'true']) {
    const before = await bullet.evaluate(el => el.getAnimations()[0].currentTime);
    await page.locator('.bpx-player-container').evaluate((el, hidden) => { el.dataset.ctrlHidden = hidden; }, hidden);
    await expect(page.locator('.bpx-player-control-bottom')).toHaveCSS('opacity', hidden === 'true' ? '0' : '1');
    await expect(bullet).toBeVisible();
    expect(layer().layerId).toBe(layerId);
    expect(await bullet.evaluate(el => el === window.__existingDanmaku.node && el.getAnimations()[0] === window.__existingDanmaku.animation)).toBe(true);
    await expect.poll(() => bullet.evaluate(el => el.getAnimations()[0].currentTime)).toBeGreaterThan(before);
  }
  // Native off/opacity/smart-mask settings must continue to own the danmaku.
  await mask.evaluate(el => { el.style.visibility = 'hidden'; });
  await expect(bullet).toBeHidden();
  await mask.evaluate(el => { el.style.visibility = ''; el.style.opacity = '.4'; el.style.maskImage = 'linear-gradient(black, transparent)'; });
  await expect(bullet).toBeVisible();
  await expect(mask).toHaveCSS('opacity', '0.4');
  const smartMask = await mask.evaluate(el => getComputedStyle(el).maskImage);
  await expect(page.locator('video')).toHaveCSS('opacity', '1');
  await page.evaluate(() => document.exitFullscreen());
  await expect(mask).toHaveCSS('backdrop-filter', 'none');
  await expect(mask).toHaveCSS('mask-image', smartMask);
  await expect(page.locator('#host-player .bpx-player-dm-mask-wrap')).toHaveCSS('backdrop-filter', 'none');
  expect(await bullet.evaluate(el => el === window.__existingDanmaku.node && el.getAnimations()[0] === window.__existingDanmaku.animation)).toBe(true);
  await cdp.detach();
});
