import { test, expect } from '@playwright/test';
import { APP, cardButton, loadFixture, mockPlayback } from './fixture.js';

test('backdrop is visibly blurred halfway through opening and reopening', async ({ page }) => {
  const errors = await loadFixture(page);
  await mockPlayback(page);
  await page.addStyleTag({ content: `
    #${APP}-overlay, .${APP}__backdrop { transition-duration:2s !important; }
    #blur-stripes { position:fixed;inset:0;z-index:2147482900;pointer-events:none;
      background:repeating-linear-gradient(#000 0 4px,#fff 4px 8px); }
  ` });
  await page.evaluate(id => {
    const stripes = document.createElement('div'); stripes.id = 'blur-stripes';
    document.body.append(stripes);
    // Freeze real opening transitions at their midpoint, so the screenshot
    // verifies rendered blur rather than only its computed CSS value.
    document.addEventListener('transitionrun', event => {
      const overlay = document.getElementById(id + '-overlay');
      if (overlay?.dataset.open !== 'true' ||
        (event.target !== overlay && !event.target.classList.contains(id + '__backdrop'))) return;
      for (const animation of event.target.getAnimations()) {
        animation.pause(); animation.currentTime = 1000;
      }
    }, true);
  }, APP);
  const overlay = page.locator(`#${APP}-overlay`);
  const backdrop = overlay.locator(`.${APP}__backdrop`);
  for (let opening = 0; opening < 2; opening++) {
    await page.locator('#card-b .cover').hover();
    await cardButton(page, 'BV1test002').click();
    await expect.poll(() => backdrop.evaluate(el => el.getAnimations().filter(a => a.playState === 'paused').length)).toBeGreaterThan(0);
    const blur = await backdrop.evaluate(el => Number(/blur\(([\d.]+)px\)/.exec(getComputedStyle(el).backdropFilter)?.[1]));
    expect(blur).toBeGreaterThan(4);
    expect(blur).toBeLessThan(8);
    // Capture the full viewport: a clipped screenshot can clip the compositor's
    // filter input too. Sample a patch outside the dialog afterward.
    const screenshot = await page.screenshot();
    const contrast = await page.evaluate(async data => {
      const image = new Image(); image.src = 'data:image/png;base64,' + data;
      await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      const { data: pixels } = ctx.getImageData(16, 32, 1, 32);
      const reds = [...pixels].filter((_, i) => i % 4 === 0);
      return Math.max(...reds) - Math.min(...reds);
    }, screenshot.toString('base64'));
    // 4px stripes should already be blended, not remain sharp until opacity=1.
    expect(contrast).toBeLessThan(20);
    await overlay.evaluate((el, id) => [...el.getAnimations(), ...el.querySelector('.' + id + '__backdrop').getAnimations()].forEach(a => a.finish()), APP);
    await page.evaluate(() => window.__biliPopupPlayerNano.close());
    await expect(overlay).toBeHidden();
  }
  expect(errors).toEqual([]);
});
