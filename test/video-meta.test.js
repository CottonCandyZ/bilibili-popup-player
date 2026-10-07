import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeVideoHref, getLinkPlaybackKey } from '../src/video-meta.js';

const base = 'https://www.bilibili.com/watchlater/list';
const link = href => ({ getAttribute: () => href });

test('watch-later links resolve to a canonical video and preserve the selected part', () => {
  for (const path of ['/list/watchlater', '/list/watchlater/']) {
    const href = `${path}?bvid=BV1test002&p=2&oid=200&watchlater_cfg=%7B%7D`;
    assert.equal(normalizeVideoHref(href, base), 'https://www.bilibili.com/video/BV1test002/?p=2');
    assert.equal(getLinkPlaybackKey(link(href), base), 'BV1test002:p2');
  }
  assert.equal(getLinkPlaybackKey(link('/video/BV1test002/?p=2'), base), 'BV1test002:p2');
});

test('list links without a valid video or on another host are not playable', () => {
  for (const href of ['/list/watchlater', '/list/watchlater?bvid=invalid', '/list/watchlater?bvid=BV1test002/extra',
    '/list/other?bvid=BV1test002', 'https://example.com/list/watchlater?bvid=BV1test002']) {
    assert.equal(getLinkPlaybackKey(link(href), base), '');
  }
});
