import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { getEmbeddedPlayerCss } from '../../src/embedded-player-style.js';
import { APP } from '../../src/constants.js';

const adapter = readFileSync(new URL('../../src/native-progress.js', import.meta.url), 'utf8').replace('export function', 'function');

async function mount(page, kind = 'home') {
  const id = kind === 'home' ? `${APP}-player` : 'bilibili-player';
  await page.setContent(`<style>
    body { margin:0; }
    #${id} { width:1200px; margin-top:60px; }
    .bpx-player-progress-schedule-wrap, .bpx-player-shadow-progress-schedule-wrap { position:relative; height:4px; margin:30px 0; }
    .bpx-player-progress-schedule { position:absolute; width:100%; height:100%; background:#666; }
    .bpx-player-progress-schedule-current { position:absolute; width:100%; height:100%; transform-origin:left; background:hotpink; }
    .bpx-player-progress-schedule-padding { position:absolute; inset:-10px 0; }
    ${getEmbeddedPlayerCss()}
  </style><div ${kind === 'pip' ? 'data-bili-popup-ui="pip"' : ''}><div id="${id}"><div class="bpx-player-container"></div></div></div>`);
  await page.addScriptTag({ content: `${adapter}; window.disposeProgress = bindNativeProgress(document.getElementById('${id}'));` });
  await page.evaluate(() => {
    // The reported video: nine uneven chapters, with the final chapter ending
    // at 159s of a 160s video. This is the SDK's native spacing calculation.
    window.chapterTimes = [0, 22, 64, 93, 105, 117, 127, 142, 152, 159];
    window.renderNative = (times = window.chapterTimes) => {
      window.chapterTimes = times;
      const count = times.length - 1, gap = .003, scale = 1 - gap * (count - 1);
      const html = times.slice(0, -1).map((from, index) => `<div class="bpx-player-progress-schedule bpx-player-progress-schedule-segment" style="left:${(from / 160 * scale + gap * index) * 100}%;width:${(times[index + 1] - from) / 160 * scale * 100}%;margin-right:${gap * 100}%"><div class="bpx-player-progress-schedule-padding"></div><div class="bpx-player-progress-schedule-current"></div></div>`).join('');
      document.querySelector('.bpx-player-container').innerHTML = `<div class="bpx-player-progress-schedule-wrap">${html}</div><div class="bpx-player-shadow-progress-schedule-wrap">${html}</div>`;
      document.querySelector('.bpx-player-progress-schedule-wrap').onmousedown = event => {
        const box = event.currentTarget.getBoundingClientRect();
        window.nativeSeek = (event.clientX - box.left) / box.width * 160;
      };
    };
    window.nativeTimeUpdate = time => {
      for (const wrap of document.querySelectorAll('.bpx-player-progress-schedule-wrap, .bpx-player-shadow-progress-schedule-wrap')) {
        [...wrap.children].forEach((chapter, index) => {
          const from = window.chapterTimes[index], to = window.chapterTimes[index + 1];
          chapter.lastChild.style.transform = `scaleX(${Math.max(0, Math.min(1, (time - from) / (to - from)))})`;
        });
      }
    };
    window.renderNative();
  });
  return page.locator('#' + id);
}

for (const kind of ['home', 'pip']) test(`${kind} chapters share the heatmap time axis across resize and native seeking`, async ({ page }) => {
  const root = await mount(page, kind);
  await expect(root.locator('[data-bpn-linear-chapter]')).toHaveCount(18);
  for (const width of [800, 1280, 1920]) {
    await root.evaluate((el, width) => { el.style.width = `${width}px`; }, width);
    for (const time of [11, 22, 43, 64, 85, 104, 150, 159]) {
      const edges = await page.evaluate(time => {
        window.nativeTimeUpdate(time);
        const index = window.chapterTimes.findIndex((to, index) => index > 0 && time <= to) - 1;
        return [...document.querySelectorAll('.bpx-player-progress-schedule-wrap, .bpx-player-shadow-progress-schedule-wrap')].map(wrap => {
          const box = wrap.getBoundingClientRect();
          return {
            progress: wrap.children[index].lastChild.getBoundingClientRect().right,
            heatmap: box.left + box.width * time / 160,
          };
        });
      }, time);
      for (const edge of edges) expect(Math.abs(edge.progress - edge.heatmap)).toBeLessThan(.1);
    }
  }
  await root.evaluate(el => { el.style.width = '1200px'; });
  const target = root.locator('.bpx-player-progress-schedule-wrap');
  const box = await target.boundingBox();
  // Native hover padding remains clickable above the thin track.
  await page.mouse.click(box.x + box.width * .53, box.y - 5);
  expect(await page.evaluate(() => window.nativeSeek)).toBeCloseTo(84.8, 2);
});

test('native chapter replacement, cleanup and unsupported geometry remain safe', async ({ page }) => {
  const root = await mount(page);
  await expect(root.locator('[data-bpn-linear-chapter]')).toHaveCount(18);
  await page.evaluate(() => window.renderNative([0, 100, 160]));
  await expect(root.locator('[data-bpn-linear-chapter]')).toHaveCount(4);
  await page.evaluate(() => window.disposeProgress());
  await expect(root.locator('[data-bpn-linear-chapter]')).toHaveCount(0);
  // Disposal restores the native styles, including its original gap geometry.
  expect(await root.locator('.bpx-player-progress-schedule-wrap').evaluate(wrap => wrap.children[1].style.left)).toBe('62.6125%');
  await page.addScriptTag({ content: `${adapter}; window.disposeProgress = bindNativeProgress(document.getElementById('${APP}-player'));` });
  await page.evaluate(() => {
    const wrap = document.querySelector('.bpx-player-progress-schedule-wrap');
    // Future native layouts without gap compression must not be reverse-scaled.
    wrap.innerHTML = '<div class="bpx-player-progress-schedule-segment" style="left:0%;width:50%;margin-right:0.3%"></div><div class="bpx-player-progress-schedule-segment" style="left:50%;width:50%;margin-right:0.3%"></div>';
    document.querySelector('.bpx-player-shadow-progress-schedule-wrap').innerHTML = '<div class="bpx-player-progress-schedule"></div>';
  });
  await expect(root.locator('[data-bpn-linear-chapter]')).toHaveCount(0);
});
