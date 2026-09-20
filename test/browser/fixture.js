import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const APP = 'bili-popup-player-nano';
const bundle = readFileSync(fileURLToPath(new URL('../../bilibili-popup-player-nano.user.js', import.meta.url)), 'utf8');
export const fixture = `<!doctype html><html><head><title>小窗播放 · 交互验证</title><meta property="og:title" content="正在播放的番剧"><style>
*{box-sizing:border-box}body{margin:0;background:#f7f8fa;color:#242936;font:14px system-ui,-apple-system,"Microsoft YaHei",sans-serif}a{color:inherit;text-decoration:none}header{height:64px;padding:0 48px;display:flex;align-items:center;gap:32px;background:white;border-bottom:1px solid #ebedf1}header strong{color:#e95183;font-size:19px}main{padding:28px 48px}h1{font-size:22px;margin:0 0 20px}h2{font-size:15px;margin:28px 0 16px}.stage-row{display:flex;gap:24px}#bofqi{display:grid;place-items:center;width:740px;height:300px;background:#1a202c;border-radius:12px;color:#aeb5c4}.ep-list{display:grid;grid-template-columns:repeat(4,44px);gap:10px;align-content:start}.ep-list a{display:grid;place-items:center;height:38px;background:#eee;border-radius:6px}.cards{display:flex;gap:22px}.video-card{width:238px;position:relative}.cover{display:block;width:238px;height:134px;border-radius:10px;overflow:hidden;background:#d8e1e8}.cover img{display:block;width:100%;height:100%;object-fit:cover}.title{display:block;margin:10px 0 4px;font-size:14px}.subtitle{font-size:12px;color:#98a0ad}.clipped{height:90px;overflow:hidden;width:238px;position:relative}.spacer{height:900px}
</style></head><body><header><strong>小窗播放</strong><span>首页</span><span>番剧</span><span>动态</span><span style="margin-left:auto;color:#939aa8">本地交互验证</span></header><main><h1 title="正在播放的番剧">正在播放的番剧</h1><div class="stage-row"><div id="bofqi">原站播放器 · 选集和弹层保持原有交互</div><div class="ep-list"><a href="/bangumi/play/ep101">1</a><a href="/bangumi/play/ep102">2</a><a href="/bangumi/play/ep103">3</a><a href="/bangumi/play/ep104">4</a></div></div><h2>你可能还喜欢</h2><section class="cards">
<article class="video-card" id="card-a"><a class="cover" href="/bangumi/play/ep201" title="旅途中的风景"><img alt="旅途中的风景" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='270'%3E%3Crect width='480' height='270' fill='%238dacb1'/%3E%3Cpath d='M0 250 170 40 340 270H0' fill='%23688084'/%3E%3Cpath d='m180 270 170-195 160 195' fill='%23a4bcc0'/%3E%3Ccircle cx='390' cy='56' r='22' fill='%23f5e1b9'/%3E%3C/svg%3E"></a><a class="title" href="/bangumi/play/ep201">旅途中的风景</a><span class="subtitle">一段关于出发与相遇的故事</span></article>
<article class="video-card" id="card-b"><a class="cover" href="/video/BV1test002/" title="留一点时间给自己"><img alt="留一点时间给自己" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='270'%3E%3Crect width='480' height='270' fill='%23cdb7a0'/%3E%3Crect x='120' y='30' width='120' height='180' rx='60' fill='%23e9d9c8'/%3E%3Cpath d='M0 230 480 180v90H0' fill='%23a68c76'/%3E%3C/svg%3E"></a><a class="title" href="/video/BV1test002/">留一点时间给自己</a><span class="subtitle">在日常里，发现新的视角</span></article>
<article class="video-card" id="card-c"><a class="cover" href="/bangumi/play/ep203" title="城市之外"><img alt="城市之外" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='270'%3E%3Crect width='480' height='270' fill='%238797ac'/%3E%3Cpath d='M0 80h80v190H0m120-230h70v230h-70m110-170h110v170H230m150-220h100v220H380' fill='%235f6f89'/%3E%3C/svg%3E"></a><a class="title" href="/bangumi/play/ep203">城市之外</a><span class="subtitle">走出熟悉的边界</span></article>
</section><div id="extra"></div><div class="spacer"></div></main></body></html>`;

export async function loadFixture(page, path = '/bangumi/play/ep101', { disabled = false } = {}) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    if (route.request().isNavigationRequest() && route.request().frame() === page.mainFrame()) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture });
    return route.abort();
  });
  await page.goto(new URL(path, 'https://www.bilibili.com').href);
  if (disabled) await page.evaluate(key => localStorage.setItem(key + ':enabled', '0'), APP);
  await page.addScriptTag({ content: bundle });
  return errors;
}

export function cardButton(page, key = 'ep201') {
  const value = key.startsWith('ep') ? `ogv:ep:${key.slice(2)}` : key;
  return page.locator(`#${APP}-host`).locator(`button[data-key="${value}"]`);
}

export async function mockPlayback(page) {
  const pages = [{ cid: 301, page: 1, part: '从日常出发', duration: 180 }, { cid: 302, page: 2, part: '看见新的风景', duration: 240 }];
  await page.route('https://api.bilibili.com/**', route => {
    const url = route.request().url();
    const data = url.includes('/pagelist') ? pages : url.includes('/view/detail') ? {
      View: { aid: 200, bvid: 'BV1test002', cid: 301, title: '留一点时间给自己', desc: '在日常里，发现新的视角。', pic: '', owner: { mid: 100, name: '日常观察室' }, stat: { view: 42680, like: 1280 }, pages },
      Related: [{ aid: 201, bvid: 'BV1test003', cid: 303, title: '下一站，慢慢走', duration: 180, pic: '', owner: { mid: 100, name: '日常观察室' }, stat: { view: 10240 } }],
    } : {};
    return route.fulfill({ json: { code: 0, data } });
  });
  await page.evaluate(() => {
    window.__mockPlayback = { created: 0, paused: 0, disconnected: 0, externalPaused: 0, externalPlayed: 0 };
    const log = window.__mockPlayback;
    window.nano = {
      GroupKind: { Ugc: 0, Pgc: 1 }, ScreenKind: { Normal: 0, Wide: 1, Web: 2, Full: 4 }, EventType: {},
      createPlayer(setting) {
        log.created++;
        log.screenKind = setting.screenKind;
        let current = setting;
        return {
          connect() { current.element.innerHTML = '<div class="bpx-player-container" style="height:100%;display:grid;place-items:center;background:#141c28;color:#cbd3df;font:14px system-ui"><div style="text-align:center"><div style="font-size:30px;margin-bottom:14px">▷</div>播放器测试画面<br><span style="display:block;margin-top:10px;font-size:11px;color:#718096">同一个播放实例 · 持续播放</span></div></div>'; },
          reload(next) { current = next; log.screenKind = next.screenKind; }, pause() { log.paused++; }, play() {}, resize() {}, toggleFeature() {}, getCurrentTime() { return 30; }, getDuration() { return 180; }, disconnect() { log.disconnected++; },
        };
      },
    };
    window.BiliComments = class {
      mount(element) {
        element.innerHTML = '<div style="padding:20px;color:#757d8b;font:13px system-ui">评论区测试内容</div>';
        return { methods: { reload() {} }, unmount() { element.textContent = ''; } };
      }
    };
    const video = document.createElement('video');
    Object.defineProperty(video, 'paused', { get: () => false });
    video.pause = () => { log.externalPaused++; };
    video.play = () => { log.externalPlayed++; return Promise.resolve(); };
    document.querySelector('#bofqi').append(video);
  });
}
