import { APP } from './constants.js';

export function waitForHostScript(targetDocument, src) {
  const targetWindow = targetDocument.defaultView;
  const absoluteSrc = new URL(src, targetDocument.baseURI).href;
  const find = () => [...targetDocument.scripts].find(script => script.src === absoluteSrc);
  if (find()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const observer = new targetWindow.MutationObserver(() => {
      if (!find()) return;
      observer.disconnect();
      targetWindow.clearTimeout(timer);
      resolve();
    });
    const timer = targetWindow.setTimeout(() => {
      observer.disconnect();
      reject(new Error('等待原站评论组件超时'));
    }, 15000);
    observer.observe(targetDocument.documentElement, { childList: true, subtree: true });
  });
}

export function loadScriptOnce(targetDocument, src, isReady) {
  if (isReady()) return Promise.resolve();

  const attr = `data-${APP}-script`;
  const absoluteSrc = new URL(src, targetDocument.baseURI).href;
  // The host page may already be loading the same runtime. Re-inserting it
  // can register Bilibili's custom comment elements twice.
  const existing = [...targetDocument.scripts].find(script => script.src === absoluteSrc);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = targetDocument.createElement('script');
    script.src = src;
    script.crossOrigin = 'anonymous';
    script.setAttribute(attr, src);
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
    targetDocument.head.appendChild(script);
  });
}
