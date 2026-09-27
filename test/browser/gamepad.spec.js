import { test, expect } from '@playwright/test';
import { APP as A, cardButton, loadFixture, mockPlayback } from './fixture.js';

async function prepare(page) {
  const errors = await loadFixture(page, '/');
  await mockPlayback(page);
  await page.evaluate(() => {
    const pad = { index: 0, id: 'Standard gamepad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    const mock = window.__gamepad = { pad, exposed: false, keys: [], reads: 0 };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => {
      mock.reads++;
      return [mock.exposed ? pad : null, null, null, null];
    } });
    for (const type of ['keydown', 'keyup']) window.addEventListener(type, event => {
      if (event.target.matches?.('.bpx-player-container')) mock.keys.push({ type, key: event.key, repeat: event.repeat });
    });
  });
  async function connect(connected = true, event = true) {
    await page.evaluate(({ connected, event }) => {
      window.__gamepad.exposed = connected;
      if (event) window.dispatchEvent(new Event(connected ? 'gamepadconnected' : 'gamepaddisconnected'));
    }, { connected, event });
  }
  async function frames() {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  async function button(index, pressed) {
    await page.evaluate(({ index, pressed }) => {
      window.__gamepad.pad.buttons[index] = { pressed, value: pressed ? 1 : 0 };
    }, { index, pressed });
    await frames();
  }
  async function press(index) { await button(index, true); await button(index, false); }
  async function keys() { return page.evaluate(() => window.__gamepad.keys.filter(event => event.type === 'keydown').map(event => event.key)); }
  async function open() {
    await page.locator('#card-b .cover').hover();
    // A DOM click avoids waiting for the playback URL change while the API is gated.
    await cardButton(page, 'BV1test002').evaluate(el => el.click());
  }
  async function ready() {
    await expect(page.getByText('播放器测试画面', { exact: false })).toBeVisible();
    await frames();
  }
  async function settings() {
    await page.locator(`#${A}-player-wrap`).hover();
    await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  }
  return { errors, connect, frames, button, press, keys, open, ready, settings };
}

for (const timing of ['before opening', 'while loading']) test(`a gamepad connected ${timing} works after asynchronous player creation`, async ({ page }) => {
  const pad = await prepare(page);
  let release, requested;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { requested = resolve; });
  await page.route('**/x/web-interface/wbi/view/detail*', async route => { requested(); await gate; await route.fallback(); });
  if (timing === 'before opening') await pad.connect();
  await pad.open(); await started; await pad.frames();
  expect(await page.evaluate(() => Boolean(window.__biliPopupPlayerNano.getState().home.player))).toBe(false);
  if (timing === 'while loading') await pad.connect();
  release(); await pad.ready();
  await pad.press(0); await pad.press(2); await pad.press(1);
  expect(await pad.keys()).toEqual([' ', 'ArrowLeft', 'ArrowRight']);
  // Closing the shell stops input; reopening resumes polling on the same player.
  await page.evaluate(() => window.__biliPopupPlayerNano.close());
  await pad.press(0);
  expect(await pad.keys()).toHaveLength(3);
  await pad.open(); await pad.ready(); await pad.press(0);
  expect(await pad.keys()).toHaveLength(4);
  expect(await page.evaluate(() => window.__mockPlayback.created)).toBe(1);
  expect(pad.errors).toEqual([]);
});

test('polling discovers an exposed pad without a new connection event and survives reconnect', async ({ page }) => {
  const pad = await prepare(page);
  await pad.open(); await pad.ready();
  await pad.connect(true, false); await pad.frames();
  await pad.press(0);
  expect(await pad.keys()).toEqual([' ']);
  await pad.settings();
  await page.getByRole('button', { name: '手柄快捷键', exact: true }).click();
  await expect(page.getByText('手柄已连接', { exact: true })).toBeVisible();
  await expect(page.getByText('连接手柄后按任意键', { exact: true })).toBeHidden();
  await pad.connect(false);
  await expect(page.getByText('连接手柄后按任意键', { exact: true })).toBeVisible();
  await pad.press(0);
  expect(await pad.keys()).toHaveLength(1);
  await pad.button(0, true); await pad.connect(); await pad.frames();
  await expect(page.getByText('手柄已连接', { exact: true })).toBeVisible();
  expect(await pad.keys()).toHaveLength(1); // The activation press is not a playback command.
  await pad.button(0, false); await pad.press(0);
  expect(await pad.keys()).toHaveLength(2);
  expect(pad.errors).toEqual([]);
});

test('reenabling control ignores a held activation button and updates the displayed status', async ({ page }) => {
  const pad = await prepare(page);
  await pad.open(); await pad.ready(); await pad.connect(); await pad.frames();
  await pad.settings();
  await page.getByRole('button', { name: '手柄快捷键', exact: true }).click();
  const toggle = page.getByRole('switch', { name: '手柄控制', exact: true });
  await toggle.click();
  await expect(page.getByText('手柄控制已关闭', { exact: true })).toBeVisible();
  await pad.press(0); await pad.button(0, true); await pad.button(2, true);
  expect(await pad.keys()).toEqual([]);
  await toggle.click(); await pad.frames();
  expect(await pad.keys()).toEqual([]);
  await pad.button(0, false); await pad.button(2, false); await pad.press(0);
  expect(await pad.keys()).toEqual([' ']);
  await expect(page.getByText('手柄已连接', { exact: true })).toBeVisible();
  expect(pad.errors).toEqual([]);
});

test('native key repeat and shoulder tab changes continue after part reload', async ({ page }) => {
  const pad = await prepare(page);
  await pad.connect(); await pad.open(); await pad.ready();
  await page.getByRole('tab', { name: '分P', exact: true }).click();
  await page.getByRole('button', { name: '播放：2. 看见新的风景', exact: true }).click();
  await pad.frames(); await pad.press(0);
  expect(await pad.keys()).toEqual([' ']);
  await pad.button(2, true);
  await expect.poll(() => page.evaluate(() => window.__gamepad.keys.filter(event => event.type === 'keydown' && event.key === 'ArrowLeft' && event.repeat).length)).toBeGreaterThan(0);
  await pad.button(2, false);
  expect(await page.evaluate(() => window.__gamepad.keys.at(-1))).toMatchObject({ type: 'keyup', key: 'ArrowLeft' });
  await pad.press(5);
  await expect(page.getByRole('tab', { name: '播放列表', exact: true })).toHaveAttribute('aria-selected', 'true');
  await pad.press(4);
  await expect(page.getByRole('tab', { name: '分P', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect(pad.errors).toEqual([]);
});
