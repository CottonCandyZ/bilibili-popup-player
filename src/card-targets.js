import { APP, HOST_ID } from './constants.js';
import { COVER_HOST_SELECTOR, getLinkPlaybackKey } from './video-meta.js';

export const CARD_ACTION_SELECTOR = 'button, input, select, textarea, [role="button"], [role="menuitem"], [class*="watch-later"], [class*="watchLater"], .van-watchlater';

const EXCLUDED_CONTEXT = [
  `[data-bili-popup-ui]`, `#${APP}-overlay`, `#${HOST_ID}`,
  '#bilibili-player', '#bofqi', '.bpx-player-container', '.bilibili-player',
  'dialog', '[role="dialog"]', '[role="menu"]', '[role="listbox"]', '[role="tablist"]',
  '[aria-modal="true"]', '[inert]', '[hidden]',
  '.ep-list', '.ep-list-wrapper', '.ep-item', '.ep-list-item', '.episode-item',
  '[class*="epList"]', '[class*="ep-list"]', '[class*="episode-list"]',
  '[class*="episodeList"]', '[class*="numberList"]', '[class*="number-list"]',
  '[class*="EpisodeVirtualList"]', '[class*="EpisodeList"]',
  '[class*="tooltip"]', '[class*="context-menu"]',
].join(',');

// Only a real cover can host a card control. A text link or episode cell is
// not a cover, even if one of its ancestors contains an unrelated image.
export function findCardAnchor(link, card, meta) {
  if (!link?.isConnected || !card?.isConnected || link.closest(EXCLUDED_CONTEXT)) return null;
  const key = getLinkPlaybackKey(link);
  const links = [link, ...card.querySelectorAll('a[href]')];
  const candidates = links.filter(candidate => candidate === link || (key && getLinkPlaybackKey(candidate) === key));
  for (const candidate of candidates) {
    if (candidate.closest(EXCLUDED_CONTEXT)) continue;
    const image = candidate.querySelector('img, picture, video, canvas');
    let cover = image?.closest(COVER_HOST_SELECTOR);
    if (!cover || !card.contains(cover)) cover = image;
    if (!cover && candidate.matches(COVER_HOST_SELECTOR) && getComputedStyle(candidate).backgroundImage !== 'none') cover = candidate;
    if (!cover) cover = [...candidate.querySelectorAll(COVER_HOST_SELECTOR)]
      .find(element => getComputedStyle(element).backgroundImage !== 'none');
    if (!cover) continue;
    // Playback recommendations put duration, mask and inline-preview layers
    // beside the image link. They are all part of this one thumbnail surface.
    const recommendationCover = candidate.closest('.video-page-card-small, .video-page-operator-card-small') && cover.closest('.pic-box');
    if (recommendationCover && card.contains(recommendationCover)) cover = recommendationCover;
    const rect = cover.getBoundingClientRect();
    // Header history/favorites use smaller covers, including on OGV pages.
    if (rect.width < 96 || rect.height < 54) continue;
    if (rect.width > 720 || rect.height > 560 || rect.width / rect.height > 3) continue;
    return cover;
  }
  // Dynamic-page live avatars have their own established metadata binding.
  if (meta?.kind === 'live' && !key && link.querySelector('img')) {
    const rect = link.getBoundingClientRect();
    if (rect.width >= 40 && rect.height >= 40 && rect.width <= 240) return link;
  }
  return null;
}

export function intersectRects(a, b) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

export function getVisibleCardRect(anchor) {
  const win = anchor.ownerDocument.defaultView;
  let rect = intersectRects(anchor.getBoundingClientRect(), { left: 0, top: 0, right: win.innerWidth, bottom: win.innerHeight });
  for (let element = anchor; element; element = element.parentElement) {
    const style = win.getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0 || element.hidden || element.inert) return null;
    if (element !== anchor && /(hidden|clip|scroll|auto)/.test(`${style.overflowX} ${style.overflowY}`)) {
      const bounds = element.getBoundingClientRect();
      const clipX = /(hidden|clip|scroll|auto)/.test(style.overflowX);
      const clipY = /(hidden|clip|scroll|auto)/.test(style.overflowY);
      rect = intersectRects(rect, {
        left: clipX ? bounds.left + element.clientLeft : rect.left,
        right: clipX ? bounds.left + element.clientLeft + element.clientWidth : rect.right,
        top: clipY ? bounds.top + element.clientTop : rect.top,
        bottom: clipY ? bounds.top + element.clientTop + element.clientHeight : rect.bottom,
      });
    }
    if (rect.width <= 0 || rect.height <= 0) return null;
  }
  return rect;
}

export function pointInRect(point, rect) {
  return Boolean(point && rect && point.x >= rect.left && point.x < rect.right && point.y >= rect.top && point.y < rect.bottom);
}

// Check the rendered hit stack, not z-index numbers: stacking contexts,
// transforms, sticky headers and transparent intercepting layers all count.
export function isCardExposedAt(entry, x, y, shadowRoot, coverOnly = false) {
  const doc = entry.card.ownerDocument;
  const shadowHit = shadowRoot?.elementFromPoint?.(x, y);
  if (shadowHit && shadowHit !== entry.button && shadowHit !== entry.badge && shadowHit.closest?.(`.${APP}__settings, .${APP}__settings__positioner`)) return false;
  const top = doc.elementsFromPoint(x, y).find(element => element !== entry.controlHost && element.id !== HOST_ID && element.id !== `${APP}-control-overlay`);
  if (top?.closest(EXCLUDED_CONTEXT) || top?.closest(CARD_ACTION_SELECTOR)) return false;
  const surface = coverOnly ? entry.anchor : entry.card;
  if (top && (surface === top || surface.contains(top))) return true;
  // Some sites make the cover image ignore pointers so its enclosing link
  // receives clicks. Unrelated siblings inside the same card still occlude it.
  return Boolean(coverOnly && top?.contains(surface) && doc.defaultView.getComputedStyle(surface).pointerEvents === 'none');
}

export function isControlAreaExposed(entry, rect, shadowRoot) {
  return [[rect.left + 2, rect.top + 2], [rect.right - 2, rect.top + 2], [rect.left + 2, rect.bottom - 2], [rect.right - 2, rect.bottom - 2], [(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2]]
    .every(([x, y]) => isCardExposedAt(entry, x, y, shadowRoot, true));
}
