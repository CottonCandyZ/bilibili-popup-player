import { COMMENT_FALLBACK, CORE_FALLBACK } from './constants.js';
import {
  getCardRoot,
  getVideoMetaFromLink,
  isCoverLink,
  normalizeResourceUrl,
  normalizeVideoHref,
  PLAYBACK_VIDEO_LINK_SELECTOR,
} from './video-meta.js';

export async function resolvePlaybackBootstrap(meta) {
  const html = await fetch(meta.href, { credentials: 'include' }).then((res) => res.text());
  const initialState = JSON.parse(extractAssignedJson(html, 'window.__INITIAL_STATE__'));
  const playInfoJson = extractAssignedJson(html, 'window.__playinfo__');
  const playInfo = playInfoJson ? JSON.parse(playInfoJson) : null;
  const vd = initialState.videoData;
  const p = Number(initialState.p || 1);
  const page = vd.pages?.[p - 1] || vd.pages?.[0] || {};
  const currentBvid = vd.bvid || meta.bvid;
  const recommendationCards = mergePlaylistCards(
    extractPlaylistCardsFromHtml(html, meta.href, currentBvid),
    extractPlaylistCardsFromInitialState(initialState, meta.href, currentBvid),
  );

  return {
    title: vd.title || meta.title,
    coreScript: extractCoreScriptUrl(html) || CORE_FALLBACK,
    commentScript: extractCommentScriptUrl(html) || COMMENT_FALLBACK,
    stylesheets: extractStylesheetUrls(html),
    initialState,
    playInfo,
    recommendationCards,
    playerInfo: {
      aid: vd.aid || initialState.aid,
      bvid: currentBvid,
      cid: page.cid || initialState.cid,
      p,
      t: 0,
    },
    href: meta.href,
    commentInfo: {
      params: `1,${vd.aid || initialState.aid}`,
      spmPrefix: initialState.spmidPrefix || '333.788',
      cmFromTrackId: new URL(meta.href, location.href).searchParams.get('track_id') || '',
    },
  };
}

function mergePlaylistCards(...groups) {
  const byBvid = new Map();
  groups.flat().forEach((card) => {
    if (!card?.bvid) return;
    byBvid.set(card.bvid, mergePlaylistCard(byBvid.get(card.bvid), card));
  });
  return [...byBvid.values()];
}

function mergePlaylistCard(base, next) {
  if (!base) return next;
  return {
    ...base,
    href: base.href || next.href,
    title: isUsefulTitle(base.title) ? base.title : next.title,
    cover: base.cover || next.cover,
    subtitle: base.subtitle || next.subtitle,
    duration: base.duration || next.duration,
    stats: base.stats || next.stats,
  };
}

function extractPlaylistCardsFromHtml(html, baseUrl, currentBvid) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const seen = new Set();
  return [...doc.querySelectorAll(PLAYBACK_VIDEO_LINK_SELECTOR)]
    .sort((a, b) => Number(isCoverLink(b)) - Number(isCoverLink(a)))
    .map((link) => buildPlaylistCard(link, baseUrl))
    .filter((card) => {
      if (!card || card.bvid === currentBvid || seen.has(card.bvid)) return false;
      seen.add(card.bvid);
      return true;
    });
}

function buildPlaylistCard(link, baseUrl) {
  const meta = getVideoMetaFromLink(link, baseUrl);
  if (!meta) return null;

  const root = getCardRoot(link);
  const title = getPlaylistCardTitle(link, root, meta.title);
  const cover = getPlaylistCardCover(root, baseUrl);
  const subtitle = getPlaylistCardSubtitle(root);
  const duration = getPlaylistCardDuration(root);
  const stats = getPlaylistCardStats(root);
  return { ...meta, title, cover, subtitle, duration, stats };
}

function extractPlaylistCardsFromInitialState(initialState, baseUrl, currentBvid) {
  return (initialState.related || [])
    .map((item) => {
      const bvid = item?.bvid;
      if (!bvid || bvid === currentBvid) return null;
      return {
        bvid,
        href: normalizeVideoHref(item.uri || `/video/${bvid}`, baseUrl),
        title: String(item.title || 'Bilibili 视频').replace(/\s+/g, ' ').trim(),
        cover: normalizeResourceUrl(item.pic, baseUrl),
        subtitle: String(item.owner?.name || item.author || '').replace(/\s+/g, ' ').trim(),
        duration: formatDuration(item.duration),
        stats: formatRelatedStats(item),
      };
    })
    .filter((card) => card?.href);
}

function getPlaylistCardTitle(link, root, fallback) {
  const candidate = link.getAttribute('title') ||
    link.getAttribute('aria-label') ||
    getSafeTitleElementText(root, [
      '.title',
      '.info-title',
      '.bili-video-card__info--tit',
      '.video-page-card-small-title',
    ].join(',')) ||
    root?.querySelector?.('img')?.getAttribute('alt') ||
    fallback;
  const title = String(candidate || fallback || 'Bilibili 视频').replace(/\s+/g, ' ').trim();
  return isUsefulTitle(title) ? title : 'Bilibili 视频';
}

function getSafeTitleElementText(root, selector) {
  return [...(root?.querySelectorAll?.(selector) || [])]
    .map((element) => element.textContent || element.getAttribute?.('title') || '')
    .find(isUsefulTitle) || '';
}

function getPlaylistCardCover(root, baseUrl) {
  const img = root?.querySelector?.('img[src], img[data-src], img[data-lazy-src], img[data-original], img[data-url]');
  const source = root?.querySelector?.('source[srcset], source[data-srcset]');
  const raw = img?.getAttribute('data-src') ||
    img?.getAttribute('data-lazy-src') ||
    img?.getAttribute('data-original') ||
    img?.getAttribute('data-url') ||
    img?.getAttribute('src') ||
    getFirstSrcsetUrl(source?.getAttribute('data-srcset') || source?.getAttribute('srcset')) ||
    '';
  return normalizeResourceUrl(raw, baseUrl);
}

function getPlaylistCardSubtitle(root) {
  const candidate = root?.querySelector?.([
    '.upname',
    '.name',
    '.bili-video-card__info--author',
    '.video-page-card-small-author',
    '[class*="author"]',
  ].join(','))?.textContent || '';
  return candidate.replace(/\s+/g, ' ').trim();
}

function getPlaylistCardDuration(root) {
  const candidate = root?.querySelector?.([
    '.duration',
    '.bili-video-card__stats__duration',
    '[class*="duration"]',
  ].join(','))?.textContent || '';
  return candidate.replace(/\s+/g, ' ').trim();
}

function getPlaylistCardStats(root) {
  const playInfo = root?.querySelector?.('.playinfo')?.textContent;
  if (playInfo) return playInfo.replace(/\s+/g, ' ').trim();

  const items = [...(root?.querySelectorAll?.([
    '.bili-video-card__stats--text',
    '.bili-video-card__stats--item',
    '[class*="stats"] [class*="text"]',
  ].join(',')) || [])]
    .map((element) => element.textContent.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return [...new Set(items)].slice(0, 2).join(' ');
}

function getFirstSrcsetUrl(srcset) {
  return String(srcset || '').split(',')[0]?.trim().split(/\s+/)[0] || '';
}

function isUsefulTitle(value) {
  const title = String(value || '').replace(/\s+/g, ' ').trim();
  return Boolean(title && title !== '不感兴趣' && title !== '撤销' && !title.includes('将减少此类内容推荐'));
}

function formatRelatedStats(item) {
  const view = formatCount(item?.stat?.view ?? item?.play);
  const danmaku = formatCount(item?.stat?.danmaku ?? item?.video_review);
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

function extractAssignedJson(html, marker) {
  const start = html.indexOf(`${marker}=`);
  if (start < 0) {
    if (marker === 'window.__playinfo__') return null;
    throw new Error(`${marker} not found`);
  }

  const jsonStart = start + marker.length + 1;
  const first = html[jsonStart];
  if (first !== '{' && first !== '[') throw new Error(`${marker} assignment is not JSON`);

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = jsonStart; i < html.length; i += 1) {
    const char = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) return html.slice(jsonStart, i + 1);
    }
  }
  throw new Error(`${marker} JSON is not closed`);
}

function extractCoreScriptUrl(html) {
  const candidates = [...html.matchAll(/<script[^>]+src="([^"]*\/player\/main\/core\.[^"]+\.js[^"]*)"[^>]*>/g)]
    .map((match) => normalizeResourceUrl(match[1]))
    .filter(Boolean);
  return candidates[0] || '';
}

function extractCommentScriptUrl(html) {
  const hash = html.match(/"comment_version_hash":"([^"]+)"/)?.[1];
  if (hash) return `https://s1.hdslb.com/bfs/seed/jinkela/commentpc/bili-comments.${hash}.js`;
  const src = html.match(/<script[^>]+src="([^"]*bili-comments[^"]+\.js[^"]*)"[^>]*>/)?.[1];
  return normalizeResourceUrl(src);
}

function extractStylesheetUrls(html) {
  const urls = [];
  const patterns = [
    /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/g,
    /<link[^>]+href="([^"]+)"[^>]+rel="stylesheet"[^>]*>/g,
  ];
  patterns.forEach((pattern) => {
    for (const match of html.matchAll(pattern)) {
      const href = normalizeResourceUrl(match[1]);
      if (href && !urls.includes(href)) urls.push(href);
    }
  });
  return urls;
}
