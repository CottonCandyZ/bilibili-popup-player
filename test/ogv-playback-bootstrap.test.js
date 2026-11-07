import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createNanoPlayUrlResponse,
  normalizePlayViewResponse,
  resolveOgvPlaybackBootstrap,
} from '../src/ogv-playback-bootstrap.js';

const rawPlayView = {
  play_video_type: 'whole',
  video_info: {
    format: 'hdflv2',
    quality: 80,
    timelength: 750000,
    accept_quality: [80, 64, 32, 16],
    accept_description: ['高清 1080P', '高清 720P', '清晰 480P', '流畅 360P'],
    dash: {
      duration: 750,
      video: [{
        id: 80,
        base_url: 'http://example.com/video.m4s',
        backup_url: ['http://backup.example.com/video.m4s'],
        codecid: 7,
      }],
      audio: [{
        id: 30280,
        base_url: 'http://example.com/audio.m4s',
        backup_url: [],
      }],
    },
  },
  arc: {
    aid: 12098403,
    cid: 93505235,
  },
  supplement: {
    ogv_episode_info: {
      episode_id: 113281,
    },
    ogv_season_info: {
      season_id: 6311,
      season_type: 1,
    },
  },
};

const getPlayUrlResult = {
  play_check: { play_detail: 'PLAY_PREVIEW' },
  video_info: {
    ...rawPlayView.video_info,
    is_preview: 1,
    clip_info_list: [{ clipType: 'CLIP_TYPE_OP', start: 0, end: 90 }],
    record_info: { record: '备案号', record_icon: 'https://example.com/record.png' },
  },
  play_view_business_info: {
    episode_info: { aid: 12098403, cid: 93505235, ep_id: 113281 },
    season_info: { season_id: 6311, season_type: 1 },
    user_status: {
      is_login: 1,
      vip_info: { real_vip: true },
      pay_info: { pay_check: 1 },
      watch_progress: { last_ep_id: 113280, last_ep_index: '1', last_time: 50, current_watch_progress: 120 },
    },
  },
};

test('preserves legacy playurl preview, clips and business information', () => {
  const response = normalizePlayViewResponse({ code: 0, message: 'success', result: getPlayUrlResult });
  assert.equal(response.data.code, 0);
  assert.equal(response.data.result.video_info.is_preview, true);
  assert.deepEqual(response.data.result.video_info.clip_info_list, getPlayUrlResult.video_info.clip_info_list);
  assert.deepEqual(response.data.result.play_view_business_info, getPlayUrlResult.play_view_business_info);
});

test('adapts legacy playurl metadata and watch progress to Nano', () => {
  const payload = { code: 0, message: 'success', result: getPlayUrlResult };
  const response = createNanoPlayUrlResponse(getPlayUrlResult, payload);
  assert.equal(response.raw, payload);
  assert.equal(response.body.mediaDataSource.type, 'dash');
  assert.equal(response.body.isPreview, true);
  assert.equal(response.body.lastPlayTime, 120);
  assert.equal(response.body.lastPlayEpid, 113280);
  assert.deepEqual(response.body.clipInfoList, getPlayUrlResult.video_info.clip_info_list);
  assert.deepEqual(response.body.recordInfo, { record: '备案号', recordIcon: 'https://example.com/record.png' });
  const business = response.body.playViewBusinessInfo;
  assert.deepEqual(business.episodeInfo, getPlayUrlResult.play_view_business_info.episode_info);
  assert.deepEqual(business.seasonInfo, getPlayUrlResult.play_view_business_info.season_info);
  assert.deepEqual(business.userStatus.pay_info, { pay_check: 1 });
  assert.deepEqual(business.userStatus.vip_info, { real_vip: true });
  assert.equal(business.userStatus.is_login, true);
  assert.deepEqual(business.userStatus.watch_progress, {
    lastEpId: 113280, lastEpIndex: '1', lastTime: 50, currentWatchProgress: 120,
  });
});

test('adapts legacy playurl MP4 previews and fragment videos', () => {
  const videoInfo = {
    format: 'mp4', quality: 16, timelength: 30000, is_preview: 1,
    durl: [{ length: 30000, url: 'https://example.com/preview.mp4', backup_url: [] }],
  };
  const result = {
    ...getPlayUrlResult,
    video_info: videoInfo,
    fragment_videos: [{
      fragment_info: { fragment_position: 'PRE' }, playable_status: true, video_info: videoInfo,
    }],
  };
  const { body } = createNanoPlayUrlResponse(result, { code: 0, result });
  assert.equal(body.mediaDataSource.type, 'mp4');
  assert.equal(body.mediaDataSource.url, 'https://example.com/preview.mp4');
  assert.equal(body.isPreview, true);
  assert.equal(body.parsedFragmentVideoInfoList.length, 2);
  assert.equal(body.parsedFragmentVideoInfoList[0].playStatus, true);
  assert.equal(body.parsedFragmentVideoInfoList[0].mediaDataSource.type, 'mp4');
});

test('uses credentialed playview GET requests for bootstrap misses and Nano quality/episode changes', async (t) => {
  const locationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
  globalThis.location = { href: 'https://www.bilibili.com/' };
  t.after(() => {
    if (locationDescriptor) Object.defineProperty(globalThis, 'location', locationDescriptor);
    else delete globalThis.location;
  });
  const episode = { id: 113281, aid: 12098403, bvid: 'BV1Yx411q74q', cid: 93505235, title: '2' };
  const calls = [];
  const playViewResult = { ...rawPlayView, play_video_type: 'preview', watch_progress: { current_progress: 120 } };
  let reply = { code: 0, message: '0', data: playViewResult };
  let status = 200;
  t.mock.method(globalThis, 'fetch', async (href, options) => {
    const url = new URL(href);
    if (url.hostname === 'www.bilibili.com') return new Response('<html></html>');
    if (url.pathname === '/pgc/view/web/simple/season') {
      return Response.json({ code: 0, result: { season_id: 6311, title: '番剧', episodes: [episode] } });
    }
    if (url.pathname === '/pgc/view/web/ep/list') return Response.json({ code: 0, result: { episodes: [episode] } });
    if (url.pathname === '/pgc/season/web/related/recommend') return Response.json({ code: 0, data: { season: [] } });
    assert.equal(url.pathname, '/ogv/player/playview');
    calls.push({ url, options });
    return typeof reply === 'string' ? new Response(reply, { status }) : Response.json(reply, { status });
  });
  const bootstrap = await resolveOgvPlaybackBootstrap({ kind: 'ogv', href: 'https://www.bilibili.com/bangumi/play/ep113281' });
  assert.equal(bootstrap.playerInfo.epId, 113281);
  assert.equal(bootstrap.playInfo.result.video_info.is_preview, true);
  assert.equal(calls[0].url.searchParams.get('ep_id'), '113281');
  assert.equal(calls[0].url.searchParams.get('aid'), '12098403');
  assert.equal(calls[0].url.searchParams.get('qn'), '127');
  assert.equal(calls[0].url.searchParams.get('biz_type'), 'ogv');
  assert.equal(calls[0].url.searchParams.get('scene'), 'normal');

  const response = await bootstrap.requestPlayUrlInfo({
    avid: 12098404, cid: 93505236, ep_id: 113282, qn: 64, fnval: 16, fnver: 0, drm_tech_type: 2,
  });
  assert.equal(response.body.quality, 80);
  assert.equal(response.body.lastPlayTime, 120);
  const params = calls[1].url.searchParams;
  for (const [key, value] of Object.entries({ aid: '12098404', cid: '93505236', ep_id: '113282', season_id: '6311', qn: '64', fnval: '16', fnver: '0', drm_tech_type: '2' })) {
    assert.equal(params.get(key), value);
  }
  for (const { url, options } of calls) {
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'include');
    assert.equal(options.body, undefined);
    assert.equal(options.headers['content-type'], undefined);
    assert.equal(url.searchParams.has('csrf'), false);
    assert.equal(url.searchParams.has('avid'), false);
    assert.equal(url.searchParams.has('buvid'), false);
    assert.equal(url.searchParams.has('video_index'), false);
    assert.equal([...url.searchParams.values()].some(value => value === 'undefined' || value === '[object Object]'), false);
  }

  for (const [payload, httpStatus, error] of [
    [{ code: -10403, message: '地区限制' }, 200, /地区限制/],
    [{ code: 0, result: {} }, 200, /invalid data/],
    ['not json', 200, /OGV playview failed/],
    [{ code: 0, data: playViewResult }, 503, /OGV playview failed: 503/],
  ]) {
    reply = payload;
    status = httpStatus;
    await assert.rejects(bootstrap.requestPlayUrlInfo({ qn: 32 }), error);
  }
});

test('normalizes the direct OGV playview API response', () => {
  const response = normalizePlayViewResponse({
    code: 0,
    message: '0',
    data: rawPlayView,
  });

  assert.equal(response.data.code, 0);
  assert.equal(response.data.result.play_video_type, 'whole');
  assert.equal(response.data.result.video_info.quality, 80);
  assert.equal(
    response.data.result.play_view_business_info.episode_info.ep_id,
    113281,
  );
});

test('keeps supporting the weslie SSR response shape', () => {
  const response = normalizePlayViewResponse({
    status: 200,
    data: {
      code: 0,
      message: '0',
      result: rawPlayView,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.data.code, 0);
  assert.equal(response.data.result.video_info.timelength, 750000);
});

test('rejects unrelated response objects instead of resolving null into Nano', () => {
  assert.equal(normalizePlayViewResponse({ code: 0, data: {} }), null);
});

test('adapts BigPlayer OGV responses to the Nano HttpPlayUrl contract', () => {
  const payload = {
    code: 0,
    message: '0',
    data: rawPlayView,
  };
  const response = createNanoPlayUrlResponse(rawPlayView, payload, 200);

  assert.equal(response.raw, payload);
  assert.equal(response.status, 200);
  assert.equal(response.data.result.play_video_type, 'whole');
  assert.equal(response.response.status, 200);
  assert.equal(response.retries, 0);
  assert.equal(response.body.quality, 80);
  assert.equal(response.body.mediaDataSource.type, 'dash');
  assert.equal(
    response.body.mediaDataSource.url.video[0].baseUrl,
    'https://example.com/video.m4s',
  );
  assert.equal(
    response.body.playViewBusinessInfo.episodeInfo.ep_id,
    113281,
  );
  assert.equal(response.body.parsedFragmentVideoInfoList.length, 1);
});

test('does not create a nullable Nano response from malformed OGV data', () => {
  assert.throws(
    () => createNanoPlayUrlResponse(null),
    /OGV playview result is empty/,
  );
});
