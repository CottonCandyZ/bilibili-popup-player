import { BV_RE } from './constants.js';

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

export function getCardRoot(link) {
  return link.closest('.bili-video-card') ||
    link.closest('.feed-card') ||
    link.closest('.bili-video-card__wrap') ||
    link.closest('.small-item') ||
    link.closest('.history-card') ||
    link.closest('.history-record') ||
    link.closest('.bili-history-card') ||
    link.closest('.video-item') ||
    link.closest('.video-list-item') ||
    link.closest('.search-card') ||
    link.closest('.search-item') ||
    link.closest('.list-item') ||
    link.closest('.section-item') ||
    link.closest('.video-card') ||
    link.closest('.video-page-card-small') ||
    link.closest('.card-box') ||
    link.closest('.recommended-card') ||
    link.closest('[class*="video-card"]') ||
    link.closest('[class*="video-page-card"]') ||
    link.closest('[class*="history"]') ||
    link.closest('[class*="search"]') ||
    link.closest('[class*="list-item"]') ||
    link.closest('[class*="small-item"]') ||
    link.closest('[class*="feed-card"]') ||
    link.parentElement;
}

export function isCoverLink(link) {
  const coverSelector = '.bili-video-card__image, .bili-video-card__cover, .bili-video-card__wrap, .pic-box, .pic, .framepreview-box, .video-awesome-img, .cover, .cover-contain, .history-card__cover, .bili-history-card__cover, [class*="cover"], [class*="pic"], [class*="image"], [class*="poster"], [class*="thumbnail"]';
  return Boolean(
    link.matches?.(coverSelector) ||
    link.closest?.(coverSelector) ||
    link.querySelector?.('img, picture, video, canvas, svg[class*="play"]') ||
    /cover|pic|image/i.test(String(link.className || ''))
  );
}
