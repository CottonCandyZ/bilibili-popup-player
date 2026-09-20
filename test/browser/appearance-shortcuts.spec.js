import { test, expect } from '@playwright/test';
import { APP as A, cardButton, loadFixture, mockPlayback } from './fixture.js';

async function openPlayer(page, context, kind = 'home', prepare) {
  const errors = await loadFixture(page, kind === 'home' ? '/bangumi/play/ep101' : '/video/BV1test002/');
  await mockPlayback(page);
  await prepare?.();
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
  return { surface, errors };
}

for (const kind of ['home', 'pip']) test(`${kind} accent presets and custom colors apply immediately without changing the host page`, async ({ page, context }) => {
  const { surface, errors } = await openPlayer(page, context, kind);
  const original = await page.locator('body').evaluate(el => getComputedStyle(el).getPropertyValue('--brand_blue'));
  const frame = surface.locator(kind === 'home' ? `#${A}-player-wrap` : '#stage');
  await frame.hover();
  await surface.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await surface.getByRole('button', { name: /主题配色/ }).click();
  const toggle = surface.getByRole('switch', { name: '小窗播放', exact: true });
  const tab = surface.getByRole('tab', { name: '评论', exact: true });
  await expect(surface.getByRole('radio', { name: '哔哩粉', exact: true })).toBeChecked();
  await expect(toggle).toHaveCSS('background-color', 'rgb(251, 114, 153)');
  for (const [label, color] of [['哔哩粉', 'rgb(251, 114, 153)'], ['哔哩蓝', 'rgb(0, 174, 236)']]) {
    await surface.getByRole('radio', { name: label, exact: true }).click();
    await expect(toggle).toHaveCSS('background-color', color);
    await expect(tab).toHaveCSS('border-bottom-color', color);
  }
  const hex = surface.getByRole('textbox', { name: '主题色十六进制值', exact: true });
  await hex.fill('#7546de');
  await expect(toggle).toHaveCSS('background-color', 'rgb(117, 70, 222)');
  await expect(surface.getByRole('radio', { name: '自定义', exact: true })).toBeChecked();
  await hex.fill('invalid'); await hex.press('Enter');
  await expect(hex).toHaveValue('#7546de');
  await surface.getByRole('radio', { name: '哔哩粉', exact: true }).click();
  await surface.getByRole('radio', { name: '自定义', exact: true }).click();
  await expect(toggle).toHaveCSS('background-color', 'rgb(117, 70, 222)');
  expect(await page.locator('body').evaluate(el => getComputedStyle(el).getPropertyValue('--brand_blue'))).toBe(original);
  expect(await page.locator('#' + A + '-host').evaluate((el, A) => getComputedStyle(el).getPropertyValue(`--${A}-accent`).trim(), A)).toBe('#7546de');
  await surface.getByRole('radio', { name: '黑白', exact: true }).click();
  await expect(toggle).toHaveCSS('background-color', 'rgb(32, 33, 36)');
  await surface.getByRole('radio', { name: '哔哩蓝', exact: true }).click();
  if (kind === 'pip') await surface.close();
  await loadFixture(page);
  await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await expect(page.getByRole('switch', { name: '小窗播放', exact: true })).toHaveCSS('background-color', 'rgb(0, 174, 236)');
  await page.getByRole('button', { name: /主题配色/ }).click();
  await expect(page.getByRole('radio', { name: '哔哩蓝', exact: true })).toBeChecked();
  expect(errors).toEqual([]);
});

for (const kind of ['home', 'pip']) for (const scheme of ['light', 'dark']) test(`${kind} ${scheme} native controls, comments and action dialogs inherit the selected accent`, async ({ page, context }) => {
  await context.addCookies([
    { name: 'theme_style', value: scheme, domain: '.bilibili.com', path: '/' },
    { name: 'bili_jct', value: 'mock-csrf', domain: '.bilibili.com', path: '/' },
    { name: 'DedeUserID', value: '100', domain: '.bilibili.com', path: '/' },
  ]);
  const { surface, errors } = await openPlayer(page, context, kind, async () => {
    await page.route('**/x/v3/fav/folder/created/list-all?**', route => route.fulfill({ json: { code: 0, data: { list: [{ id: 1, title: '测试收藏夹', media_count: 0, fav_state: 0 }] } } }));
  });
  await surface.addStyleTag({ content: `
    :root { --bg1:${scheme === 'dark' ? '#17181a' : '#fff'}; --bg2:${scheme === 'dark' ? '#242628' : '#f4f4f4'}; --text1:${scheme === 'dark' ? '#e3e5e7' : '#202124'}; --brand_blue:#00aeec; --v_brand_blue:var(--brand_blue); --bpx-fn-color:var(--brand_blue); }
    .bui-bar, .bui-progress-bar, .bui-button-blue { background:var(--bpx-fn-color); }
    .bui-danmaku-switch { fill:rgba(255,255,255,.9); }
  ` });
  await surface.evaluate(({ A, kind }) => {
    const root = document.getElementById(kind === 'home' ? A + '-player' : 'bilibili-player').firstChild;
    root.insertAdjacentHTML('beforeend', `<div class="bui-bar">音量</div><div class="bui-progress-bar">进度</div><div class="bui-button"><span class="bui-area bui-button-blue">发送</span></div>
      <div class="bui-danmaku-switch"><span class="bui-danmaku-switch-on"><svg><path data-tv-outline d="M0 0H10V10"/><path data-legacy-check fill="#00AEEC" d="M0 0L10 10"/></svg></span><span class="bui-danmaku-switch-off"><svg><path data-off-icon d="M0 0H10V10"/></svg></span></div>
      <div class="bui-danmaku-switch bui-danmaku-switch-new"><svg><path data-danmu-color="accent" fill="#00AEEC" d="M0 0L10 10"/><path data-tv-outline d="M0 0H10V10"/></svg></div>`);
    const mount = document.getElementById(kind === 'home' ? A + '-comments-mount' : 'comments-mount');
    const box = document.createElement('bili-comment-box');
    box.attachShadow({ mode: 'open' }).innerHTML = '<style>#pub button {background:rgba(0,174,236,.5);color:white} #pub button.active{background:var(--brand_blue)}</style><div id="pub"><button class="active">评论发送</button></div>';
    const header = document.createElement('bili-comments-header-renderer');
    header.attachShadow({ mode: 'open' }).innerHTML = '<style>button{background:var(--v_brand_blue);color:white}</style><div id="disabled-commentbox"><div id="edit"><button>登录测试</button></div></div>';
    mount.append(box, header);
  }, { A, kind });
  const frame = surface.locator(kind === 'home' ? `#${A}-player-wrap` : '#stage');
  await frame.hover();
  await surface.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await surface.getByRole('button', { name: /主题配色/ }).click();
  for (const [label, color, foreground] of scheme === 'dark' ? [
    ['黑白', 'rgb(227, 229, 231)', 'rgb(23, 24, 26)'],
    ['哔哩粉', 'rgb(215, 100, 133)', 'rgb(255, 255, 255)'],
    ['哔哩蓝', 'rgb(4, 150, 202)', 'rgb(255, 255, 255)'],
  ] : [
    ['黑白', 'rgb(32, 33, 36)', 'rgb(255, 255, 255)'],
    ['哔哩粉', 'rgb(251, 114, 153)', 'rgb(255, 255, 255)'],
    ['哔哩蓝', 'rgb(0, 174, 236)', 'rgb(255, 255, 255)'],
  ]) {
    await surface.getByRole('radio', { name: label, exact: true }).click();
    const follow = surface.getByRole('button', { name: '关注 UP 主', exact: true });
    await expect(follow).toHaveCSS('background-color', color);
    await expect(follow).toHaveCSS('color', foreground);
    const videoColor = label === '黑白' ? 'rgb(255, 255, 255)' : color;
    for (const selector of ['.bui-bar', '.bui-progress-bar', '.bui-button-blue']) await expect(surface.locator(selector)).toHaveCSS('background-color', videoColor);
    await expect(surface.locator('.bui-button-blue')).toHaveCSS('color', label === '黑白' ? 'rgb(17, 17, 17)' : 'rgb(255, 255, 255)');
    await expect(surface.locator('[data-danmu-color="accent"]')).toHaveCSS('fill', videoColor);
    await expect(surface.locator('[data-legacy-check]')).toHaveCSS('fill', videoColor);
    for (const icon of await surface.locator('[data-tv-outline], [data-off-icon]').all()) await expect(icon).toHaveCSS('fill', 'rgba(255, 255, 255, 0.9)');
    await expect(surface.getByRole('button', { name: '评论发送', exact: true })).toHaveCSS('background-color', color);
    await expect(surface.getByRole('button', { name: '评论发送', exact: true })).toHaveCSS('color', foreground);
    await expect(surface.getByRole('button', { name: '登录测试', exact: true })).toHaveCSS('color', foreground);
    await expect(surface.getByRole('button', { name: '登录测试', exact: true })).toHaveCSS('background-color', color);
  }
  if (scheme === 'dark') {
    await surface.getByRole('switch', { name: '深色单独配色', exact: true }).click();
    await surface.getByRole('textbox', { name: '深色主题色十六进制值', exact: true }).fill('#6a3592');
    await expect(surface.getByRole('button', { name: '关注 UP 主', exact: true })).toHaveCSS('background-color', 'rgb(106, 53, 146)');
    await expect(surface.getByRole('button', { name: '关注 UP 主', exact: true })).toHaveCSS('color', 'rgb(255, 255, 255)');
    // Switching the site theme uses the light preset, without destroying the
    // dark override. A later return to dark mode restores that independent hue.
    await page.evaluate(() => { document.cookie = 'theme_style=light;domain=.bilibili.com;path=/'; });
    await expect(surface.getByRole('button', { name: '关注 UP 主', exact: true })).toHaveCSS('background-color', 'rgb(0, 174, 236)');
    await page.evaluate(() => { document.cookie = 'theme_style=dark;domain=.bilibili.com;path=/'; });
    await expect(surface.getByRole('button', { name: '关注 UP 主', exact: true })).toHaveCSS('background-color', 'rgb(106, 53, 146)');
    await surface.getByRole('switch', { name: '深色单独配色', exact: true }).click();
  }
  const accent = scheme === 'dark' ? 'rgb(4, 150, 202)' : 'rgb(0, 174, 236)';
  await surface.keyboard.press('Escape');
  await surface.getByRole('button', { name: '关注 UP 主', exact: true }).click();
  const followed = surface.getByRole('button', { name: '取消关注 UP 主', exact: true });
  await expect(followed).toHaveCSS('color', accent);
  await followed.hover();
  expect(await followed.evaluate(el => getComputedStyle(el, '::after').color)).toBe(accent);
  if (kind === 'home') await surface.locator(`#${A}-dialog`).evaluate(el => el.requestFullscreen());
  await surface.getByRole('button', { name: '投币', exact: true }).click();
  const coin = surface.getByRole('dialog', { name: '投币', exact: true });
  await expect(coin.getByRole('button', { name: '确定', exact: true })).toHaveCSS('background-color', accent);
  if (kind === 'home') expect(await coin.evaluate(el => document.fullscreenElement.contains(el))).toBe(true);
  await coin.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(coin).toHaveCount(0);
  if (kind === 'home') await surface.evaluate(() => document.exitFullscreen());
  await expect(frame).toBeVisible();
  await surface.getByRole('button', { name: '收藏', exact: true }).click();
  const favorite = surface.getByRole('dialog', { name: '添加到收藏夹', exact: true });
  await favorite.getByText('测试收藏夹', { exact: true }).click();
  await expect(favorite.getByRole('checkbox', { name: /测试收藏夹/ })).toBeChecked();
  await expect(favorite.locator(`.${A}__favorite-item i`)).toHaveCSS('background-color', accent);
  await expect(favorite.getByRole('button', { name: '确定', exact: true })).toHaveCSS('background-color', accent);
  await surface.keyboard.press('Escape');
  await expect(favorite).toHaveCount(0);
  await expect(frame).toBeVisible();
  expect(errors).toEqual([]);
  if (kind === 'pip') await surface.close();
});

test('an explicitly saved monochrome palette survives the new pink default', async ({ page }) => {
  await loadFixture(page);
  await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await page.getByRole('button', { name: /主题配色/ }).click();
  await expect(page.getByRole('radio', { name: '哔哩粉', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: '黑白', exact: true }).click();
  await loadFixture(page);
  await page.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await page.getByRole('button', { name: /主题配色/ }).click();
  await expect(page.getByRole('radio', { name: '黑白', exact: true })).toBeChecked();
  await expect(page.getByRole('switch', { name: '小窗播放', exact: true })).toHaveCSS('background-color', 'rgb(32, 33, 36)');
});

for (const kind of ['home', 'pip']) test(`${kind} sends complete native key sequences without replacing them or stealing widget input`, async ({ page, context }) => {
  const { surface, errors } = await openPlayer(page, context, kind, () => page.evaluate(() => {
    const create = window.nano.createPlayer;
    const media = window.__mediaKeys = { events: [], apiCalls: [] };
    window.nano.createPlayer = setting => {
      const player = create(setting), connect = player.connect;
      return Object.assign(player, {
        seek() { media.apiCalls.push('seek'); },
        getVolume: () => .5, setVolume() { media.apiCalls.push('volume'); },
        isPaused: () => true,
        connect() {
          connect();
          // Nano owns window listeners, not listeners on the shell element.
          const win = setting.element.ownerDocument.defaultView;
          for (const type of ['keydown', 'keyup']) win.addEventListener(type, event => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) return;
            media.events.push({ type, key: event.key, repeat: event.repeat, trusted: event.isTrusted });
            event.preventDefault();
          });
        },
      });
    };
  }));
  const root = surface.locator(kind === 'home' ? `#${A}-player` : '#bilibili-player');
  await root.evaluate(el => { el.tabIndex = -1; el.focus(); });
  for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Space']) await surface.keyboard.press(key);
  expect(await page.evaluate(() => window.__mediaKeys.events)).toEqual(
    ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', ' '].flatMap(key => ['keydown', 'keyup'].map(type => ({ type, key, repeat: false, trusted: true }))),
  );
  const downCount = () => page.evaluate(() => window.__mediaKeys.events.filter(event => event.type === 'keydown').length);
  await surface.getByRole('tab', { name: '评论', exact: true }).focus();
  await surface.keyboard.press('ArrowRight');
  expect(await downCount()).toBe(5);
  await surface.getByRole('tab', { name: '评论', exact: true }).click();
  await surface.locator(kind === 'home' ? `#${A}-comments-mount` : '#comments-mount').evaluate(el => {
    const editor = document.createElement('test-comment-editor');
    editor.attachShadow({ mode: 'open' }).innerHTML = '<textarea aria-label="评论输入测试"></textarea>';
    el.append(editor);
  });
  const input = surface.getByRole('textbox', { name: '评论输入测试', exact: true });
  await input.fill('测试'); await input.press('ArrowLeft'); await input.press('Space');
  expect(await downCount()).toBe(5);

  // Holding right must reach Nano as a single press plus repeat events. Its
  // release must still arrive when focus moves into a comment before keyup.
  await root.focus();
  await page.evaluate(() => { window.__mediaKeys.events = []; });
  await surface.keyboard.down('ArrowRight');
  await surface.waitForTimeout(350);
  await surface.keyboard.down('ArrowRight');
  await surface.keyboard.down('ArrowRight');
  await input.focus();
  await surface.keyboard.up('ArrowRight');
  expect(await page.evaluate(() => window.__mediaKeys.events)).toEqual([
    { type: 'keydown', key: 'ArrowRight', repeat: false, trusted: true },
    { type: 'keydown', key: 'ArrowRight', repeat: true, trusted: true },
    { type: 'keydown', key: 'ArrowRight', repeat: true, trusted: true },
    { type: 'keyup', key: 'ArrowRight', repeat: false, trusted: true },
  ]);
  await surface.locator(kind === 'home' ? `#${A}-player-wrap` : '#stage').hover();
  await surface.getByRole('button', { name: '小窗播放设置', exact: true }).click();
  await surface.getByRole('switch', { name: '联播倒计时', exact: true }).focus();
  await surface.keyboard.press('Space');
  await expect(surface.getByRole('switch', { name: '联播倒计时', exact: true })).not.toBeChecked();
  expect(await downCount()).toBe(3);
  expect(await page.evaluate(() => window.__mediaKeys.apiCalls)).toEqual([]);
  expect(errors).toEqual([]);
  if (kind === 'pip') await surface.close();
});

test('episode buttons use the public navigation API after selection and delayed native reloads', async ({ page, context }) => {
  const { errors } = await openPlayer(page, context, 'home', () => page.evaluate(() => {
    const create = window.nano.createPlayer;
    window.nano.EventType.Player_Prepared = 'prepared';
    window.nano.createPlayer = setting => {
      const player = create(setting), connect = player.connect;
      const events = new Map();
      const setNavigationState = flags => {
        for (const [key, flag] of [['prev', 'hasPrev'], ['next', 'hasNext']]) {
          const button = setting.element.querySelector('.bpx-player-ctrl-' + key);
          if (button) button.hidden = !flags[flag];
        }
      };
      window.__resetNativeNavigation = () => { setNavigationState({ hasPrev:false, hasNext:false }); events.get('prepared')?.(); };
      return Object.assign(player, {
        connect() {
          connect();
          setting.element.firstChild.insertAdjacentHTML('beforeend', '<div style="position:absolute;bottom:20px;left:20px"><button class="bpx-player-ctrl-prev" hidden>上一集测试</button><button class="bpx-player-ctrl-next" hidden>下一集测试</button></div>');
        },
        on(type, handler) { events.set(type, handler); }, off(type) { events.delete(type); },
        episode: { setNavigationState },
      });
    };
  }));
  await expect(page.getByRole('button', { name:'下一集测试', exact:true })).toBeVisible();
  await expect(page.getByRole('button', { name:'上一集测试', exact:true })).toBeHidden();
  await page.getByRole('button', { name:'下一集测试', exact:true }).click();
  await expect(page.getByRole('button', { name:'上一集测试', exact:true })).toBeVisible();
  await page.evaluate(() => window.__resetNativeNavigation());
  await expect(page.getByRole('button', { name:'上一集测试', exact:true })).toBeVisible();
  await expect(page.getByRole('button', { name:'下一集测试', exact:true })).toBeHidden();
  expect(errors).toEqual([]);
});
