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

const CARD_ROOT_SELECTORS = [
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
];

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

export const DYNAMIC_VIDEO_LINK_SELECTOR = [
  'a.bili-dyn-card-video[href*="/video/BV"]',
  '.suit-video-card a[href*="/video/BV"]',
  '.bili-dyn-content__orig__major a[href*="/video/BV"]',
  '[class*="dyn-card-video"][href*="/video/BV"]',
].join(',');

export function normalizeVideoHref(rawHref, baseUrl = location.href) {
  if (!rawHref) return '';
  try {
    const url = new URL(rawHref, baseUrl);
    if (!url.hostname.endsWith('bilibili.com')) return '';
    const match = url.href.match(BV_RE);
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
  const match = href?.match(BV_RE);
  if (!match) return null;
  const title = getDynamicCardTitle(link) ||
    link.getAttribute('title') ||
    link.getAttribute('aria-label') ||
    link.querySelector('img')?.getAttribute('alt') ||
    link.textContent ||
    'Bilibili 视频';
  return { bvid: match[1], href, title: cleanVideoTitle(title) };
}

export function getOgvMetaFromLink(link, baseUrl = location.href) {
  const href = normalizeOgvHref(link.getAttribute('href') || link.href, baseUrl);
  const parsed = parseOgvHref(href, baseUrl);
  if (!parsed) return null;
  const title = getDynamicCardTitle(link) ||
    link.getAttribute('title') ||
    link.getAttribute('aria-label') ||
    link.querySelector('img')?.getAttribute('alt') ||
    link.textContent ||
    'Bilibili 番剧';
  return {
    kind: 'ogv',
    seasonId: parsed.prefix === 'ss' ? parsed.id : '',
    epId: parsed.prefix === 'ep' ? parsed.id : '',
    href,
    title: cleanVideoTitle(title),
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
  for (const selector of CARD_ROOT_SELECTORS) {
    const candidate = link.closest(selector);
    if (candidate && countDistinctBvids(candidate) <= 1) return candidate;
  }
  return getFallbackCardRoot(link);
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
  return countDistinctBvids(parent) > 1 ? link : parent;
}

function countDistinctBvids(root) {
  return new Set(
    [...(root.querySelectorAll?.('a[href*="/video/BV"]') || [])]
      .map((link) => normalizeVideoHref(link.getAttribute('href') || link.href).match(BV_RE)?.[1])
      .filter(Boolean),
  ).size;
}

function parseOgvHref(rawHref, baseUrl = location.href) {
  if (!rawHref) return null;
  try {
    const url = new URL(rawHref, baseUrl);
    if (!url.hostname.endsWith('bilibili.com')) return null;
    const match = url.href.match(OGV_RE);
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

function getDynamicCardTitle(link) {
  const title = link.querySelector?.('.bili-dyn-card-video__title, [class*="dyn-card-video__title"]')?.textContent;
  return title ? String(title).trim() : '';
}
