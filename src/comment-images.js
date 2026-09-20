import { APP } from './constants.js';

const PREVIEW = `data-${APP}-comment-preview`;
const VIEWER = '.pswp, bili-photoswipe';
const PICTURES = 'bili-comment-pictures-renderer';

export function hasCommentImagePreview(targetDocument) {
  return [...(targetDocument?.querySelectorAll(`[${PREVIEW}="viewer"]`) || [])]
    .some(element => element.getClientRects().length && element.getAttribute('aria-hidden') !== 'true');
}

export function handleCommentImageShortcut(event, targetDocument) {
  if (!hasCommentImagePreview(targetDocument)) return false;
  // Leave image navigation, zoom and focus to PhotoSwipe. Keys that only
  // belong to the player must not reach its native document/window listeners.
  if ([' ', 'f', 'j', 'k', 'l'].includes(String(event.key).toLowerCase())) {
    event.stopImmediatePropagation();
    const interactive = event.composedPath().some(node => node?.matches?.('button, a, input, textarea, select, [contenteditable="true"]'));
    if (!interactive) event.preventDefault();
  }
  return true;
}

// The SDK appends its lightbox to body. Fullscreen uses the browser's top layer,
// so z-index alone cannot bring that lightbox above our player. Keep previews
// from this comment instance inside the shell, outside its scrolling content.
export function installCommentImages(mount, targetDocument) {
  const shell = mount.closest(`#${APP}-dialog, #shell`);
  if (!shell) return () => {};
  const ownerWindow = targetDocument.defaultView;
  const owned = new Set();
  let awaitingViewer = false;

  function onClick(event) {
    const path = event.composedPath();
    awaitingViewer = path.includes(mount) && path.some(node => node?.localName === PICTURES);
  }

  function hasOwnedViewer() {
    return [...owned].some(element => element.isConnected && element.matches(VIEWER));
  }

  const observer = new ownerWindow.MutationObserver(records => {
    for (const element of owned) if (!element.isConnected) owned.delete(element);
    for (const record of records) for (const element of record.addedNodes) {
      if (element.nodeType !== 1 || element.parentElement !== targetDocument.body) continue;
      const viewer = element.matches(VIEWER);
      const accessory = element.localName === 'bili-comment-picture-goods-overlay';
      if (!(viewer && awaitingViewer) && !(accessory && (awaitingViewer || hasOwnedViewer()))) continue;
      if (viewer) awaitingViewer = false;
      element.setAttribute(PREVIEW, viewer ? 'viewer' : 'accessory');
      owned.add(element);
      shell.appendChild(element);
    }
  });
  observer.observe(targetDocument.body, { childList: true });
  observer.observe(shell, { childList: true });
  targetDocument.addEventListener('click', onClick, true);

  return () => {
    targetDocument.removeEventListener('click', onClick, true);
    observer.disconnect();
    for (const element of owned) {
      // Let the SDK finish closing and release its document listeners itself.
      element.querySelector('.pswp__button--close')?.click();
      if (element.isConnected) targetDocument.body.appendChild(element);
      element.removeAttribute(PREVIEW);
    }
    owned.clear();
  };
}
