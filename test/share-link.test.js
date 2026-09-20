import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPlaybackLink } from '../src/share-link.js';

test('copy links remove tracking, seek time, part query and fragments for all playback types', () => {
  for (const [input, expected] of [
    ['https://www.bilibili.com/video/BV1GJ411x7h7/?spm_id_from=333.1007&t=34&p=2#reply', 'https://www.bilibili.com/video/BV1GJ411x7h7/'],
    ['/bangumi/play/ep113281?from=search&t=12', 'https://www.bilibili.com/bangumi/play/ep113281'],
    ['https://live.bilibili.com/123?broadcast_type=0', 'https://live.bilibili.com/123'],
  ]) assert.equal(cleanPlaybackLink(input), expected);
  for (const input of ['', undefined, 'javascript:alert(1)', 'https://other.example/video/BV123', '/?bpn_bvid=BV123']) assert.equal(cleanPlaybackLink(input), '');
});
