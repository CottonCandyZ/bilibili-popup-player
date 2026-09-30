import { APP } from './constants.js';

const LAYER = `data-${APP}-login-layer`;
const MASK = '.bili-mini-mask';

function getLogin(doc) {
  return [...(doc?.querySelectorAll(`[${LAYER}] ${MASK}`) || [])]
    .find(element => element.getClientRects().length && doc.defaultView.getComputedStyle(element).display !== 'none');
}

export function hasNativeLogin(doc) { return Boolean(getLogin(doc)); }

export function dismissNativeLogin(doc) {
  getLogin(doc)?.querySelector('.bili-mini-close-icon')?.click();
}

export function handleNativeLoginShortcut(event, doc) {
  const mask = getLogin(doc);
  if (!mask) return false;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === 'keydown') mask.querySelector('.bili-mini-close-icon')?.click();
  }
  return true;
}

// MiniLogin mounts to body with z-index:10010. A shell-owned portal fixes both
// our modal stacking and the browser fullscreen top layer, without replacing
// Bilibili's authentication flow or its success/cancel callbacks.
export function installNativeLogin(mount, doc) {
  const shell = mount.closest(`#${APP}-dialog, #shell`);
  if (!shell) return () => {};
  const win = doc.defaultView;
  const layers = new Set();
  let pendingUntil = 0;
  let previousFocus = null;

  function onClick(event) {
    if (event.composedPath().some(node => node?.hasAttribute?.(LAYER))) return;
    pendingUntil = event.composedPath().includes(shell) ? Date.now() + 10000 : 0;
    if (pendingUntil) previousFocus = event.composedPath()[0];
  }

  function adopt(mask) {
    let layer = mask.parentElement;
    if (!layers.has(layer)) {
      layer = doc.createElement('div');
      layer.setAttribute(LAYER, '');
      layer.style.display = 'contents';
      mask.before(layer);
      layer.append(mask);
      layers.add(layer);
      observer.observe(layer, { childList: true });
    }
    shell.append(layer);
    mask.setAttribute('role', 'dialog');
    mask.setAttribute('aria-label', '登录哔哩哔哩');
    mask.tabIndex = -1;
    // The SDK's close icon is a div; keep it accessible without changing its
    // click handler or requesting/entering any account information ourselves.
    const close = mask.querySelector('.bili-mini-close-icon');
    if (close) {
      close.setAttribute('role', 'button');
      close.setAttribute('aria-label', '关闭登录窗口');
      close.tabIndex = 0;
    }
    mask.focus({ preventScroll: true });
    pendingUntil = 0;
  }

  const observer = new win.MutationObserver(records => {
    for (const record of records) for (const element of record.addedNodes) {
      if (element.nodeType !== 1 || !element.matches(MASK) || Date.now() > pendingUntil) continue;
      if (element.parentElement === doc.body || layers.has(element.parentElement)) adopt(element);
    }
    for (const layer of layers) {
      if (layer.querySelector(MASK)) continue;
      // Vue replaces the mask with a comment node on close. Preserve that
      // placeholder in the document, so the SDK can reopen after our shell is
      // closed/unmounted. Moving just the mask would strand its next mount.
      if (layer.parentElement === shell) {
        doc.body.append(layer);
        if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
      }
      if (!layer.childNodes.length) { layer.remove(); layers.delete(layer); }
    }
  });
  observer.observe(doc.body, { childList: true });
  doc.addEventListener('click', onClick, true);
  const stopPlayerKeys = event => {
    if (!getLogin(doc)) return;
    event.stopPropagation();
    if (event.type === 'keydown' && ['Enter', ' '].includes(event.key) && event.target.matches?.('.bili-mini-close-icon')) {
      event.preventDefault(); event.target.click();
    }
  };
  shell.addEventListener('keydown', stopPlayerKeys);
  shell.addEventListener('keyup', stopPlayerKeys);

  return () => {
    doc.removeEventListener('click', onClick, true);
    shell.removeEventListener('keydown', stopPlayerKeys);
    shell.removeEventListener('keyup', stopPlayerKeys);
    observer.disconnect();
    for (const layer of layers) {
      layer.querySelector('.bili-mini-close-icon')?.click();
      doc.body.append(layer);
    }
    layers.clear();
  };
}
