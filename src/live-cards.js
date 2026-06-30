const LIVE_ROOM_HREF_RE = /^https?:\/\/live\.bilibili\.com\/(?:blanc\/)?(\d+)(?:[/?#]|$)/;

export const LIVE_CARD_LINK_SELECTOR = [
  'a.bili-dyn-card-live[href*="live.bilibili.com/"]',
  'a.user-row[href*="live.bilibili.com/"]',
  'a[href*="live.bilibili.com/"]:not([href*="/p/"]):not([href*="/blackboard/"])',
].join(',');

const LIVE_CARD_ROOT_SELECTORS = [
  '.bili-dyn-card-live',
  '.bili-dyn-live-users__item',
  '.bili-dyn-live-users__item-container',
  '.bili-dyn-content__orig__major.suit-video-card',
  '.suit-video-card',
  '.user-row',
  '.room-card-wrapper',
  '.room-card',
  '.live-card',
  '[class*="live-card"]',
  '[class*="room-card"]',
  '[class*="RoomCard"]',
];

export function getLiveMetaFromLink(link, baseUrl = location.href) {
  const href = normalizeLiveHref(link.getAttribute('href') || link.href, baseUrl);
  const roomId = href.match(LIVE_ROOM_HREF_RE)?.[1];
  if (!roomId) return null;
  return {
    kind: 'live',
    roomId,
    href,
    title: getLiveCardTitle(link) || `Bilibili 直播 ${roomId}`,
  };
}

export function getLiveCardRoot(link) {
  for (const selector of LIVE_CARD_ROOT_SELECTORS) {
    const candidate = link.closest(selector);
    if (candidate) return candidate;
  }
  return link;
}

export function getPlayableKey(meta) {
  if (meta?.kind === 'live' || meta?.roomId) return meta.roomId ? `live:${meta.roomId}` : '';
  if (meta?.kind === 'ogv' || meta?.epId || meta?.seasonId) {
    if (meta.epId) return `ogv:ep:${meta.epId}`;
    if (meta.seasonId) return `ogv:ss:${meta.seasonId}`;
    if (meta.bvid) return `ogv:${meta.bvid}`;
    return '';
  }
  return meta?.bvid || '';
}

export function isLiveCardLink(link) {
  return Boolean(getLiveMetaFromLink(link));
}

export async function fetchDynamicLivePortalCards() {
  const response = await fetch('https://api.bilibili.com/x/polymer/web-dynamic/v1/portal', {
    credentials: 'include',
    headers: { accept: 'application/json, text/plain, */*' },
  });
  if (!response.ok) throw new Error(`动态直播列表请求失败：${response.status}`);
  const payload = await response.json();
  if (payload?.code !== 0) throw new Error(payload?.message || `动态直播列表错误：${payload?.code}`);
  return (payload?.data?.live_users?.items || [])
    .map((item) => ({
      kind: 'live',
      roomId: item.room_id ? String(item.room_id) : '',
      href: normalizeLiveHref(item.jump_url || `https://live.bilibili.com/${item.room_id}`, location.href),
      title: cleanLiveCardTitle(item.title) || item.uname || `Bilibili 直播 ${item.room_id}`,
      subtitle: item.uname || '',
      cover: normalizeImageUrl(item.cover || item.face),
      face: normalizeImageUrl(item.face),
    }))
    .filter((card) => card.roomId && card.href);
}

export function findDynamicLiveUserElement(card, used = new Set(), root = document) {
  const items = [...root.querySelectorAll('.bili-dyn-live-users__item')];
  const title = String(card?.title || '').trim();
  const subtitle = String(card?.subtitle || '').trim();
  const candidates = items.filter((item) => {
    if (used.has(item)) return false;
    return true;
  }).map((item) => ({
    item,
    title: item.querySelector('.bili-dyn-live-users__item__title')?.textContent?.trim() || '',
    subtitle: item.querySelector('.bili-dyn-live-users__item__uname')?.textContent?.trim() || '',
  }));
  return candidates.find((candidate) => {
    return (!title || candidate.title === title) && (!subtitle || candidate.subtitle === subtitle);
  })?.item || candidates.find((candidate) => {
    return subtitle && candidate.subtitle === subtitle;
  })?.item || candidates.find((candidate) => {
    return title && candidate.title === title;
  })?.item || null;
}

function normalizeLiveHref(rawHref, baseUrl) {
  try {
    const url = new URL(rawHref, baseUrl);
    const roomId = url.href.match(LIVE_ROOM_HREF_RE)?.[1];
    return roomId ? `https://live.bilibili.com/${roomId}` : '';
  } catch {
    return '';
  }
}

function normalizeImageUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    return new URL(rawUrl, location.href).href;
  } catch {
    return rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;
  }
}

function getLiveCardTitle(link) {
  const title = link.querySelector?.([
    '.bili-dyn-card-live__title',
    '[class*="dyn-card-live__title"]',
    '.bili-dyn-live-users__item__title',
    '.room-title',
    '[class*="room-title"]',
    '[class*="title"]',
  ].join(','))?.textContent || link.getAttribute('title') || link.textContent;
  return cleanLiveCardTitle(title);
}

function cleanLiveCardTitle(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^直播中\s*/u, '')
    .replace(/\s*(?:·\s*)?\d+(?:\.\d+)?万?人(?:看过|气)?\s*$/u, '')
    .trim();
}
