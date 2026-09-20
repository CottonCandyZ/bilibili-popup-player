import { BV_RE, OGV_RE } from './constants.js';

export const COVER_HOST_SELECTOR = [
  '.bili-dyn-card-video',
  '.bili-dyn-card-video__cover',
  '.bili-dyn-card-video__image',
  '.bili-dyn-card-video__body',
  '.bili-dyn-card-reserve__cover',
  '.bili-video-card__image',
  '.bili-video-card__cover',
  '.pic-box',
  '.pic',
  '.framepreview-box',
  '.video-awesome-img',
  '.cover',
  '.cover-contain',
  '.history-card__cover',
  '.bili-history-card__cover',
  '[class*="cover"]',
  '[class*="pic"]',
  '[class*="image"]',
  '[class*="poster"]',
  '[class*="thumbnail"]',
].join(',');

const CARD_ROOT_SELECTOR = [
  '.bili-dyn-card-video',
  '.bili-dyn-content__orig__major.suit-video-card',
  '.suit-video-card',
  '.bili-dyn-card-video__body',
  '.bili-dyn-card',
  '.bili-dyn-item',
  '.bili-dyn-list__item',
  '.bili-rich-text-module',
  '.bili-dyn-content',
  '.bili-video-card',
  '.feed-card',
  '.floor-single-card',
  '.carousel-item',
  '[class*="carousel-item"]',
  '.bili-video-card__wrap',
  '.small-item',
  '.history-card',
  '.history-record',
  '.bili-history-card',
  '.video-item',
  '.video-list-item',
  '.search-card',
  '.search-item',
  '.list-item',
  '.section-item',
  '.bangumi-card',
  '.season-item',
  '.episode-item',
  '.ep-list-item',
  '.media-card',
  '.video-card',
  '.video-page-card-small',
  '.video-page-operator-card-small',
  '.card-box',
  '.recommended-card',
].join(',');

const FALLBACK_CARD_ROOT_SELECTOR = [
  '[class*="video-card"]',
  '[class*="video-page-card"]',
  '[class*="history"]',
  '[class*="search"]',
  '[class*="list-item"]',
  '[class*="bangumi"]',
  '[class*="season"]',
  '[class*="episode"]',
  '[class*="small-item"]',
  '[class*="feed-card"]',
  '[class*="dyn-card-video"]',
  '[class*="bili-dyn-card"]',
  '[class*="bili-dyn-item"]',
].join(',');

const CARD_TITLE_SELECTORS = [
  '.bili-video-card__info--tit',
  '.video-page-card-small-title',
  '.bili-dyn-card-video__title, [class*="dyn-card-video__title"]',
  '.history-card__title',
  '.bili-history-card__title',
  '.bili-dyn-live-users__item__title',
  '.info-title',
  '.title',
];

const NON_TITLE_SELECTOR = [
  '[role="tooltip"]', 'button', '[role="button"]',
  '[class*="watch-later"]', '[class*="watchLater"]', '[class*="tooltip"]',
  '.bili-video-card__stats', '.bili-video-card__no-interest', '.no-interest-title', '.no-interest-desc', '.v-inline-player',
].join(',');

export const PLAYBACK_VIDEO_LINK_SELECTOR = [
  '.video-page-card-small a[href*="/video/BV"]',
  '.video-page-operator-card-small a[href*="/video/BV"]',
  '.rec-list .video-page-card-small a[href*="/video/BV"]',
  '.rec-list .video-page-operator-card-small a[href*="/video/BV"]',
  '.recommend-list .video-page-card-small a[href*="/video/BV"]',
  '.recommend-list .video-page-operator-card-small a[href*="/video/BV"]',
].join(',');

export const OGV_VIDEO_LINK_SELECTOR = [
  'a[href*="/bangumi/play/ss"]',
  'a[href*="/bangumi/play/ep"]',
].join(',');

export function normalizeVideoHref(rawHref, baseUrl = location.href) {
  if (!rawHref) return '';
  try {
    const url = new URL(rawHref, baseUrl);
    if (!isBilibiliUrl(url)) return '';
    const match = url.pathname.match(BV_RE);
    if (match) {
      const canonical = new URL(`/video/${match[1]}/`, 'https://www.bilibili.com');
      canonical.search = url.search;
      canonical.hash = url.hash;
      return canonical.href;
    }
    return url.href;
  } catch {
    return '';
  }
}

export function normalizeOgvHref(rawHref, baseUrl = location.href) {
  const parsed = parseOgvHref(rawHref, baseUrl);
  if (!parsed) return '';
  const canonical = new URL(`/bangumi/play/${parsed.prefix}${parsed.id}`, 'https://www.bilibili.com');
  canonical.search = parsed.url.search;
  canonical.hash = parsed.url.hash;
  return canonical.href;
}

export function normalizeResourceUrl(rawUrl, baseUrl = location.href) {
  if (!rawUrl) return '';
  try {
    return new URL(rawUrl, baseUrl).href;
  } catch {
    return '';
  }
}

export function getVideoMetaFromLink(link, baseUrl = location.href) {
  const href = normalizeVideoHref(link.getAttribute('href') || link.href, baseUrl);
  const match = href ? new URL(href).pathname.match(BV_RE) : null;
  if (!match) return null;
  return { bvid: match[1], href, title: getCardTitle(getCardRoot(link), link) };
}

export function getOgvMetaFromLink(link, baseUrl = location.href) {
  const href = normalizeOgvHref(link.getAttribute('href') || link.href, baseUrl);
  const parsed = parseOgvHref(href, baseUrl);
  if (!parsed) return null;
  return {
    kind: 'ogv',
    seasonId: parsed.prefix === 'ss' ? parsed.id : '',
    epId: parsed.prefix === 'ep' ? parsed.id : '',
    href,
    title: getCardTitle(getCardRoot(link), link, 'Bilibili 番剧'),
  };
}

export function getCurrentPageBvid() {
  return location.href.match(BV_RE)?.[1] || '';
}

export function getCurrentPageOgvMeta() {
  const href = normalizeOgvHref(location.href);
  const parsed = parseOgvHref(href || location.href);
  if (!parsed) return null;
  const title = cleanVideoTitle(
    document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
    document.querySelector('h1[title]')?.getAttribute('title') ||
    document.querySelector('h1')?.textContent ||
    document.title ||
    'Bilibili 番剧',
  );
  return {
    kind: 'ogv',
    seasonId: parsed.prefix === 'ss' ? parsed.id : '',
    epId: parsed.prefix === 'ep' ? parsed.id : '',
    href,
    title,
  };
}

export function getCurrentPageOgvKey() {
  const meta = getCurrentPageOgvMeta();
  if (!meta) return '';
  return meta.epId ? `ep${meta.epId}` : meta.seasonId ? `ss${meta.seasonId}` : '';
}

export function isPlaybackPage() {
  return /^https?:\/\/www\.bilibili\.com\/video\/BV/.test(location.href);
}

export function isOgvPage() {
  return /^https?:\/\/www\.bilibili\.com\/bangumi\/play\/(?:ss|ep)\d+/.test(location.href);
}

export function isSpacePage() {
  return /^https?:\/\/space\.bilibili\.com\//.test(location.href);
}

export function isDynamicPage() {
  return /^https?:\/\/t\.bilibili\.com\//.test(location.href);
}

export function getCardRoot(link) {
  // BEM children such as bili-video-card__image--link match the broad fallback
  // selectors too. Keep looking for a complete card, but never cross into a
  // container holding different videos or episodes.
  let fallback = null;
  for (let candidate = link; candidate && candidate !== link.ownerDocument.body; candidate = candidate.parentElement) {
    if (countDistinctPlayables(candidate) > 1) break;
    if (candidate.matches(CARD_ROOT_SELECTOR)) return candidate;
    if (!fallback && candidate.matches(FALLBACK_CARD_ROOT_SELECTOR)) fallback = candidate;
  }
  return fallback || getFallbackCardRoot(link);
}

export function getCardTitle(root, link, fallback = 'Bilibili 视频') {
  for (const selector of CARD_TITLE_SELECTORS) {
    const elements = [...(root?.querySelectorAll(selector) || [])];
    if (root?.matches(selector)) elements.unshift(root);
    for (const element of elements) {
      if (element.closest(NON_TITLE_SELECTOR)) continue;
      const title = [element.getAttribute('title'), element.textContent].find(isUsefulCardTitle);
      if (title) return cleanCardTitle(title);
    }
  }
  const key = getLinkPlaybackKey(link);
  const links = [link, ...(root?.querySelectorAll('a[href]') || [])];
  for (const candidate of links) {
    if (!key || candidate.closest(NON_TITLE_SELECTOR) || getLinkPlaybackKey(candidate) !== key ||
        isCoverLink(candidate) || candidate.querySelector(COVER_HOST_SELECTOR)) continue;
    const title = [candidate.getAttribute('title'), candidate.getAttribute('aria-label'), candidate.textContent].find(isUsefulCardTitle);
    if (title) return cleanCardTitle(title);
  }
  // A cover's raw text includes hidden tooltips, counts and hover-preview UI.
  // Only explicit metadata is safe if the card's title has not mounted yet.
  const title = [link.getAttribute('title'), link.getAttribute('aria-label'),
    root?.querySelector('img')?.getAttribute('alt'), fallback].find(isUsefulCardTitle);
  return cleanCardTitle(title) || 'Bilibili 视频';
}

function cleanCardTitle(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isUsefulCardTitle(value) {
  const title = cleanCardTitle(value);
  return Boolean(title && !/^(?:不感兴趣|撤销|添加至稍后再看|稍后再看|已加稍后再看|已添加至稍后再看|取消稍后再看)$/.test(title) && !title.includes('将减少此类内容推荐'));
}

export function isCoverLink(link) {
  return Boolean(
    link.matches?.(COVER_HOST_SELECTOR) ||
    link.closest?.(COVER_HOST_SELECTOR) ||
    link.querySelector?.('img, picture, video, canvas, svg[class*="play"]') ||
    /cover|pic|image/i.test(String(link.className || ''))
  );
}

function getFallbackCardRoot(link) {
  const parent = link.parentElement;
  if (!parent) return link;
  return countDistinctPlayables(parent) > 1 ? link : parent;
}

export function getLinkPlaybackKey(link, baseUrl = location.href) {
  try {
    const url = new URL(link.getAttribute('href') || link.href, baseUrl);
    if (!isBilibiliUrl(url)) return '';
    const bv = url.pathname.match(BV_RE)?.[1];
    if (bv) return `${bv}:p${Math.max(1, Number(url.searchParams.get('p')) || 1)}`;
    const ogv = url.pathname.match(OGV_RE);
    if (ogv) return `${ogv[1]}${ogv[2]}`;
    if (url.hostname === 'live.bilibili.com') return `live:${url.pathname.match(/^\/(\d+)/)?.[1] || ''}`;
  } catch { /* Not a playable URL. */ }
  return '';
}

function countDistinctPlayables(root) {
  const links = [...root.querySelectorAll('a[href]')];
  if (root.matches('a[href]')) links.push(root);
  return new Set(links.map(link => getLinkPlaybackKey(link)).filter(Boolean)).size;
}

function isBilibiliUrl(url) {
  return /^(?:http|https):$/.test(url.protocol) && (url.hostname === 'bilibili.com' || url.hostname.endsWith('.bilibili.com'));
}

function parseOgvHref(rawHref, baseUrl = location.href) {
  if (!rawHref) return null;
  try {
    const url = new URL(rawHref, baseUrl);
    if (!isBilibiliUrl(url)) return null;
    const match = url.pathname.match(OGV_RE);
    if (!match) return null;
    return {
      url,
      prefix: match[1],
      id: match[2],
    };
  } catch {
    return null;
  }
}

function cleanVideoTitle(value) {
  const title = String(value || '').replace(/\s+/g, ' ').trim().replace(/^(?:\d{1,2}:)?\d{1,2}:\d{2}\s+/, '');
  if (!title || title === '不感兴趣') return 'Bilibili 视频';
  return title;
}
