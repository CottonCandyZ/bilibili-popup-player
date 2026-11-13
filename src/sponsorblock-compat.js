// BilibiliSponsorBlock 0.17.1 discovers page media under #bilibili-player and
// requests identity through its MAIN-world message bridge. Answer only those
// requests while our player owns playback; leave the site's globals untouched.
const SOURCE = 'biliSponsorBlock';
const PLAYER_ID = 'bilibili-player';
const RESPONSES = {
  getBvID: 'returnBvID',
  getVideoInfoOnplayer: 'returnVideoInfo',
  getChannelID: 'returnChannelID',
  getDescription: 'returnDescription',
  getCidFromBvid: 'returnCidFromBvid',
  getCidMap: 'returnCidMap',
};

export function createSponsorBlockCompatibility(targetWindow) {
  let playback = null;
  let detected = false;
  let disposed = false;
  let revision = 0;
  let releasePlayerId = null;

  const post = message => targetWindow.postMessage(message, targetWindow.location.origin);
  const announce = () => {
    const info = playback?.bootstrap.playerInfo;
    const original = targetWindow.__INITIAL_STATE__;
    const bvid = info?.bvid || original?.bvid;
    const cid = info?.cid || original?.cid;
    post({
      source: 'sponsorblock', type: 'navigation',
      url: playback?.bootstrap.href || targetWindow.location.href,
      videoID: bvid && cid ? `${bvid}+${cid}` : null,
    });
  };

  function syncPlayerId() {
    if (releasePlayerId || !detected || playback?.kind !== 'home') return;
    const root = playback.root;
    const doc = root.ownerDocument;
    const originals = new Set();
    const display = root.style.getPropertyValue('display');
    const priority = root.style.getPropertyPriority('display');
    const reserve = element => {
      if (element !== root && element.id === PLAYER_ID) {
        originals.add(element);
        element.removeAttribute('id');
      }
    };
    // There must be one discoverable player, including on native playback pages.
    // Release the paused host's ID only for the duration of this compatibility
    // session, restoring it on close, renderer changes, disable and destroy.
    doc.querySelectorAll(`#${PLAYER_ID}`).forEach(reserve);
    // The existing UI mount is only a discovery boundary, not another layout box.
    root.style.setProperty('display', 'contents');
    root.id = PLAYER_ID;
    const observer = new targetWindow.MutationObserver(records => {
      for (const record of records) {
        // Native danmaku/control updates inside our player cannot add host roots.
        if (root.contains(record.target)) continue;
        if (record.type === 'attributes') reserve(record.target);
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          reserve(node);
          node.querySelectorAll(`#${PLAYER_ID}`).forEach(reserve);
        }
      }
    });
    observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['id'] });
    releasePlayerId = () => {
      observer.disconnect();
      if (root.id === PLAYER_ID) root.removeAttribute('id');
      if (root.style.display === 'contents') {
        if (display) root.style.setProperty('display', display, priority);
        else root.style.removeProperty('display');
      }
      for (const element of originals) if (!element.hasAttribute('id')) element.id = PLAYER_ID;
    };
  }

  function onMessage(event) {
    const request = event.data;
    const responseType = RESPONSES[request?.type];
    if (event.source !== targetWindow || event.origin !== targetWindow.location.origin ||
      request?.source !== SOURCE || typeof request.id !== 'string' ||
      !responseType || responseType !== request.responseType) return;
    const firstRequest = !detected;
    detected = true;
    syncPlayerId();
    if (!playback) return;

    const { bootstrap } = playback;
    const info = bootstrap.playerInfo;
    const pages = bootstrap.initialState?.videoData?.pages || [];
    let data;
    switch (request.type) {
      case 'getBvID': data = `${info.bvid}+${info.cid}`; break;
      case 'getVideoInfoOnplayer': data = { aid: info.aid, bvid: info.bvid, cid: info.cid, p: info.p || 1 }; break;
      case 'getChannelID': data = bootstrap.initialState?.videoData?.owner?.mid ?? null; break;
      case 'getDescription': data = bootstrap.initialState?.videoData?.desc || ''; break;
      case 'getCidFromBvid': {
        if (request.payload?.bvid !== info.bvid) return;
        const page = Number(request.payload.page || 1);
        data = pages.find(item => Number(item.page) === page)?.cid ?? (page === Number(info.p || 1) ? info.cid : null);
        break;
      }
      case 'getCidMap':
        if (request.payload !== info.bvid) return;
        data = new Map(pages.map(item => [Number(item.page), item.cid]));
        break;
    }
    // Capture runs ahead of the extension's bubble listener, so its stale host
    // response cannot win the same request ID or race a second response.
    event.stopImmediatePropagation();
    post({ source: SOURCE, type: request.responseType, id: request.id, data });
    if (firstRequest) announce();
  }

  targetWindow.addEventListener('message', onMessage, true);
  return {
    setPlayback(kind, root, bootstrap) {
      if (disposed) return;
      if (!root || !bootstrap?.playerInfo?.bvid || !bootstrap.playerInfo.cid) { this.clear(kind); return; }
      revision++;
      if (playback?.root !== root) { releasePlayerId?.(); releasePlayerId = null; }
      playback = { kind, root, bootstrap };
      syncPlayerId();
      if (detected) announce();
    },
    clear(kind) {
      if (playback?.kind !== kind) return;
      playback = null;
      releasePlayerId?.();
      releasePlayerId = null;
      const token = ++revision;
      // Closing also restores the page URL. Read it after that synchronous work.
      targetWindow.queueMicrotask(() => { if (!disposed && detected && token === revision) announce(); });
    },
    dispose() {
      disposed = true;
      releasePlayerId?.();
      releasePlayerId = null;
      playback = null;
      targetWindow.removeEventListener('message', onMessage, true);
    },
  };
}
