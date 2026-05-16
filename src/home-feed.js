import { normalizeResourceUrl, normalizeVideoHref } from './video-meta.js';

const HOME_FEED_API = 'https://api.bilibili.com/x/web-interface/wbi/index/top/feed/rcmd';
const PAGE_SIZE = 12;

export function isHomeFeedPage(url = globalThis.location?.href || '') {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'www.bilibili.com' && (parsed.pathname === '/' || parsed.pathname === '/index.html');
  } catch {
    return false;
  }
}

export function createHomeFeedSession() {
  return {
    brush: 0,
    fetchRow: 0,
    freshIdx: 0,
    freshIdx1h: 0,
    lastYNum: 0,
    shownIds: new Set(),
    uniqId: String(Date.now() + Math.floor(Math.random() * 1000000)),
    yNum: 0,
  };
}

export async function fetchHomeFeedCards({ session, existingCards = [] } = {}) {
  if (!session) throw new Error('Missing home feed session');

  const params = buildHomeFeedParams(session, existingCards);
  const response = await fetch(`${HOME_FEED_API}?${params}`, {
    credentials: 'include',
    headers: {
      accept: 'application/json, text/plain, */*',
    },
  });
  if (!response.ok) throw new Error(`Home feed request failed: ${response.status}`);

  const payload = await response.json();
  if (payload?.code !== 0) throw new Error(payload?.message || `Home feed error: ${payload?.code}`);

  const existingBvids = new Set(existingCards.map((card) => card?.bvid).filter(Boolean));
  const seenBvids = new Set(existingBvids);
  const cards = (payload.data?.item || [])
    .map(mapHomeFeedItem)
    .filter((card) => {
      if (!card?.bvid || seenBvids.has(card.bvid)) return false;
      seenBvids.add(card.bvid);
      return true;
    });

  advanceHomeFeedSession(session, cards);
  return cards;
}

function buildHomeFeedParams(session, existingCards) {
  const showIds = [
    ...existingCards.map((card) => card?.showId).filter(Boolean),
    ...session.shownIds,
  ].slice(-60);
  const nextFreshIdx = session.freshIdx + 1;
  const nextFetchRow = session.fetchRow + 1;
  const nextYNum = session.yNum + 4;

  const params = new URLSearchParams({
    web_location: '1430650',
    y_num: String(nextYNum),
    fresh_type: '4',
    feed_version: 'V8',
    fresh_idx_1h: String(session.freshIdx1h + 1),
    fetch_row: String(nextFetchRow),
    fresh_idx: String(nextFreshIdx),
    brush: String(session.brush + 1),
    device: 'win',
    homepage_ver: '1',
    ps: String(PAGE_SIZE),
    last_y_num: String(session.lastYNum),
    screen: getScreenParam(),
    seo_info: '',
    tt_exp: '',
    uniq_id: session.uniqId,
  });
  if (showIds.length) params.set('last_showlist', showIds.join(','));
  return params;
}

function advanceHomeFeedSession(session, cards) {
  session.brush += 1;
  session.fetchRow += Math.max(1, Math.ceil(cards.length / 4));
  session.freshIdx += 1;
  session.freshIdx1h += 1;
  session.lastYNum = session.yNum;
  session.yNum += 4;
  cards.forEach((card) => {
    if (card.showId) session.shownIds.add(card.showId);
  });
}

function mapHomeFeedItem(item) {
  if (!item || item.goto !== 'av' || !item.bvid) return null;
  const href = normalizeVideoHref(item.uri || `/video/${item.bvid}`, 'https://www.bilibili.com/');
  if (!href) return null;
  return {
    bvid: item.bvid,
    cover: normalizeResourceUrl(item.pic, 'https://www.bilibili.com/'),
    duration: formatDuration(item.duration),
    href,
    showId: item.id ? `av_${item.id}` : '',
    stats: formatHomeFeedStats(item),
    subtitle: cleanText(item.owner?.name),
    title: cleanTitle(item.title),
  };
}

function formatHomeFeedStats(item) {
  const view = formatCount(item?.stat?.view);
  const danmaku = formatCount(item?.stat?.danmaku);
  return view || danmaku ? { view, danmaku } : '';
}

function formatCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) return '';
  if (count >= 100000000) return `${trimFixed(count / 100000000)}亿`;
  if (count >= 10000) return `${trimFixed(count / 10000)}万`;
  return String(Math.round(count));
}

function trimFixed(value) {
  return value.toFixed(1).replace(/\.0$/, '');
}

function formatDuration(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getScreenParam() {
  const width = Math.max(1, Math.round(globalThis.window?.innerWidth || globalThis.screen?.width || 0));
  const height = Math.max(1, Math.round(globalThis.window?.innerHeight || globalThis.screen?.height || 0));
  return `${width}-${height}`;
}

function cleanTitle(value) {
  return cleanText(value) || 'Bilibili 视频';
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
