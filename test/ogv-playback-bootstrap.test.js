import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createNanoPlayUrlResponse,
  normalizePlayViewResponse,
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
