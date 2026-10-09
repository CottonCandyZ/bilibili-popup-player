import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fixture, mockPlayback, APP as A, cardButton } from '../browser/fixture.js';

// See compatibility.md for the generated media and resource limits. All page/API
// requests are fulfilled locally; this does not load Bilibili's native player.
const folder = pathToFileURL(resolve(process.env.PERF_OUTPUT || '.cache/playback-profile') + '/');
const rates = (process.env.PERF_CPU_RATES || '1,4,6').split(',').map(Number);
if (rates.some(rate => !Number.isFinite(rate) || rate < 1)) throw new Error('PERF_CPU_RATES must be numbers >= 1');
const revisions = ['normal', ...(process.env.PERF_BASELINE ? ['baseline'] : []), 'optimized'];
await mkdir(folder, { recursive: true });
const media = await readFile(resolve(process.env.PERF_MEDIA || '.cache/perf/sample-1080p60.mp4'));
const results = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function summarizeProfile(profile) {
  const times = new Map();
  for (let i = 0; i < profile.samples.length; i++) times.set(profile.samples[i], (times.get(profile.samples[i]) || 0) + profile.timeDeltas[i]);
  return profile.nodes.map(node => ({ function: node.callFrame.functionName || '(anonymous)', file: node.callFrame.url,
    line: node.callFrame.lineNumber + 1, selfMs: (times.get(node.id) || 0) / 1000 }))
    .sort((a, b) => b.selfMs - a.selfMs).slice(0, 18);
}

for (const revision of revisions) {
  const browser = await chromium.launch({ executablePath: process.env.PERF_CHROMIUM || '/usr/bin/chromium',
    headless: true, args: [...(process.env.PERF_DISABLE_GPU === '0' ? [] : ['--disable-gpu']), '--autoplay-policy=no-user-gesture-required'] });
  try {
    const system = await browser.newBrowserCDPSession();
    const { gpu } = await system.send('SystemInfo.getInfo');
    const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      if (route.request().isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: fixture });
      return route.abort();
    });
    await page.route('http://performance.local/sample.mp4', route => route.fulfill({ contentType: 'video/mp4', body: media }));
    await page.goto('https://www.bilibili.com/bangumi/play/ep101');
    await page.evaluate(A => {
      const getter = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth').get;
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() {
        return this.dataset.scrollbarProbe === A ? this.clientWidth + 14 : getter.call(this);
      } });
    }, A);
    if (revision !== 'normal') {
      const code = await readFile(resolve(revision === 'baseline' ? process.env.PERF_BASELINE : process.env.PERF_CURRENT || 'bilibili-popup-player-nano.user.js'), 'utf8');
      await page.addScriptTag({ content: code + `\n//# sourceURL=popup-${revision}.js` });
      await mockPlayback(page);
      await page.locator('#card-b .cover').hover();
      await cardButton(page, 'BV1test002').click();
      await page.locator(`#${A}-player .bpx-player-container`).waitFor();
    }
    await page.addStyleTag({ content: `
      .perf-stage { position:relative;width:100%;height:100%;overflow:hidden;background:black; }
      .perf-stage video { position:absolute;left:0;top:0;width:640px;height:360px;object-fit:contain; }
      .perf-dm { position:absolute;left:0;top:0;width:640px;height:360px;overflow:hidden;pointer-events:none; }
      .perf-dm span { position:absolute;left:640px;color:white;text-shadow:1px 1px black;font:16px sans-serif;white-space:nowrap;animation:perf-roll 6s linear infinite; }
      @keyframes perf-roll { to { transform:translateX(-1000px); } }
      .perf-progress { position:absolute;top:370px;left:8px;color:white; }
    ` });
    await page.evaluate(({ A, revision }) => {
      const root = revision === 'normal' ? document.getElementById('bofqi') : document.querySelector(`#${A}-player .bpx-player-container`);
      root.innerHTML = '<div class="perf-stage"><video muted autoplay loop src="http://performance.local/sample.mp4"></video><div class="perf-dm bpx-player-row-dm-wrap"></div><div class="perf-progress"></div></div>';
      if (revision === 'normal') { root.style.width = '740px'; root.style.height = '440px'; }
      const video = root.querySelector('video');
      window.__perfVideo = video;
      let comments = document.getElementById(A + '-comments-mount');
      if (!comments) { comments = document.createElement('section'); document.body.append(comments); }
      comments.innerHTML = Array.from({ length: 100 }, (_, i) => `<article style="padding:8px;border-bottom:1px solid #8882"><div>用户 ${i}</div><div>性能测试评论，验证播放期间侧栏的布局与 DOM 观察器开销。</div><div><button>回复</button><span> ${i} 赞</span></div></article>`).join('');
      // Keep 180 moving nodes even when throttling delays timers. A rolling
      // append/remove list otherwise gets sparser on the slowest variant and
      // makes its frame-drop comparison misleading.
      const danmaku = root.querySelector('.perf-dm'), started = performance.now();
      function bullet(index) {
        const node = document.createElement('span');
        node.textContent = '滚动弹幕 ' + index;
        node.style.top = (index % 18) * 19 + 'px';
        node.style.animationDelay = -(((performance.now() - started) / 1000 + index / 30) % 6) + 's';
        return node;
      }
      for (let i = 0; i < 180; i++) danmaku.append(bullet(i));
      let counter = 180;
      window.__dmTimer = setInterval(() => {
        danmaku.firstElementChild.replaceWith(bullet(counter++));
        danmaku.append(danmaku.firstElementChild);
      }, 33);
      setInterval(() => { root.querySelector('.perf-progress').textContent = video.currentTime.toFixed(2); }, 250);
      video.play();
    }, { A, revision });
    await page.mouse.move(0, 0);
    await page.waitForFunction(() => window.__perfVideo.videoWidth === 1920 && window.__perfVideo.currentTime > .5);
    await wait(14000);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
    const processes = async () => (await system.send('SystemInfo.getProcessInfo')).processInfo;
    const cases = rates.map(rate => ({name:'cpu'+rate,rate}));
    if (revision === 'optimized') cases.push(...rates.map(rate=>({name:'cpu'+rate+'-blur-off',rate})));
    for (const entry of cases) {
      await page.evaluate(({ A, mode }) => {
        const overlay = document.getElementById(A+'-overlay');
        if (overlay) overlay.dataset.backgroundBlur = String(!mode.endsWith('blur-off'));
      }, { A, mode: entry.name });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: entry.rate });
      await wait(4000);
      const playbackBefore = await page.evaluate(() => ({ time: window.__perfVideo.currentTime, ...window.__perfVideo.getVideoPlaybackQuality().toJSON?.(),
        total: window.__perfVideo.getVideoPlaybackQuality().totalVideoFrames, dropped: window.__perfVideo.getVideoPlaybackQuality().droppedVideoFrames }));
      const procBefore = await processes(), processStart = performance.now(), before = await metrics();
      const start = performance.now();
      await cdp.send('Profiler.start');
      await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8,blink,cc,gpu', transferMode: 'ReturnAsStream' });
      await wait(8000);
      const { profile } = await cdp.send('Profiler.stop');
      const elapsed = (performance.now() - start) / 1000;
      const after = await metrics(), procAfter = await processes();
      const processElapsed = (performance.now() - processStart) / 1000;
      const playbackAfter = await page.evaluate(() => ({ total: window.__perfVideo.getVideoPlaybackQuality().totalVideoFrames,
        dropped: window.__perfVideo.getVideoPlaybackQuality().droppedVideoFrames, videoWidth: window.__perfVideo.videoWidth,
        videoHeight: window.__perfVideo.videoHeight, decodedBytes: window.__perfVideo.webkitVideoDecodedByteCount,
        box: window.__perfVideo.getBoundingClientRect().toJSON(), activeDanmaku: document.querySelector('.perf-dm').childElementCount }));
      const traceReady = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
      await cdp.send('Tracing.end');
      const { stream } = await traceReady;
      let trace = '';
      while (true) { const part = await cdp.send('IO.read', { handle: stream }); trace += part.data; if (part.eof) break; }
      await cdp.send('IO.close', { handle: stream });
      const name = revision + '-' + entry.name;
      await page.screenshot({path:new URL(name+'.png',folder).pathname});
      await writeFile(new URL(name + '.trace.json', folder), trace);
      await writeFile(new URL(name + '.cpuprofile', folder), JSON.stringify(profile));
      const processCpu = {};
      for (const p of procAfter) { const old = procBefore.find(x => x.id === p.id); if (old) processCpu[p.type] = (processCpu[p.type] || 0) + (p.cpuTime - old.cpuTime) / processElapsed * 100; }
      const row = { revision, case: entry.name, throttle: entry.rate, elapsed, processElapsed, processCpuPctOfOneCore: processCpu,
        metrics: Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','LayoutCount','RecalcStyleCount'].map(k => [k, after[k]-before[k]])),
        video: { ...playbackAfter, total: playbackAfter.total-playbackBefore.total, dropped: playbackAfter.dropped-playbackBefore.dropped },
        topSelf: summarizeProfile(profile), errors: [...errors], browserVersion: browser.version(), gpu: gpu.featureStatus };
      results.push(row);
      await writeFile(new URL('results.json', folder), JSON.stringify(results, null, 2));
      console.log(JSON.stringify({ revision, case: entry.name, cpu: processCpu, metrics: row.metrics, frames: row.video.total, dropped: row.video.dropped,
        hot: row.topSelf.filter(x=>!['(idle)','(program)'].includes(x.function)).slice(0,7) }));
    }
    await page.screenshot({ path: new URL(revision + '.png', folder).pathname });
  } finally { await browser.close(); }
}
