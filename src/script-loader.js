import { APP } from './constants.js';

const pendingLoads = new WeakMap();
const SCRIPT_TIMEOUT_MS = 15000;

export function loadPlayerCore(targetDocument, src, getApi, options = {}) {
  const isReady = () => typeof getApi()?.createPlayer === 'function';
  if (isReady()) return Promise.resolve();
  const matches = (script) => /\/player\/main\/core\.[^/]+\.js$/.test(new URL(script.src, targetDocument.baseURI).pathname);
  const existing = [...targetDocument.scripts].find(matches);
  if (!existing && targetDocument.defaultView.customElements?.get('bwp-video')) {
    return Promise.reject(new Error('页面已注册播放器组件，但播放器接口不可用；请刷新页面后重试'));
  }
  return loadScriptOnce(targetDocument, src, isReady, { ...options, matches });
}

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

export function loadScriptOnce(targetDocument, src, isReady, { matches, timeoutMs = SCRIPT_TIMEOUT_MS } = {}) {
  if (isReady()) return Promise.resolve();

  const attr = `data-${APP}-script`;
  const absoluteSrc = new URL(src, targetDocument.baseURI).href;
  // The host page may already be loading the same runtime. Re-inserting it
  // can register Bilibili's custom comment elements twice.
  const existing = [...targetDocument.scripts].find(matches || (script => script.src === absoluteSrc));
  const key = existing?.src || absoluteSrc;
  let loads = pendingLoads.get(targetDocument);
  if (!loads) pendingLoads.set(targetDocument, loads = new Map());
  if (loads.has(key)) return loads.get(key);
  const script = existing || targetDocument.createElement('script');
  if (!existing) {
    script.src = src;
    script.crossOrigin = 'anonymous';
    script.setAttribute(attr, src);
  }
  const targetWindow = targetDocument.defaultView;
  const promise = new Promise((resolve, reject) => {
    let timeout, poll;
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      targetWindow.clearTimeout(timeout);
      targetWindow.clearInterval(poll);
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
      loads.delete(key);
      if (error) {
        if (!existing) script.remove();
        reject(error);
      } else resolve();
    };
    const check = () => {
      try { if (isReady()) { finish(); return true; } }
      catch (error) { finish(error); return true; }
      return false;
    };
    const onLoad = () => {
      if (!check()) finish(new Error(`脚本已加载，但组件接口不可用：${key}`));
    };
    const onError = () => finish(new Error(`加载脚本失败：${key}`));
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    // A host script may have completed before listeners were attached. Polling
    // also detects its API becoming available without another load event.
    poll = targetWindow.setInterval(check, 50);
    timeout = targetWindow.setTimeout(() => finish(new Error(`加载脚本超时：${key}`)), timeoutMs);
  });
  loads.set(key, promise);
  if (!existing) targetDocument.head.appendChild(script);
  return promise;
}
