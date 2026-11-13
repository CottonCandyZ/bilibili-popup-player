// BilibiliSponsorBlock 0.17.1 discovers page media under #bilibili-player and
// requests identity through its MAIN-world message bridge. Answer only those
// requests while our player owns playback; leave the site's globals untouched.
const SOURCE = 'biliSponsorBlock';
const PLAYER_ID = 'bilibili-player';
const PIP_ROOT = 'bpx-player-rich-pip-root';
const PIP_TRACK = 'bpx-player-rich-pip-progress';
const PLAYBACK_URL_PARAM = 'bpn_video';
const RESPONSES = {
  getBvID: 'returnBvID',
  getVideoInfoOnplayer: 'returnVideoInfo',
  getChannelID: 'returnChannelID',
  getDescription: 'returnDescription',
  getCidFromBvid: 'returnCidFromBvid',
  getCidMap: 'returnCidMap',
};

export function syncSponsorBlockPlaybackUrl(url, href) {
  url.searchParams.delete(PLAYBACK_URL_PARAM);
  if (url.hostname === 'www.bilibili.com' || !href) return;
  const playbackUrl = String(href).match(/^https:\/\/www\.bilibili\.com\/(?:video\/(?:BV[\da-z]+|av\d+)|bangumi\/play\/(?:ep|ss)\d+)\/?(?=[?#]|$)/i)?.[0];
  if (!playbackUrl) return;
  // 0.17.1 rechecks document.URL on every skip and searches for the literal
  // playback URL. Expose it in a query parameter on the current origin.
  url.search += `${url.search ? '&' : '?'}${PLAYBACK_URL_PARAM}=${playbackUrl}`;
}

export function createSponsorBlockCompatibility(targetWindow, { syncPlaybackUrl = () => {} } = {}) {
  let playback = null;
  let detected = false;
  let disposed = false;
  let revision = 0;
  let releasePlayerId = null;
  let releasePipTimeline = null;
  const replies = new Map();
  const replyKey = targetWindow.crypto.randomUUID();

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

  function syncPipTimeline() {
    if (releasePipTimeline || !detected || playback?.kind !== 'pip') return;
    const root = playback.root;
    const doc = root.ownerDocument;
    const source = doc.createElement('div');
    source.className = PIP_TRACK;
    source.hidden = true;
    const overlay = doc.createElement('ul');
    overlay.className = 'sbSegmentOverlay';
    overlay.dataset.bpnSponsorblockTimeline = '';
    overlay.setAttribute('aria-hidden', 'true');
    let media = null;
    let track = null;

    const syncHosts = () => {
      const video = root.querySelector('.bpx-player-video-area video:not(.bpx-player-seamless-replacement, .v-recommend-inline-player video)');
      const nextMedia = video?.closest('.bpx-player-video-wrap') ?? null;
      if (nextMedia !== media) {
        media?.classList.remove(PIP_ROOT);
        source.remove();
        media = nextMedia;
        media?.classList.add(PIP_ROOT);
      }
      // SponsorBlock resolves its track from the video. Scope the marker to
      // the media wrapper so Titan's native rich-PiP layout stays inactive.
      if (media && source.parentElement !== media) media.append(source);
      track = video?.closest('.bpx-player-container')?.querySelector('.bpx-player-progress') ?? null;
      if (!track) overlay.remove();
      else if (overlay.parentElement !== track) track.prepend(overlay);
    };

    const observer = new targetWindow.MutationObserver(records => {
      if (!root.contains(media) || source.parentElement !== media ||
          !root.contains(track) || overlay.parentElement !== track) syncHosts();
      if (records.some(({ target }) => source.contains(target))) {
        // The extension owns the marks. Copy only its decorative bars onto
        // Nano's seek track, which also carries the native heatmap.
        const segments = source.querySelector('#pipPreviewbar')?.children || [];
        overlay.replaceChildren(...Array.from(segments, segment => segment.cloneNode(true)));
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    observer.observe(source, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    syncHosts();
    releasePipTimeline = () => {
      observer.disconnect();
      media?.classList.remove(PIP_ROOT);
      source.remove();
      overlay.remove();
    };
  }

  function activate() {
    syncPlaybackUrl(playback.bootstrap.href);
    syncPlayerId();
    syncPipTimeline();
    announce();
  }

  function releaseSurface() {
    releasePlayerId?.();
    releasePlayerId = null;
    releasePipTimeline?.();
    releasePipTimeline = null;
  }

  function onMessage(event) {
    const request = event.data;
    if (event.source !== targetWindow || event.origin !== targetWindow.location.origin || request?.source !== SOURCE) return;
    // The extension's document-start listener may run before ours even in
    // capture, since message events target Window itself. Suppress its stale
    // reply before the extension's per-request listener can consume it.
    if (replies.has(request.id) && replies.get(request.id) === request.type && request.bpnReplyKey !== replyKey) {
      event.stopImmediatePropagation();
      return;
    }
    const responseType = RESPONSES[request.type];
    const query = typeof request.id === 'string' && responseType && responseType === request.responseType;
    // On a non-video URL the extension can initialize without querying media.
    // Its hydration handshake is also proof the extension is present.
    const readiness = request.type === 'pageReady' || (request.type === 'requestPageReady' && request.bpnReplyKey !== replyKey);
    if (!query && !readiness &&
      !(request.type === 'getFrameRate' && request.responseType === 'returnFrameRate')) return;
    if (!detected) {
      detected = true;
      if (playback) activate();
    }
    if (!query || !playback) return;

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
    replies.set(request.id, request.responseType);
    if (replies.size > 256) replies.delete(replies.keys().next().value);
    event.stopImmediatePropagation();
    post({ source: SOURCE, type: request.responseType, id: request.id, data, bpnReplyKey: replyKey });
  }

  targetWindow.addEventListener('message', onMessage, true);
  const onNavigation = ({ navigationType }) => {
    if (!detected || !playback || !['push', 'replace'].includes(navigationType)) return;
    const href = playback.bootstrap.href;
    const token = revision;
    // Space's router can replace the URL during hydration or when changing
    // tabs. Reapply after that navigation has updated location.
    targetWindow.queueMicrotask(() => {
      if (!disposed && token === revision) syncPlaybackUrl(href);
    });
  };
  if (targetWindow.location.hostname !== 'www.bilibili.com') {
    targetWindow.navigation?.addEventListener('currententrychange', onNavigation);
  }
  return {
    get detected() { return detected; },
    setPlayback(kind, root, bootstrap) {
      if (disposed) return;
      if (!root || !bootstrap?.playerInfo?.bvid || !bootstrap.playerInfo.cid) { this.clear(kind); return; }
      revision++;
      if (playback?.root !== root || playback.kind !== kind) releaseSurface();
      playback = { kind, root, bootstrap };
      if (detected) activate();
      else post({ source: SOURCE, type: 'requestPageReady', bpnReplyKey: replyKey });
    },
    clear(kind) {
      if (playback?.kind !== kind) return;
      playback = null;
      releaseSurface();
      const token = ++revision;
      // Closing also restores the page URL. Read it after that synchronous work.
      targetWindow.queueMicrotask(() => { if (!disposed && detected && token === revision) announce(); });
    },
    dispose() {
      disposed = true;
      releaseSurface();
      playback = null;
      replies.clear();
      targetWindow.removeEventListener('message', onMessage, true);
      targetWindow.navigation?.removeEventListener('currententrychange', onNavigation);
    },
  };
}
