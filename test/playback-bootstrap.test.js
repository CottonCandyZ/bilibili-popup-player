import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePlaybackBootstrap } from '../src/playback-bootstrap.js';
import { readPlaybackPageData } from '../src/playback-page-data.js';

const meta = { bvid: 'BV1test002', href: 'https://www.bilibili.com/video/BV1test002/', title: '卡片标题' };
const videoData = { aid: 200, bvid: meta.bvid, cid: 301, title: '测试视频', owner: { mid: 100, name: 'UP' },
  pages: [{ cid: 301, page: 1, part: '第一 P' }, { cid: 302, page: 2, part: '第二 P' }] };
const json = (data, status = 200) => Response.json(data, { status });
const pageHtml = (state, playInfo = null) => `<script>window.__INITIAL_STATE__ = ${JSON.stringify(state)};</script>
  <script>window.__playinfo__=${JSON.stringify(playInfo)};</script>
  <script src="//s1.hdslb.com/bfs/static/player/main/core.b237bb82.js"></script>`;

async function withPage(fetch, run, state) {
  const previous = { fetch: globalThis.fetch, location: globalThis.location, window: globalThis.window };
  globalThis.fetch = fetch;
  globalThis.location = { href: 'https://www.bilibili.com/' };
  globalThis.window = state || {};
  try { return await run(); } finally { Object.assign(globalThis, previous); }
}

test('a rejected detail API falls back to basic video info, preserving the selected part and original error', async () => {
  const requested = [];
  await withPage(async url => {
    requested.push(url);
    if (url.includes('/wbi/view/detail')) return json({ code: -352, message: '风控校验失败' });
    if (url.includes('/web-interface/view?')) return json({ code: 0, data: videoData });
    throw new Error('unexpected request');
  }, async () => {
    const result = await resolvePlaybackBootstrap({ ...meta, p: 2 });
    assert.equal(result.playerInfo.cid, 302);
    assert.equal(result.commentInfo.params, '1,200');
    assert.equal(result.diagnostics.source, '基本视频信息接口');
    assert.equal(result.diagnostics.failures[0].code, -352);
    assert.match(result.diagnostics.failures[0].message, /风控校验失败/);
    assert.equal(requested.length, 2);
  });
});

test('a script replacing the detail response with invalid data cannot block the basic info fallback', async () => {
  await withPage(async url => url.includes('/wbi/view/detail')
    ? json({ code: 0, data: {} }) : json({ code: 0, data: videoData }), async () => {
    const result = await resolvePlaybackBootstrap(meta);
    assert.equal(result.playerInfo.bvid, meta.bvid);
    assert.match(result.diagnostics.failures[0].message, /信息缺失/);
  });
});

test('API network failures fall back to native page JSON without executing its scripts', async () => {
  globalThis.__unexpectedPageExecution = false;
  await withPage(async url => {
    if (url.startsWith('https://api.bilibili.com/')) throw new TypeError('Failed to fetch');
    return new Response(pageHtml({ videoData, p: 1 }, { dash: { video: [] } }) + '<script>globalThis.__unexpectedPageExecution=true;</script>');
  }, async () => {
    const result = await resolvePlaybackBootstrap(meta);
    assert.equal(result.playerInfo.cid, 301);
    assert.match(result.coreScript, /core\.b237bb82\.js$/);
    assert.deepEqual(result.playInfo, { dash: { video: [] } });
    assert.equal(result.diagnostics.source, '原播放页');
    assert.equal(globalThis.__unexpectedPageExecution, false);
  });
  delete globalThis.__unexpectedPageExecution;
});

test('matching native state avoids network requests and never reuses a different part prefetch', async () => {
  await withPage(() => { throw new Error('no network needed'); }, async () => {
    const result = await resolvePlaybackBootstrap({ ...meta, p: 2 });
    assert.equal(result.playerInfo.cid, 302);
    assert.equal(result.playInfo, null);
    assert.equal(result.diagnostics.source, '当前播放页');
    assert.equal(globalThis.window.__INITIAL_STATE__.videoData, videoData);
  }, { __INITIAL_STATE__: { videoData, p: 1 }, __playinfo__: { dash: { video: ['first-part'] } } });
});

test('stale native state and a wrong-video detail response cannot play the wrong video', async () => {
  await withPage(async url => url.includes('/wbi/view/detail')
    ? json({ code: 0, data: { View: { ...videoData, bvid: 'BV1other' } } })
    : json({ code: 0, data: videoData }), async () => {
    const result = await resolvePlaybackBootstrap(meta);
    assert.equal(result.playerInfo.bvid, meta.bvid);
    assert.equal(result.diagnostics.source, '基本视频信息接口');
  }, { __INITIAL_STATE__: { videoData: { ...videoData, bvid: 'BV1other' } } });
});

test('complete detail data does not wait for an optional pagelist request', async () => {
  const requested = [];
  await withPage(async url => {
    requested.push(url);
    if (url.includes('/pagelist')) return new Promise(() => {});
    return json({ code: 0, data: { View: videoData } });
  }, async () => {
    const result = await resolvePlaybackBootstrap(meta);
    assert.equal(result.playerInfo.cid, 301);
    assert.equal(requested.length, 1);
  });
});

for (const stage of ['request', 'response body']) test(`a stalled ${stage} times out even when a wrapped fetch ignores abort`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await withPage(async url => {
    if (!url.includes('/wbi/view/detail')) return json({ code: 0, data: videoData });
    if (stage === 'request') return new Promise(() => {});
    return { ok: true, status: 200, json: () => new Promise(() => {}) };
  }, async () => {
    const pending = resolvePlaybackBootstrap(meta);
    await Promise.resolve();
    await Promise.resolve();
    t.mock.timers.tick(8000);
    const result = await pending;
    assert.equal(result.diagnostics.source, '基本视频信息接口');
    assert.match(result.diagnostics.failures[0].message, /请求超时/);
  });
});

test('all-source failure retains business codes, HTTP status and request failures', async () => {
  await withPage(async url => {
    if (url.includes('/wbi/view/detail')) return json({ code: -352, message: '风控校验失败' });
    if (url.includes('/web-interface/view?')) return new Response('', { status: 403 });
    throw new TypeError('Failed to fetch');
  }, async () => {
    await assert.rejects(resolvePlaybackBootstrap(meta), error => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.diagnostics.length, 3);
      assert.equal(error.diagnostics[0].code, -352);
      assert.equal(error.diagnostics[1].status, 403);
      assert.match(error.diagnostics[2].message, /Failed to fetch/);
      return true;
    });
  });
});

test('native JSON extraction handles escaped quotes and brackets inside strings', () => {
  const state = { videoData: { ...videoData, title: '括号 } 与 \\"引号" [ 不会截断 JSON' } };
  const result = readPlaybackPageData(pageHtml(state), meta.href);
  assert.deepEqual(result.initialState, state);
});
