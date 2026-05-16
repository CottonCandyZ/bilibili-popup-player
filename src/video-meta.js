import { BV_RE } from './constants.js';

export const COVER_HOST_SELECTOR = [
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
  '[class*="small-item"]',
  '[class*="feed-card"]',
];

export const PLAYBACK_VIDEO_LINK_SELECTOR = [
  '.video-page-card-small a[href*="/video/BV"]',
  '.video-page-operator-card-small a[href*="/video/BV"]',
  '.rec-list .video-page-card-small a[href*="/video/BV"]',
  '.rec-list .video-page-operator-card-small a[href*="/video/BV"]',
  '.recommend-list .video-page-card-small a[href*="/video/BV"]',
  '.recommend-list .video-page-operator-card-small a[href*="/video/BV"]',
].join(',');

export function normalizeVideoHref(rawHref, baseUrl = location.href) {
  if (!rawHref) return '';
  try {
    const url = new URL(rawHref, baseUrl);
    if (!url.hostname.endsWith('bilibili.com')) return '';
    return url.href;
  } catch {
    return '';
  }
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
  const title = link.getAttribute('title') ||
    link.getAttribute('aria-label') ||
    link.querySelector('img')?.getAttribute('alt') ||
    link.textContent ||
    'Bilibili 视频';
  return { bvid: match[1], href, title: cleanVideoTitle(title) };
}

export function getCurrentPageBvid() {
  return location.href.match(BV_RE)?.[1] || '';
}

export function isPlaybackPage() {
  return /^https?:\/\/www\.bilibili\.com\/video\/BV/.test(location.href);
}

export function isSpacePage() {
  return /^https?:\/\/space\.bilibili\.com\//.test(location.href);
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

function cleanVideoTitle(value) {
  const title = String(value || '').replace(/\s+/g, ' ').trim();
  if (!title || title === '不感兴趣') return 'Bilibili 视频';
  return title;
}
