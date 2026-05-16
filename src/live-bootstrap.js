import { normalizeResourceUrl } from './video-meta.js';

const LIVE_ROOM_RE = /^https?:\/\/live\.bilibili\.com\/(?:blanc\/)?(\d+)/;
const LIVE_PLAYER_SCRIPT = 'https://s1.hdslb.com/bfs/blive-engineer/live-web-player/room-player.prod.min.js';

export function isLivePage() {
  return LIVE_ROOM_RE.test(location.href);
}

export function getCurrentLiveMeta() {
  const match = location.href.match(LIVE_ROOM_RE);
  if (!match) return null;
  const roomId = match[1];
  const title = cleanLiveTitle(
    document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
    document.querySelector('meta[name="title"]')?.getAttribute('content') ||
    document.title ||
    `Bilibili 直播 ${roomId}`,
  );
  return {
    kind: 'live',
    roomId,
    href: normalizeLiveHref(location.href),
    title,
  };
}

export function isLiveMeta(meta) {
  return meta?.kind === 'live' || Boolean(meta?.roomId && !meta?.bvid);
}

export function isLiveBootstrap(bootstrap) {
  return bootstrap?.kind === 'live';
}

export async function resolveLiveBootstrap(meta) {
  const inputRoomId = String(meta?.roomId || '').trim();
  if (!inputRoomId) throw new Error('直播房间号缺失');

  const roomInit = await fetchLiveJson(`https://api.live.bilibili.com/room/v1/Room/room_init?id=${encodeURIComponent(inputRoomId)}`);
  const room = roomInit?.data;
  if (!room?.room_id) throw new Error('直播房间解析失败');
  if (room.is_hidden) throw new Error('直播间已隐藏');
  if (room.is_locked) throw new Error('直播间已锁定');
  if (!room.live_status) throw new Error('当前直播间未开播');

  const playInfo = await fetchLiveJson(buildPlayInfoUrl(room.room_id));
  if (!playInfo?.data?.playurl_info?.playurl) throw new Error('直播播放地址解析失败');

  const roomInitData = {
    code: 0,
    message: '0',
    ttl: 1,
    data: {
      ...room,
      ...playInfo.data,
      room_id: room.room_id,
      short_id: room.short_id,
      uid: room.uid,
      live_status: room.live_status,
    },
  };

  return {
    kind: 'live',
    title: meta.title || `Bilibili 直播 ${inputRoomId}`,
    href: normalizeLiveHref(meta.href || `https://live.bilibili.com/${inputRoomId}`),
    playerScript: LIVE_PLAYER_SCRIPT,
    stylesheets: [],
    roomInitData,
    playerInfo: {
      roomId: room.room_id,
      shortId: room.short_id || inputRoomId,
      uid: room.uid,
      t: 0,
    },
  };
}

function buildPlayInfoUrl(roomId) {
  const url = new URL('https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo');
  url.searchParams.set('room_id', String(roomId));
  url.searchParams.set('protocol', '0,1');
  url.searchParams.set('format', '0,1,2');
  url.searchParams.set('codec', '0,1,2');
  url.searchParams.set('qn', '10000');
  url.searchParams.set('platform', 'web');
  url.searchParams.set('ptype', '16');
  url.searchParams.set('dolby', '5');
  url.searchParams.set('panorama', '1');
  return url.href;
}

async function fetchLiveJson(url) {
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      accept: 'application/json, text/plain, */*',
    },
  });
  if (!response.ok) throw new Error(`直播接口请求失败：${response.status}`);
  const json = await response.json();
  if (json.code !== 0) throw new Error(json.message || json.msg || `直播接口错误：${json.code}`);
  return json;
}

function normalizeLiveHref(rawHref) {
  try {
    const url = new URL(rawHref, location.href);
    return `https://live.bilibili.com/${url.pathname.match(/(\d+)/)?.[1] || ''}`;
  } catch {
    return rawHref || '';
  }
}

function cleanLiveTitle(value) {
  const title = String(value || '').replace(/\s+/g, ' ').trim();
  return title
    .replace(/_哔哩哔哩直播.*$/u, '')
    .replace(/- 哔哩哔哩直播.*$/u, '')
    .trim() || 'Bilibili 直播';
}
