import { test, expect } from '@playwright/test';
import { APP, cardButton, loadFixture, mockPlayback } from './fixture.js';

for (const scale of [1, 1.25]) test(`background blur matches a continuous reference without tile seams at ${scale}x scale`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: scale });
  const page = await context.newPage();
  try {
    const errors = await loadFixture(page);
    await mockPlayback(page);
    await page.locator('#card-b .cover').hover();
    await cardButton(page, 'BV1test002').click();
    await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
    await page.addStyleTag({ content: `
      *, *::before, *::after { animation:none !important;transition:none !important; }
      #seam-scene { position:fixed;inset:0;z-index:2147482900;display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(6,1fr); }
      #seam-scene div { background:linear-gradient(140deg,var(--c) 0 45%,#161616 45% 64%,#aaa 64%);color:white;font:bold 25px sans-serif;padding:10px; }
    ` });
    await page.evaluate(() => {
      const scene = document.createElement('div'); scene.id = 'seam-scene';
      scene.innerHTML = Array.from({ length: 48 }, (_, i) => `<div style="--c:hsl(${i * 37 % 360} 65% 65%)">标题 ${i}<br>播放视频</div>`).join('');
      document.body.append(scene);
    });
    for (const viewport of [{ width: 800, height: 600 }, { width: 801, height: 601 }]) {
      await page.setViewportSize(viewport);
      const overlay = page.locator(`#${APP}-overlay`);
      await expect(overlay).toHaveCSS('backdrop-filter', 'none');
      await expect(overlay).not.toHaveAttribute('data-layout-animating', 'true');
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const actual = await page.screenshot();
      // One viewport-wide filter is the reference. This catches kernel clipping
      // and neighboring tiles reblurring or tinting one another at their edges.
      const style = await page.addStyleTag({ content: `
        #${APP}-overlay { backdrop-filter:blur(8px) !important;background:#11111166 !important; }
        .${APP}__backdrop { visibility:hidden !important; }
      ` });
      const reference = await page.screenshot();
      const dialog = await page.locator(`#${APP}-dialog`).boundingBox();
      await style.evaluate(el => el.remove());
      const difference = await page.evaluate(async ({ actual, reference, dialog, scale }) => {
        async function pixels(data) {
          const image = new Image(); image.src = 'data:image/png;base64,' + data;
          await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
          const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
          return ctx.getImageData(0, 0, image.width, image.height);
        }
        const a = await pixels(actual), b = await pixels(reference);
        let max = 0, changed = 0;
        for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
          // Exclude player UI and its antialiased edge (one CSS pixel).
          // Fractional DPR can rasterize that edge differently in a filtered parent.
          if (x / scale > dialog.x - 1 && x / scale < dialog.x + dialog.width + 1 &&
            y / scale > dialog.y - 1 && y / scale < dialog.y + dialog.height + 1) continue;
          const i = (y * a.width + x) * 4;
          const delta = Math.max(...[0, 1, 2].map(c => Math.abs(a.data[i + c] - b.data[i + c])));
          max = Math.max(max, delta); if (delta > 2) changed++;
        }
        return { max, changed };
      }, { actual: actual.toString('base64'), reference: reference.toString('base64'), dialog, scale });
      expect(difference.changed).toBe(0);
      expect(difference.max).toBeLessThanOrEqual(2);
    }
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
