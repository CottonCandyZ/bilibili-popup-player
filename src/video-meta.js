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

export function normalizeVideoHref(rawHref) {
  if (!rawHref) return '';
  try {
    const url = new URL(rawHref, location.href);
    if (!url.hostname.endsWith('bilibili.com')) return '';
    return url.href;
  } catch {
    return '';
  }
}

export function normalizeResourceUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    return new URL(rawUrl, location.href).href;
  } catch {
    return '';
  }
}

export function getVideoMetaFromLink(link) {
  const href = normalizeVideoHref(link.getAttribute('href') || link.href);
  const match = href?.match(BV_RE);
  if (!match) return null;
  const title = link.getAttribute('title') ||
    link.getAttribute('aria-label') ||
    link.querySelector('img')?.getAttribute('alt') ||
    link.closest('[title]')?.getAttribute('title') ||
    'Bilibili 视频';
  return { bvid: match[1], href, title: title.trim() || 'Bilibili 视频' };
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
