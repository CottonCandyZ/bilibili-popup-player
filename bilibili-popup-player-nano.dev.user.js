// ==UserScript==
// @name         Bilibili Popup Player - Nano Dev
// @namespace    https://www.bilibili.com/
// @version      0.0.0-dev
// @description  Local dev loader for Bilibili Popup Player - Nano.
// @author       Codex & Cotton
// @match        https://www.bilibili.com/*
// @match        https://space.bilibili.com/*
// @match        https://search.bilibili.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      127.0.0.1
// @connect      localhost
// ==/UserScript==

(() => {
  const origin = 'http://127.0.0.1:8715';
  const scriptUrl = `${origin}/bilibili-popup-player-nano.user.js`;
  const versionUrl = `${origin}/dev-version.json`;
  const pollInterval = 1000;
  let currentVersion = '';

  load();

  async function load() {
    try {
      currentVersion = await readVersion();
      const code = await requestText(scriptUrl);
      unsafeWindow.Function(`${code}\n//# sourceURL=${scriptUrl}`)();
      window.setInterval(checkVersion, pollInterval);
    } catch (error) {
      console.error('[bili-popup-dev] failed to load local bundle', error);
    }
  }

  async function checkVersion() {
    try {
      const nextVersion = await readVersion();
      if (nextVersion && currentVersion && nextVersion !== currentVersion) {
        location.reload();
      }
    } catch {
      // The local dev server may be restarting.
    }
  }

  async function readVersion() {
    const payload = JSON.parse(await requestText(versionUrl));
    return String(payload.version || '');
  }

  function requestText(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`,
        headers: { 'Cache-Control': 'no-cache' },
        onload(response) {
          if (response.status >= 200 && response.status < 300) {
            resolve(response.responseText || '');
          } else {
            reject(new Error(`GET ${url} failed: ${response.status}`));
          }
        },
        onerror: reject,
        ontimeout: reject,
      });
    });
  }
})();
