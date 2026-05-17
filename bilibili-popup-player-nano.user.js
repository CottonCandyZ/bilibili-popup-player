// ==UserScript==
// @name         Bilibili Popup Player - Nano
// @namespace    https://www.bilibili.com/
// @version      4.0.0
// @description  B 站小窗播放合并版：支持首页、动态和播放页推荐视频，网页内弹窗/Chrome Document PiP 两种模式可切换。
// @author       Codex & Cotton
// @downloadURL  https://pop-player.nanachi.moe/bilibili-popup-player-nano.user.js
// @updateURL    https://pop-player.nanachi.moe/bilibili-popup-player-nano.user.js
// @match        https://www.bilibili.com/*
// @match        https://space.bilibili.com/*
// @match        https://search.bilibili.com/*
// @match        https://live.bilibili.com/*
// @match        https://t.bilibili.com/*
// @run-at       document-idle
// @grant        GM_deleteValue
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// ==/UserScript==
(function () {
  'use strict';

  const APP = 'bili-popup-player-nano';
  const STYLE_ID = `${APP}-style`;
  const DOCUMENT_STYLE_ID = `${APP}-document-style`;
  const HOST_ID = `${APP}-host`;
  const BUTTON_CLASS = `${APP}__button`;
  const BADGE_CLASS = `${APP}__badge`;
  const SETTINGS_CLASS = `${APP}__settings`;
  const STORAGE_MODE = `${APP}:mode`;
  const STORAGE_DIRECT_CLICK = `${APP}:direct-click`;
  const STORAGE_COMMENT_LAYOUT = `${APP}:comment-layout`;
  const STORAGE_COMMENT_WIDTH = `${APP}:comment-width`;
  const STORAGE_LAST_PLAYED = `${APP}:last-played`;
  const STORAGE_MODAL_SIZE = `${APP}:modal-size`;
  const STORAGE_AUTO_PLAY_NEXT = `${APP}:auto-play-next`;
  const ENABLED_URL_RE = /^https?:\/\/(?:www\.bilibili\.com\/(?:$|[?#]|index\.html|video\/BV|account\/history|history)|space\.bilibili\.com\/|search\.bilibili\.com\/|live\.bilibili\.com\/|t\.bilibili\.com\/)/;
  const BV_RE = /\/video\/(BV[0-9A-Za-z]+)/;
  const CORE_FALLBACK = 'https://s1.hdslb.com/bfs/static/player/main/core.6dcbfdb4.js';
  const COMMENT_FALLBACK = 'https://s1.hdslb.com/bfs/seed/jinkela/commentpc/bili-comments.js';
  const THEME_BASE = 'https://s1.hdslb.com/bfs/seed/jinkela/short/bili-theme';

  const ARCHIVE_LIKE_API = 'https://api.bilibili.com/x/web-interface/archive/like';
  async function requestArchiveLike(aid, like = true) {
    const normalizedAid = Number(aid);
    if (!Number.isFinite(normalizedAid) || normalizedAid <= 0) throw new Error('缺少 aid');
    const csrf = getCookieValue$2('bili_jct');
    if (!csrf) throw new Error('需要登录后才能点赞');
    const response = await fetch(ARCHIVE_LIKE_API, {
      method: 'POST',
      credentials: 'include',
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
      },
      body: new URLSearchParams({
        aid: String(Math.trunc(normalizedAid)),
        like: like ? '1' : '2',
        csrf
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`请求失败：${response.status}`);
    if (!payload || payload.code !== 0) throw new Error(payload?.message || '点赞失败');
    return payload;
  }
  function getCookieValue$2(name) {
    const prefix = `${encodeURIComponent(name)}=`;
    const item = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith(prefix));
    return item ? decodeURIComponent(item.slice(prefix.length)) : '';
  }

  function escapeHtml(value) {
    return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  }
  function cssEscape(value) {
    return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  }

  function loadScriptOnce(targetDocument, src, isReady) {
    if (isReady()) return Promise.resolve();
    const attr = `data-${APP}-script`;
    const existing = targetDocument.querySelector(`script[${attr}="${cssEscape(src)}"]`);
    if (existing) {
      return new Promise((resolve, reject) => {
        existing.addEventListener('load', resolve, {
          once: true
        });
        existing.addEventListener('error', reject, {
          once: true
        });
      });
    }
    return new Promise((resolve, reject) => {
      const script = targetDocument.createElement('script');
      script.src = src;
      script.crossOrigin = 'anonymous';
      script.setAttribute(attr, src);
      script.addEventListener('load', resolve, {
        once: true
      });
      script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), {
        once: true
      });
      targetDocument.head.appendChild(script);
    });
  }

  async function mountComments(adapter, bootstrap) {
    const {
      slot,
      mount,
      targetDocument,
      getCtor,
      beforeLoad,
      getPlayer,
      getScrollContainer,
      isActive
    } = adapter;
    if (!mount) return;
    if (!slot.comments) mount.textContent = '评论加载中...';
    try {
      beforeLoad?.();
      await loadScriptOnce(targetDocument, bootstrap.commentScript, getCtor);
      if (!isActive()) return;
      const CommentCtor = getCtor();
      if (!CommentCtor) throw new Error('BiliComments not available after comment script load');
      const scrollContainer = getScrollContainer?.();
      const props = buildCommentProps(bootstrap, scrollContainer);
      if (reloadCommentInstance(slot.comments, props)) {
        applyCommentScrollContainer(slot.comments, scrollContainer);
        return;
      }
      mount.textContent = '';
      slot.comments = mountCommentInstance(CommentCtor, props, mount, targetDocument, scrollContainer);
      slot.comments.addEventListener?.('seek', event => {
        try {
          const {
            time
          } = event.detail || {};
          getPlayer()?.seek?.({
            value: time,
            autoplay: true
          });
        } catch {
          // Ignore seek bridge failures.
        }
      });
    } catch (error) {
      if (!isActive()) return;
      mount.textContent = `评论加载失败：${error?.message || 'unknown'}`;
    }
  }
  function mountCommentInstance(CommentCtor, props, mount, targetDocument, scrollContainer) {
    const instance = new CommentCtor(props);
    if (!scrollContainer) return instance.mount(mount);
    const originalCreateElement = targetDocument.createElement;
    targetDocument.createElement = function createElementWithScrollContainer(name, options) {
      const element = originalCreateElement.call(this, name, options);
      if (String(name).toLowerCase() === 'bili-comments') element.scrollContainer = scrollContainer;
      return element;
    };
    try {
      return instance.mount(mount);
    } finally {
      targetDocument.createElement = originalCreateElement;
      applyCommentScrollContainer(instance, scrollContainer);
    }
  }
  function applyCommentScrollContainer(instance, scrollContainer) {
    if (!instance || !scrollContainer) return;
    const element = instance.el?.current;
    if (element) element.scrollContainer = scrollContainer;
  }
  function buildCommentProps(bootstrap, scrollContainer) {
    const props = {
      params: bootstrap.commentInfo.params,
      disableUpActions: true,
      disableVideoTime: false,
      lazyLoad: true,
      cmFromTrackId: bootstrap.commentInfo.cmFromTrackId,
      spmPrefix: bootstrap.commentInfo.spmPrefix
    };
    if (scrollContainer) props.scrollContainer = scrollContainer;
    return props;
  }
  function reloadCommentInstance(instance, props) {
    if (!instance) return false;
    if (instance.methods?.reload) {
      instance.methods.reload(props);
      return true;
    }
    if (instance.dispatchAction) {
      instance.dispatchAction({
        type: 'reload',
        args: [props],
        callback() {}
      });
      return true;
    }
    return false;
  }
  function disposeCommentInstance(state, kind) {
    const current = state[kind].comments;
    if (!current) return;
    try {
      current.destroy?.();
      current.unmount?.();
    } catch {
      // Ignore comment cleanup failures.
    }
    state[kind].comments = null;
  }

  const LIVE_ROOM_HREF_RE = /^https?:\/\/live\.bilibili\.com\/(?:blanc\/)?(\d+)(?:[/?#]|$)/;
  const LIVE_CARD_LINK_SELECTOR = ['a.bili-dyn-card-live[href*="live.bilibili.com/"]', 'a.user-row[href*="live.bilibili.com/"]', 'a[href*="live.bilibili.com/"]:not([href*="/p/"]):not([href*="/blackboard/"])'].join(',');
  const LIVE_CARD_ROOT_SELECTORS = ['.bili-dyn-card-live', '.bili-dyn-live-users__item', '.bili-dyn-live-users__item-container', '.bili-dyn-content__orig__major.suit-video-card', '.suit-video-card', '.user-row', '.room-card-wrapper', '.room-card', '.live-card', '[class*="live-card"]', '[class*="room-card"]', '[class*="RoomCard"]'];
  function getLiveMetaFromLink(link, baseUrl = location.href) {
    const href = normalizeLiveHref$1(link.getAttribute('href') || link.href, baseUrl);
    const roomId = href.match(LIVE_ROOM_HREF_RE)?.[1];
    if (!roomId) return null;
    return {
      kind: 'live',
      roomId,
      href,
      title: getLiveCardTitle(link) || `Bilibili 直播 ${roomId}`
    };
  }
  function getLiveCardRoot(link) {
    for (const selector of LIVE_CARD_ROOT_SELECTORS) {
      const candidate = link.closest(selector);
      if (candidate) return candidate;
    }
    return link;
  }
  function getPlayableKey(meta) {
    if (meta?.kind === 'live' || meta?.roomId) return meta.roomId ? `live:${meta.roomId}` : '';
    return meta?.bvid || '';
  }
  async function fetchDynamicLivePortalCards() {
    const response = await fetch('https://api.bilibili.com/x/polymer/web-dynamic/v1/portal', {
      credentials: 'include',
      headers: {
        accept: 'application/json, text/plain, */*'
      }
    });
    if (!response.ok) throw new Error(`动态直播列表请求失败：${response.status}`);
    const payload = await response.json();
    if (payload?.code !== 0) throw new Error(payload?.message || `动态直播列表错误：${payload?.code}`);
    return (payload?.data?.live_users?.items || []).map(item => ({
      kind: 'live',
      roomId: item.room_id ? String(item.room_id) : '',
      href: normalizeLiveHref$1(item.jump_url || `https://live.bilibili.com/${item.room_id}`, location.href),
      title: cleanLiveCardTitle(item.title) || item.uname || `Bilibili 直播 ${item.room_id}`,
      subtitle: item.uname || '',
      cover: normalizeImageUrl(item.cover || item.face),
      face: normalizeImageUrl(item.face)
    })).filter(card => card.roomId && card.href);
  }
  function findDynamicLiveUserElement(card, used = new Set(), root = document) {
    const items = [...root.querySelectorAll('.bili-dyn-live-users__item')];
    const title = String(card?.title || '').trim();
    const subtitle = String(card?.subtitle || '').trim();
    const candidates = items.filter(item => {
      if (used.has(item)) return false;
      return true;
    }).map(item => ({
      item,
      title: item.querySelector('.bili-dyn-live-users__item__title')?.textContent?.trim() || '',
      subtitle: item.querySelector('.bili-dyn-live-users__item__uname')?.textContent?.trim() || ''
    }));
    return candidates.find(candidate => {
      return (!title || candidate.title === title) && (!subtitle || candidate.subtitle === subtitle);
    })?.item || candidates.find(candidate => {
      return subtitle && candidate.subtitle === subtitle;
    })?.item || candidates.find(candidate => {
      return title && candidate.title === title;
    })?.item || null;
  }
  function normalizeLiveHref$1(rawHref, baseUrl) {
    try {
      const url = new URL(rawHref, baseUrl);
      const roomId = url.href.match(LIVE_ROOM_HREF_RE)?.[1];
      return roomId ? `https://live.bilibili.com/${roomId}` : '';
    } catch {
      return '';
    }
  }
  function normalizeImageUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
      return new URL(rawUrl, location.href).href;
    } catch {
      return rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;
    }
  }
  function getLiveCardTitle(link) {
    const title = link.querySelector?.(['.bili-dyn-card-live__title', '[class*="dyn-card-live__title"]', '.bili-dyn-live-users__item__title', '.room-title', '[class*="room-title"]', '[class*="title"]'].join(','))?.textContent || link.getAttribute('title') || link.textContent;
    return cleanLiveCardTitle(title);
  }
  function cleanLiveCardTitle(value) {
    return String(value || '').replace(/\s+/g, ' ').replace(/^直播中\s*/u, '').replace(/\s*(?:·\s*)?\d+(?:\.\d+)?万?人(?:看过|气)?\s*$/u, '').trim();
  }

  const COVER_HOST_SELECTOR = ['.bili-dyn-card-video', '.bili-dyn-card-video__cover', '.bili-dyn-card-video__image', '.bili-dyn-card-video__body', '.bili-dyn-card-reserve__cover', '.bili-video-card__image', '.bili-video-card__cover', '.pic-box', '.pic', '.framepreview-box', '.video-awesome-img', '.cover', '.cover-contain', '.history-card__cover', '.bili-history-card__cover', '[class*="cover"]', '[class*="pic"]', '[class*="image"]', '[class*="poster"]', '[class*="thumbnail"]'].join(',');
  const CARD_ROOT_SELECTORS = ['.bili-dyn-card-video', '.bili-dyn-content__orig__major.suit-video-card', '.suit-video-card', '.bili-dyn-card-video__body', '.bili-dyn-card', '.bili-dyn-item', '.bili-dyn-list__item', '.bili-rich-text-module', '.bili-dyn-content', '.bili-video-card', '.feed-card', '.floor-single-card', '.carousel-item', '[class*="carousel-item"]', '.bili-video-card__wrap', '.small-item', '.history-card', '.history-record', '.bili-history-card', '.video-item', '.video-list-item', '.search-card', '.search-item', '.list-item', '.section-item', '.video-card', '.video-page-card-small', '.video-page-operator-card-small', '.card-box', '.recommended-card', '[class*="video-card"]', '[class*="video-page-card"]', '[class*="history"]', '[class*="search"]', '[class*="list-item"]', '[class*="small-item"]', '[class*="feed-card"]', '[class*="dyn-card-video"]', '[class*="bili-dyn-card"]', '[class*="bili-dyn-item"]'];
  const PLAYBACK_VIDEO_LINK_SELECTOR = ['.video-page-card-small a[href*="/video/BV"]', '.video-page-operator-card-small a[href*="/video/BV"]', '.rec-list .video-page-card-small a[href*="/video/BV"]', '.rec-list .video-page-operator-card-small a[href*="/video/BV"]', '.recommend-list .video-page-card-small a[href*="/video/BV"]', '.recommend-list .video-page-operator-card-small a[href*="/video/BV"]'].join(',');
  const DYNAMIC_VIDEO_LINK_SELECTOR = ['a.bili-dyn-card-video[href*="/video/BV"]', '.suit-video-card a[href*="/video/BV"]', '.bili-dyn-content__orig__major a[href*="/video/BV"]', '[class*="dyn-card-video"][href*="/video/BV"]'].join(',');
  function normalizeVideoHref(rawHref, baseUrl = location.href) {
    if (!rawHref) return '';
    try {
      const url = new URL(rawHref, baseUrl);
      if (!url.hostname.endsWith('bilibili.com')) return '';
      return url.href;
    } catch {
      return '';
    }
  }
  function normalizeResourceUrl(rawUrl, baseUrl = location.href) {
    if (!rawUrl) return '';
    try {
      return new URL(rawUrl, baseUrl).href;
    } catch {
      return '';
    }
  }
  function getVideoMetaFromLink(link, baseUrl = location.href) {
    const href = normalizeVideoHref(link.getAttribute('href') || link.href, baseUrl);
    const match = href?.match(BV_RE);
    if (!match) return null;
    const title = getDynamicCardTitle(link) || link.getAttribute('title') || link.getAttribute('aria-label') || link.querySelector('img')?.getAttribute('alt') || link.textContent || 'Bilibili 视频';
    return {
      bvid: match[1],
      href,
      title: cleanVideoTitle(title)
    };
  }
  function getCurrentPageBvid() {
    return location.href.match(BV_RE)?.[1] || '';
  }
  function isPlaybackPage() {
    return /^https?:\/\/www\.bilibili\.com\/video\/BV/.test(location.href);
  }
  function isSpacePage() {
    return /^https?:\/\/space\.bilibili\.com\//.test(location.href);
  }
  function isDynamicPage() {
    return /^https?:\/\/t\.bilibili\.com\//.test(location.href);
  }
  function getCardRoot(link) {
    for (const selector of CARD_ROOT_SELECTORS) {
      const candidate = link.closest(selector);
      if (candidate && countDistinctBvids(candidate) <= 1) return candidate;
    }
    return getFallbackCardRoot(link);
  }
  function isCoverLink(link) {
    return Boolean(link.matches?.(COVER_HOST_SELECTOR) || link.closest?.(COVER_HOST_SELECTOR) || link.querySelector?.('img, picture, video, canvas, svg[class*="play"]') || /cover|pic|image/i.test(String(link.className || '')));
  }
  function getFallbackCardRoot(link) {
    const parent = link.parentElement;
    if (!parent) return link;
    return countDistinctBvids(parent) > 1 ? link : parent;
  }
  function countDistinctBvids(root) {
    return new Set([...(root.querySelectorAll?.('a[href*="/video/BV"]') || [])].map(link => normalizeVideoHref(link.getAttribute('href') || link.href).match(BV_RE)?.[1]).filter(Boolean)).size;
  }
  function cleanVideoTitle(value) {
    const title = String(value).replace(/\s+/g, ' ').trim().replace(/^(?:\d{1,2}:)?\d{1,2}:\d{2}\s+/, '');
    if (!title || title === '不感兴趣') return 'Bilibili 视频';
    return title;
  }
  function getDynamicCardTitle(link) {
    const title = link.querySelector?.('.bili-dyn-card-video__title, [class*="dyn-card-video__title"]')?.textContent;
    return title ? String(title).trim() : '';
  }

  const IS_DEV = false;
  const equalFn = (a, b) => a === b;
  const signalOptions = {
    equals: equalFn
  };
  let runEffects = runQueue;
  const STALE = 1;
  const PENDING = 2;
  const UNOWNED = {
    owned: null,
    cleanups: null,
    context: null,
    owner: null
  };
  var Owner = null;
  let Transition = null;
  let ExternalSourceConfig = null;
  let Listener = null;
  let Updates = null;
  let Effects = null;
  let ExecCount = 0;
  function createRoot(fn, detachedOwner) {
    const listener = Listener,
      owner = Owner,
      unowned = fn.length === 0,
      current = detachedOwner === undefined ? owner : detachedOwner,
      root = unowned ? UNOWNED : {
        owned: null,
        cleanups: null,
        context: current ? current.context : null,
        owner: current
      },
      updateFn = unowned ? fn : () => fn(() => untrack(() => cleanNode(root)));
    Owner = root;
    Listener = null;
    try {
      return runUpdates(updateFn, true);
    } finally {
      Listener = listener;
      Owner = owner;
    }
  }
  function createSignal(value, options) {
    options = options ? Object.assign({}, signalOptions, options) : signalOptions;
    const s = {
      value,
      observers: null,
      observerSlots: null,
      comparator: options.equals || undefined
    };
    const setter = value => {
      if (typeof value === "function") {
        value = value(s.value);
      }
      return writeSignal(s, value);
    };
    return [readSignal.bind(s), setter];
  }
  function createRenderEffect(fn, value, options) {
    const c = createComputation(fn, value, false, STALE);
    updateComputation(c);
  }
  function createEffect(fn, value, options) {
    runEffects = runUserEffects;
    const c = createComputation(fn, value, false, STALE);
    c.user = true;
    Effects ? Effects.push(c) : updateComputation(c);
  }
  function createMemo(fn, value, options) {
    options = options ? Object.assign({}, signalOptions, options) : signalOptions;
    const c = createComputation(fn, value, true, 0);
    c.observers = null;
    c.observerSlots = null;
    c.comparator = options.equals || undefined;
    updateComputation(c);
    return readSignal.bind(c);
  }
  function untrack(fn) {
    if (Listener === null) return fn();
    const listener = Listener;
    Listener = null;
    try {
      if (ExternalSourceConfig) ;
      return fn();
    } finally {
      Listener = listener;
    }
  }
  function onCleanup(fn) {
    if (Owner === null) ;else if (Owner.cleanups === null) Owner.cleanups = [fn];else Owner.cleanups.push(fn);
    return fn;
  }
  const [transPending, setTransPending] = /*@__PURE__*/createSignal(false);
  function readSignal() {
    if (this.sources && (this.state)) {
      if ((this.state) === STALE) updateComputation(this);else {
        const updates = Updates;
        Updates = null;
        runUpdates(() => lookUpstream(this), false);
        Updates = updates;
      }
    }
    if (Listener) {
      const observers = this.observers;
      if (!observers || observers[observers.length - 1] !== Listener) {
        const sSlot = observers ? observers.length : 0;
        if (!Listener.sources) {
          Listener.sources = [this];
          Listener.sourceSlots = [sSlot];
        } else {
          Listener.sources.push(this);
          Listener.sourceSlots.push(sSlot);
        }
        if (!observers) {
          this.observers = [Listener];
          this.observerSlots = [Listener.sources.length - 1];
        } else {
          observers.push(Listener);
          this.observerSlots.push(Listener.sources.length - 1);
        }
      }
    }
    return this.value;
  }
  function writeSignal(node, value, isComp) {
    let current = node.value;
    if (!node.comparator || !node.comparator(current, value)) {
      node.value = value;
      if (node.observers && node.observers.length) {
        runUpdates(() => {
          for (let i = 0; i < node.observers.length; i += 1) {
            const o = node.observers[i];
            const TransitionRunning = Transition && Transition.running;
            if (TransitionRunning && Transition.disposed.has(o)) ;
            if (TransitionRunning ? !o.tState : !o.state) {
              if (o.pure) Updates.push(o);else Effects.push(o);
              if (o.observers) markDownstream(o);
            }
            if (!TransitionRunning) o.state = STALE;
          }
          if (Updates.length > 10e5) {
            Updates = [];
            if (IS_DEV) ;
            throw new Error();
          }
        }, false);
      }
    }
    return value;
  }
  function updateComputation(node) {
    if (!node.fn) return;
    cleanNode(node);
    const time = ExecCount;
    runComputation(node, node.value, time);
  }
  function runComputation(node, value, time) {
    let nextValue;
    const owner = Owner,
      listener = Listener;
    Listener = Owner = node;
    try {
      nextValue = node.fn(value);
    } catch (err) {
      if (node.pure) {
        {
          node.state = STALE;
          node.owned && node.owned.forEach(cleanNode);
          node.owned = null;
        }
      }
      node.updatedAt = time + 1;
      return handleError(err);
    } finally {
      Listener = listener;
      Owner = owner;
    }
    if (!node.updatedAt || node.updatedAt <= time) {
      if (node.updatedAt != null && "observers" in node) {
        writeSignal(node, nextValue);
      } else node.value = nextValue;
      node.updatedAt = time;
    }
  }
  function createComputation(fn, init, pure, state = STALE, options) {
    const c = {
      fn,
      state: state,
      updatedAt: null,
      owned: null,
      sources: null,
      sourceSlots: null,
      cleanups: null,
      value: init,
      owner: Owner,
      context: Owner ? Owner.context : null,
      pure
    };
    if (Owner === null) ;else if (Owner !== UNOWNED) {
      {
        if (!Owner.owned) Owner.owned = [c];else Owner.owned.push(c);
      }
    }
    return c;
  }
  function runTop(node) {
    if ((node.state) === 0) return;
    if ((node.state) === PENDING) return lookUpstream(node);
    if (node.suspense && untrack(node.suspense.inFallback)) return node.suspense.effects.push(node);
    const ancestors = [node];
    while ((node = node.owner) && (!node.updatedAt || node.updatedAt < ExecCount)) {
      if (node.state) ancestors.push(node);
    }
    for (let i = ancestors.length - 1; i >= 0; i--) {
      node = ancestors[i];
      if ((node.state) === STALE) {
        updateComputation(node);
      } else if ((node.state) === PENDING) {
        const updates = Updates;
        Updates = null;
        runUpdates(() => lookUpstream(node, ancestors[0]), false);
        Updates = updates;
      }
    }
  }
  function runUpdates(fn, init) {
    if (Updates) return fn();
    let wait = false;
    if (!init) Updates = [];
    if (Effects) wait = true;else Effects = [];
    ExecCount++;
    try {
      const res = fn();
      completeUpdates(wait);
      return res;
    } catch (err) {
      if (!wait) Effects = null;
      Updates = null;
      handleError(err);
    }
  }
  function completeUpdates(wait) {
    if (Updates) {
      runQueue(Updates);
      Updates = null;
    }
    if (wait) return;
    const e = Effects;
    Effects = null;
    if (e.length) runUpdates(() => runEffects(e), false);
  }
  function runQueue(queue) {
    for (let i = 0; i < queue.length; i++) runTop(queue[i]);
  }
  function runUserEffects(queue) {
    let i,
      userLength = 0;
    for (i = 0; i < queue.length; i++) {
      const e = queue[i];
      if (!e.user) runTop(e);else queue[userLength++] = e;
    }
    for (i = 0; i < userLength; i++) runTop(queue[i]);
  }
  function lookUpstream(node, ignore) {
    node.state = 0;
    for (let i = 0; i < node.sources.length; i += 1) {
      const source = node.sources[i];
      if (source.sources) {
        const state = source.state;
        if (state === STALE) {
          if (source !== ignore && (!source.updatedAt || source.updatedAt < ExecCount)) runTop(source);
        } else if (state === PENDING) lookUpstream(source, ignore);
      }
    }
  }
  function markDownstream(node) {
    for (let i = 0; i < node.observers.length; i += 1) {
      const o = node.observers[i];
      if (!o.state) {
        o.state = PENDING;
        if (o.pure) Updates.push(o);else Effects.push(o);
        o.observers && markDownstream(o);
      }
    }
  }
  function cleanNode(node) {
    let i;
    if (node.sources) {
      while (node.sources.length) {
        const source = node.sources.pop(),
          index = node.sourceSlots.pop(),
          obs = source.observers;
        if (obs && obs.length) {
          const n = obs.pop(),
            s = source.observerSlots.pop();
          if (index < obs.length) {
            n.sourceSlots[s] = index;
            obs[index] = n;
            source.observerSlots[index] = s;
          }
        }
      }
    }
    if (node.tOwned) {
      for (i = node.tOwned.length - 1; i >= 0; i--) cleanNode(node.tOwned[i]);
      delete node.tOwned;
    }
    if (node.owned) {
      for (i = node.owned.length - 1; i >= 0; i--) cleanNode(node.owned[i]);
      node.owned = null;
    }
    if (node.cleanups) {
      for (i = node.cleanups.length - 1; i >= 0; i--) node.cleanups[i]();
      node.cleanups = null;
    }
    node.state = 0;
  }
  function castError(err) {
    if (err instanceof Error) return err;
    return new Error(typeof err === "string" ? err : "Unknown error", {
      cause: err
    });
  }
  function handleError(err, owner = Owner) {
    const error = castError(err);
    throw error;
  }
  function createComponent(Comp, props) {
    return untrack(() => Comp(props || {}));
  }

  const TAB_KEYS = ['comments', 'pages', 'playlist', 'live', 'recommend'];
  const PLAYING_ICON_URL = 'https://i0.hdslb.com/bfs/static/jinkela/playlist-video/asserts/playing.gif';
  function createCommentsTabsUi({
    state,
    getHomeRenderer,
    getPipRenderer,
    getCommentLayout,
    onTabChange,
    onListChange,
    openWithRenderer,
    syncHomeSize,
    schedulePipLayoutSync
  }) {
    const activeSignals = new Map();
    const selectedPageSignals = new Map();
    const selectedLiveSignals = new Map();
    const selectedSignals = new Map();
    const listViews = new Map();
    const [lastPlayedKey, setLastPlayedKey] = createSignal(getLastPlayedKey());
    function createTabs(targetDocument, kind) {
      const tabs = targetDocument.createElement('div');
      tabs.className = `${APP}__comments-tabs`;
      tabs.setAttribute('role', 'tablist');
      tabs.setAttribute('aria-label', '评论区内容');
      tabs.append(createTab(targetDocument, kind, 'comments', '评论'), createTab(targetDocument, kind, 'pages', '合集'), createTab(targetDocument, kind, 'playlist', '播放列表'), createTab(targetDocument, kind, 'live', '直播列表'), createTab(targetDocument, kind, 'recommend', '相关推荐'));
      const [, setActive] = getActiveSignal(kind);
      setActive(state[kind].activeCommentsTab || 'comments');
      tabs.__biliPopupPlayerNanoDisposeSolidTabs?.();
      tabs.__biliPopupPlayerNanoDisposeSolidTabs = createRoot(dispose => {
        createEffect(() => {
          syncTabButtons(tabs, getActiveSignal(kind)[0]());
        });
        return dispose;
      });
      return tabs;
    }
    function createTab(targetDocument, kind, tab, label) {
      const button = targetDocument.createElement('button');
      button.type = 'button';
      button.id = kind === 'home' ? `${APP}-tab-${tab}` : `tab-${tab}`;
      button.className = `${APP}__comments-tab`;
      button.dataset.tab = tab;
      button.__biliPopupPlayerNanoTabsBound = true;
      button.setAttribute('role', 'tab');
      button.textContent = label;
      button.addEventListener('click', () => setTab(kind, tab, {
        forceLocate: true
      }));
      if (tab === 'pages') button.hidden = !state[kind].pageCards?.length;
      if (tab === 'live') button.hidden = !state[kind].liveListMode;
      return button;
    }
    function setTab(kind, tab, {
      forceLocate = false
    } = {}) {
      const previousTab = state[kind].activeCommentsTab;
      state[kind].activeCommentsTab = TAB_KEYS.includes(tab) ? tab : 'comments';
      getActiveSignal(kind)[1](state[kind].activeCommentsTab);
      syncTabs(kind);
      if (state[kind].activeCommentsTab === 'playlist') scrollSelectedPlaylistIntoView(kind, {
        force: forceLocate && previousTab === state[kind].activeCommentsTab
      });
      if (state[kind].activeCommentsTab === 'live') scrollSelectedLiveIntoView(kind, {
        force: forceLocate && previousTab === state[kind].activeCommentsTab
      });
      if (state[kind].activeCommentsTab === 'pages') scrollSelectedPageIntoView(kind, {
        force: forceLocate && previousTab === state[kind].activeCommentsTab
      });
      onTabChange?.(kind, state[kind].activeCommentsTab);
      if (kind === 'home') syncHomeSize();else if (state.pip.win && !state.pip.win.closed) schedulePipLayoutSync(state.pip.win);
    }
    function syncTabs(kind) {
      const ui = getUi(kind);
      if (!ui) return;
      const activeTab = TAB_KEYS.includes(state[kind].activeCommentsTab) ? state[kind].activeCommentsTab : 'comments';
      getActiveSignal(kind)[1](activeTab);
      syncTabButtonSet([ui.commentsTab, ui.pagesTab, ui.playlistTab, ui.liveTab, ui.recommendTab], activeTab);
      ui.commentsPanel.hidden = activeTab !== 'comments';
      ui.pagesPanel.hidden = activeTab !== 'pages';
      ui.playlistPanel.hidden = activeTab !== 'playlist';
      ui.livePanel.hidden = activeTab !== 'live';
      ui.recommendPanel.hidden = activeTab !== 'recommend';
    }
    function syncTabButtons(tabs, activeTab) {
      syncTabButtonSet(tabs.querySelectorAll?.(`.${APP}__comments-tab`) || [], activeTab);
    }
    function syncTabButtonSet(buttons, activeTab) {
      buttons.forEach?.(button => {
        if (!button) return;
        const active = button.dataset.tab === activeTab;
        button.classList.toggle(`${APP}--active`, active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
      });
    }
    function getUi(kind) {
      if (kind === 'home') {
        const ui = state.home.ui;
        if (!ui?.commentsPanel || !ui.playlistPanel || !ui.livePanel || !ui.recommendPanel) return null;
        return {
          commentsTab: ui.commentsTabs?.querySelector?.('[data-tab="comments"]'),
          pagesTab: ui.commentsTabs?.querySelector?.('[data-tab="pages"]'),
          playlistTab: ui.commentsTabs?.querySelector?.('[data-tab="playlist"]'),
          liveTab: ui.commentsTabs?.querySelector?.('[data-tab="live"]'),
          recommendTab: ui.commentsTabs?.querySelector?.('[data-tab="recommend"]'),
          commentsPanel: ui.commentsPanel,
          pagesPanel: ui.pagesPanel,
          pagesList: ui.pagesList,
          pagesEmpty: ui.pagesEmpty,
          playlistPanel: ui.playlistPanel,
          playlistList: ui.playlistList,
          playlistEmpty: ui.playlistEmpty,
          livePanel: ui.livePanel,
          liveList: ui.liveList,
          liveEmpty: ui.liveEmpty,
          recommendPanel: ui.recommendPanel,
          recommendList: ui.recommendList,
          recommendEmpty: ui.recommendEmpty
        };
      }
      const doc = state.pip.win && !state.pip.win.closed ? state.pip.win.document : null;
      if (!doc) return null;
      const commentsPanel = doc.getElementById('comments-panel');
      const pagesPanel = doc.getElementById('pages-panel');
      const playlistPanel = doc.getElementById('playlist-panel');
      const livePanel = doc.getElementById('live-panel');
      const recommendPanel = doc.getElementById('recommend-panel');
      if (!commentsPanel || !pagesPanel || !playlistPanel || !livePanel || !recommendPanel) return null;
      return {
        commentsTab: doc.getElementById('tab-comments'),
        pagesTab: doc.getElementById('tab-pages'),
        playlistTab: doc.getElementById('tab-playlist'),
        liveTab: doc.getElementById('tab-live'),
        recommendTab: doc.getElementById('tab-recommend'),
        commentsPanel,
        pagesPanel,
        pagesList: doc.getElementById('pages-list'),
        pagesEmpty: doc.getElementById('pages-empty'),
        playlistPanel,
        playlistList: doc.getElementById('playlist-list'),
        playlistEmpty: doc.getElementById('playlist-empty'),
        livePanel,
        liveList: doc.getElementById('live-list'),
        liveEmpty: doc.getElementById('live-empty'),
        recommendPanel,
        recommendList: doc.getElementById('recommend-list'),
        recommendEmpty: doc.getElementById('recommend-empty')
      };
    }
    function capturePagePlaylist(kind, selectedBvid, options = {}) {
      state[kind].playlistCards = getScannedPlaylistCards().filter(card => (card.kind || 'video') === 'video' && (!options.kind || (card.kind || 'video') === options.kind));
      setSelectedPlaylistBvid(kind, selectedBvid);
      renderPlaylist(kind);
    }
    function capturePageLiveList(kind, selectedKey) {
      state[kind].liveCards = getScannedLiveCards();
      setSelectedLiveKey(kind, selectedKey);
      renderLiveList(kind);
    }
    function renderPageParts(kind, bootstrap, statusText = '合集加载中...') {
      const cards = bootstrap ? getPagePartCards(bootstrap) : [];
      state[kind].pageCards = cards;
      setSelectedPageKey(kind, bootstrap ? getSelectedPageKey(bootstrap) : '');
      syncPageTabVisibility(kind, Boolean(cards.length));
      const ui = getUi(kind);
      if (!ui?.pagesList || !ui.pagesEmpty) return;
      renderCardList({
        list: ui.pagesList,
        empty: ui.pagesEmpty,
        cards,
        emptyText: bootstrap ? '当前视频没有合集' : statusText,
        kind,
        source: 'pages',
        loading: !bootstrap
      });
      onListChange?.(kind, 'pages');
    }
    function syncPageTabVisibility(kind, visible) {
      const ui = getUi(kind);
      if (!ui?.pagesTab) return;
      ui.pagesTab.hidden = !visible;
      if (!visible && state[kind].activeCommentsTab === 'pages') setTab(kind, 'comments');
    }
    function syncLiveTabVisibility(kind, visible) {
      const ui = getUi(kind);
      if (!ui?.liveTab) return;
      ui.liveTab.hidden = !visible;
      if (!visible && state[kind].activeCommentsTab === 'live') setTab(kind, 'comments');
    }
    function setSelectedPlaylistBvid(kind, bvid) {
      state[kind].selectedPlaylistBvid = bvid || '';
      getSelectedSignal(kind)[1](state[kind].selectedPlaylistBvid);
      scrollSelectedPlaylistIntoView(kind);
    }
    function setSelectedLiveKey(kind, key) {
      state[kind].selectedLiveKey = key || '';
      getSelectedLiveSignal(kind)[1](state[kind].selectedLiveKey);
      scrollSelectedLiveIntoView(kind);
    }
    function setSelectedPageKey(kind, key) {
      state[kind].selectedPageKey = key || '';
      getSelectedPageSignal(kind)[1](state[kind].selectedPageKey);
      scrollSelectedPageIntoView(kind);
    }
    function getScannedPlaylistCards() {
      const seen = new Set();
      return state.cardEntries.filter(entry => entry.card?.isConnected && entry.link?.isConnected).map(entry => getPlaylistCardFromEntry(entry)).filter(card => {
        const key = getPlayableKey(card);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    function getScannedLiveCards() {
      const seen = new Set();
      return state.cardEntries.filter(entry => entry.card?.isConnected && entry.link?.isConnected).map(entry => getPlaylistCardFromEntry(entry)).filter(card => {
        const key = getPlayableKey(card);
        if ((card?.kind || 'video') !== 'live' || !key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    function getPlaylistCardFromEntry(entry) {
      const meta = entry.meta || getVideoMetaFromLink(entry.link);
      if (!meta) return null;
      const root = entry.card || entry.link;
      return {
        ...meta,
        title: getEntryCardTitle(root, entry.link, meta.title),
        cover: getEntryCardCover(root, entry.link) || meta.cover || meta.face || '',
        subtitle: getEntryCardSubtitle(root) || meta.subtitle || '',
        duration: getEntryCardDuration(root),
        stats: getEntryCardStats(root)
      };
    }
    function renderPlaylist(kind, statusText = '当前页面没有扫到可播放卡片', options = {}) {
      if (typeof statusText === 'object') {
        options = statusText;
        statusText = '当前页面没有扫到可播放卡片';
      }
      const ui = getUi(kind);
      if (!ui?.playlistList || !ui.playlistEmpty) return;
      renderCardList({
        list: ui.playlistList,
        empty: ui.playlistEmpty,
        cards: state[kind].playlistCards,
        emptyText: statusText,
        kind,
        source: 'playlist',
        ...options
      });
      onListChange?.(kind, 'playlist');
    }
    function renderLiveList(kind, statusText = '当前页面没有扫到直播卡片', options = {}) {
      if (typeof statusText === 'object') {
        options = statusText;
        statusText = '当前页面没有扫到直播卡片';
      }
      syncLiveTabVisibility(kind, Boolean(state[kind].liveListMode));
      const ui = getUi(kind);
      if (!ui?.liveList || !ui.liveEmpty) return;
      renderCardList({
        list: ui.liveList,
        empty: ui.liveEmpty,
        cards: state[kind].liveCards,
        emptyText: statusText,
        kind,
        source: 'live',
        ...options
      });
      onListChange?.(kind, 'live');
    }
    function renderRecommendations(kind, bootstrap, statusText = '相关推荐加载中...') {
      if (bootstrap) state[kind].recommendationCards = bootstrap.recommendationCards || bootstrap.playlistCards || [];else state[kind].recommendationCards = [];
      const ui = getUi(kind);
      if (!ui?.recommendList || !ui.recommendEmpty) return;
      renderCardList({
        list: ui.recommendList,
        empty: ui.recommendEmpty,
        cards: state[kind].recommendationCards,
        emptyText: bootstrap ? '没有扫到可播放的推荐卡片' : statusText,
        kind,
        source: 'recommend',
        loading: !bootstrap
      });
      onListChange?.(kind, 'recommend');
    }
    function renderCardList({
      list,
      empty,
      cards,
      emptyText,
      kind,
      source,
      loading = false,
      appendLoading = false,
      autoScrollSelected = true
    }) {
      const view = ensureListView({
        list,
        empty,
        kind,
        source
      });
      view.setAutoScrollSelected(Boolean(autoScrollSelected));
      view.setAppendLoading(Boolean(appendLoading));
      view.setLoading(Boolean(loading));
      view.setEmptyText(emptyText);
      view.setCards(cards || []);
    }
    function ensureListView({
      list,
      empty,
      kind,
      source
    }) {
      const key = `${kind}:${source}`;
      const current = listViews.get(key);
      if (current?.list === list && current.empty === empty) return current;
      current?.dispose?.();
      list.textContent = '';
      const [cards, setCards] = createSignal([]);
      const [emptyText, setEmptyText] = createSignal('');
      const [loading, setLoading] = createSignal(false);
      const [appendLoading, setAppendLoading] = createSignal(false);
      const [autoScrollSelected, setAutoScrollSelected] = createSignal(true);
      const dispose = createRoot(disposeRoot => {
        createEffect(() => {
          const currentCards = cards();
          const currentLoading = loading();
          const currentAppendLoading = appendLoading();
          const selected = source === 'playlist' ? getSelectedSignal(kind)[0]() : source === 'live' ? getSelectedLiveSignal(kind)[0]() : source === 'recommend' ? getSelectedSignal(kind)[0]() : source === 'pages' ? getSelectedPageSignal(kind)[0]() : '';
          const lastPlayed = lastPlayedKey();
          list.textContent = '';
          empty.hidden = Boolean(currentLoading || currentAppendLoading || currentCards.length);
          empty.textContent = currentLoading || currentAppendLoading || currentCards.length ? '' : emptyText();
          if (currentLoading) {
            appendSkeletonCards(list.ownerDocument, list, 6);
            return;
          }
          currentCards.forEach(card => {
            list.appendChild(createCardButton(list.ownerDocument, kind, card, source, selected, lastPlayed));
          });
          if (currentAppendLoading) appendSkeletonCards(list.ownerDocument, list, 3);
          if (source === 'playlist' && autoScrollSelected()) scrollSelectedPlaylistIntoView(kind);
          if (source === 'live' && autoScrollSelected()) scrollSelectedLiveIntoView(kind);
          if (source === 'pages' && autoScrollSelected()) scrollSelectedPageIntoView(kind);
        });
        return disposeRoot;
      });
      const view = {
        dispose,
        empty,
        list,
        setAppendLoading,
        setAutoScrollSelected,
        setCards,
        setEmptyText,
        setLoading
      };
      listViews.set(key, view);
      return view;
    }
    function appendSkeletonCards(targetDocument, list, count) {
      for (let index = 0; index < count; index += 1) {
        list.appendChild(createSkeletonCard(targetDocument, index));
      }
    }
    function createSkeletonCard(targetDocument, index) {
      const card = targetDocument.createElement('div');
      card.className = `${APP}__playlist-card ${APP}__playlist-card--skeleton`;
      card.setAttribute('aria-hidden', 'true');
      const cover = targetDocument.createElement('div');
      cover.className = `${APP}__playlist-skeleton-cover`;
      const info = targetDocument.createElement('div');
      info.className = `${APP}__playlist-skeleton-info`;
      [92, index % 2 ? 64 : 78, index % 3 ? 46 : 58].forEach((width, lineIndex) => {
        const line = targetDocument.createElement('span');
        line.className = `${APP}__playlist-skeleton-line`;
        line.style.width = `${width}%`;
        if (lineIndex === 0) line.classList.add(`${APP}__playlist-skeleton-line--title`);
        info.appendChild(line);
      });
      card.append(cover, info);
      return card;
    }
    function createCardButton(targetDocument, kind, card, source = 'playlist', selectedBvid = '', lastPlayedBvid = '') {
      const cardKey = source === 'pages' ? card.pageKey : getPlayableKey(card);
      const selected = source === 'playlist' || source === 'live' || source === 'recommend' ? selectedBvid === cardKey : source === 'pages' && selectedBvid === card.pageKey;
      const isLastPlayed = source === 'playlist' && !selected && lastPlayedBvid && lastPlayedBvid === cardKey;
      const button = targetDocument.createElement('div');
      button.className = `${APP}__playlist-card`;
      button.dataset.bvid = card.bvid || '';
      button.dataset.roomId = card.roomId || '';
      button.dataset.key = cardKey || '';
      button.dataset.pageKey = card.pageKey || '';
      button.dataset.source = source;
      button.tabIndex = 0;
      button.setAttribute('role', 'button');
      button.title = card.title;
      button.setAttribute('aria-label', `播放：${card.title}`);
      if (selected) {
        button.classList.add(`${APP}--selected`);
        button.setAttribute('aria-current', 'true');
      }
      button.addEventListener('click', () => {
        state.lastButton = null;
        if (source === 'playlist') setSelectedPlaylistBvid(kind, cardKey);
        if (source === 'live') setSelectedLiveKey(kind, cardKey);
        if (source === 'pages') setSelectedPageKey(kind, card.pageKey);
        const renderer = kind === 'pip' ? getPipRenderer() : getHomeRenderer();
        openWithRenderer(renderer, source === 'playlist' ? {
          ...card,
          fromPlaylist: true
        } : source === 'live' ? {
          ...card,
          fromLiveList: true
        } : source === 'pages' ? {
          ...card,
          fromPagePart: true
        } : card);
      });
      button.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        button.click();
      });
      const cover = targetDocument.createElement('div');
      cover.className = `${APP}__playlist-cover`;
      if (card.cover) {
        const img = targetDocument.createElement('img');
        img.src = card.cover;
        img.alt = '';
        img.loading = 'lazy';
        cover.appendChild(img);
      }
      if (card.duration) {
        const duration = targetDocument.createElement('span');
        duration.className = `${APP}__playlist-duration`;
        duration.textContent = card.duration;
        cover.appendChild(duration);
      }
      const info = targetDocument.createElement('div');
      info.className = `${APP}__playlist-info`;
      const title = targetDocument.createElement('div');
      title.className = `${APP}__playlist-title`;
      const titleText = targetDocument.createElement('span');
      titleText.className = `${APP}__playlist-title-text`;
      if (selected) {
        const playing = targetDocument.createElement('img');
        playing.className = `${APP}__playlist-playing`;
        playing.src = PLAYING_ICON_URL;
        playing.alt = '';
        playing.loading = 'lazy';
        titleText.appendChild(playing);
      }
      titleText.appendChild(targetDocument.createTextNode(card.title || 'Bilibili 视频'));
      title.appendChild(titleText);
      if (isLastPlayed) {
        const lastPlayed = targetDocument.createElement('span');
        lastPlayed.className = `${APP}__playlist-last-played`;
        lastPlayed.textContent = '上次播放';
        title.appendChild(lastPlayed);
      }
      info.appendChild(title);
      if (card.subtitle) {
        const subtitle = targetDocument.createElement('div');
        subtitle.className = `${APP}__playlist-subtitle`;
        subtitle.textContent = card.subtitle;
        info.appendChild(subtitle);
      }
      if (card.stats) {
        const stats = targetDocument.createElement('div');
        stats.className = `${APP}__playlist-stats`;
        appendStats(targetDocument, stats, card.stats);
        info.appendChild(stats);
      }
      button.append(cover, info);
      return button;
    }
    function attachPipTabs(targetWindow) {
      if (!targetWindow || targetWindow.closed) return;
      const doc = targetWindow.document;
      const tabs = [...(doc?.querySelectorAll?.(`.${APP}__comments-tab`) || [])];
      if (!tabs.length || tabs[0].__biliPopupPlayerNanoTabsBound) return;
      tabs.forEach(tab => {
        tab.__biliPopupPlayerNanoTabsBound = true;
        tab.addEventListener('click', () => setTab('pip', tab.dataset.tab, {
          forceLocate: true
        }));
      });
      syncTabs('pip');
    }
    function getActiveSignal(kind) {
      let signal = activeSignals.get(kind);
      if (!signal) {
        signal = createSignal(state[kind].activeCommentsTab || 'comments');
        activeSignals.set(kind, signal);
      }
      return signal;
    }
    function getSelectedSignal(kind) {
      let signal = selectedSignals.get(kind);
      if (!signal) {
        signal = createSignal(state[kind].selectedPlaylistBvid || '');
        selectedSignals.set(kind, signal);
      }
      return signal;
    }
    function getSelectedPageSignal(kind) {
      let signal = selectedPageSignals.get(kind);
      if (!signal) {
        signal = createSignal(state[kind].selectedPageKey || '');
        selectedPageSignals.set(kind, signal);
      }
      return signal;
    }
    function getSelectedLiveSignal(kind) {
      let signal = selectedLiveSignals.get(kind);
      if (!signal) {
        signal = createSignal(state[kind].selectedLiveKey || '');
        selectedLiveSignals.set(kind, signal);
      }
      return signal;
    }
    function getLastPlayedKey() {
      if (state.playlistLastPlayed?.kind === 'video' && state.playlistLastPlayed?.bvid) return state.playlistLastPlayed.bvid;
      return state.lastPlayed?.kind === 'video' && state.lastPlayed?.bvid ? state.lastPlayed.bvid : '';
    }
    function syncLastPlayed() {
      setLastPlayedKey(getLastPlayedKey());
    }
    function scrollSelectedPlaylistIntoView(kind, {
      force = false
    } = {}) {
      if (!force && getCommentLayout?.() !== 'right') return;
      const bvid = state[kind].selectedPlaylistBvid;
      if (!bvid) return;
      const ui = getUi(kind);
      const list = ui?.playlistList;
      if (!list || ui.playlistPanel?.hidden) return;
      const item = [...(list.querySelectorAll?.(`.${APP}__playlist-card`) || [])].find(card => card.dataset.bvid === bvid);
      scrollItemWithinPanel(ui.playlistPanel, item);
    }
    function scrollSelectedLiveIntoView(kind, {
      force = false
    } = {}) {
      if (!force && getCommentLayout?.() !== 'right') return;
      const key = state[kind].selectedLiveKey;
      if (!key) return;
      const ui = getUi(kind);
      const list = ui?.liveList;
      if (!list || ui.livePanel?.hidden) return;
      const item = [...(list.querySelectorAll?.(`.${APP}__playlist-card`) || [])].find(card => card.dataset.key === key);
      scrollItemWithinPanel(ui.livePanel, item);
    }
    function scrollSelectedPageIntoView(kind, {
      force = false
    } = {}) {
      if (!force && getCommentLayout?.() !== 'right') return;
      const pageKey = state[kind].selectedPageKey;
      if (!pageKey) return;
      const ui = getUi(kind);
      const list = ui?.pagesList;
      if (!list || ui.pagesPanel?.hidden) return;
      const item = [...(list.querySelectorAll?.(`.${APP}__playlist-card`) || [])].find(card => card.dataset.pageKey === pageKey);
      scrollItemWithinPanel(ui.pagesPanel, item);
    }
    function scrollItemWithinPanel(panel, item) {
      if (!panel || !item) return;
      const panelRect = panel.getBoundingClientRect?.();
      const itemRect = item.getBoundingClientRect?.();
      if (!panelRect || !itemRect) return;
      const targetTop = panel.scrollTop + (itemRect.top - panelRect.top) - Math.max(0, (panel.clientHeight - itemRect.height) / 2);
      const maxTop = Math.max(0, panel.scrollHeight - panel.clientHeight);
      const top = Math.min(maxTop, Math.max(0, targetTop));
      panel.scrollTo?.({
        top,
        behavior: 'smooth'
      });
    }
    return {
      attachPipTabs,
      capturePageLiveList,
      capturePagePlaylist,
      createTabs,
      renderLiveList,
      renderPageParts,
      renderPlaylist,
      renderRecommendations,
      scrollSelectedLiveIntoView,
      scrollSelectedPlaylistIntoView,
      setSelectedLiveKey,
      setSelectedPageKey,
      setSelectedPlaylistBvid,
      syncLastPlayed,
      syncTabs
    };
  }
  function getPagePartCards(bootstrap) {
    const vd = bootstrap?.initialState?.videoData || {};
    const bvid = bootstrap?.playerInfo?.bvid || vd.bvid;
    const href = bootstrap?.href || (bvid ? `https://www.bilibili.com/video/${bvid}` : '');
    const pageCards = (Array.isArray(vd.pages) ? vd.pages : []).map((page, index) => buildPagePartCard({
      bvid,
      href,
      index,
      page,
      title: vd.title,
      cover: vd.pic
    })).filter(Boolean);
    if (pageCards.length > 1) return pageCards;
    const episodes = getSeasonEpisodes(bootstrap);
    if (episodes.length <= 1) return [];
    return episodes.map((episode, index) => buildSeasonEpisodeCard({
      episode,
      fallbackBvid: bvid,
      fallbackHref: href,
      index
    })).filter(Boolean);
  }
  function buildPagePartCard({
    bvid,
    href,
    index,
    page,
    title,
    cover
  }) {
    if (!bvid || !page?.cid) return null;
    const pageNo = Number(page.page || index + 1);
    const pageHref = setVideoPageParam(href || `/video/${bvid}`, pageNo);
    return {
      bvid,
      cid: page.cid,
      cover: normalizeResourceUrl(page.first_frame || cover),
      duration: formatDuration$2(page.duration),
      href: pageHref,
      page: pageNo,
      pageKey: `${bvid}:${pageNo}`,
      subtitle: title || '',
      title: `${pageNo}. ${cleanText$1(page.part) || '未命名片段'}`
    };
  }
  function buildSeasonEpisodeCard({
    episode,
    fallbackBvid,
    fallbackHref,
    index
  }) {
    const bvid = episode?.bvid || fallbackBvid;
    const pageNo = Number(episode?.p || index + 1);
    const href = normalizeVideoHref(episode?.link || episode?.uri || `/video/${bvid}`, fallbackHref) || setVideoPageParam(`/video/${bvid}`, pageNo);
    if (!bvid || !href) return null;
    return {
      bvid,
      cid: episode.cid || episode.page?.cid,
      cover: normalizeResourceUrl(episode.arc?.pic || episode.cover),
      duration: formatDuration$2(episode.duration || episode.page?.duration || episode.arc?.duration),
      href,
      page: pageNo,
      pageKey: `${bvid}:${pageNo}`,
      subtitle: episode.arc?.title || '',
      stats: episode.arc?.stat,
      title: `${pageNo}. ${cleanText$1(episode.title || episode.part || episode.page?.part) || '未命名片段'}`
    };
  }
  function getSeasonEpisodes(bootstrap) {
    const vd = bootstrap?.initialState?.videoData || {};
    const candidates = [vd.ugc_season, bootstrap?.initialState?.sectionsInfo, bootstrap?.initialState?.ugcSeason];
    for (const season of candidates) {
      const episodes = extractSeasonEpisodes(season);
      if (episodes.length > 1) return episodes;
    }
    return [];
  }
  function extractSeasonEpisodes(season) {
    if (!season) return [];
    if (Array.isArray(season.episodes)) return season.episodes;
    return (Array.isArray(season.sections) ? season.sections : []).flatMap(section => Array.isArray(section?.episodes) ? section.episodes : []);
  }
  function getSelectedPageKey(bootstrap) {
    const info = bootstrap?.playerInfo;
    if (!info?.bvid) return '';
    return `${info.bvid}:${Number(info.p || 1)}`;
  }
  function setVideoPageParam(rawHref, page) {
    try {
      const url = new URL(rawHref, location.href);
      url.searchParams.set('p', String(page));
      return normalizeVideoHref(url.href) || url.href;
    } catch {
      return '';
    }
  }
  function appendStats(targetDocument, container, stats) {
    const values = normalizeStats(stats);
    if (!values.view && !values.danmaku) {
      container.textContent = typeof stats === 'object' ? '' : cleanText$1(stats);
      return;
    }
    if (values.view) container.appendChild(createStatItem(targetDocument, 'view', values.view, '播放'));
    if (values.danmaku) container.appendChild(createStatItem(targetDocument, 'danmaku', values.danmaku, '弹幕'));
  }
  function createStatItem(targetDocument, type, value, label) {
    const item = targetDocument.createElement('span');
    item.className = `${APP}__playlist-stat ${APP}__playlist-stat--${type}`;
    item.title = `${label}：${value}`;
    item.append(createStatIcon(targetDocument, type), targetDocument.createTextNode(value));
    return item;
  }
  function createStatIcon(targetDocument, type) {
    const markup = type === 'danmaku' ? danmakuIconMarkup() : viewIconMarkup();
    const paths = [...markup.matchAll(/<path\s+d="([^"]+)"\s+fill="([^"]+)"><\/path>/g)];
    if (!paths.length) {
      const fallback = targetDocument.createElement('span');
      fallback.className = `${APP}__playlist-stat-icon`;
      fallback.setAttribute('aria-hidden', 'true');
      return fallback;
    }
    const svg = targetDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add(`${APP}__playlist-stat-icon`);
    paths.forEach(([, d, fill]) => {
      const path = targetDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', fill);
      svg.appendChild(path);
    });
    return svg;
  }
  function normalizeStats(stats) {
    if (!stats) return {
      view: '',
      danmaku: ''
    };
    if (typeof stats === 'object') {
      return {
        view: cleanText$1(stats.view),
        danmaku: cleanText$1(stats.danmaku)
      };
    }
    const parts = cleanText$1(stats).split(/\s+/).filter(Boolean);
    return {
      view: parts[0] || '',
      danmaku: parts[1] || ''
    };
  }
  function formatDuration$2(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return '';
    const total = Math.round(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor(total % 3600 / 60);
    const s = total % 60;
    if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  function viewIconMarkup() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.99805C9.48178 4.99805 7.283 5.12616 5.73089 5.25202C4.65221 5.33949 3.81611 6.16352 3.72 7.23254C3.60607 8.4998 3.5 10.171 3.5 11.998C3.5 13.8251 3.60607 15.4963 3.72 16.76355C3.81611 17.83255 4.65221 18.6566 5.73089 18.7441C7.283 18.8699 9.48178 18.998 12 18.998C14.5185 18.998 16.7174 18.8699 18.2696 18.74405C19.3481 18.65655 20.184 17.8328 20.2801 16.76405C20.394 15.4973 20.5 13.82645 20.5 11.998C20.5 10.16965 20.394 8.49877 20.2801 7.23205C20.184 6.1633 19.3481 5.33952 18.2696 5.25205C16.7174 5.12618 14.5185 4.99805 12 4.99805zM5.60965 3.75693C7.19232 3.62859 9.43258 3.49805 12 3.49805C14.5677 3.49805 16.8081 3.62861 18.3908 3.75696C20.1881 3.90272 21.6118 5.29278 21.7741 7.09773C21.8909 8.3969 22 10.11405 22 11.998C22 13.88205 21.8909 15.5992 21.7741 16.8984C21.6118 18.7033 20.1881 20.09335 18.3908 20.23915C16.8081 20.3675 14.5677 20.498 12 20.498C9.43258 20.498 7.19232 20.3675 5.60965 20.2392C3.81206 20.0934 2.38831 18.70295 2.22603 16.8979C2.10918 15.5982 2 13.8808 2 11.998C2 10.1153 2.10918 8.39787 2.22603 7.09823C2.38831 5.29312 3.81206 3.90269 5.60965 3.75693z" fill="currentColor"></path><path d="M14.7138 10.96875C15.50765 11.4271 15.50765 12.573 14.71375 13.0313L11.5362 14.8659C10.74235 15.3242 9.75 14.7513 9.75001 13.8346L9.75001 10.1655C9.75001 9.24881 10.74235 8.67587 11.5362 9.13422L14.7138 10.96875z" fill="currentColor"></path></svg>';
  }
  function danmakuIconMarkup() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.99805C9.48178 4.99805 7.283 5.12616 5.73089 5.25202C4.65221 5.33949 3.81611 6.16352 3.72 7.23254C3.60607 8.4998 3.5 10.171 3.5 11.998C3.5 13.8251 3.60607 15.4963 3.72 16.76355C3.81611 17.83255 4.65221 18.6566 5.73089 18.7441C7.283 18.8699 9.48178 18.998 12 18.998C14.5185 18.998 16.7174 18.8699 18.2696 18.74405C19.3481 18.65655 20.184 17.8328 20.2801 16.76405C20.394 15.4973 20.5 13.82645 20.5 11.998C20.5 10.16965 20.394 8.49877 20.2801 7.23205C20.184 6.1633 19.3481 5.33952 18.2696 5.25205C16.7174 5.12618 14.5185 4.99805 12 4.99805zM5.60965 3.75693C7.19232 3.62859 9.43258 3.49805 12 3.49805C14.5677 3.49805 16.8081 3.62861 18.3908 3.75696C20.1881 3.90272 21.6118 5.29278 21.7741 7.09773C21.8909 8.3969 22 10.11405 22 11.998C22 13.88205 21.8909 15.5992 21.7741 16.8984C21.6118 18.7033 20.1881 20.09335 18.3908 20.23915C16.8081 20.3675 14.5677 20.498 12 20.498C9.43258 20.498 7.19232 20.3675 5.60965 20.2392C3.81206 20.0934 2.38831 18.70295 2.22603 16.8979C2.10918 15.5982 2 13.8808 2 11.998C2 10.1153 2.10918 8.39787 2.22603 7.09823C2.38831 5.29312 3.81206 3.90269 5.60965 3.75693z" fill="currentColor"></path><path d="M15.875 10.75L9.875 10.75C9.46079 10.75 9.125 10.4142 9.125 10C9.125 9.58579 9.46079 9.25 9.875 9.25L15.875 9.25C16.2892 9.25 16.625 9.58579 16.625 10C16.625 10.4142 16.2892 10.75 15.875 10.75z" fill="currentColor"></path><path d="M17.375 14.75L11.375 14.75C10.9608 14.75 10.625 14.4142 10.625 14C10.625 13.5858 10.9608 13.25 11.375 13.25L17.375 13.25C17.7892 13.25 18.125 13.5858 18.125 14C18.125 14.4142 17.7892 14.75 17.375 14.75z" fill="currentColor"></path><path d="M7.875 10C7.875 10.4142 7.53921 10.75 7.125 10.75L6.625 10.75C6.21079 10.75 5.875 10.4142 5.875 10C5.875 9.58579 6.21079 9.25 6.625 9.25L7.125 9.25C7.53921 9.25 7.875 9.58579 7.875 10z" fill="currentColor"></path><path d="M9.375 14C9.375 14.4142 9.03921 14.75 8.625 14.75L8.125 14.75C7.71079 14.75 7.375 14.4142 7.375 14C7.375 13.5858 7.71079 13.25 8.125 13.25L8.625 13.25C9.03921 13.25 9.375 13.5858 9.375 14z" fill="currentColor"></path></svg>';
  }
  function getEntryCardTitle(root, link, fallback) {
    const bvid = getVideoMetaFromLink(link)?.bvid;
    const textLink = getEntryTextLink(root, bvid);
    const candidate = textLink?.textContent || getSafeTitleElementText(root, ['.bili-video-card__info--tit', '.video-page-card-small-title', '.title', '.bili-dyn-live-users__item__title', '.info-title'].join(',')) || link?.getAttribute?.('title') || link?.getAttribute?.('aria-label') || root?.querySelector?.('img')?.getAttribute('alt') || fallback;
    return cleanTitle$1(candidate || fallback || 'Bilibili 视频');
  }
  function getEntryTextLink(root, bvid) {
    if (!root || !bvid) return null;
    return [...(root.querySelectorAll?.('a[href*="/video/BV"]') || [])].find(candidate => {
      const meta = getVideoMetaFromLink(candidate);
      return meta?.bvid === bvid && !isCoverLink(candidate) && isUsefulTitle(candidate.textContent);
    }) || null;
  }
  function getSafeTitleElementText(root, selector) {
    return [...(root?.querySelectorAll?.(selector) || [])].map(element => element.textContent || element.getAttribute?.('title') || '').find(isUsefulTitle) || '';
  }
  function getEntryCardCover(root, link) {
    const img = root?.querySelector?.('img[src], img[data-src], img[data-lazy-src], img[data-original], img[data-url]') || link?.querySelector?.('img[src], img[data-src], img[data-lazy-src], img[data-original], img[data-url]');
    const source = root?.querySelector?.('source[srcset], source[data-srcset]') || link?.querySelector?.('source[srcset], source[data-srcset]');
    const raw = img?.getAttribute('data-src') || img?.getAttribute('data-lazy-src') || img?.getAttribute('data-original') || img?.getAttribute('data-url') || img?.getAttribute('src') || getFirstSrcsetUrl(source?.getAttribute('data-srcset') || source?.getAttribute('srcset')) || '';
    return normalizeResourceUrl(raw);
  }
  function getEntryCardSubtitle(root) {
    return cleanText$1(root?.querySelector?.(['.upname', '.name', '.bili-dyn-live-users__item__uname', '.bili-video-card__info--author', '.video-page-card-small-author', '[class*="author"]'].join(','))?.textContent);
  }
  function getEntryCardDuration(root) {
    return cleanText$1(root?.querySelector?.(['.duration', '.bili-video-card__stats__duration', '[class*="duration"]'].join(','))?.textContent);
  }
  function getEntryCardStats(root) {
    const playInfo = root?.querySelector?.('.playinfo')?.textContent;
    if (playInfo) return cleanText$1(playInfo);
    const items = uniqueList([...(root?.querySelectorAll?.(['.bili-video-card__stats--text', '.bili-video-card__stats--item', '[class*="stats"] [class*="text"]'].join(',')) || [])].map(element => cleanText$1(element.textContent)).filter(Boolean));
    return items.slice(0, 2).join(' ');
  }
  function cleanText$1(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }
  function cleanTitle$1(value) {
    const title = cleanText$1(value);
    return isUsefulTitle(title) ? title : 'Bilibili 视频';
  }
  function isUsefulTitle(value) {
    const title = cleanText$1(value);
    return Boolean(title && title !== '不感兴趣' && title !== '撤销' && !title.includes('将减少此类内容推荐'));
  }
  function uniqueList(values) {
    return [...new Set(values)];
  }
  function getFirstSrcsetUrl(srcset) {
    return String(srcset || '').split(',')[0]?.trim().split(/\s+/)[0] || '';
  }

  const HOME_FEED_API = 'https://api.bilibili.com/x/web-interface/wbi/index/top/feed/rcmd';
  const PAGE_SIZE = 12;
  function isHomeFeedPage(url = globalThis.location?.href || '') {
    try {
      const parsed = new URL(url);
      return parsed.hostname === 'www.bilibili.com' && (parsed.pathname === '/' || parsed.pathname === '/index.html');
    } catch {
      return false;
    }
  }
  function createHomeFeedSession() {
    return {
      brush: 0,
      fetchRow: 0,
      freshIdx: 0,
      freshIdx1h: 0,
      lastYNum: 0,
      shownIds: new Set(),
      uniqId: String(Date.now() + Math.floor(Math.random() * 1000000)),
      yNum: 0
    };
  }
  async function fetchHomeFeedCards({
    session,
    existingCards = []
  } = {}) {
    if (!session) throw new Error('Missing home feed session');
    const params = buildHomeFeedParams(session, existingCards);
    const response = await fetch(`${HOME_FEED_API}?${params}`, {
      credentials: 'include',
      headers: {
        accept: 'application/json, text/plain, */*'
      }
    });
    if (!response.ok) throw new Error(`Home feed request failed: ${response.status}`);
    const payload = await response.json();
    if (payload?.code !== 0) throw new Error(payload?.message || `Home feed error: ${payload?.code}`);
    const existingBvids = new Set(existingCards.map(card => card?.bvid).filter(Boolean));
    const seenBvids = new Set(existingBvids);
    const cards = (payload.data?.item || []).map(mapHomeFeedItem).filter(card => {
      if (!card?.bvid || seenBvids.has(card.bvid)) return false;
      seenBvids.add(card.bvid);
      return true;
    });
    advanceHomeFeedSession(session, cards);
    return cards;
  }
  function buildHomeFeedParams(session, existingCards) {
    const showIds = [...existingCards.map(card => card?.showId).filter(Boolean), ...session.shownIds].slice(-60);
    const nextFreshIdx = session.freshIdx + 1;
    const nextFetchRow = session.fetchRow + 1;
    const nextYNum = session.yNum + 4;
    const params = new URLSearchParams({
      web_location: '1430650',
      y_num: String(nextYNum),
      fresh_type: '4',
      feed_version: 'V8',
      fresh_idx_1h: String(session.freshIdx1h + 1),
      fetch_row: String(nextFetchRow),
      fresh_idx: String(nextFreshIdx),
      brush: String(session.brush + 1),
      device: 'win',
      homepage_ver: '1',
      ps: String(PAGE_SIZE),
      last_y_num: String(session.lastYNum),
      screen: getScreenParam(),
      seo_info: '',
      tt_exp: '',
      uniq_id: session.uniqId
    });
    if (showIds.length) params.set('last_showlist', showIds.join(','));
    return params;
  }
  function advanceHomeFeedSession(session, cards) {
    session.brush += 1;
    session.fetchRow += Math.max(1, Math.ceil(cards.length / 4));
    session.freshIdx += 1;
    session.freshIdx1h += 1;
    session.lastYNum = session.yNum;
    session.yNum += 4;
    cards.forEach(card => {
      if (card.showId) session.shownIds.add(card.showId);
    });
  }
  function mapHomeFeedItem(item) {
    if (!item || item.goto !== 'av' || !item.bvid) return null;
    const href = normalizeVideoHref(item.uri || `/video/${item.bvid}`, 'https://www.bilibili.com/');
    if (!href) return null;
    return {
      bvid: item.bvid,
      cover: normalizeResourceUrl(item.pic, 'https://www.bilibili.com/'),
      duration: formatDuration$1(item.duration),
      href,
      showId: item.id ? `av_${item.id}` : '',
      stats: formatHomeFeedStats(item),
      subtitle: cleanText(item.owner?.name),
      title: cleanTitle(item.title)
    };
  }
  function formatHomeFeedStats(item) {
    const view = formatCount$2(item?.stat?.view);
    const danmaku = formatCount$2(item?.stat?.danmaku);
    return view || danmaku ? {
      view,
      danmaku
    } : '';
  }
  function formatCount$2(value) {
    const count = Number(value);
    if (!Number.isFinite(count) || count <= 0) return '';
    if (count >= 100000000) return `${trimFixed$2(count / 100000000)}亿`;
    if (count >= 10000) return `${trimFixed$2(count / 10000)}万`;
    return String(Math.round(count));
  }
  function trimFixed$2(value) {
    return value.toFixed(1).replace(/\.0$/, '');
  }
  function formatDuration$1(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return '';
    const total = Math.round(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor(total % 3600 / 60);
    const s = total % 60;
    if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  function getScreenParam() {
    const width = Math.max(1, Math.round(globalThis.window?.innerWidth || globalThis.screen?.width || 0));
    const height = Math.max(1, Math.round(globalThis.window?.innerHeight || globalThis.screen?.height || 0));
    return `${width}-${height}`;
  }
  function cleanTitle(value) {
    return cleanText(value) || 'Bilibili 视频';
  }
  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  const LUCIDE_STROKE_WIDTH = '2';
  function createIconFromMarkup(markup) {
    const template = document.createElement('template');
    template.innerHTML = markup;
    return template.content.firstElementChild;
  }
  function lucideIconMarkup(paths) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${LUCIDE_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths.map(d => `<path d="${d}"></path>`).join('')}</svg>`;
  }
  function createSettingsIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', LUCIDE_STROKE_WIDTH);
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    [['path', {
      d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915'
    }], ['circle', {
      cx: '12',
      cy: '12',
      r: '3'
    }]].forEach(([name, attrs]) => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', name);
      Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
      svg.appendChild(node);
    });
    return svg;
  }
  function createExternalLinkIcon() {
    return createIconFromMarkup(externalLinkIconMarkup());
  }
  function createHistoryBackIcon() {
    return createIconFromMarkup(lucideIconMarkup(['m15 18-6-6 6-6']));
  }
  function createHistoryForwardIcon() {
    return createIconFromMarkup(lucideIconMarkup(['m9 18 6-6-6-6']));
  }
  function createMaximizeIcon() {
    return createIconFromMarkup(lucideIconMarkup(['M8 3H5a2 2 0 0 0-2 2v3', 'M21 8V5a2 2 0 0 0-2-2h-3', 'M3 16v3a2 2 0 0 0 2 2h3', 'M16 21h3a2 2 0 0 0 2-2v-3']));
  }
  function createMinimizeIcon() {
    return createIconFromMarkup(lucideIconMarkup(['M8 3v3a2 2 0 0 1-2 2H3', 'M21 8h-3a2 2 0 0 1-2-2V3', 'M3 16h3a2 2 0 0 1 2 2v3', 'M16 21v-3a2 2 0 0 1 2-2h3']));
  }
  function createPictureInPictureIcon() {
    return createIconFromMarkup(lucideIconMarkup(['M21 9V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4', 'M21 13v5a2 2 0 0 1-2 2h-5', 'M15 15h6v5h-6z']));
  }
  function createAutoPlayIcon() {
    return createIconFromMarkup(lucideIconMarkup(['m17 2 4 4-4 4', 'M3 11v-1a4 4 0 0 1 4-4h14', 'm7 22-4-4 4-4', 'M21 13v1a4 4 0 0 1-4 4H3']));
  }
  function createResetSizeIcon() {
    return createIconFromMarkup(lucideIconMarkup(['M3 12a9 9 0 1 0 3-6.7', 'M3 3v6h6']));
  }
  function createCloseIcon() {
    return createIconFromMarkup(lucideIconMarkup(['M18 6 6 18', 'm6 6 12 12']));
  }
  function externalLinkIconMarkup() {
    return lucideIconMarkup(['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6']);
  }
  function arrowUpIconMarkup() {
    return lucideIconMarkup(['m18 15-6-6-6 6']);
  }

  const LIVE_ROOM_RE = /^https?:\/\/live\.bilibili\.com\/(?:blanc\/)?(\d+)/;
  const LIVE_PLAYER_SCRIPT = 'https://s1.hdslb.com/bfs/blive-engineer/live-web-player/room-player.prod.min.js';
  function isLivePage() {
    return LIVE_ROOM_RE.test(location.href);
  }
  function getCurrentLiveMeta() {
    const match = location.href.match(LIVE_ROOM_RE);
    if (!match) return null;
    const roomId = match[1];
    const title = cleanLiveTitle(document.querySelector('meta[property="og:title"]')?.getAttribute('content') || document.querySelector('meta[name="title"]')?.getAttribute('content') || document.title || `Bilibili 直播 ${roomId}`);
    return {
      kind: 'live',
      roomId,
      href: normalizeLiveHref(location.href),
      title
    };
  }
  function isLiveMeta(meta) {
    return meta?.kind === 'live' || Boolean(meta?.roomId && !meta?.bvid);
  }
  function isLiveBootstrap(bootstrap) {
    return bootstrap?.kind === 'live';
  }
  async function resolveLiveBootstrap(meta) {
    const inputRoomId = String(meta?.roomId || '').trim();
    if (!inputRoomId) throw new Error('直播房间号缺失');
    const roomInit = await fetchLiveJson(`https://api.live.bilibili.com/room/v1/Room/room_init?id=${encodeURIComponent(inputRoomId)}`);
    const room = roomInit?.data;
    if (!room?.room_id) throw new Error('直播房间解析失败');
    if (room.is_hidden) throw new Error('直播间已隐藏');
    if (room.is_locked) throw new Error('直播间已锁定');
    if (!room.live_status) throw new Error('当前直播间未开播');
    const playInfo = await fetchLiveJson(buildPlayInfoUrl(room.room_id));
    if (!playInfo?.data?.playurl_info?.playurl) throw new Error('直播播放地址解析失败');
    const roomInitData = {
      code: 0,
      message: '0',
      ttl: 1,
      data: {
        ...room,
        ...playInfo.data,
        room_id: room.room_id,
        short_id: room.short_id,
        uid: room.uid,
        live_status: room.live_status
      }
    };
    return {
      kind: 'live',
      title: meta.title || `Bilibili 直播 ${inputRoomId}`,
      href: normalizeLiveHref(meta.href || `https://live.bilibili.com/${inputRoomId}`),
      playerScript: LIVE_PLAYER_SCRIPT,
      stylesheets: [],
      roomInitData,
      playerInfo: {
        roomId: room.room_id,
        shortId: room.short_id || inputRoomId,
        uid: room.uid,
        t: 0
      }
    };
  }
  function buildPlayInfoUrl(roomId) {
    const url = new URL('https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo');
    url.searchParams.set('room_id', String(roomId));
    url.searchParams.set('protocol', '0,1');
    url.searchParams.set('format', '0,1,2');
    url.searchParams.set('codec', '0,1,2');
    url.searchParams.set('qn', '10000');
    url.searchParams.set('platform', 'web');
    url.searchParams.set('ptype', '16');
    url.searchParams.set('dolby', '5');
    url.searchParams.set('panorama', '1');
    return url.href;
  }
  async function fetchLiveJson(url) {
    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        accept: 'application/json, text/plain, */*'
      }
    });
    if (!response.ok) throw new Error(`直播接口请求失败：${response.status}`);
    const json = await response.json();
    if (json.code !== 0) throw new Error(json.message || json.msg || `直播接口错误：${json.code}`);
    return json;
  }
  function normalizeLiveHref(rawHref) {
    try {
      const url = new URL(rawHref, location.href);
      return `https://live.bilibili.com/${url.pathname.match(/(\d+)/)?.[1] || ''}`;
    } catch {
      return rawHref || '';
    }
  }
  function cleanLiveTitle(value) {
    const title = String(value || '').replace(/\s+/g, ' ').trim();
    return title.replace(/_哔哩哔哩直播.*$/u, '').replace(/- 哔哩哔哩直播.*$/u, '').trim() || 'Bilibili 直播';
  }

  function installLivePipGlobals(targetWindow, bootstrap) {
    const now = Date.now();
    const rnd = Math.floor(now / 1000);
    targetWindow.BilibiliLive = {
      INIT_TIME: now,
      RND: rnd,
      UID: 0,
      ROOMID: bootstrap.playerInfo?.roomId || 0,
      ANCHOR_UID: bootstrap.playerInfo?.uid || 0
    };
    targetWindow.DANMU_RND = rnd;
    targetWindow.webPlayerAbTest = {};
    targetWindow.__RoomPlayerReportData__ = {
      startLoadPlayer: targetWindow.performance?.now?.() || 0
    };
    targetWindow.__NEPTUNE_IS_MY_WAIFU__ = {
      roomInitRes: bootstrap.roomInitData,
      roomInfoRes: {
        code: 0,
        data: {
          new_switch_info: {},
          player_watermark: {
            url: ''
          },
          pure_room_info: {
            function_control: []
          }
        }
      }
    };
    targetWindow.addWaifu = () => {};
    targetWindow.roomPlayerLoaded = () => {
      targetWindow.roomPlayerIsLoaded = true;
    };
    targetWindow.roomPlayerError = () => {
      targetWindow.roomPlayerTriggerError = 'loadError';
    };
  }
  function buildLivePipPlayerOptions(targetWindow, bootstrap) {
    return {
      fullscreenContainer: targetWindow.document.getElementById('fullscreen-container'),
      cid: bootstrap.playerInfo.roomId,
      initTime: targetWindow.performance?.now?.() || 0,
      roomInitDataV2: bootstrap.roomInitData,
      relayRoomId: bootstrap.roomInitData?.data?.relay_room_id,
      rnd: targetWindow.DANMU_RND,
      fnPromiseMode: true,
      protover: 2,
      mask: {
        shouldOpenMask: true
      },
      ptype: 16,
      backgroundFilter: true,
      coreType: 2,
      coreProtocol: 0,
      initTrackData: {
        ...targetWindow.__RoomPlayerReportData__
      },
      UI: {
        logo: false,
        logoOptions: {
          url: ''
        },
        feedback: false,
        recommend: false,
        showDanmakuSetting: true,
        dmContainerTopOffset: 0,
        danmaku: true
      }
    };
  }
  function createLivePipPlayerAdapter(targetWindow, player, sizeElement = null) {
    return {
      raw: player,
      play: () => player?.play?.(),
      pause: () => player?.pause?.(),
      resize: () => {
        const rect = sizeElement?.getBoundingClientRect?.();
        player?.resize?.();
        player?.setSize?.(Math.round(rect?.width || targetWindow.innerWidth), Math.round(rect?.height || targetWindow.innerHeight));
      },
      disconnect: () => {
        player?.destroy?.();
        player?.dispose?.();
        player?.unload?.();
      },
      on: (...args) => player?.on?.(...args),
      off: (...args) => player?.off?.(...args)
    };
  }

  const NANO_THEME = {
    'bpx-primary-color': 'var(--brand_blue)',
    'bpx-fn-color': 'var(--brand_blue)',
    'bpx-fn-hover-color': 'var(--brand_blue)',
    'bpx-box-shadow': 'var(--bg3)',
    'bpx-dmsend-switch-icon': 'var(--text2)',
    'bpx-dmsend-hint-icon': 'var(--graph_medium)',
    'bpx-aux-header-icon': 'var(--graph_icon)',
    'bpx-aux-float-icon': 'var(--graph_icon)',
    'bpx-aux-block-icon': 'var(--text3)',
    'bpx-dmsend-info-font': 'var(--text2)',
    'bpx-dmsend-input-font': 'var(--text1)',
    'bpx-dmsend-hint-font': 'var(--text3)',
    'bpx-aux-header-font': 'var(--text1)',
    'bpx-aux-footer-font': 'var(--text2)',
    'bpx-aux-footer-font-hover': 'var(--text1)',
    'bpx-aux-content-font1': 'var(--text1)',
    'bpx-aux-content-font2': 'var(--text2)',
    'bpx-aux-content-font3': 'var(--text2)',
    'bpx-aux-content-font4': 'var(--text3)',
    'bpx-aux-content-font5': 'var(--text3)',
    'bpx-dmsend-main-bg': 'var(--bg1)',
    'bpx-dmsend-input-bg': 'var(--bg3)',
    'bpx-aux-header-bg': 'var(--graph_bg_regular)',
    'bpx-aux-footer-bg': 'var(--graph_bg_regular)',
    'bpx-aux-content-bg': 'var(--bg1)',
    'bpx-aux-button-bg': 'var(--bg3)',
    'bpx-aux-button-disabled-bg': 'var(--graph_bg_thin)',
    'bpx-aux-float-bg': 'var(--bg1_float)',
    'bpx-aux-float-hover-bg': 'var(--graph_medium)',
    'bpx-aux-cover-bg': 'var(--graph_weak)',
    'bpx-dmsend-border': 'var(--bg3)',
    'bpx-aux-float-border': 'var(--line_light)',
    'bpx-aux-line-border': 'var(--line_regular)',
    'bpx-aux-input-border': 'var(--line_regular)',
    'bpx-dmsend-disable-button-bg': 'var(--graph_bg_thick)',
    'bpx-dmsend-disable-button-text': 'var(--text3)'
  };
  function getPlayerNanoTheme() {
    return {
      ...NANO_THEME
    };
  }
  function getPlayerThemeVariableCss(selector) {
    return `
      ${selector} .bpx-player-container {
        --bpx-dmsend-main-bg: var(--bg1, #fff);
        --bpx-dmsend-input-bg: var(--bg3, var(--bg2, #f4f4f4));
        --bpx-dmsend-border: var(--bg3, var(--line_regular, #e7e7e7));
        --bpx-dmsend-info-font: var(--text2, #505050);
        --bpx-dmsend-input-font: var(--text1, #212121);
        --bpx-dmsend-switch-icon: var(--text2, #757575);
        --bpx-dmsend-hint-font: var(--text3, #757a81);
        --bpx-dmsend-hint-icon: var(--text3, #757a81);
        --bpx-dmsend-disable-button-bg: var(--graph_bg_thick, #e3e5e7);
        --bpx-dmsend-disable-button-text: var(--text3, #9499a0);
        --bpx-primary-color: var(--brand_blue, #00aeec);
      }
`;
  }

  function installDocumentStyle(targetDocument = document) {
    if (targetDocument.getElementById(DOCUMENT_STYLE_ID)) return;
    const style = targetDocument.createElement('style');
    style.id = DOCUMENT_STYLE_ID;
    style.textContent = `
      :root {
        --${APP}-surface: var(--bg1, #fff);
        --${APP}-surface-soft: var(--bg2, #f6f7f8);
        --${APP}-surface-elevated: var(--bg1_float, var(--bg1, #fff));
        --${APP}-text: var(--text1, #18191c);
        --${APP}-text-subtle: var(--text2, #61666d);
        --${APP}-text-muted: var(--text3, #9499a0);
        --${APP}-border: var(--line_regular, #e3e5e7);
        --${APP}-brand: var(--brand_pink, #fb7299);
        --${APP}-brand-soft: var(--Pi5, rgba(251, 114, 153, 0.14));
      }

      .${BUTTON_CLASS} {
        position: absolute !important;
        z-index: 20;
        right: 8px;
        bottom: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 72px;
        height: 28px;
        padding: 0 10px;
        border: 1px solid var(--${APP}-border);
        border-radius: 6px;
        color: var(--${APP}-text);
        background: var(--${APP}-surface-soft);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
        font: 500 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: pointer;
        opacity: 0.96;
        pointer-events: auto;
        transition: border-color 0.16s ease, color 0.16s ease, background 0.16s ease, opacity 0.16s ease;
      }

      .${BUTTON_CLASS}:disabled {
        color: var(--${APP}-text-muted);
        background: var(--${APP}-surface-soft);
        box-shadow: none;
        cursor: default;
      }

      .${BUTTON_CLASS}:hover,
      .${BUTTON_CLASS}:focus-visible {
        color: #fff;
        border-color: var(--${APP}-brand);
        background: var(--${APP}-brand);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
        opacity: 1;
        outline: none;
      }

      .${BADGE_CLASS} {
        position: absolute !important;
        z-index: 21;
        top: 8px;
        left: 8px;
        display: none;
        align-items: center;
        height: 24px;
        padding: 0 8px;
        border-radius: 6px;
        color: var(--${APP}-text-subtle);
        border: 1px solid var(--${APP}-border);
        background: var(--${APP}-surface-elevated);
        backdrop-filter: blur(8px);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
        font: 500 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: none;
      }

      .${BADGE_CLASS}.${APP}--active {
        display: inline-flex;
      }

      .${BADGE_CLASS}.${APP}--playing {
        color: #fff;
        border-color: var(--${APP}-brand);
        background: var(--${APP}-brand);
      }

      .${APP}__control-overlay.${APP}--playback-web-fullscreen {
        display: none;
      }

      .${APP}__fixed-pip-button {
        position: fixed !important;
        right: 16px !important;
        bottom: 160px !important;
        left: auto !important;
        top: auto !important;
        z-index: 2147481000;
        width: 52px !important;
        height: 52px !important;
        min-width: 0 !important;
        padding: 0 !important;
        display: grid !important;
        place-items: center !important;
        border-radius: 10px !important;
        font-size: 0 !important;
      }

      .${APP}__fixed-pip-button svg {
        width: 22px;
        height: 22px;
        display: block;
        stroke: currentColor;
      }

      #${APP}-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        display: grid;
        place-items: center;
        padding: 16px;
        background: rgba(15, 18, 24, 0.68);
      }

      body.${APP}--modal-open > bili-photoswipe,
      body.${APP}--modal-open > bili-modal,
      body.${APP}--modal-open > .pswp,
      body.${APP}--modal-open > .bili-modal,
      body.${APP}--modal-open > .bili-photoswipe,
      body.${APP}--modal-open > [class*="pswp"],
      body.${APP}--modal-open > [class*="photoswipe"],
      body.${APP}--modal-open > [class*="photo-swipe"],
      body.${APP}--modal-open > [class*="image-preview"],
      body.${APP}--modal-open > [class*="picture-preview"],
      body.${APP}--modal-open > [class*="preview"][class*="modal"],
      body.${APP}--modal-open > [class*="preview"][class*="popup"],
      #${APP}-overlay bili-photoswipe,
      #${APP}-overlay bili-modal,
      #${APP}-overlay .pswp,
      #${APP}-overlay .bili-modal,
      #${APP}-overlay .bili-photoswipe,
      #${APP}-overlay [class*="pswp"],
      #${APP}-overlay [class*="photoswipe"],
      #${APP}-overlay [class*="photo-swipe"],
      #${APP}-overlay [class*="image-preview"],
      #${APP}-overlay [class*="picture-preview"],
      #${APP}-overlay [class*="preview"][class*="modal"],
      #${APP}-overlay [class*="preview"][class*="popup"] {
        position: fixed !important;
        inset: 0 !important;
        z-index: 2147483647 !important;
      }

      #${APP}-overlay.${APP}--hidden {
        display: none;
      }

      #${APP}-dialog {
        position: relative;
        width: calc(100vw - clamp(128px, 16vw, 440px));
        height: min(960px, calc(100vh - clamp(96px, 12vh, 220px)));
        display: grid;
        grid-template-rows: 46px 1fr;
        overflow: hidden;
        border-radius: 8px;
        background: var(--${APP}-surface);
        box-shadow: 0 20px 70px rgba(0, 0, 0, 0.42);
      }

      #${APP}-overlay.${APP}--fullscreen {
        padding: 0;
        background: #000;
      }

      #${APP}-overlay.${APP}--fullscreen #${APP}-dialog {
        width: 100vw;
        height: 100vh;
        border-radius: 0;
        box-shadow: none;
      }

      #${APP}-overlay.${APP}--fullscreen .${APP}__modal-resize-handle {
        display: none;
      }

      #${APP}-header {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        min-width: 0;
        padding: 0 10px 0 16px;
        color: var(--${APP}-text);
        background: var(--${APP}-surface-elevated);
        border-bottom: 1px solid var(--${APP}-border);
      }

      .${APP}__header-history {
        display: inline-grid;
        grid-template-columns: repeat(2, 32px);
        gap: 2px;
        align-items: center;
      }

      .${APP}__header-actions {
        display: inline-grid;
        grid-auto-flow: column;
        grid-auto-columns: 32px;
        gap: 4px;
        align-items: center;
        justify-content: end;
        min-width: 0;
      }

      .${APP}__auto-play-hint {
        justify-self: end;
        grid-column: auto / span 1;
        max-width: 0;
        overflow: hidden;
        white-space: nowrap;
        color: var(--${APP}-text-subtle);
        opacity: 0;
        font: 500 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        transition: max-width 0.18s ease, opacity 0.18s ease, margin-right 0.18s ease;
      }

      .${APP}__auto-play-hint.${APP}--visible {
        max-width: 180px;
        margin-right: 4px;
        opacity: 1;
      }

      #${APP}-title {
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        font: 500 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      #${APP}-status {
        display: none;
      }

      .${APP}__header-button {
        width: 32px;
        height: 32px;
        box-sizing: border-box;
        padding: 0;
        display: inline-grid;
        place-items: center;
        line-height: 1;
        font: inherit;
        appearance: none;
        -moz-appearance: none;
        border: 1px solid transparent;
        border-radius: 6px;
        color: var(--${APP}-text-subtle);
        background: transparent;
        cursor: pointer;
        transition: color 0.16s ease, background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
      }

      .${APP}__header-button:disabled {
        color: var(--${APP}-text-muted);
        cursor: default;
        opacity: 0.45;
      }

      .${APP}__header-button svg {
        width: 17px;
        height: 17px;
        display: block;
        margin: 0;
        flex: none;
        stroke: currentColor;
        transition: stroke 0.16s ease;
      }

      .${APP}__header-button svg * {
        stroke: currentColor;
      }

      .${APP}__header-button--text {
        width: auto;
        min-width: 72px;
        padding: 0 10px;
        font-size: 12px;
      }

      .${APP}__header-button:hover,
      .${APP}__header-button:focus-visible,
      .${APP}__header-button.${APP}__header-button--active {
        color: var(--${APP}-brand);
        border-color: rgba(251, 114, 153, 0.32);
        background: var(--${APP}-surface-soft);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
        outline: none;
      }

      .${APP}__header-button:disabled:hover,
      .${APP}__header-button:disabled:focus-visible {
        color: var(--${APP}-text-muted);
        border-color: transparent;
        background: transparent;
        box-shadow: none;
      }

      .${APP}__modal-resize-handle {
        position: absolute;
        right: 0;
        bottom: 0;
        z-index: 20;
        width: 28px;
        height: 28px;
        padding: 0;
        border: 0;
        border-radius: 0 0 8px 0;
        color: var(--${APP}-text-muted);
        background:
          linear-gradient(135deg, transparent 0 52%, currentColor 52% 57%, transparent 57%),
          linear-gradient(135deg, transparent 0 68%, currentColor 68% 73%, transparent 73%);
        cursor: nwse-resize;
        opacity: 0.72;
      }

      .${APP}__modal-resize-handle:hover,
      .${APP}__modal-resize-handle:focus-visible,
      #${APP}-overlay.${APP}--modal-resizing .${APP}__modal-resize-handle {
        color: var(--${APP}-brand);
        opacity: 1;
        outline: none;
      }

      #${APP}-content {
        position: relative;
        min-width: 0;
        min-height: 0;
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
        background: var(--${APP}-surface);
      }

      #${APP}-overlay.${APP}--comments-right #${APP}-content {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 8px var(--${APP}-comments-width, 420px);
        overflow: hidden;
      }

      .${APP}__back-to-top {
        position: absolute;
        right: 34px;
        bottom: 30px;
        z-index: 6;
        width: 38px;
        height: 38px;
        display: grid;
        place-items: center;
        border: 1px solid var(--line_regular, #e3e5e7);
        border-radius: 999px;
        color: var(--text2, #61666d);
        background: var(--bg1, #fff);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
        cursor: pointer;
        opacity: 0;
        pointer-events: none;
        transform: translateY(6px);
        transition: opacity 0.16s ease, transform 0.16s ease, color 0.16s ease, border-color 0.16s ease;
      }

      #${APP}-overlay.${APP}--comments-right .${APP}__back-to-top {
        right: 24px;
        bottom: 24px;
      }

      .${APP}__back-to-top.${APP}--visible {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0);
      }

      .${APP}__back-to-top:hover,
      .${APP}__back-to-top:focus-visible {
        color: var(--${APP}-brand);
        border-color: var(--${APP}-brand);
        outline: none;
      }

      .${APP}__back-to-top svg {
        width: 18px;
        height: 18px;
        display: block;
        stroke: currentColor;
      }

      #${APP}-comments-resizer {
        display: none;
      }

      #${APP}-overlay.${APP}--comments-right #${APP}-comments-resizer {
        display: block;
        position: relative;
        z-index: 2;
        width: 8px;
        min-width: 8px;
        height: 100%;
        cursor: col-resize;
        background: var(--bg1, #fff);
      }

      #${APP}-overlay.${APP}--comments-right #${APP}-comments-resizer::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 0;
        width: 1px;
        background: rgba(148, 153, 160, 0.36);
      }

      #${APP}-overlay.${APP}--comments-right #${APP}-comments-resizer:hover::before,
      #${APP}-overlay.${APP}--comments-right #${APP}-comments-resizer:focus-visible::before,
      #${APP}-overlay.${APP}--resizing #${APP}-comments-resizer::before {
        background: var(--${APP}-brand);
      }

      #${APP}-overlay.${APP}--comments-right #${APP}-comments-resizer:focus-visible {
        outline: none;
      }

      #${APP}-player-wrap {
        position: relative;
        height: calc(min(960px, calc(100vh - clamp(96px, 12vh, 220px))) - 46px);
        min-width: 0;
        min-height: 0;
        background: #000;
      }

      #${APP}-overlay.${APP}--fullscreen #${APP}-player-wrap {
        height: calc(100vh - 46px);
      }

      #${APP}-overlay.${APP}--comments-right #${APP}-player-wrap,
      #${APP}-overlay.${APP}--fullscreen.${APP}--comments-right #${APP}-player-wrap {
        height: 100%;
      }

      #${APP}-player,
      #${APP}-player .bpx-player-container {
        width: 100% !important;
        height: 100% !important;
      }

${getPlayerThemeVariableCss(`#${APP}-player`)}

      .${APP}__like-burst {
        position: absolute;
        left: 50%;
        top: 50%;
        z-index: 80;
        box-sizing: border-box;
        min-width: 112px;
        height: 46px;
        padding: 0 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 999px;
        color: #fff;
        background: rgba(0, 0, 0, 0.62);
        box-shadow: 0 12px 34px rgba(0, 0, 0, 0.32);
        font: 700 16px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
        pointer-events: none;
        transform: translate(-50%, -50%) scale(0.86);
        animation: ${APP}-like-burst 0.9s ease forwards;
      }

      .${APP}__like-burst--success {
        background: rgba(251, 114, 153, 0.92);
      }

      .${APP}__like-burst--neutral {
        background: rgba(77, 84, 96, 0.9);
      }

      .${APP}__like-burst--error {
        background: rgba(174, 45, 45, 0.92);
      }

      .${APP}__like-burst svg {
        width: 22px;
        height: 22px;
        flex: 0 0 auto;
      }

      @keyframes ${APP}-like-burst {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.72);
        }
        18% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1.06);
        }
        62% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, calc(-50% - 24px)) scale(0.98);
        }
      }

      #${APP}-player .bpx-player-ctrl-web,
      #${APP}-player .bpx-player-ctrl-web-enter,
      #${APP}-player .bpx-player-ctrl-web-leave,
      #${APP}-player .bilibili-player-video-btn-web-fullscreen {
        display: none !important;
      }

      #${APP}-player.bpx-player-web-full,
      #${APP}-player .bpx-player-web-full,
      #${APP}-player.bilibili-player-video-web-fullscreen,
      #${APP}-player .bilibili-player-video-web-fullscreen {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        min-width: 0 !important;
        min-height: 0 !important;
        z-index: 1 !important;
      }

      #${APP}-player.${APP}__live-player-root,
      #${APP}-player #fullscreen-container,
      #${APP}-player #live-player {
        position: relative;
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        background: #000;
      }

      #${APP}-player .${APP}__live-player-controls-layer {
        overflow: visible !important;
      }

      #${APP}-player .${APP}__live-player-only-control {
        position: absolute !important;
        right: 14px;
        bottom: calc(100% + 10px);
        z-index: 60;
        width: 34px;
        height: 34px;
        box-sizing: border-box;
        padding: 0;
        display: inline-grid;
        place-items: center;
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 6px;
        color: rgba(255, 255, 255, 0.92);
        background: rgba(0, 0, 0, 0.56);
        backdrop-filter: blur(8px);
        cursor: pointer;
      }

      #${APP}-player .${APP}__live-player-only-control:hover,
      #${APP}-player .${APP}__live-player-only-control:focus-visible {
        color: #fff;
        border-color: var(--${APP}-brand);
        background: var(--${APP}-brand);
        outline: none;
      }

      #${APP}-player .${APP}__live-player-only-control svg {
        width: 17px;
        height: 17px;
        display: block;
        stroke: currentColor;
      }

      #${APP}-comments {
        display: flex;
        flex-direction: column;
        min-height: 520px;
        padding: 0;
        color: var(--text1, #18191c);
        background: var(--bg1, #fff);
      }

      #${APP}-overlay.${APP}--comments-right #${APP}-comments {
        display: grid;
        grid-template-rows: 42px minmax(0, 1fr);
        min-width: 0;
        min-height: 0;
        height: 100%;
        padding: 0;
        overflow: hidden;
        border-left: 0;
      }

      .${APP}__comments-tabs {
        flex: 0 0 auto;
        display: flex;
        align-items: flex-end;
        gap: 4px;
        box-sizing: border-box;
        min-height: 42px;
        margin: 0;
        padding: 6px 0 0;
        border-bottom: 1px solid var(--line_regular, #e3e5e7);
        background: var(--bg1, #fff);
        overflow: visible;
      }

      #${APP}-overlay.${APP}--comments-right .${APP}__comments-tabs {
        grid-row: 1;
        margin: 0;
        padding: 6px 0 0;
      }

      .${APP}__comments-tab {
        box-sizing: border-box;
        height: 36px;
        padding: 0 4px;
        display: inline-flex;
        align-items: center;
        border: 0;
        border-bottom: 2px solid transparent;
        color: var(--text2, #61666d);
        background: transparent;
        font: 600 16px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: pointer;
      }

      .${APP}__comments-tab[hidden] {
        display: none !important;
      }

      .${APP}__comments-tab:hover,
      .${APP}__comments-tab:focus-visible,
      .${APP}__comments-tab.${APP}--active {
        color: var(--brand_pink, #fb7299);
        outline: none;
      }

      .${APP}__comments-tab.${APP}--active {
        border-bottom-color: var(--brand_pink, #fb7299);
      }

      .${APP}__comments-panel[hidden] {
        display: none !important;
      }

      .${APP}__comments-panel:not([hidden]) {
        min-width: 0;
        min-height: 0;
        flex: 1 1 auto;
        overflow: visible;
      }

      #${APP}-overlay.${APP}--comments-right .${APP}__comments-panel:not([hidden]) {
        grid-row: 2;
        height: 100%;
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
      }

      #${APP}-comments-mount {
        box-sizing: border-box;
        min-height: 360px;
        padding: 8px 18px 0 0;
        color: var(--text1, #18191c);
        background: var(--bg1, #fff);
      }

      #${APP}-overlay.${APP}--comments-right #${APP}-comments-mount {
        padding: 8px 16px 0 0;
      }

      .${APP}__video-intro {
        box-sizing: border-box;
        margin: 0 18px 0 0;
        padding: 14px 0 16px;
        color: var(--text1, #18191c);
        border-bottom: 1px solid var(--line_regular, #e3e5e7);
        background: var(--bg1, #fff);
      }

      #${APP}-overlay.${APP}--comments-right .${APP}__video-intro {
        margin-right: 16px;
      }

      .${APP}__video-intro-up {
        display: grid;
        grid-template-columns: 40px minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
        min-width: 0;
      }

      .${APP}__video-intro-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        object-fit: cover;
        background: var(--graph_bg_thin, #f1f2f3);
      }

      .${APP}__video-intro-main {
        min-width: 0;
      }

      .${APP}__video-intro-name {
        display: block;
        overflow: hidden;
        color: var(--text1, #18191c);
        font: 600 14px/20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        text-decoration: none;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .${APP}__video-intro-name:hover,
      .${APP}__video-intro-name:focus-visible {
        color: var(--brand_pink, #fb7299);
        outline: none;
      }

      .${APP}__video-intro-meta {
        overflow: hidden;
        color: var(--text3, #9499a0);
        font: 400 12px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .${APP}__video-intro-owner-desc {
        display: -webkit-box;
        margin-top: 3px;
        overflow: hidden;
        color: var(--text2, #61666d);
        font: 400 12px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        overflow-wrap: anywhere;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }

      .${APP}__video-intro-follow {
        position: relative;
        height: 30px;
        min-width: 58px;
        padding: 0 14px;
        border: 0;
        border-radius: 4px;
        color: #fff;
        background: var(--brand_pink, #fb7299);
        font: 600 13px/30px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease;
      }

      .${APP}__video-intro-follow::after {
        content: attr(data-label);
      }

      .${APP}__video-intro-follow:hover,
      .${APP}__video-intro-follow:focus-visible {
        background: #ff85ad;
        outline: none;
      }

      .${APP}__video-intro-follow--active {
        color: var(--text2, #61666d);
        background: var(--graph_bg_thick, #e3e5e7);
      }

      .${APP}__video-intro-follow--active:hover,
      .${APP}__video-intro-follow--active:focus-visible {
        color: #fff;
        background: #9499a0;
      }

      .${APP}__video-intro-follow--active:hover::after,
      .${APP}__video-intro-follow--active:focus-visible::after {
        content: attr(data-hover-label);
      }

      .${APP}__video-intro-follow:disabled {
        color: var(--text3, #9499a0);
        background: var(--graph_bg_thick, #e3e5e7);
        cursor: default;
      }

      .${APP}__video-intro-desc {
        margin-top: 12px;
      }

      .${APP}__video-intro-desc-title {
        margin-bottom: 5px;
        color: var(--text2, #61666d);
        font: 600 13px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .${APP}__video-intro-desc-text {
        max-height: 144px;
        overflow: auto;
        color: var(--text2, #61666d);
        font: 400 13px/20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }

      .${APP}__playlist {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 0 28px;
        padding: 12px 0 24px;
      }

      #${APP}-overlay.${APP}--comments-right .${APP}__playlist {
        grid-template-columns: 1fr;
      }

      .${APP}__playlist-card {
        appearance: none;
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        display: grid;
        grid-template-columns: clamp(112px, 30%, 156px) minmax(0, 1fr);
        column-gap: 12px;
        align-items: start;
        padding: 12px 16px;
        border: 0;
        border-bottom: 1px solid var(--line_regular, #e3e5e7);
        border-radius: 0;
        color: var(--text1, #18191c);
        background: transparent;
        text-align: left;
        text-indent: 0;
        font: inherit;
        cursor: pointer;
      }

      .${APP}__playlist-card:hover,
      .${APP}__playlist-card:focus-visible,
      .${APP}__playlist-card.${APP}--selected {
        outline: none;
      }

      .${APP}__playlist-card:last-child {
        border-bottom: 0;
      }

      .${APP}__playlist-card.${APP}--selected {
        color: var(--brand_blue, #00aeec);
        background: transparent;
      }

      .${APP}__playlist-card:hover .${APP}__playlist-title,
      .${APP}__playlist-card:focus-visible .${APP}__playlist-title,
      .${APP}__playlist-card.${APP}--selected .${APP}__playlist-title {
        color: var(--brand_blue, #00aeec);
      }

      .${APP}__playlist-card.${APP}--selected .${APP}__playlist-subtitle,
      .${APP}__playlist-card.${APP}--selected .${APP}__playlist-stats {
        color: var(--text2, #61666d);
      }

      .${APP}__playlist-playing {
        width: 16px;
        height: 16px;
        display: inline-block;
        margin: 0 4px 0 0;
        vertical-align: -3px;
      }

      .${APP}__playlist-cover {
        position: relative;
        z-index: 0;
        min-width: 0;
        width: 100%;
        aspect-ratio: 16 / 9;
        overflow: hidden;
        border-radius: 6px;
        background: var(--bg2, #f6f7f8);
      }

      .${APP}__playlist-cover img {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
      }

      .${APP}__playlist-duration {
        position: absolute;
        right: 4px;
        bottom: 4px;
        height: 18px;
        padding: 0 5px;
        border-radius: 3px;
        color: #fff;
        background: rgba(0, 0, 0, 0.72);
        font: 500 12px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .${APP}__playlist-info {
        position: relative;
        z-index: 1;
        width: 100%;
        min-width: 0;
        max-width: 100%;
        overflow: visible;
        padding: 1px 2px 0 1px;
        display: grid;
        align-content: start;
        gap: 6px;
      }

      .${APP}__playlist-title {
        width: 100%;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 6px;
        overflow: hidden;
        overflow-wrap: anywhere;
        word-break: break-word;
        color: var(--text1, #18191c);
        font: 500 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .${APP}__playlist-title-text {
        min-width: 0;
        flex: 1 1 auto;
        overflow: hidden;
        overflow-wrap: anywhere;
        word-break: break-word;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }

      .${APP}__playlist-last-played {
        flex: 0 0 auto;
        height: 18px;
        display: inline-flex;
        align-items: center;
        padding: 0 5px;
        border-radius: 3px;
        color: var(--brand_blue, #00aeec);
        background: color-mix(in srgb, var(--brand_blue, #00aeec) 12%, transparent);
        font: 500 11px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .${APP}__playlist-subtitle,
      .${APP}__playlist-stats,
      .${APP}__playlist-empty {
        color: var(--text3, #9499a0);
        font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .${APP}__playlist-subtitle,
      .${APP}__playlist-stats {
        max-width: 100%;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .${APP}__playlist-stats {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .${APP}__playlist-stat {
        min-width: 0;
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }

      .${APP}__playlist-stat-icon {
        width: 16px;
        height: 16px;
        flex: 0 0 auto;
        color: currentColor;
      }

      .${APP}__playlist-card--skeleton {
        cursor: default;
        pointer-events: none;
      }

      .${APP}__playlist-skeleton-cover,
      .${APP}__playlist-skeleton-line {
        position: relative;
        overflow: hidden;
        border-radius: 6px;
        background: var(--graph_bg_regular, var(--bg2, #f1f2f3));
      }

      .${APP}__playlist-skeleton-cover {
        width: 100%;
        aspect-ratio: 16 / 9;
      }

      .${APP}__playlist-skeleton-info {
        min-width: 0;
        display: grid;
        align-content: start;
        gap: 9px;
        padding-top: 2px;
      }

      .${APP}__playlist-skeleton-line {
        height: 12px;
      }

      .${APP}__playlist-skeleton-line--title {
        height: 16px;
      }

      .${APP}__playlist-skeleton-cover::after,
      .${APP}__playlist-skeleton-line::after {
        content: "";
        position: absolute;
        inset: 0;
        transform: translateX(-100%);
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.34), transparent);
        animation: ${APP}-skeleton-shimmer 1.25s ease-in-out infinite;
      }

      @keyframes ${APP}-skeleton-shimmer {
        100% {
          transform: translateX(100%);
        }
      }

      body.${APP}--modal-open .bili-comments-bottom-fixed-wrapper,
      body.${APP}--modal-open [class*="bottom-fixed"],
      body.${APP}--modal-open [class*="fixed-wrapper"],
      #${APP}-overlay .bili-comments-bottom-fixed-wrapper,
      #${APP}-overlay [class*="bottom-fixed"],
      #${APP}-overlay [class*="fixed-wrapper"],
      .${APP}__bottom-fixed-hidden {
        display: none !important;
      }

      @media (max-width: 900px) {
        #${APP}-overlay.${APP}--comments-right #${APP}-content {
          display: block;
          overflow-x: hidden;
          overflow-y: auto;
        }

        #${APP}-overlay.${APP}--comments-right #${APP}-comments-resizer {
          display: none;
        }

        #${APP}-overlay.${APP}--comments-right #${APP}-player-wrap {
          height: calc(min(960px, calc(100vh - clamp(96px, 12vh, 220px))) - 46px);
        }

        #${APP}-overlay.${APP}--comments-right #${APP}-comments {
          height: auto;
          overflow: visible;
          border-left: 0;
        }
      }
`;
    targetDocument.head.appendChild(style);
  }

  const memo = fn => createMemo(() => fn());
  function reconcileArrays(parentNode, a, b) {
    let bLength = b.length,
      aEnd = a.length,
      bEnd = bLength,
      aStart = 0,
      bStart = 0,
      after = a[aEnd - 1].nextSibling,
      map = null;
    while (aStart < aEnd || bStart < bEnd) {
      if (a[aStart] === b[bStart]) {
        aStart++;
        bStart++;
        continue;
      }
      while (a[aEnd - 1] === b[bEnd - 1]) {
        aEnd--;
        bEnd--;
      }
      if (aEnd === aStart) {
        const node = bEnd < bLength ? bStart ? b[bStart - 1].nextSibling : b[bEnd - bStart] : after;
        while (bStart < bEnd) parentNode.insertBefore(b[bStart++], node);
      } else if (bEnd === bStart) {
        while (aStart < aEnd) {
          if (!map || !map.has(a[aStart])) a[aStart].remove();
          aStart++;
        }
      } else if (a[aStart] === b[bEnd - 1] && b[bStart] === a[aEnd - 1]) {
        const node = a[--aEnd].nextSibling;
        parentNode.insertBefore(b[bStart++], a[aStart++].nextSibling);
        parentNode.insertBefore(b[--bEnd], node);
        a[aEnd] = b[bEnd];
      } else {
        if (!map) {
          map = new Map();
          let i = bStart;
          while (i < bEnd) map.set(b[i], i++);
        }
        const index = map.get(a[aStart]);
        if (index != null) {
          if (bStart < index && index < bEnd) {
            let i = aStart,
              sequence = 1,
              t;
            while (++i < aEnd && i < bEnd) {
              if ((t = map.get(a[i])) == null || t !== index + sequence) break;
              sequence++;
            }
            if (sequence > index - bStart) {
              const node = a[aStart];
              while (bStart < index) parentNode.insertBefore(b[bStart++], node);
            } else parentNode.replaceChild(b[bStart++], a[aStart++]);
          } else aStart++;
        } else a[aStart++].remove();
      }
    }
  }
  const $$EVENTS = "_$DX_DELEGATE";
  function render(code, element, init, options = {}) {
    let disposer;
    createRoot(dispose => {
      disposer = dispose;
      element === document ? code() : insert(element, code(), element.firstChild ? null : undefined, init);
    }, options.owner);
    return () => {
      disposer();
      element.textContent = "";
    };
  }
  function template(html, isImportNode, isSVG, isMathML) {
    let node;
    const create = () => {
      const t = document.createElement("template");
      t.innerHTML = html;
      return t.content.firstChild;
    };
    const fn = () => (node || (node = create())).cloneNode(true);
    fn.cloneNode = fn;
    return fn;
  }
  function delegateEvents(eventNames, document = window.document) {
    const e = document[$$EVENTS] || (document[$$EVENTS] = new Set());
    for (let i = 0, l = eventNames.length; i < l; i++) {
      const name = eventNames[i];
      if (!e.has(name)) {
        e.add(name);
        document.addEventListener(name, eventHandler);
      }
    }
  }
  function setAttribute(node, name, value) {
    if (value == null) node.removeAttribute(name);else node.setAttribute(name, value);
  }
  function className(node, value) {
    if (value == null) node.removeAttribute("class");else node.className = value;
  }
  function use(fn, element, arg) {
    return untrack(() => fn(element, arg));
  }
  function insert(parent, accessor, marker, initial) {
    if (marker !== undefined && !initial) initial = [];
    if (typeof accessor !== "function") return insertExpression(parent, accessor, initial, marker);
    createRenderEffect(current => insertExpression(parent, accessor(), current, marker), initial);
  }
  function eventHandler(e) {
    let node = e.target;
    const key = `$$${e.type}`;
    const oriTarget = e.target;
    const oriCurrentTarget = e.currentTarget;
    const retarget = value => Object.defineProperty(e, "target", {
      configurable: true,
      value
    });
    const handleNode = () => {
      const handler = node[key];
      if (handler && !node.disabled) {
        const data = node[`${key}Data`];
        data !== undefined ? handler.call(node, data, e) : handler.call(node, e);
        if (e.cancelBubble) return;
      }
      node.host && typeof node.host !== "string" && !node.host._$host && node.contains(e.target) && retarget(node.host);
      return true;
    };
    const walkUpTree = () => {
      while (handleNode() && (node = node._$host || node.parentNode || node.host));
    };
    Object.defineProperty(e, "currentTarget", {
      configurable: true,
      get() {
        return node || document;
      }
    });
    if (e.composedPath) {
      const path = e.composedPath();
      retarget(path[0]);
      for (let i = 0; i < path.length - 2; i++) {
        node = path[i];
        if (!handleNode()) break;
        if (node._$host) {
          node = node._$host;
          walkUpTree();
          break;
        }
        if (node.parentNode === oriCurrentTarget) {
          break;
        }
      }
    } else walkUpTree();
    retarget(oriTarget);
  }
  function insertExpression(parent, value, current, marker, unwrapArray) {
    while (typeof current === "function") current = current();
    if (value === current) return current;
    const t = typeof value,
      multi = marker !== undefined;
    parent = multi && current[0] && current[0].parentNode || parent;
    if (t === "string" || t === "number") {
      if (t === "number") {
        value = value.toString();
        if (value === current) return current;
      }
      if (multi) {
        let node = current[0];
        if (node && node.nodeType === 3) {
          node.data !== value && (node.data = value);
        } else node = document.createTextNode(value);
        current = cleanChildren(parent, current, marker, node);
      } else {
        if (current !== "" && typeof current === "string") {
          current = parent.firstChild.data = value;
        } else current = parent.textContent = value;
      }
    } else if (value == null || t === "boolean") {
      current = cleanChildren(parent, current, marker);
    } else if (t === "function") {
      createRenderEffect(() => {
        let v = value();
        while (typeof v === "function") v = v();
        current = insertExpression(parent, v, current, marker);
      });
      return () => current;
    } else if (Array.isArray(value)) {
      const array = [];
      const currentArray = current && Array.isArray(current);
      if (normalizeIncomingArray(array, value, current, unwrapArray)) {
        createRenderEffect(() => current = insertExpression(parent, array, current, marker, true));
        return () => current;
      }
      if (array.length === 0) {
        current = cleanChildren(parent, current, marker);
        if (multi) return current;
      } else if (currentArray) {
        if (current.length === 0) {
          appendNodes(parent, array, marker);
        } else reconcileArrays(parent, current, array);
      } else {
        current && cleanChildren(parent);
        appendNodes(parent, array);
      }
      current = array;
    } else if (value.nodeType) {
      if (Array.isArray(current)) {
        if (multi) return current = cleanChildren(parent, current, marker, value);
        cleanChildren(parent, current, null, value);
      } else if (current == null || current === "" || !parent.firstChild) {
        parent.appendChild(value);
      } else parent.replaceChild(value, parent.firstChild);
      current = value;
    } else ;
    return current;
  }
  function normalizeIncomingArray(normalized, array, current, unwrap) {
    let dynamic = false;
    for (let i = 0, len = array.length; i < len; i++) {
      let item = array[i],
        prev = current && current[normalized.length],
        t;
      if (item == null || item === true || item === false) ;else if ((t = typeof item) === "object" && item.nodeType) {
        normalized.push(item);
      } else if (Array.isArray(item)) {
        dynamic = normalizeIncomingArray(normalized, item, prev) || dynamic;
      } else if (t === "function") {
        if (unwrap) {
          while (typeof item === "function") item = item();
          dynamic = normalizeIncomingArray(normalized, Array.isArray(item) ? item : [item], Array.isArray(prev) ? prev : [prev]) || dynamic;
        } else {
          normalized.push(item);
          dynamic = true;
        }
      } else {
        const value = String(item);
        if (prev && prev.nodeType === 3 && prev.data === value) normalized.push(prev);else normalized.push(document.createTextNode(value));
      }
    }
    return dynamic;
  }
  function appendNodes(parent, array, marker = null) {
    for (let i = 0, len = array.length; i < len; i++) parent.insertBefore(array[i], marker);
  }
  function cleanChildren(parent, current, marker, replacement) {
    if (marker === undefined) return parent.textContent = "";
    const node = replacement || document.createTextNode("");
    if (current.length) {
      let inserted = false;
      for (let i = current.length - 1; i >= 0; i--) {
        const el = current[i];
        if (node !== el) {
          const isParent = el.parentNode === parent;
          if (!inserted && !i) isParent ? parent.replaceChild(node, el) : parent.insertBefore(node, marker);else isParent && el.remove();
        } else inserted = true;
      }
    } else parent.insertBefore(node, marker);
    return [node];
  }

  var _tmpl$ = /*#__PURE__*/template(`<div role=dialog aria-modal=true data-backdrop-pointer=0><section><header><div><button type=button title=上一次播放 aria-label=上一次播放></button><button type=button title=下一次播放 aria-label=下一次播放></button></div><div></div><div></div><div><span role=status aria-live=polite></span><button type=button title="自动联播。按 J / L 手动切换"aria-label="自动联播。按 J / L 手动切换"></button><button type=button title=打开原播放页 aria-label=打开原播放页></button><button type=button title=网页内全屏 aria-label=网页内全屏></button><button type=button title=重置窗口尺寸 aria-label=重置窗口尺寸></button><button type=button title=关闭 aria-label=关闭首页播放器></button></div></header><div><div><div></div></div><div tabindex=0 role=separator aria-orientation=vertical aria-label=调整评论区宽度></div><section><div><div></div><div></div></div><div><div></div><div>合集加载中...</div></div><div><div></div><div>播放列表加载中...</div></div><div><div></div><div>直播列表加载中...</div></div><div><div></div><div>相关推荐加载中...</div></div></section></div><button type=button title=回到顶部 aria-label=回到顶部></button><button type=button title=调整窗口尺寸 aria-label=调整窗口尺寸>`),
    _tmpl$2 = /*#__PURE__*/template(`<button type=button title="在 Document PiP 打开。建议保持 PiP 窗口常开，后续切视频会更快；关闭后再打开会重新初始化。"aria-label="在 Document PiP 打开。建议保持 PiP 窗口常开，后续切视频会更快；关闭后再打开会重新初始化。">`),
    _tmpl$3 = /*#__PURE__*/template(`<div id=shell><main id=layout><div id=stage><div id=bilibili-player></div></div><div id=comments-resizer tabindex=0 role=separator aria-orientation=vertical aria-label=调整评论区宽度></div><section id=comments><div id=comments-panel><div id=video-intro></div><div id=comments-mount>评论加载中...</div></div><div id=pages-panel><div id=pages-list></div><div id=pages-empty>合集加载中...</div></div><div id=playlist-panel><div id=playlist-list></div><div id=playlist-empty>播放列表加载中...</div></div><div id=live-panel><div id=live-list></div><div id=live-empty>直播列表加载中...</div></div><div id=recommend-panel><div id=recommend-list></div><div id=recommend-empty>相关推荐加载中...</div></div></section></main><button type=button id=back-to-top title=回到顶部 aria-label=回到顶部>`);
  function mountHomePlayerPage({
    targetDocument = document,
    createCommentsTabs,
    onBackToTop,
    onBackdropClose,
    onClose,
    onFullscreen,
    onHistoryNext,
    onHistoryPrevious,
    onOpenOriginal,
    onOpenPip,
    onPlayerControlClick,
    supportsPip = true,
    onResetSize,
    onToggleAutoPlay,
    onModalResizeStart,
    onResizeStart
  }) {
    const mount = targetDocument.createElement('div');
    const refs = {};
    const setRef = key => element => {
      refs[key] = element;
    };
    const commentsTabs = createCommentsTabs(targetDocument, 'home');
    targetDocument.body.appendChild(mount);
    const disposeSolid = render(() => createComponent(HomePlayerPage, {
      commentsTabs: commentsTabs,
      refs: setRef,
      onBackToTop: onBackToTop,
      onBackdropClose: onBackdropClose,
      onClose: onClose,
      onFullscreen: onFullscreen,
      onHistoryNext: onHistoryNext,
      onHistoryPrevious: onHistoryPrevious,
      onOpenOriginal: onOpenOriginal,
      onOpenPip: onOpenPip,
      onPlayerControlClick: onPlayerControlClick,
      supportsPip: supportsPip,
      onResetSize: onResetSize,
      onToggleAutoPlay: onToggleAutoPlay,
      onModalResizeStart: onModalResizeStart,
      onResizeStart: onResizeStart,
      targetDocument: targetDocument
    }), mount);
    return {
      ...refs,
      commentsTabs,
      mount,
      dispose: () => {
        disposeSolid();
        mount.remove();
      }
    };
  }
  function mountPipPlayerPage({
    targetDocument,
    createCommentsTabs
  }) {
    const mount = targetDocument.createElement('div');
    const commentsTabs = createCommentsTabs(targetDocument, 'pip');
    targetDocument.body.appendChild(mount);
    const disposeSolid = render(() => createComponent(PipPlayerPage, {
      commentsTabs: commentsTabs,
      targetDocument: targetDocument
    }), mount);
    return {
      mount,
      dispose: () => {
        disposeSolid();
        mount.remove();
      }
    };
  }
  function HomePlayerPage(props) {
    let backdropPointer = '0';
    const backToTopIcon = props.targetDocument.createElement('template');
    backToTopIcon.innerHTML = arrowUpIconMarkup();
    return (() => {
      var _el$ = _tmpl$(),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.firstChild,
        _el$4 = _el$3.firstChild,
        _el$5 = _el$4.firstChild,
        _el$6 = _el$5.nextSibling,
        _el$7 = _el$4.nextSibling,
        _el$8 = _el$7.nextSibling,
        _el$9 = _el$8.nextSibling,
        _el$0 = _el$9.firstChild,
        _el$1 = _el$0.nextSibling,
        _el$10 = _el$1.nextSibling,
        _el$11 = _el$10.nextSibling,
        _el$12 = _el$11.nextSibling,
        _el$13 = _el$12.nextSibling,
        _el$14 = _el$3.nextSibling,
        _el$15 = _el$14.firstChild,
        _el$16 = _el$15.firstChild,
        _el$17 = _el$15.nextSibling,
        _el$18 = _el$17.nextSibling,
        _el$19 = _el$18.firstChild,
        _el$20 = _el$19.firstChild,
        _el$21 = _el$20.nextSibling,
        _el$22 = _el$19.nextSibling,
        _el$23 = _el$22.firstChild,
        _el$24 = _el$23.nextSibling,
        _el$25 = _el$22.nextSibling,
        _el$26 = _el$25.firstChild,
        _el$27 = _el$26.nextSibling,
        _el$28 = _el$25.nextSibling,
        _el$29 = _el$28.firstChild,
        _el$30 = _el$29.nextSibling,
        _el$31 = _el$28.nextSibling,
        _el$32 = _el$31.firstChild,
        _el$33 = _el$32.nextSibling,
        _el$34 = _el$14.nextSibling,
        _el$35 = _el$34.nextSibling;
      _el$.addEventListener("pointercancel", event => {
        backdropPointer = '0';
        event.currentTarget.dataset.backdropPointer = '0';
      });
      _el$.$$pointerup = event => {
        const startedOnBackdrop = backdropPointer === '1';
        backdropPointer = '0';
        event.currentTarget.dataset.backdropPointer = '0';
        if (startedOnBackdrop && event.target === event.currentTarget) props.onBackdropClose?.();
      };
      _el$.$$pointerdown = event => {
        backdropPointer = event.target === event.currentTarget ? '1' : '0';
        event.currentTarget.dataset.backdropPointer = backdropPointer;
      };
      var _ref$ = props.refs('overlay');
      typeof _ref$ === "function" && use(_ref$, _el$);
      setAttribute(_el$, "id", `${APP}-overlay`);
      var _ref$2 = props.refs('dialog');
      typeof _ref$2 === "function" && use(_ref$2, _el$2);
      setAttribute(_el$2, "id", `${APP}-dialog`);
      setAttribute(_el$3, "id", `${APP}-header`);
      className(_el$4, `${APP}__header-history`);
      _el$5.$$click = () => props.onHistoryPrevious?.();
      var _ref$3 = props.refs('historyPrevious');
      typeof _ref$3 === "function" && use(_ref$3, _el$5);
      className(_el$5, `${APP}__header-button`);
      insert(_el$5, createHistoryBackIcon);
      _el$6.$$click = () => props.onHistoryNext?.();
      var _ref$4 = props.refs('historyNext');
      typeof _ref$4 === "function" && use(_ref$4, _el$6);
      className(_el$6, `${APP}__header-button`);
      insert(_el$6, createHistoryForwardIcon);
      var _ref$5 = props.refs('title');
      typeof _ref$5 === "function" && use(_ref$5, _el$7);
      setAttribute(_el$7, "id", `${APP}-title`);
      var _ref$6 = props.refs('status');
      typeof _ref$6 === "function" && use(_ref$6, _el$8);
      setAttribute(_el$8, "id", `${APP}-status`);
      className(_el$9, `${APP}__header-actions`);
      var _ref$7 = props.refs('autoPlayHint');
      typeof _ref$7 === "function" && use(_ref$7, _el$0);
      className(_el$0, `${APP}__auto-play-hint`);
      _el$1.$$click = () => props.onToggleAutoPlay?.();
      var _ref$8 = props.refs('autoPlayNext');
      typeof _ref$8 === "function" && use(_ref$8, _el$1);
      className(_el$1, `${APP}__header-button`);
      insert(_el$1, createAutoPlayIcon);
      insert(_el$9, (() => {
        var _c$ = memo(() => !!props.supportsPip);
        return () => _c$() && (() => {
          var _el$36 = _tmpl$2();
          _el$36.$$click = () => props.onOpenPip?.();
          var _ref$33 = props.refs('openPip');
          typeof _ref$33 === "function" && use(_ref$33, _el$36);
          className(_el$36, `${APP}__header-button`);
          insert(_el$36, createPictureInPictureIcon);
          return _el$36;
        })();
      })(), _el$10);
      _el$10.$$click = event => props.onOpenOriginal?.(event.currentTarget.dataset.href);
      var _ref$9 = props.refs('openOriginal');
      typeof _ref$9 === "function" && use(_ref$9, _el$10);
      className(_el$10, `${APP}__header-button`);
      insert(_el$10, createExternalLinkIcon);
      _el$11.$$click = () => props.onFullscreen?.();
      var _ref$0 = props.refs('fullscreen');
      typeof _ref$0 === "function" && use(_ref$0, _el$11);
      className(_el$11, `${APP}__header-button`);
      insert(_el$11, createMaximizeIcon);
      _el$12.$$click = () => props.onResetSize?.();
      var _ref$1 = props.refs('resetSize');
      typeof _ref$1 === "function" && use(_ref$1, _el$12);
      className(_el$12, `${APP}__header-button`);
      insert(_el$12, createResetSizeIcon);
      _el$13.$$click = () => props.onClose?.();
      var _ref$10 = props.refs('close');
      typeof _ref$10 === "function" && use(_ref$10, _el$13);
      className(_el$13, `${APP}__header-button ${APP}__header-button--close`);
      insert(_el$13, createCloseIcon);
      var _ref$11 = props.refs('content');
      typeof _ref$11 === "function" && use(_ref$11, _el$14);
      setAttribute(_el$14, "id", `${APP}-content`);
      var _ref$12 = props.refs('playerWrap');
      typeof _ref$12 === "function" && use(_ref$12, _el$15);
      setAttribute(_el$15, "id", `${APP}-player-wrap`);
      _el$16.addEventListener("clickcapture", event => props.onPlayerControlClick?.(event));
      var _ref$13 = props.refs('playerRoot');
      typeof _ref$13 === "function" && use(_ref$13, _el$16);
      setAttribute(_el$16, "id", `${APP}-player`);
      _el$17.$$pointerdown = event => props.onResizeStart?.(event);
      var _ref$14 = props.refs('commentsResizer');
      typeof _ref$14 === "function" && use(_ref$14, _el$17);
      setAttribute(_el$17, "id", `${APP}-comments-resizer`);
      var _ref$15 = props.refs('comments');
      typeof _ref$15 === "function" && use(_ref$15, _el$18);
      setAttribute(_el$18, "id", `${APP}-comments`);
      insert(_el$18, () => props.commentsTabs, _el$19);
      var _ref$16 = props.refs('commentsPanel');
      typeof _ref$16 === "function" && use(_ref$16, _el$19);
      setAttribute(_el$19, "id", `${APP}-comments-panel`);
      className(_el$19, `${APP}__comments-panel`);
      var _ref$17 = props.refs('videoIntro');
      typeof _ref$17 === "function" && use(_ref$17, _el$20);
      setAttribute(_el$20, "id", `${APP}-video-intro`);
      var _ref$18 = props.refs('commentsMount');
      typeof _ref$18 === "function" && use(_ref$18, _el$21);
      setAttribute(_el$21, "id", `${APP}-comments-mount`);
      var _ref$19 = props.refs('pagesPanel');
      typeof _ref$19 === "function" && use(_ref$19, _el$22);
      setAttribute(_el$22, "id", `${APP}-pages-panel`);
      className(_el$22, `${APP}__comments-panel`);
      var _ref$20 = props.refs('pagesList');
      typeof _ref$20 === "function" && use(_ref$20, _el$23);
      setAttribute(_el$23, "id", `${APP}-pages-list`);
      className(_el$23, `${APP}__playlist`);
      var _ref$21 = props.refs('pagesEmpty');
      typeof _ref$21 === "function" && use(_ref$21, _el$24);
      setAttribute(_el$24, "id", `${APP}-pages-empty`);
      className(_el$24, `${APP}__playlist-empty`);
      var _ref$22 = props.refs('playlistPanel');
      typeof _ref$22 === "function" && use(_ref$22, _el$25);
      setAttribute(_el$25, "id", `${APP}-playlist-panel`);
      className(_el$25, `${APP}__comments-panel`);
      var _ref$23 = props.refs('playlistList');
      typeof _ref$23 === "function" && use(_ref$23, _el$26);
      setAttribute(_el$26, "id", `${APP}-playlist-list`);
      className(_el$26, `${APP}__playlist`);
      var _ref$24 = props.refs('playlistEmpty');
      typeof _ref$24 === "function" && use(_ref$24, _el$27);
      setAttribute(_el$27, "id", `${APP}-playlist-empty`);
      className(_el$27, `${APP}__playlist-empty`);
      var _ref$25 = props.refs('livePanel');
      typeof _ref$25 === "function" && use(_ref$25, _el$28);
      setAttribute(_el$28, "id", `${APP}-live-panel`);
      className(_el$28, `${APP}__comments-panel`);
      var _ref$26 = props.refs('liveList');
      typeof _ref$26 === "function" && use(_ref$26, _el$29);
      setAttribute(_el$29, "id", `${APP}-live-list`);
      className(_el$29, `${APP}__playlist`);
      var _ref$27 = props.refs('liveEmpty');
      typeof _ref$27 === "function" && use(_ref$27, _el$30);
      setAttribute(_el$30, "id", `${APP}-live-empty`);
      className(_el$30, `${APP}__playlist-empty`);
      var _ref$28 = props.refs('recommendPanel');
      typeof _ref$28 === "function" && use(_ref$28, _el$31);
      setAttribute(_el$31, "id", `${APP}-recommend-panel`);
      className(_el$31, `${APP}__comments-panel`);
      var _ref$29 = props.refs('recommendList');
      typeof _ref$29 === "function" && use(_ref$29, _el$32);
      setAttribute(_el$32, "id", `${APP}-recommend-list`);
      className(_el$32, `${APP}__playlist`);
      var _ref$30 = props.refs('recommendEmpty');
      typeof _ref$30 === "function" && use(_ref$30, _el$33);
      setAttribute(_el$33, "id", `${APP}-recommend-empty`);
      className(_el$33, `${APP}__playlist-empty`);
      _el$34.$$click = () => props.onBackToTop?.();
      var _ref$31 = props.refs('backToTop');
      typeof _ref$31 === "function" && use(_ref$31, _el$34);
      className(_el$34, `${APP}__back-to-top`);
      insert(_el$34, () => backToTopIcon.content.firstElementChild);
      _el$35.$$pointerdown = event => props.onModalResizeStart?.(event);
      var _ref$32 = props.refs('modalResizeHandle');
      typeof _ref$32 === "function" && use(_ref$32, _el$35);
      className(_el$35, `${APP}__modal-resize-handle`);
      return _el$;
    })();
  }
  function PipPlayerPage(props) {
    const backToTopIcon = props.targetDocument.createElement('template');
    backToTopIcon.innerHTML = arrowUpIconMarkup();
    return (() => {
      var _el$37 = _tmpl$3(),
        _el$38 = _el$37.firstChild,
        _el$39 = _el$38.firstChild,
        _el$40 = _el$39.nextSibling,
        _el$41 = _el$40.nextSibling,
        _el$42 = _el$41.firstChild,
        _el$43 = _el$42.nextSibling,
        _el$44 = _el$43.firstChild,
        _el$45 = _el$44.nextSibling,
        _el$46 = _el$43.nextSibling,
        _el$47 = _el$46.firstChild,
        _el$48 = _el$47.nextSibling,
        _el$49 = _el$46.nextSibling,
        _el$50 = _el$49.firstChild,
        _el$51 = _el$50.nextSibling,
        _el$52 = _el$49.nextSibling,
        _el$53 = _el$52.firstChild,
        _el$54 = _el$53.nextSibling,
        _el$55 = _el$38.nextSibling;
      insert(_el$41, () => props.commentsTabs, _el$42);
      className(_el$42, `${APP}__comments-panel`);
      className(_el$43, `${APP}__comments-panel`);
      className(_el$44, `${APP}__playlist`);
      className(_el$45, `${APP}__playlist-empty`);
      className(_el$46, `${APP}__comments-panel`);
      className(_el$47, `${APP}__playlist`);
      className(_el$48, `${APP}__playlist-empty`);
      className(_el$49, `${APP}__comments-panel`);
      className(_el$50, `${APP}__playlist`);
      className(_el$51, `${APP}__playlist-empty`);
      className(_el$52, `${APP}__comments-panel`);
      className(_el$53, `${APP}__playlist`);
      className(_el$54, `${APP}__playlist-empty`);
      className(_el$55, `${APP}__back-to-top`);
      insert(_el$55, () => backToTopIcon.content.firstElementChild);
      return _el$37;
    })();
  }
  delegateEvents(["pointerdown", "pointerup", "click"]);

  function renderPipPlayerDocument({
    title,
    stylesheets,
    themeClassMarkup,
    commentLayoutClass
  }) {
    return `<!doctype html>
<html${themeClassMarkup}>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title || 'Bilibili 小窗播放')}</title>
    ${renderStylesheetLinks(stylesheets)}
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background: #000;
      }
      body {
        overflow: hidden;
        color: var(--text1, #18191c);
      }
      #shell {
        width: 100vw;
        height: 100vh;
        background: #000;
      }
      #layout {
        position: relative;
        min-width: 0;
        min-height: 0;
        height: 100vh;
      }
      body.comments-bottom #layout {
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      body.comments-right #layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 8px var(--${APP}-comments-width, 420px);
        overflow: hidden;
      }
      body.comments-right #stage {
        grid-column: 1;
        grid-row: 1;
        overflow: hidden;
      }
      #comments-resizer {
        display: none;
      }
      body.comments-right #comments-resizer {
        display: block;
        position: relative;
        grid-column: 2;
        grid-row: 1;
        z-index: 4;
        width: 8px;
        min-width: 8px;
        height: 100vh;
        cursor: col-resize;
        background: var(--bg1, #fff);
      }
      body.comments-right #comments-resizer::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 0;
        width: 1px;
        background: var(--line_regular, rgba(148, 153, 160, 0.36));
      }
      body.comments-right #comments-resizer:hover::before,
      body.comments-right #comments-resizer:focus-visible::before,
      body.resizing-comments #comments-resizer::before {
        background: var(--brand_pink, #fb7299);
      }
      body.comments-right #comments-resizer:focus-visible {
        outline: none;
      }
      #stage {
        position: relative;
        min-width: 0;
        min-height: 0;
        width: 100%;
        height: 100vh;
        background: #000;
      }
      #bilibili-player {
        position: relative;
        width: 100% !important;
        height: 100% !important;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        background: #000;
      }
      #bilibili-player,
      #bilibili-player > *,
      #bilibili-player .bpx-player-container {
        width: 100% !important;
        height: 100% !important;
      }
${getPlayerThemeVariableCss('#bilibili-player')}
      .${APP}__like-burst {
        position: absolute;
        left: 50%;
        top: 50%;
        z-index: 80;
        box-sizing: border-box;
        min-width: 112px;
        height: 46px;
        padding: 0 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 999px;
        color: #fff;
        background: rgba(0, 0, 0, 0.62);
        box-shadow: 0 12px 34px rgba(0, 0, 0, 0.32);
        font: 700 16px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
        pointer-events: none;
        transform: translate(-50%, -50%) scale(0.86);
        animation: ${APP}-like-burst 0.9s ease forwards;
      }
      .${APP}__like-burst--success {
        background: rgba(251, 114, 153, 0.92);
      }
      .${APP}__like-burst--neutral {
        background: rgba(77, 84, 96, 0.9);
      }
      .${APP}__like-burst--error {
        background: rgba(174, 45, 45, 0.92);
      }
      .${APP}__like-burst svg {
        width: 22px;
        height: 22px;
        flex: 0 0 auto;
      }
      @keyframes ${APP}-like-burst {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.72);
        }
        18% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1.06);
        }
        62% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, calc(-50% - 24px)) scale(0.98);
        }
      }
      #comments {
        display: flex;
        flex-direction: column;
        min-height: 520px;
        padding: 0;
        color: var(--text1, #18191c);
        background: var(--bg1, #fff);
      }
      body.comments-right #comments {
        display: grid;
        grid-template-rows: 42px minmax(0, 1fr);
        grid-column: 3;
        grid-row: 1;
        min-width: 0;
        min-height: 0;
        height: 100vh;
        padding: 0 0 0 8px;
        overflow: hidden;
        border-left: 0;
      }
      .${APP}__back-to-top {
        position: fixed;
        right: 28px;
        bottom: 26px;
        z-index: 12;
        width: 38px;
        height: 38px;
        display: grid;
        place-items: center;
        border: 1px solid var(--line_regular, #e3e5e7);
        border-radius: 999px;
        color: var(--text2, #61666d);
        background: var(--bg1, #fff);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
        cursor: pointer;
        opacity: 0;
        pointer-events: none;
        transform: translateY(6px);
        transition: opacity 0.16s ease, transform 0.16s ease, color 0.16s ease, border-color 0.16s ease;
      }
      body.comments-right .${APP}__back-to-top {
        right: 22px;
        bottom: 22px;
      }
      .${APP}__back-to-top.${APP}--visible {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0);
      }
      .${APP}__back-to-top:hover,
      .${APP}__back-to-top:focus-visible {
        color: var(--brand_pink, #fb7299);
        border-color: var(--brand_pink, #fb7299);
        outline: none;
      }
      .${APP}__back-to-top svg {
        width: 18px;
        height: 18px;
        display: block;
        stroke: currentColor;
      }
      #${APP}-pip-controls {
        position: static !important;
        z-index: auto !important;
        transform: none !important;
        display: inline-flex !important;
        align-items: center !important;
        height: 100% !important;
        margin: 0 14px 0 0 !important;
        padding: 0 !important;
        vertical-align: middle !important;
        pointer-events: auto !important;
        flex: 0 0 auto !important;
      }
      #${APP}-pip-controls a {
        all: unset;
        box-sizing: border-box !important;
        position: relative !important;
        top: -8px !important;
        width: auto !important;
        height: 100% !important;
        min-width: auto !important;
        max-width: none !important;
        padding: 0 !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        flex: 0 0 auto !important;
        border: 0 !important;
        color: #fff !important;
        background: transparent !important;
        box-shadow: none !important;
        text-decoration: none !important;
        white-space: nowrap !important;
        font: 600 14px/20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        letter-spacing: 0 !important;
        cursor: pointer !important;
        opacity: 0.92 !important;
        text-shadow: 0 0 2px rgba(0, 0, 0, 0.6) !important;
      }
      #${APP}-pip-controls a:hover,
      #${APP}-pip-controls a:focus-visible {
        color: #fff !important;
        background: transparent !important;
        outline: none !important;
        opacity: 1 !important;
      }
      .${APP}__comments-tabs {
        flex: 0 0 auto;
        display: flex;
        align-items: flex-end;
        gap: 4px;
        box-sizing: border-box;
        min-height: 42px;
        margin: 0;
        padding: 6px 0 0;
        border-bottom: 1px solid var(--line_regular, #e3e5e7);
        background: var(--bg1, #fff);
        overflow: visible;
      }
      body.comments-right .${APP}__comments-tabs {
        grid-row: 1;
        margin: 0;
        padding: 6px 0 0;
      }
      .${APP}__comments-tab {
        box-sizing: border-box;
        height: 36px;
        padding: 0 4px;
        display: inline-flex;
        align-items: center;
        border: 0;
        border-bottom: 2px solid transparent;
        color: var(--text2, #61666d);
        background: transparent;
        font: 600 16px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: pointer;
      }
      .${APP}__comments-tab[hidden] {
        display: none !important;
      }
      .${APP}__comments-tab:hover,
      .${APP}__comments-tab:focus-visible,
      .${APP}__comments-tab.${APP}--active {
        color: var(--brand_pink, #fb7299);
        outline: none;
      }
      .${APP}__comments-tab.${APP}--active {
        border-bottom-color: var(--brand_pink, #fb7299);
      }
      .${APP}__comments-panel[hidden] {
        display: none !important;
      }
      .${APP}__comments-panel:not([hidden]) {
        min-width: 0;
        min-height: 0;
        flex: 1 1 auto;
        overflow: visible;
      }
      body.comments-right .${APP}__comments-panel:not([hidden]) {
        grid-row: 2;
        height: 100%;
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      #comments-mount {
        box-sizing: border-box;
        min-height: 360px;
        padding: 8px 18px 0 0;
        color: var(--text1, #18191c);
        background: var(--bg1, #fff);
      }
      body.comments-right #comments-mount {
        padding: 8px 16px 0 0;
      }
      .${APP}__video-intro {
        box-sizing: border-box;
        margin: 0 18px 0 0;
        padding: 14px 0 16px;
        color: var(--text1, #18191c);
        border-bottom: 1px solid var(--line_regular, #e3e5e7);
        background: var(--bg1, #fff);
      }
      body.comments-right .${APP}__video-intro {
        margin-right: 16px;
      }
      .${APP}__video-intro-up {
        display: grid;
        grid-template-columns: 40px minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
        min-width: 0;
      }
      .${APP}__video-intro-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        object-fit: cover;
        background: var(--graph_bg_thin, #f1f2f3);
      }
      .${APP}__video-intro-main {
        min-width: 0;
      }
      .${APP}__video-intro-name {
        display: block;
        overflow: hidden;
        color: var(--text1, #18191c);
        font: 600 14px/20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        text-decoration: none;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .${APP}__video-intro-name:hover,
      .${APP}__video-intro-name:focus-visible {
        color: var(--brand_pink, #fb7299);
        outline: none;
      }
      .${APP}__video-intro-meta {
        overflow: hidden;
        color: var(--text3, #9499a0);
        font: 400 12px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .${APP}__video-intro-owner-desc {
        display: -webkit-box;
        margin-top: 3px;
        overflow: hidden;
        color: var(--text2, #61666d);
        font: 400 12px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        overflow-wrap: anywhere;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }
      .${APP}__video-intro-follow {
        position: relative;
        height: 30px;
        min-width: 58px;
        padding: 0 14px;
        border: 0;
        border-radius: 4px;
        color: #fff;
        background: var(--brand_pink, #fb7299);
        font: 600 13px/30px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease;
      }
      .${APP}__video-intro-follow::after {
        content: attr(data-label);
      }
      .${APP}__video-intro-follow:hover,
      .${APP}__video-intro-follow:focus-visible {
        background: #ff85ad;
        outline: none;
      }
      .${APP}__video-intro-follow--active {
        color: var(--text2, #61666d);
        background: var(--graph_bg_thick, #e3e5e7);
      }
      .${APP}__video-intro-follow--active:hover,
      .${APP}__video-intro-follow--active:focus-visible {
        color: #fff;
        background: #9499a0;
      }
      .${APP}__video-intro-follow--active:hover::after,
      .${APP}__video-intro-follow--active:focus-visible::after {
        content: attr(data-hover-label);
      }
      .${APP}__video-intro-follow:disabled {
        color: var(--text3, #9499a0);
        background: var(--graph_bg_thick, #e3e5e7);
        cursor: default;
      }
      .${APP}__video-intro-desc {
        margin-top: 12px;
      }
      .${APP}__video-intro-desc-title {
        margin-bottom: 5px;
        color: var(--text2, #61666d);
        font: 600 13px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .${APP}__video-intro-desc-text {
        max-height: 144px;
        overflow: auto;
        color: var(--text2, #61666d);
        font: 400 13px/20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .${APP}__playlist {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 0 28px;
        padding: 12px 0 24px;
      }
      body.comments-right .${APP}__playlist {
        grid-template-columns: 1fr;
      }
      .${APP}__playlist-card {
        appearance: none;
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        display: grid;
        grid-template-columns: clamp(112px, 30%, 156px) minmax(0, 1fr);
        column-gap: 12px;
        align-items: start;
        padding: 12px 14px;
        border: 0;
        border-bottom: 1px solid var(--line_regular, #e3e5e7);
        border-radius: 0;
        color: var(--text1, #18191c);
        background: transparent;
        text-align: left;
        text-indent: 0;
        font: inherit;
        cursor: pointer;
      }
      .${APP}__playlist-card:hover,
      .${APP}__playlist-card:focus-visible,
      .${APP}__playlist-card.${APP}--selected {
        outline: none;
      }
      .${APP}__playlist-card:last-child {
        border-bottom: 0;
      }
      .${APP}__playlist-card.${APP}--selected {
        color: var(--brand_blue, #00aeec);
        background: transparent;
      }
      .${APP}__playlist-card:hover .${APP}__playlist-title,
      .${APP}__playlist-card:focus-visible .${APP}__playlist-title,
      .${APP}__playlist-card.${APP}--selected .${APP}__playlist-title {
        color: var(--brand_blue, #00aeec);
      }
      .${APP}__playlist-card.${APP}--selected .${APP}__playlist-subtitle,
      .${APP}__playlist-card.${APP}--selected .${APP}__playlist-stats {
        color: var(--text2, #61666d);
      }
      .${APP}__playlist-playing {
        width: 16px;
        height: 16px;
        display: inline-block;
        margin: 0 4px 0 0;
        vertical-align: -3px;
      }
      .${APP}__playlist-cover {
        position: relative;
        z-index: 0;
        min-width: 0;
        width: 100%;
        aspect-ratio: 16 / 9;
        overflow: hidden;
        border-radius: 6px;
        background: var(--bg2, #f6f7f8);
      }
      .${APP}__playlist-cover img {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
      }
      .${APP}__playlist-duration {
        position: absolute;
        right: 4px;
        bottom: 4px;
        height: 18px;
        padding: 0 5px;
        border-radius: 3px;
        color: #fff;
        background: rgba(0, 0, 0, 0.72);
        font: 500 12px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .${APP}__playlist-info {
        position: relative;
        z-index: 1;
        width: 100%;
        min-width: 0;
        max-width: 100%;
        overflow: visible;
        padding: 1px 2px 0 1px;
        display: grid;
        align-content: start;
        gap: 6px;
      }
      .${APP}__playlist-title {
        width: 100%;
        min-width: 0;
        overflow: hidden;
        overflow-wrap: anywhere;
        word-break: break-word;
        color: var(--text1, #18191c);
        font: 500 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .${APP}__playlist-title-text {
        min-width: 0;
        overflow: hidden;
        overflow-wrap: anywhere;
        word-break: break-word;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      .${APP}__playlist-subtitle,
      .${APP}__playlist-stats,
      .${APP}__playlist-empty {
        color: var(--text3, #9499a0);
        font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .${APP}__playlist-subtitle,
      .${APP}__playlist-stats {
        max-width: 100%;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .${APP}__playlist-stats {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .${APP}__playlist-stat {
        min-width: 0;
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }
      .${APP}__playlist-stat-icon {
        width: 16px;
        height: 16px;
        flex: 0 0 auto;
        color: currentColor;
      }
      .${APP}__playlist-card--skeleton {
        cursor: default;
        pointer-events: none;
      }
      .${APP}__playlist-skeleton-cover,
      .${APP}__playlist-skeleton-line {
        position: relative;
        overflow: hidden;
        border-radius: 6px;
        background: var(--graph_bg_regular, var(--bg2, #f1f2f3));
      }
      .${APP}__playlist-skeleton-cover {
        width: 100%;
        aspect-ratio: 16 / 9;
      }
      .${APP}__playlist-skeleton-info {
        min-width: 0;
        display: grid;
        align-content: start;
        gap: 9px;
        padding-top: 2px;
      }
      .${APP}__playlist-skeleton-line {
        height: 12px;
      }
      .${APP}__playlist-skeleton-line--title {
        height: 16px;
      }
      .${APP}__playlist-skeleton-cover::after,
      .${APP}__playlist-skeleton-line::after {
        content: "";
        position: absolute;
        inset: 0;
        transform: translateX(-100%);
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.34), transparent);
        animation: ${APP}-skeleton-shimmer 1.25s ease-in-out infinite;
      }
      @keyframes ${APP}-skeleton-shimmer {
        100% {
          transform: translateX(100%);
        }
      }
      .${APP}__bottom-fixed-hidden {
        display: none !important;
      }
    </style>
  </head>
  <body class="${commentLayoutClass}"></body>
</html>`;
  }
  function renderLivePipDocument({
    title,
    href,
    themeClassMarkup
  }) {
    return `<!doctype html>
<html${themeClassMarkup}>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title || 'Bilibili 直播小窗')}</title>
    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #000;
      }
      #shell,
      #stage,
      #fullscreen-container,
      #live-player {
        position: relative;
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        background: #000;
      }
      #${APP}-live-original {
        all: unset;
        box-sizing: border-box;
        position: fixed;
        top: 12px;
        right: 12px;
        z-index: 2147482999;
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        border-radius: 8px;
        color: rgba(255, 255, 255, 0.92);
        background: rgba(0, 0, 0, 0.36);
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.16s ease, background 0.16s ease;
      }
      body:hover #${APP}-live-original,
      #${APP}-live-original:focus-visible {
        opacity: 1;
      }
      #${APP}-live-original:hover,
      #${APP}-live-original:focus-visible {
        background: rgba(0, 0, 0, 0.62);
        outline: none;
      }
      #${APP}-live-original svg {
        width: 18px;
        height: 18px;
        display: block;
        stroke: currentColor;
      }
    </style>
  </head>
  <body>
    <div id="shell">
      <div id="stage">
        <div id="fullscreen-container">
          <div id="live-player">
            <div id="fullscreen-danmaku-vm"><fullscreen-danmaku></fullscreen-danmaku></div>
          </div>
        </div>
      </div>
    </div>
    <a id="${APP}-live-original" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" title="打开原直播间" aria-label="打开原直播间">${externalLinkIconMarkup()}</a>
  </body>
</html>`;
  }
  function renderPipLoadingDocument({
    title,
    href,
    stylesheets,
    themeClassMarkup
  }) {
    return `<!doctype html>
<html${themeClassMarkup}>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title || 'Bilibili 小窗播放')}</title>
    ${renderStylesheetLinks(stylesheets)}
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        color: var(--text1, #18191c);
        background: var(--bg1, #fff);
        font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      a {
        position: fixed;
        top: 10px;
        right: 10px;
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        border: 1px solid var(--line_regular, #e3e5e7);
        border-radius: 8px;
        color: var(--text1, #18191c);
        background: var(--bg2, #f6f7f8);
      }
      a svg {
        width: 17px;
        height: 17px;
        display: block;
        stroke: currentColor;
      }
    </style>
  </head>
  <body>${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" title="打开原播放页" aria-label="打开原播放页">${externalLinkIconMarkup()}</a>` : ''}加载中...</body>
</html>`;
  }
  function renderPipErrorDocument({
    error,
    href,
    stylesheets,
    themeClassMarkup
  }) {
    return `<!doctype html>
<html${themeClassMarkup}>
  <head>
    <meta charset="utf-8">
    <title>初始化失败</title>
    ${renderStylesheetLinks(stylesheets)}
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        color: var(--text1, #18191c);
        background: var(--bg1, #fff);
        font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      pre {
        max-width: calc(100vw - 32px);
        white-space: pre-wrap;
      }
      a {
        position: fixed;
        top: 10px;
        right: 10px;
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        border: 1px solid var(--line_regular, #e3e5e7);
        border-radius: 8px;
        color: var(--text1, #18191c);
        background: var(--bg2, #f6f7f8);
      }
      a svg {
        width: 17px;
        height: 17px;
        display: block;
        stroke: currentColor;
      }
    </style>
  </head>
  <body>${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" title="打开原播放页" aria-label="打开原播放页">${externalLinkIconMarkup()}</a>` : ''}<pre>${escapeHtml(error?.message || String(error))}</pre></body>
</html>`;
  }
  function renderStylesheetLinks(stylesheets) {
    return [...new Set(stylesheets || [])].map(href => `<link rel="stylesheet" href="${escapeHtml(href)}">`).join('\n');
  }

  function getTidInfo(channel, tid) {
    if (!channel || !tid) return null;
    for (const item of channel) {
      if (!item?.sub) continue;
      for (const sub of item.sub) {
        if (tid === sub.tid) {
          return {
            name: item.name,
            route: item.route,
            tid: item.tid,
            url: item.url,
            subName: sub.name,
            subRoute: sub.route,
            subUrl: sub.url,
            subTid: sub.tid
          };
        }
      }
    }
    return null;
  }
  function getUpStaffs(staffData) {
    if (!Array.isArray(staffData) || !staffData.length) return null;
    return staffData.map(staff => ({
      face: staff.face,
      mid: staff.mid,
      name: staff.name
    }));
  }
  function compactObject(value) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
  }
  function getStats(stat) {
    return compactObject({
      aid: stat?.aid,
      coin: stat?.coin,
      danmaku: stat?.danmaku,
      dislike: stat?.dislike,
      favorite: stat?.favorite,
      hisRank: stat?.his_rank,
      like: stat?.like,
      nowRank: stat?.now_rank,
      reply: stat?.reply,
      share: stat?.share,
      view: stat?.view,
      vt: stat?.vt
    });
  }
  function isPositiveState(value) {
    return value === true || value === 1 || value === '1';
  }
  function getStoryType(videoData) {
    if (videoData?.ugc_season?.sections?.length) return 2;
    if ((videoData?.pages?.length || 0) > 1) return 1;
    return 0;
  }
  function getPageList(videoData) {
    if (!Array.isArray(videoData?.pages) || !videoData.pages.length) return null;
    return videoData.pages.map((page, index) => ({
      aid: videoData.aid,
      bvid: videoData.bvid,
      cid: page.cid,
      duration: page.duration,
      from: page.from,
      hasNext: index < videoData.pages.length - 1,
      hasPrev: index > 0,
      page: page.page,
      p: page.page || index + 1,
      part: page.part,
      title: page.part
    }));
  }
  function getUpInfo(initialState) {
    const vd = initialState?.videoData || {};
    const upData = initialState?.upData || vd.owner || {};
    if (!upData?.mid) return null;
    const followed = isPositiveState(vd.req_user?.attention ?? upData.followed);
    return {
      attention: upData.attention,
      face: upData.face,
      fans: upData.fans,
      follow: followed,
      followed,
      isFollowed: followed,
      mid: upData.mid,
      name: upData.name,
      officialVerify: upData.official_verify || upData.officialVerify,
      pendant: upData.pendant,
      sign: upData.sign,
      staffs: getUpStaffs(initialState?.staffData || vd.staff),
      vip: upData.vip
    };
  }
  function getManuscriptInfo(initialState) {
    const vd = initialState?.videoData || {};
    return {
      coinDisable: true,
      coinStatus: Number(vd.req_user?.coin) > 0,
      collectDisable: true,
      collectStatus: isPositiveState(vd.req_user?.favorite),
      cover: vd.pic,
      electricStatus: initialState?.elecFullInfo?.show_info?.state,
      likeDisable: true,
      likeIcon: vd.like_icon,
      likeStatus: isPositiveState(vd.req_user?.like),
      list: getPageList(vd),
      related: initialState?.related,
      relatedAutoplay: false,
      stat: vd.stat,
      title: vd.title,
      type: getStoryType(vd)
    };
  }
  function getManuscriptActionState(initialState) {
    const vd = initialState?.videoData || {};
    return {
      coinDisable: true,
      coinStatus: Number(vd.req_user?.coin) > 0,
      collectDisable: true,
      collectStatus: isPositiveState(vd.req_user?.favorite),
      likeDisable: true,
      likeIcon: vd.like_icon,
      likeStatus: isPositiveState(vd.req_user?.like)
    };
  }
  function getPlayerViewInfo(initialState) {
    const vd = initialState?.videoData || {};
    const upInfo = getUpInfo(initialState);
    const manuscriptInfo = getManuscriptInfo(initialState);
    const currentPage = Array.isArray(vd.pages) ? vd.pages.find(page => Number(page.page) === Number(initialState?.p)) || vd.pages[0] : null;
    const tidInfo = getTidInfo(initialState?.channelKv || initialState?.channel, vd.tid_v2) || getTidInfo(initialState?.channelKv || initialState?.channel, vd.tid) || {
      subTid: vd.tid_v2 || vd.tid
    };
    return {
      upInfo,
      storyInfo: {
        aid: vd.aid,
        bvid: vd.bvid,
        cid: currentPage?.cid || vd.cid || initialState?.cid,
        copyright: vd.copyright,
        cover: vd.pic,
        ctime: vd.ctime,
        desc: vd.desc,
        dimension: vd.dimension,
        duration: vd.duration,
        owner: vd.owner,
        pages: vd.pages,
        pic: vd.pic,
        pubdate: vd.pubdate,
        reqUser: vd.req_user,
        req_user: vd.req_user,
        rights: vd.rights,
        state: vd.state,
        stat: vd.stat,
        title: vd.title,
        type: getStoryType(vd),
        tid: tidInfo.tid,
        tidV2: vd.tid_v2,
        tname: vd.tname,
        tnameV2: vd.tname_v2,
        subTid: tidInfo.subTid,
        stats: getStats(vd.stat),
        ...manuscriptInfo
      }
    };
  }
  function getPlayerExternalState(initialState, internalKind = {}) {
    const upInfo = getUpInfo(initialState);
    const manuscriptInfo = getManuscriptActionState(initialState);
    const followKey = internalKind.Follow ?? 3;
    const upInfoKey = internalKind.UpInfo ?? 6;
    const manuscriptKey = internalKind.Manuscript ?? 7;
    const state = {
      [manuscriptKey]: manuscriptInfo
    };
    if (upInfo) {
      state[followKey] = upInfo.follow;
      state[upInfoKey] = upInfo;
    }
    return state;
  }

  async function resolvePlaybackBootstrap(meta) {
    const apiBootstrap = await resolvePlaybackBootstrapFromApis(meta);
    if (apiBootstrap) return apiBootstrap;
    throw new Error('Playback API bootstrap failed');
  }
  async function resolvePlaybackBootstrapFromApis(meta) {
    const bvid = meta.bvid || meta.href?.match(BV_RE)?.[1];
    if (!bvid) return null;
    try {
      const [detailResult, pagelistResult] = await Promise.allSettled([fetchPlaybackJson(`https://api.bilibili.com/x/web-interface/wbi/view/detail?bvid=${encodeURIComponent(bvid)}&need_view=1&platform=web`), fetchPlaybackJson(`https://api.bilibili.com/x/player/pagelist?bvid=${encodeURIComponent(bvid)}`)]);
      if (detailResult.status !== 'fulfilled') return null;
      const detail = detailResult.value?.data || {};
      const vd = normalizeVideoData(detail.View, pagelistResult.status === 'fulfilled' ? pagelistResult.value?.data : null);
      if (!vd?.aid || !vd?.bvid) return null;
      applyDetailCard(vd, detail.Card);
      const pageP = resolveCurrentPage(meta.href, {
        p: 1,
        videoData: vd
      });
      const sequence = resolvePlaybackSequence(vd, pageP);
      const page = getVideoPage(vd, pageP);
      const relatedItems = Array.isArray(detail.Related) ? detail.Related : [];
      const initialState = buildInitialStateFromApis({
        meta,
        p: sequence.p,
        relatedItems,
        videoData: vd
      });
      const recommendationCards = extractPlaylistCardsFromRelatedItems(relatedItems, meta.href, vd.bvid);
      return {
        title: vd.title || meta.title,
        coreScript: CORE_FALLBACK,
        commentScript: COMMENT_FALLBACK,
        stylesheets: [],
        initialState,
        playInfo: null,
        recommendationCards,
        playerInfo: {
          aid: vd.aid,
          bvid: vd.bvid,
          cid: page.cid || vd.cid || initialState.cid,
          p: sequence.p,
          t: 0,
          hasPrev: sequence.hasPrev,
          hasNext: sequence.hasNext,
          seasonId: sequence.seasonId
        },
        href: meta.href,
        commentInfo: {
          params: `1,${vd.aid}`,
          spmPrefix: '333.788',
          cmFromTrackId: new URL(meta.href, location.href).searchParams.get('track_id') || ''
        }
      };
    } catch {
      return null;
    }
  }
  async function fetchPlaybackJson(url) {
    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        accept: 'application/json, text/plain, */*'
      }
    });
    if (!response.ok) throw new Error(`Playback API request failed: ${response.status}`);
    const payload = await response.json();
    if (payload?.code !== 0) throw new Error(payload?.message || `Playback API error: ${payload?.code}`);
    return payload;
  }
  function normalizeVideoData(videoData, pageList) {
    if (!videoData) return null;
    const pages = mergeVideoPages(videoData.pages, pageList);
    return {
      ...videoData,
      pages,
      videos: videoData.videos || pages.length
    };
  }
  function applyDetailCard(videoData, cardInfo) {
    const card = cardInfo?.card || {};
    const owner = videoData.owner || {};
    const mid = Number(card.mid || owner.mid);
    videoData.owner = {
      ...owner,
      __biliPopupPlayerNanoProfileLoaded: cardInfo ? true : owner.__biliPopupPlayerNanoProfileLoaded,
      attention: card.attention ?? owner.attention,
      face: card.face || owner.face,
      fans: cardInfo?.follower ?? card.fans ?? owner.fans,
      mid: Number.isFinite(mid) && mid > 0 ? mid : owner.mid,
      name: card.name || owner.name,
      official_verify: card.official_verify || owner.official_verify,
      pendant: card.pendant || owner.pendant,
      sign: card.sign || owner.sign,
      vip: card.vip || owner.vip
    };
    if (cardInfo && Object.hasOwn(cardInfo, 'following')) {
      videoData.req_user = {
        ...(videoData.req_user || {}),
        attention: cardInfo.following ? 1 : 0
      };
    }
  }
  function mergeVideoPages(primaryPages, pageList) {
    const byPage = new Map();
    const addPage = page => {
      if (!page) return;
      const pageNo = Number(page.page || byPage.size + 1);
      byPage.set(pageNo, {
        ...byPage.get(pageNo),
        ...page,
        page: pageNo
      });
    };
    (Array.isArray(primaryPages) ? primaryPages : []).forEach(addPage);
    (Array.isArray(pageList) ? pageList : []).forEach(addPage);
    return [...byPage.values()].sort((a, b) => Number(a.page || 0) - Number(b.page || 0));
  }
  function buildInitialStateFromApis({
    meta,
    p,
    relatedItems,
    videoData
  }) {
    const page = getVideoPage(videoData, p);
    const owner = videoData.owner || {};
    return {
      aid: videoData.aid,
      bvid: videoData.bvid || meta.bvid,
      cid: page.cid || videoData.cid,
      p,
      videoData,
      related: relatedItems,
      sectionsInfo: videoData.ugc_season || null,
      sectionsFavState: false,
      spmidPrefix: '333.788',
      upData: {
        mid: owner.mid,
        name: owner.name,
        face: owner.face,
        fans: owner.fans,
        sign: owner.sign,
        attention: owner.attention,
        followed: videoData.req_user?.attention,
        official_verify: owner.official_verify,
        pendant: owner.pendant,
        vip: owner.vip
      },
      staffData: videoData.staff || [],
      nanoTheme: getPlayerNanoTheme()
    };
  }
  function resolveCurrentPage(href, initialState) {
    const parsed = new URL(href, location.href);
    const urlPage = Number(parsed.searchParams.get('p') || parsed.searchParams.get('page') || 0);
    const statePage = Number(initialState?.p);
    const page = urlPage || statePage || 1;
    const pageCount = initialState?.videoData?.pages?.length || 0;
    if (!Number.isFinite(page) || page < 1) return 1;
    return pageCount ? Math.min(page, pageCount) : page;
  }
  function getVideoPage(videoData, p) {
    return videoData?.pages?.find(page => Number(page.page) === Number(p)) || videoData?.pages?.[Number(p) - 1] || videoData?.pages?.[0] || {};
  }
  function resolvePlaybackSequence(videoData, pageP) {
    const episodes = getUgcSeasonEpisodes(videoData);
    const currentEpisodeIndex = episodes.findIndex(episode => episode?.bvid && videoData?.bvid && episode.bvid === videoData.bvid || Number(episode?.cid) && Number(videoData?.cid) && Number(episode.cid) === Number(videoData.cid));
    if (currentEpisodeIndex >= 0 && episodes.length > 1) {
      return {
        p: currentEpisodeIndex + 1,
        hasPrev: currentEpisodeIndex > 0,
        hasNext: currentEpisodeIndex < episodes.length - 1,
        seasonId: videoData?.ugc_season?.id || episodes[currentEpisodeIndex]?.season_id
      };
    }
    const pageCount = videoData?.pages?.length || 0;
    return {
      p: pageP,
      hasPrev: pageP > 1,
      hasNext: pageCount > 0 && pageP < pageCount,
      seasonId: videoData?.season_id
    };
  }
  function getUgcSeasonEpisodes(videoData) {
    return (Array.isArray(videoData?.ugc_season?.sections) ? videoData.ugc_season.sections : []).flatMap(section => Array.isArray(section?.episodes) ? section.episodes : []);
  }
  function extractPlaylistCardsFromRelatedItems(items, baseUrl, currentBvid) {
    return (Array.isArray(items) ? items : []).map(item => {
      const bvid = item?.bvid;
      if (!bvid || bvid === currentBvid) return null;
      return {
        bvid,
        href: normalizeVideoHref(item.uri, baseUrl) || normalizeVideoHref(`/video/${bvid}`, baseUrl),
        title: String(item.title || 'Bilibili 视频').replace(/\s+/g, ' ').trim(),
        cover: normalizeResourceUrl(item.pic, baseUrl),
        subtitle: String(item.owner?.name || item.author || '').replace(/\s+/g, ' ').trim(),
        duration: formatDuration(item.duration),
        stats: formatRelatedStats(item)
      };
    }).filter(card => card?.href);
  }
  function formatRelatedStats(item) {
    const view = formatCount$1(item?.stat?.view ?? item?.play);
    const danmaku = formatCount$1(item?.stat?.danmaku ?? item?.video_review);
    return view || danmaku ? {
      view,
      danmaku
    } : '';
  }
  function formatCount$1(value) {
    const count = Number(value);
    if (!Number.isFinite(count) || count <= 0) return '';
    if (count >= 100000000) return `${trimFixed$1(count / 100000000)}亿`;
    if (count >= 10000) return `${trimFixed$1(count / 10000)}万`;
    return String(Math.round(count));
  }
  function trimFixed$1(value) {
    return value.toFixed(1).replace(/\.0$/, '');
  }
  function formatDuration(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return '';
    const total = Math.round(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor(total % 3600 / 60);
    const s = total % 60;
    if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function createRendererOrchestrator({
    getActiveRenderer,
    nextToken,
    isCurrentToken,
    resolveBootstrap,
    saveLastPlayed,
    recordPlaybackHistory
  }) {
    async function openByMode(meta) {
      return openWithRenderer(getActiveRenderer(), meta);
    }
    async function openWithRenderer(renderer, meta) {
      const reusable = renderer.getReusable?.(meta);
      if (reusable) {
        const token = nextToken();
        renderer.reuse(reusable, meta, token);
        return;
      }
      const token = nextToken();
      const context = await renderer.prepare(meta, token);
      if (!context || !isCurrentToken(token)) return;
      try {
        const bootstrap = await resolveBootstrap(meta);
        if (!isCurrentToken(token) || renderer.isClosed(context)) return;
        saveLastPlayed(meta, bootstrap);
        await renderer.play(context, bootstrap, token);
        if (!isCurrentToken(token) || renderer.isClosed(context)) return;
        recordPlaybackHistory(meta, bootstrap);
        renderer.done?.(context, bootstrap);
      } catch (error) {
        if (!isCurrentToken(token) || renderer.isClosed(context)) return;
        renderer.fail(context, error);
      }
    }
    return {
      openByMode,
      openWithRenderer
    };
  }

  function getGmValue(key, fallback = null) {
    if (typeof GM_getValue !== 'function') return fallback;
    try {
      return GM_getValue(key, fallback);
    } catch {
      return fallback;
    }
  }
  function setGmValue(key, value) {
    if (typeof GM_setValue !== 'function') return false;
    try {
      GM_setValue(key, value);
      return true;
    } catch {
      return false;
    }
  }
  function deleteGmValue(key) {
    if (typeof GM_deleteValue !== 'function') return false;
    try {
      GM_deleteValue(key);
      return true;
    } catch {
      return false;
    }
  }
  function getLocalValue(key, fallback = null) {
    try {
      const value = localStorage.getItem(key);
      return value == null ? fallback : value;
    } catch {
      return fallback;
    }
  }
  function getStorageItem(key, fallback = null) {
    const gmValue = getGmValue(key, undefined);
    if (gmValue !== undefined) return gmValue;
    const localValue = getLocalValue(key, fallback);
    if (localValue !== fallback) setGmValue(key, localValue);
    return localValue;
  }
  function setStorageItem(key, value) {
    const stringValue = String(value);
    if (!setGmValue(key, stringValue)) {
      try {
        localStorage.setItem(key, stringValue);
      } catch {
        // Storage can be unavailable in strict privacy modes.
      }
    }
  }
  function removeStorageItem(key) {
    if (!deleteGmValue(key)) {
      try {
        localStorage.removeItem(key);
      } catch {
        // Storage can be unavailable in strict privacy modes.
      }
    }
  }

  function createSettingsUi({
    state,
    getShadowRoot,
    syncCardButtons,
    supportsPip
  }) {
    const [modeSignal, setModeSignal] = createSignal(state.mode);
    const [directClickSignal, setDirectClickSignal] = createSignal(state.directClick);
    const [settingsOpen, setSettingsOpen] = createSignal(false);
    function ensure() {
      if (state.settings?.root?.isConnected) {
        sync();
        return;
      }
      const mount = document.createElement('div');
      getShadowRoot().appendChild(mount);
      const dispose = render(() => createSettingsPanel(), mount);
      state.settings = {
        root: mount,
        dispose
      };
      sync();
    }
    function createSettingsPanel() {
      const root = document.createElement('div');
      root.className = SETTINGS_CLASS;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `${SETTINGS_CLASS}__button`;
      button.title = '小窗播放设置';
      button.setAttribute('aria-label', '小窗播放设置');
      button.appendChild(createSettingsIcon());
      const menu = document.createElement('div');
      menu.className = `${SETTINGS_CLASS}__menu`;
      const supportsDocumentPip = supportsPip?.() !== false;
      const items = [createSettingsLabel('播放模式'), createSettingsOption('mode', 'home', '网页内弹窗')];
      if (supportsDocumentPip) {
        items.push(createSettingsOption('mode', 'pip', 'Document PiP'), createPipModeHint());
      }
      items.push(createSettingsLabel('封面点击'), createSettingsOption('direct', 'off', '按钮起播'), createSettingsOption('direct', 'on', '封面起播'));
      menu.append(...items);
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        setSettingsOpen(open => !open);
      });
      const closeOnDocumentClick = event => {
        const path = event.composedPath?.() || [];
        if (!path.includes(root)) setSettingsOpen(false);
      };
      document.addEventListener('click', closeOnDocumentClick, true);
      onCleanup(() => document.removeEventListener('click', closeOnDocumentClick, true));
      createEffect(() => {
        root.classList.toggle(`${APP}--open`, settingsOpen());
      });
      createEffect(() => {
        const mode = modeSignal();
        const directClick = directClickSignal();
        button.title = `小窗播放设置：${mode === 'pip' ? 'Document PiP' : '网页内弹窗'} / ${directClick ? '封面起播' : '按钮起播'}`;
      });
      root.append(button, menu);
      return root;
    }
    function createSettingsLabel(text) {
      const label = document.createElement('div');
      label.className = `${SETTINGS_CLASS}__label`;
      label.textContent = text;
      return label;
    }
    function createSettingsOption(type, value, text) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = `${SETTINGS_CLASS}__option`;
      option.dataset.type = type;
      option.dataset.value = value;
      if (type === 'mode' && value === 'pip') {
        option.title = '建议保持 PiP 窗口常开，后续切视频会更快';
        option.setAttribute('aria-describedby', `${APP}-pip-mode-hint`);
      }
      option.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (type === 'mode') setPlaybackMode(value);else if (type === 'direct') setDirectCoverClick(value === 'on');
      });
      createEffect(() => {
        const active = type === 'mode' ? modeSignal() === value : type === 'direct' ? directClickSignal() === (value === 'on') : false;
        option.classList.toggle(`${APP}--active`, active);
        option.textContent = active ? `✓ ${text}` : text;
      });
      return option;
    }
    function createPipModeHint() {
      const hint = document.createElement('div');
      hint.id = `${APP}-pip-mode-hint`;
      hint.className = `${SETTINGS_CLASS}__hint`;
      hint.textContent = '建议保持 PiP 窗口常开，后续切视频会直接换源，关闭后再打开会重新初始化。';
      createEffect(() => {
        hint.hidden = modeSignal() !== 'pip';
      });
      return hint;
    }
    function sync() {
      setModeSignal(state.mode);
      setDirectClickSignal(state.directClick);
      syncCardButtons();
    }
    function setPlaybackMode(value) {
      if (value === 'pip' && supportsPip?.() === false) value = 'home';
      state.mode = value;
      setStorageItem(STORAGE_MODE, value);
      setModeSignal(value);
      syncCardButtons();
    }
    function setDirectCoverClick(value) {
      state.directClick = value;
      setStorageItem(STORAGE_DIRECT_CLICK, value ? '1' : '0');
      setDirectClickSignal(value);
      syncCardButtons();
    }
    function destroy() {
      state.settings?.dispose?.();
      state.settings?.root?.remove();
      state.settings = null;
    }
    return {
      ensure,
      sync,
      destroy
    };
  }

  function ensureStylesheetsInWindow(targetWindow, stylesheets) {
    const doc = targetWindow.document;
    const existing = new Set([...doc.querySelectorAll('link[rel~="stylesheet"][href]')].map(link => link.href));
    [...new Set([...stylesheets, ...getBiliThemeStylesheets()])].forEach(href => {
      if (existing.has(href)) return;
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      doc.head.appendChild(link);
    });
  }
  function ensureBiliThemeStylesheets(targetDocument) {
    const existing = new Set([...targetDocument.querySelectorAll('link[rel~="stylesheet"][href]')].map(link => link.href));
    getBiliThemeStylesheets().forEach(href => {
      if (existing.has(href)) return;
      const link = targetDocument.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      targetDocument.head.appendChild(link);
    });
  }
  function getBiliThemeStylesheets() {
    const themeStyle = getThemeStyle();
    if (themeStyle === 'dark') return [`${THEME_BASE}/map.css`, `${THEME_BASE}/light_u.css`, `${THEME_BASE}/dark.css`];
    return [`${THEME_BASE}/map.css`, `${THEME_BASE}/light_u.css`, `${THEME_BASE}/light.css`];
  }
  function getThemeStyle() {
    const value = getCookieValue$1('theme_style');
    if (value === 'dark' || value === 'light') return value;
    const hasDarkTheme = [...document.querySelectorAll('link[rel~="stylesheet"][href]')].some(link => String(link.getAttribute('href')).includes('/bili-theme/dark.css'));
    return hasDarkTheme ? 'dark' : 'light';
  }
  function getCookieValue$1(name) {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : '';
  }

  const OWNER_CARD_API = 'https://api.bilibili.com/x/web-interface/card';
  async function fetchOwnerProfile(mid) {
    const normalizedMid = Number(mid);
    if (!Number.isFinite(normalizedMid) || normalizedMid <= 0) throw new Error('缺少 UP 主 mid');
    const url = new URL(OWNER_CARD_API);
    url.searchParams.set('mid', String(Math.trunc(normalizedMid)));
    url.searchParams.set('photo', 'true');
    const response = await fetch(url.href, {
      credentials: 'include',
      headers: {
        accept: 'application/json, text/plain, */*'
      }
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`请求失败：${response.status}`);
    if (!payload || payload.code !== 0) throw new Error(payload?.message || 'UP 主资料加载失败');
    const card = payload.data?.card || {};
    return {
      attention: card.attention,
      face: String(card.face || ''),
      fans: payload.data?.follower ?? card.fans ?? card.follower,
      followed: Boolean(payload.data?.following),
      mid: normalizedMid,
      name: String(card.name || ''),
      officialVerify: card.official_verify || null,
      pendant: card.pendant || null,
      sign: String(card.sign || '').trim(),
      vip: card.vip || null
    };
  }

  const RELATION_MODIFY_API = 'https://api.bilibili.com/x/relation/modify';
  function renderVideoIntro({
    targetDocument = document,
    mount,
    bootstrap,
    followBusy = false,
    onFollow
  }) {
    if (!mount) return;
    const info = getVideoIntroInfo(bootstrap);
    mount.textContent = '';
    mount.hidden = !info.owner.mid && !info.description;
    if (mount.hidden) return;
    mount.className = `${APP}__video-intro`;
    const up = targetDocument.createElement('div');
    up.className = `${APP}__video-intro-up`;
    if (info.owner.face) {
      const avatar = targetDocument.createElement('img');
      avatar.className = `${APP}__video-intro-avatar`;
      avatar.src = info.owner.face;
      avatar.alt = '';
      avatar.loading = 'lazy';
      up.appendChild(avatar);
    }
    const main = targetDocument.createElement('div');
    main.className = `${APP}__video-intro-main`;
    const name = targetDocument.createElement(info.owner.href ? 'a' : 'span');
    name.className = `${APP}__video-intro-name`;
    name.textContent = info.owner.name || 'UP 主';
    if (info.owner.href) {
      name.href = info.owner.href;
      name.target = '_blank';
      name.rel = 'noreferrer';
    }
    main.appendChild(name);
    const meta = targetDocument.createElement('div');
    meta.className = `${APP}__video-intro-meta`;
    meta.textContent = info.meta.join(' · ');
    main.appendChild(meta);
    if (info.owner.sign) {
      const sign = targetDocument.createElement('div');
      sign.className = `${APP}__video-intro-owner-desc`;
      sign.textContent = info.owner.sign;
      main.appendChild(sign);
    }
    up.appendChild(main);
    if (info.owner.mid) {
      const follow = targetDocument.createElement('button');
      follow.type = 'button';
      follow.className = `${APP}__video-intro-follow`;
      follow.classList.toggle(`${APP}__video-intro-follow--active`, info.followed);
      const label = followBusy ? '处理中' : info.followed ? '已关注' : '关注';
      follow.dataset.label = label;
      follow.dataset.hoverLabel = info.followed && !followBusy ? '取消关注' : label;
      follow.setAttribute('aria-label', info.followed ? '取消关注 UP 主' : '关注 UP 主');
      follow.disabled = followBusy;
      follow.title = info.followed ? '取消关注 UP 主' : '关注 UP 主';
      follow.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        onFollow?.(info.owner.mid, !info.followed);
      });
      up.appendChild(follow);
    }
    mount.appendChild(up);
    if (info.description) {
      const description = targetDocument.createElement('div');
      description.className = `${APP}__video-intro-desc`;
      const title = targetDocument.createElement('div');
      title.className = `${APP}__video-intro-desc-title`;
      title.textContent = '视频简介';
      const text = targetDocument.createElement('div');
      text.className = `${APP}__video-intro-desc-text`;
      text.textContent = info.description;
      description.append(title, text);
      mount.appendChild(description);
    }
  }
  async function requestFollowUp(mid, follow = true) {
    const normalizedMid = Number(mid);
    if (!Number.isFinite(normalizedMid) || normalizedMid <= 0) throw new Error('缺少 UP 主 mid');
    const csrf = getCookieValue('bili_jct');
    if (!csrf) throw new Error(follow ? '需要登录后才能关注' : '需要登录后才能取消关注');
    const response = await fetch(RELATION_MODIFY_API, {
      method: 'POST',
      credentials: 'include',
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
      },
      body: new URLSearchParams({
        fid: String(Math.trunc(normalizedMid)),
        act: follow ? '1' : '2',
        re_src: '11',
        csrf
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`请求失败：${response.status}`);
    if (!payload || payload.code !== 0) throw new Error(payload?.message || (follow ? '关注失败' : '取消关注失败'));
    return payload;
  }
  function getVideoIntroInfo(bootstrap) {
    const videoData = bootstrap?.initialState?.videoData || {};
    const owner = videoData.owner || {};
    const mid = Number(owner.mid);
    const description = getDescriptionText(videoData);
    const meta = [];
    const publishedAt = formatDate(videoData.pubdate || videoData.ctime);
    if (publishedAt) meta.push(publishedAt);
    const fans = formatCount(owner.fans);
    if (fans) meta.push(`${fans} 粉丝`);
    return {
      description,
      followed: videoData.req_user?.attention === true || videoData.req_user?.attention === 1 || videoData.req_user?.attention === '1',
      meta,
      owner: {
        mid: Number.isFinite(mid) && mid > 0 ? mid : 0,
        name: String(owner.name || '').trim(),
        face: normalizeResourceUrl(owner.face, bootstrap?.href || location.href),
        href: Number.isFinite(mid) && mid > 0 ? `https://space.bilibili.com/${Math.trunc(mid)}` : '',
        sign: String(owner.sign || '').trim()
      }
    };
  }
  function getDescriptionText(videoData) {
    const desc = String(videoData?.desc || '').trim();
    if (desc) return desc;
    if (!Array.isArray(videoData?.desc_v2)) return '';
    return videoData.desc_v2.map(item => String(item?.raw_text || item?.text || '').trim()).filter(Boolean).join('\n');
  }
  function formatDate(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return '';
    const date = new Date(seconds * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  function formatCount(value) {
    const count = Number(value);
    if (!Number.isFinite(count) || count <= 0) return '';
    if (count >= 100000000) return `${trimFixed(count / 100000000)}亿`;
    if (count >= 10000) return `${trimFixed(count / 10000)}万`;
    return String(Math.round(count));
  }
  function trimFixed(value) {
    return value.toFixed(1).replace(/\.0$/, '');
  }
  function getCookieValue(name) {
    const prefix = `${encodeURIComponent(name)}=`;
    const item = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith(prefix));
    return item ? decodeURIComponent(item.slice(prefix.length)) : '';
  }

  if (ENABLED_URL_RE.test(location.href)) {
    bootstrap();
  }
  function bootstrap() {
    const pageWindow = typeof unsafeWindow === 'object' && unsafeWindow ? unsafeWindow : window;
    const COMMENT_WIDTH_DEFAULT = 420;
    const COMMENT_WIDTH_MIN = 300;
    const COMMENT_WIDTH_MAX = 720;
    const MODAL_HEIGHT_DEFAULT = 960;
    const MODAL_WIDTH_MIN = 720;
    const MODAL_HEIGHT_MIN = 420;
    const MODAL_INLINE_MARGIN_MIN = 64;
    const MODAL_INLINE_MARGIN_MAX = 220;
    const MODAL_INLINE_MARGIN_RATIO = 0.08;
    const MODAL_BLOCK_MARGIN_MIN = 96;
    const MODAL_BLOCK_MARGIN_MAX = 220;
    const MODAL_BLOCK_MARGIN_RATIO = 0.12;
    const MODAL_HEADER_HEIGHT = 46;
    const MODAL_COMMENTS_RESIZER_WIDTH = 8;
    const URL_PARAM_PLAY = 'bpn_play';
    const URL_PARAM_BVID = 'bpn_bvid';
    const URL_PARAM_PAGE = 'bpn_p';
    const PLAYLIST_CONTINUATION_PREFETCH_REMAINING = 4;
    const PLAYER_CHROME_HEIGHT = 48;
    const PLAYER_CHROME_HEIGHT_WIDE = 56;
    const PLAYER_CHROME_HEIGHT_WIDE_BREAKPOINT = 1680;
    const supportsDocumentPip = () => typeof window.documentPictureInPicture?.requestWindow === 'function';
    const initialLastPlayed = (() => {
      try {
        const value = JSON.parse(getStorageItem(STORAGE_LAST_PLAYED, 'null') || 'null');
        if (!value?.href || value?.kind === 'live' || value?.roomId || !value?.bvid) return null;
        return value;
      } catch {
        return null;
      }
    })();
    const initialCommentWidth = (() => {
      const value = Number(getStorageItem(STORAGE_COMMENT_WIDTH));
      return clampCommentWidth(Number.isFinite(value) ? value : COMMENT_WIDTH_DEFAULT);
    })();
    const initialCommentLayout = getStorageItem(STORAGE_COMMENT_LAYOUT) === 'bottom' ? 'bottom' : 'right';
    const initialModalSize = (() => {
      try {
        const value = JSON.parse(getStorageItem(STORAGE_MODAL_SIZE, 'null') || 'null');
        if (!value) return null;
        return clampHomeModalSize(value);
      } catch {
        return null;
      }
    })();
    const state = {
      observer: null,
      scanTimer: 0,
      scanWarmupTimer: 0,
      settingsVisibilityFrame: 0,
      bottomFixedFrame: 0,
      homeSizeFrame: 0,
      viewportFrame: 0,
      autoPlayHintTimer: 0,
      lastFocus: null,
      lastButton: null,
      mode: getStorageItem(STORAGE_MODE) === 'pip' && supportsDocumentPip() ? 'pip' : 'home',
      directClick: getStorageItem(STORAGE_DIRECT_CLICK) === '1',
      autoPlayNext: getStorageItem(STORAGE_AUTO_PLAY_NEXT) === '1',
      commentLayout: initialCommentLayout,
      commentWidth: initialCommentWidth,
      modalSize: initialModalSize,
      lastPlayed: initialLastPlayed,
      playlistLastPlayed: initialLastPlayed,
      pipPlaying: null,
      switchToken: 0,
      externalFeatureBlocks: [],
      ownerProfileCache: new Map(),
      ownerProfileRequests: new Map(),
      originalPageMeta: null,
      paramStartDone: false,
      playbackHistory: {
        entries: [],
        index: -1
      },
      pointer: null,
      settings: null,
      shadowHost: null,
      shadowRoot: null,
      overlay: null,
      cardEntries: [],
      dynamicLivePortal: {
        cards: [],
        error: '',
        loaded: false,
        loading: false,
        requestId: 0
      },
      live: {
        button: null,
        buttonFrame: 0
      },
      playback: {
        button: null
      },
      home: {
        overlay: null,
        ui: null,
        player: null,
        comments: null,
        bootstrap: null,
        screenHandler: null,
        navigateHandler: null,
        handoffHandler: null,
        endedHandler: null,
        navigateSyncTimer: 0,
        followBusy: false,
        likeBusy: false,
        likeBurstTimer: 0,
        featureBlocked: false,
        activeCommentsTab: 'comments',
        liveListMode: false,
        feed: {
          error: '',
          exhausted: false,
          loading: false,
          requestId: 0,
          session: null
        },
        playlistRefreshFrame: 0,
        pageCards: [],
        playlistCards: [],
        liveCards: [],
        recommendationCards: [],
        selectedPageKey: '',
        selectedPlaylistBvid: '',
        selectedLiveKey: ''
      },
      pip: {
        win: null,
        player: null,
        comments: null,
        bootstrap: null,
        screenHandler: null,
        navigateHandler: null,
        handoffHandler: null,
        endedHandler: null,
        navigateSyncTimer: 0,
        followBusy: false,
        likeBusy: false,
        likeBurstTimer: 0,
        keydownHandler: null,
        switchingWindow: false,
        activeCommentsTab: 'comments',
        liveListMode: false,
        feed: {
          error: '',
          exhausted: false,
          loading: false,
          requestId: 0,
          session: null
        },
        playlistRefreshFrame: 0,
        pageCards: [],
        playlistCards: [],
        liveCards: [],
        recommendationCards: [],
        selectedPageKey: '',
        selectedPlaylistBvid: '',
        selectedLiveKey: ''
      }
    };
    const settingsUi = createSettingsUi({
      state,
      getShadowRoot: () => state.shadowRoot,
      syncCardButtons,
      supportsPip: supportsDocumentPip
    });
    const commentsTabsUi = createCommentsTabsUi({
      state,
      getHomeRenderer: () => homeRenderer,
      getPipRenderer: () => pipRenderer,
      getCommentLayout: () => state.commentLayout,
      onTabChange: onCommentsTabChange,
      onListChange: syncPlayerHandoffAvailability,
      openWithRenderer,
      syncHomeSize,
      schedulePipLayoutSync
    });
    const {
      attachPipTabs: attachPipCommentsTabs,
      capturePageLiveList,
      capturePagePlaylist,
      createTabs: createCommentsTabs,
      renderLiveList,
      renderPageParts,
      renderPlaylist,
      renderRecommendations,
      scrollSelectedLiveIntoView,
      scrollSelectedPlaylistIntoView,
      setSelectedLiveKey,
      setSelectedPageKey,
      setSelectedPlaylistBvid,
      syncLastPlayed,
      syncTabs: syncCommentsTabs
    } = commentsTabsUi;
    let rendererOrchestrator = null;
    pageWindow.__biliPopupPlayerNano = {
      scan,
      close: closeHome,
      destroy,
      getState: () => state
    };
    ensureShadowUi();
    ensureControlOverlay();
    ensureDocumentStyle();
    ensureSettings();
    scan();
    document.addEventListener('mousemove', onDocumentMouseMove, true);
    document.addEventListener('mouseleave', onDocumentMouseLeave, true);
    document.addEventListener('click', onDirectCoverClick, true);
    document.addEventListener('fullscreenchange', scheduleSettingsVisibilitySync, true);
    window.addEventListener('scroll', scheduleViewportSync, true);
    window.addEventListener('resize', scheduleViewportSync, true);
    state.observer = new MutationObserver(onDomMutated);
    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'title', 'aria-label', 'class', 'style']
    });
    startScanWarmup();
    function ensureShadowUi() {
      if (state.shadowRoot) return;
      const previous = document.getElementById(HOST_ID);
      if (previous) previous.remove();
      const host = document.createElement('div');
      host.id = HOST_ID;
      host.style.position = 'fixed';
      host.style.inset = '0';
      host.style.zIndex = '2147482999';
      host.style.pointerEvents = 'none';
      document.documentElement.appendChild(host);
      const root = host.attachShadow({
        mode: 'open'
      });
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
      .${APP}__overlay {
        position: fixed;
        inset: 0;
        pointer-events: none;
      }

      .${BUTTON_CLASS} {
        position: absolute !important;
        z-index: 20;
        right: auto;
        bottom: auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 72px;
        height: 28px;
        padding: 0 10px;
        border: 1px solid var(--${APP}-settings-border);
        border-radius: 6px;
        color: var(--${APP}-settings-text);
        background: var(--${APP}-settings-bg-hover);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
        font: 500 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: pointer;
        opacity: 0.96;
        pointer-events: auto;
        transition: border-color 0.16s ease, color 0.16s ease, background 0.16s ease, opacity 0.16s ease;
      }

      .${BUTTON_CLASS}:hover,
      .${BUTTON_CLASS}:focus-visible {
        color: #fff;
        border-color: var(--${APP}-settings-brand);
        background: var(--${APP}-settings-brand);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
        opacity: 1;
        outline: none;
      }

      .${BADGE_CLASS} {
        position: absolute !important;
        z-index: 21;
        display: none;
        align-items: center;
        height: 24px;
        padding: 0 8px;
        border: 1px solid var(--${APP}-settings-border);
        border-radius: 6px;
        color: var(--${APP}-settings-subtle);
        background: var(--${APP}-settings-bg);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
        font: 500 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: none;
      }

      .${BADGE_CLASS}.${APP}--active {
        display: inline-flex;
      }

      .${BADGE_CLASS}.${APP}--playing {
        color: #fff;
        border-color: var(--${APP}-settings-brand);
        background: var(--${APP}-settings-brand);
      }

      :host {
        --${APP}-settings-bg: var(--bg1, #fff);
        --${APP}-settings-bg-hover: var(--bg2, #f6f7f8);
        --${APP}-settings-text: var(--text1, #18191c);
        --${APP}-settings-subtle: var(--text2, #61666d);
        --${APP}-settings-muted: var(--text3, #9499a0);
        --${APP}-settings-border: var(--line_regular, #e3e5e7);
        --${APP}-settings-brand: var(--brand_pink, #fb7299);
        --${APP}-settings-shadow: rgba(0, 0, 0, 0.18);
      }

      :host(.${APP}--playback-web-fullscreen) {
        display: none;
      }

      .${SETTINGS_CLASS} {
        position: fixed;
        right: 16px;
        bottom: 96px;
        z-index: 2147482999;
        font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: auto;
      }

      .${SETTINGS_CLASS}__button {
        width: 52px;
        height: 52px;
        display: grid;
        place-items: center;
        border: 1px solid var(--${APP}-settings-border);
        border-radius: 10px;
        color: var(--${APP}-settings-subtle);
        background: var(--${APP}-settings-bg);
        box-shadow: 0 2px 8px var(--${APP}-settings-shadow);
        cursor: pointer;
      }

      .${SETTINGS_CLASS}__button svg {
        width: 22px;
        height: 22px;
        display: block;
        stroke: currentColor;
      }

      .${SETTINGS_CLASS}__button:hover,
      .${SETTINGS_CLASS}__button:focus-visible,
      .${SETTINGS_CLASS}.${APP}--open .${SETTINGS_CLASS}__button {
        color: #fff;
        border-color: var(--${APP}-settings-brand);
        background: var(--${APP}-settings-brand);
        outline: none;
      }

      .${SETTINGS_CLASS}__menu {
        position: absolute;
        right: 0;
        bottom: 60px;
        width: 184px;
        padding: 8px;
        display: none;
        border: 1px solid var(--${APP}-settings-border);
        border-radius: 8px;
        color: var(--${APP}-settings-text);
        background: var(--${APP}-settings-bg);
        box-shadow: 0 10px 32px var(--${APP}-settings-shadow);
      }

      .${SETTINGS_CLASS}.${APP}--open .${SETTINGS_CLASS}__menu {
        display: block;
      }

      .${SETTINGS_CLASS}__label {
        margin: 4px 6px 6px;
        color: var(--${APP}-settings-muted);
        font-size: 12px;
      }

      .${SETTINGS_CLASS}__hint {
        margin: 4px 6px 8px;
        color: var(--${APP}-settings-muted);
        font-size: 12px;
        line-height: 1.45;
      }

      .${SETTINGS_CLASS}__hint[hidden] {
        display: none;
      }

      .${SETTINGS_CLASS}__option {
        width: 100%;
        height: 32px;
        margin: 2px 0;
        padding: 0 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border: 0;
        border-radius: 6px;
        color: var(--${APP}-settings-text);
        background: transparent;
        cursor: pointer;
        text-align: left;
      }

      .${SETTINGS_CLASS}__option:hover,
      .${SETTINGS_CLASS}__option:focus-visible,
      .${SETTINGS_CLASS}__option.${APP}--active {
        color: var(--${APP}-settings-brand);
        background: var(--${APP}-settings-bg-hover);
        outline: none;
      }

      .${SETTINGS_CLASS}__option:disabled {
        color: var(--${APP}-settings-muted);
        cursor: default;
        background: transparent;
      }
    `;
      root.append(style);
      state.shadowHost = host;
      state.shadowRoot = root;
    }
    function ensureControlOverlay() {
      if (state.overlay?.isConnected) return state.overlay;
      document.getElementById(`${APP}-control-overlay`)?.remove();
      const overlay = document.createElement('div');
      overlay.id = `${APP}-control-overlay`;
      overlay.className = `${APP}__control-overlay`;
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.zIndex = '2147480999';
      overlay.style.pointerEvents = 'none';
      document.documentElement.appendChild(overlay);
      state.overlay = overlay;
      return overlay;
    }
    function ensureDocumentStyle() {
      installDocumentStyle(document);
    }
    function ensureSettings() {
      settingsUi.ensure();
    }
    function openOriginalPage(href) {
      if (!href) return;
      window.open(href, '_blank', 'noopener,noreferrer');
    }
    function openOriginalPlaybackPage(href, player) {
      const nextHref = withPlaybackTime(href, getPlaybackTime(player));
      console.debug('[bili-popup-player] open original page', {
        href,
        nextHref
      });
      openOriginalPage(nextHref);
      pausePlayer(player);
    }
    function withPlaybackTime(href, seconds) {
      if (!href) return '';
      const time = Math.floor(Number(seconds));
      if (!Number.isFinite(time) || time <= 0) return href;
      try {
        const url = new URL(href, location.href);
        url.searchParams.set('t', String(time));
        return url.href;
      } catch {
        return href;
      }
    }
    function getPlaybackTime(player) {
      try {
        const numeric = Number(player?.getCurrentTime?.());
        if (Number.isFinite(numeric)) return numeric;
      } catch {
        // Ignore time read failures.
      }
      return 0;
    }
    function pausePlayer(player) {
      try {
        player?.pause?.();
      } catch {
        // Ignore pause failures.
      }
    }
    const PLAYER_GLOBAL_KEYS = ['player', 'bilibiliPlayer', 'biliPlayer', '__PLAYER__', '__BILI_PLAYER__', '__bilibiliPlayer'];
    function togglePlayerFeatures(player, isBlockPlay) {
      const blocked = Boolean(isBlockPlay);
      if (!player || typeof player.toggleFeature !== 'function') return false;
      try {
        player.toggleFeature({
          play: blocked,
          seek: blocked,
          shortcut: blocked
        });
        return true;
      } catch {
        return false;
      }
    }
    function setHomePlayerFeatureBlocked(isBlockPlay) {
      const blocked = Boolean(isBlockPlay);
      if (!state.home.player || state.home.featureBlocked === blocked) return;
      if (togglePlayerFeatures(state.home.player, blocked)) {
        state.home.featureBlocked = blocked;
      }
    }
    function setExternalPlayerFeaturesBlocked(isBlockPlay) {
      const blocked = Boolean(isBlockPlay);
      if (!blocked) {
        state.externalFeatureBlocks.forEach(player => togglePlayerFeatures(player, false));
        state.externalFeatureBlocks = [];
        return;
      }
      const known = new Set(state.externalFeatureBlocks);
      getExternalFeaturePlayers().forEach(player => {
        if (known.has(player)) return;
        if (togglePlayerFeatures(player, true)) {
          state.externalFeatureBlocks.push(player);
          known.add(player);
        }
      });
    }
    function getExternalFeaturePlayers() {
      const players = [];
      const seen = new Set();
      const add = player => {
        if (!player || typeof player.toggleFeature !== 'function') return;
        if (player === state.home.player || player === state.pip.player || seen.has(player)) return;
        seen.add(player);
        players.push(player);
      };
      PLAYER_GLOBAL_KEYS.forEach(key => add(pageWindow[key]));
      add(pageWindow.playerAgent?.player);
      add(pageWindow.bilibili?.player);
      return players;
    }
    function setPipPlaying(bootstrap) {
      state.pipPlaying = bootstrap ? {
        title: bootstrap.title,
        kind: bootstrap.kind || 'video',
        bvid: bootstrap.playerInfo?.bvid,
        aid: bootstrap.playerInfo?.aid,
        roomId: bootstrap.playerInfo?.roomId
      } : null;
      syncVideoBadges();
    }
    function syncSettings() {
      settingsUi.sync();
    }
    function bindLink(link, meta = getVideoMetaFromLink(link)) {
      if (!meta) return;
      bindPlayableLink(link, getCardRoot(link), meta);
    }
    function bindLiveLink(link, meta = getLiveMetaFromLink(link)) {
      if (!meta) return;
      bindPlayableLink(link, getLiveCardRoot(link), meta);
    }
    function bindLiveCardElement(element, meta) {
      if (!element || !meta) return;
      bindPlayableLink(element, getLiveCardRoot(element), meta);
    }
    function bindPlayableLink(link, card, meta) {
      if (!card) return;
      const existing = state.cardEntries.find(entry => entry.card === card || entry.link === link);
      if (existing) {
        upgradeCardEntry(existing, link, card, meta);
        return;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = BUTTON_CLASS;
      setCardDataset(button, meta);
      syncCardButton(button);
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        state.lastFocus = button;
        state.lastButton = button;
        if (state.directClick) {
          openOriginalPage(button.dataset.href);
          return;
        }
        openByMode(getMetaFromCardDataset(button));
      });
      const badge = document.createElement('div');
      badge.className = BADGE_CLASS;
      setCardDataset(badge, meta);
      const overlayMode = shouldUseCardOverlayFor(link, card);
      const host = overlayMode ? state.overlay : getCardControlHost(link, card);
      if (!overlayMode) ensureCardHost(host);
      host.append(button, badge);
      state.cardEntries.push({
        card,
        host,
        link,
        button,
        badge,
        meta,
        overlayMode
      });
      positionCardEntry(state.cardEntries[state.cardEntries.length - 1]);
      syncVideoBadge(badge);
    }
    function upgradeCardEntry(entry, link, card, meta) {
      const isLive = isLiveMeta(meta);
      const currentIsCover = !isLive && isCoverLink(entry.link);
      const nextIsCover = !isLive && isCoverLink(link);
      if (entry.link === link || currentIsCover || !nextIsCover) {
        entry.meta = meta;
        setCardDataset(entry.button, meta);
        setCardDataset(entry.badge, meta);
        syncCardButton(entry.button);
        syncVideoBadge(entry.badge);
        positionCardEntry(entry);
        return;
      }
      const overlayMode = shouldUseCardOverlayFor(link, card);
      const host = overlayMode ? state.overlay : getCardControlHost(link, card);
      if (!overlayMode) ensureCardHost(host);
      host.append(entry.button, entry.badge);
      entry.card = card;
      entry.host = host;
      entry.link = link;
      entry.meta = meta;
      entry.overlayMode = overlayMode;
      setCardDataset(entry.button, meta);
      setCardDataset(entry.badge, meta);
      syncCardButton(entry.button);
      syncVideoBadge(entry.badge);
      positionCardEntry(entry);
    }
    function syncCardButtons() {
      state.cardEntries.forEach(entry => syncCardButton(entry.button));
    }
    function syncCardButton(button) {
      const title = button.dataset.title || 'Bilibili 视频';
      button.textContent = state.directClick ? '跳转' : '小窗播放';
      button.setAttribute('aria-label', state.directClick ? `跳转：${title}` : `小窗播放：${title}`);
      button.title = state.directClick ? '跳转到播放页' : '小窗播放';
    }
    function syncVideoBadges() {
      state.cardEntries.forEach(entry => syncVideoBadge(entry.badge));
    }
    function syncVideoBadge(badge) {
      const key = badge.dataset.key || '';
      const playingKey = getPlayableKey(state.pipPlaying);
      const lastPlayedKey = getPlayableKey(state.lastPlayed);
      const isPlaying = Boolean(key && playingKey && playingKey === key);
      const isLastPlayed = Boolean(key && lastPlayedKey && lastPlayedKey === key);
      const active = isPlaying || isLastPlayed;
      badge.textContent = isPlaying ? '正在播放' : isLastPlayed ? '上次播放' : '';
      badge.classList.toggle(`${APP}--active`, active);
      badge.classList.toggle(`${APP}--playing`, isPlaying);
    }
    function setCardDataset(element, meta) {
      element.dataset.kind = meta.kind || 'video';
      element.dataset.bvid = meta.bvid || '';
      element.dataset.roomId = meta.roomId || '';
      element.dataset.key = getPlayableKey(meta);
      element.dataset.href = meta.href || '';
      element.dataset.title = meta.title || (isLiveMeta(meta) ? `Bilibili 直播 ${meta.roomId}` : 'Bilibili 视频');
    }
    function getMetaFromCardDataset(element) {
      if (element.dataset.kind === 'live' || element.dataset.roomId) {
        return {
          kind: 'live',
          roomId: element.dataset.roomId,
          href: element.dataset.href,
          title: element.dataset.title
        };
      }
      return {
        bvid: element.dataset.bvid,
        href: element.dataset.href,
        title: element.dataset.title
      };
    }
    function syncOverlayPositions() {
      state.cardEntries = state.cardEntries.filter(entry => {
        if (!entry.card.isConnected || !entry.link.isConnected) {
          entry.button.remove();
          entry.badge.remove();
          return false;
        }
        return true;
      });
    }
    function positionCardEntry(entry) {
      const hostRect = entry.overlayMode ? getCardControlRect(entry) : entry.host.getBoundingClientRect();
      const cardRect = getCardRect(entry);
      const visible = hostRect.width > 36 && hostRect.height > 28 && hostRect.bottom > 0 && hostRect.right > 0 && hostRect.top < innerHeight && hostRect.left < innerWidth;
      const buttonVisible = visible && shouldShowCardButton(entry, cardRect);
      entry.button.style.display = buttonVisible ? 'inline-flex' : 'none';
      entry.badge.style.display = visible && entry.badge.classList.contains(`${APP}--active`) ? 'inline-flex' : 'none';
      if (!entry.overlayMode || !visible) return;
      entry.button.style.left = `${Math.max(0, Math.round(hostRect.right - 80))}px`;
      entry.button.style.top = `${Math.max(0, Math.round(hostRect.bottom - 36))}px`;
      entry.badge.style.left = `${Math.max(0, Math.round(hostRect.left + 8))}px`;
      entry.badge.style.top = `${Math.max(0, Math.round(hostRect.top + 8))}px`;
    }
    function getCardControlRect(entry) {
      const coverLink = getCardCoverLink(entry.link, entry.card);
      const target = coverLink || entry.link;
      const host = getCardControlHost(target, entry.card);
      return (host || target).getBoundingClientRect();
    }
    function shouldUseCardOverlayFor(link, card) {
      if (isPlaybackPage() || isSpacePage() || isDynamicPage()) return true;
      if (card?.tagName === 'A') return false;
      const host = getCardControlHost(link, card);
      return host?.tagName === 'A' && !(host.parentElement && card?.contains?.(host.parentElement));
    }
    function getCardRect(entry) {
      const cardRect = entry.card.getBoundingClientRect();
      const linkRect = entry.link.getBoundingClientRect();
      const cardLooksTooBroad = cardRect.width > innerWidth * 0.72 && linkRect.width < cardRect.width * 0.45;
      return cardLooksTooBroad ? linkRect : cardRect;
    }
    function shouldShowCardButton(entry, rect) {
      if (entry.button.matches(':hover, :focus-visible')) return true;
      const pointer = state.pointer;
      if (!pointer) return false;
      return pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom;
    }
    function onDocumentMouseMove(event) {
      state.pointer = {
        x: event.clientX,
        y: event.clientY
      };
      syncOverlayPositions();
      state.cardEntries.forEach(positionCardEntry);
    }
    function onDocumentMouseLeave() {
      state.pointer = null;
      syncOverlayPositions();
      state.cardEntries.forEach(positionCardEntry);
    }
    function scheduleViewportSync() {
      if (state.viewportFrame) return;
      state.viewportFrame = requestAnimationFrame(() => {
        state.viewportFrame = 0;
        syncOverlayPositions();
        state.cardEntries.forEach(positionCardEntry);
        syncLivePageButton();
        syncPlaybackPagePipButton();
        syncSettingsVisibility();
        scheduleHomeSizeSync();
      });
    }
    function scheduleHomeSizeSync() {
      if (!state.home.ui || state.home.overlay?.classList.contains(`${APP}--hidden`)) return;
      if (state.homeSizeFrame) return;
      state.homeSizeFrame = requestAnimationFrame(() => {
        state.homeSizeFrame = 0;
        if (!state.home.ui || state.home.overlay?.classList.contains(`${APP}--hidden`)) return;
        syncHomeSize();
      });
    }
    function scheduleSettingsVisibilitySync() {
      if (state.settingsVisibilityFrame) return;
      state.settingsVisibilityFrame = requestAnimationFrame(() => {
        state.settingsVisibilityFrame = 0;
        syncSettingsVisibility();
      });
    }
    function syncSettingsVisibility() {
      const hidden = isPlaybackPageWebFullscreen() || isLivePageWebFullscreen();
      state.shadowHost?.classList.toggle(`${APP}--playback-web-fullscreen`, hidden);
      state.overlay?.classList.toggle(`${APP}--playback-web-fullscreen`, hidden);
    }
    function ensureCardHost(card) {
      const style = getComputedStyle(card);
      if (style.position === 'static') card.style.position = 'relative';
      if (style.display === 'inline') card.style.display = 'inline-block';
      if (style.overflow === 'visible') return;
      card.style.overflow = 'visible';
    }
    function getCardControlHost(link, card) {
      const coverLink = getCardCoverLink(link, card) || link;
      const host = coverLink.matches?.(COVER_HOST_SELECTOR) ? coverLink : coverLink.closest?.(COVER_HOST_SELECTOR);
      if (!host || !card.contains(host)) return link.parentElement && card.contains(link.parentElement) ? link.parentElement : link;
      if (host.tagName !== 'A' || host === card) return host;
      const parent = host.parentElement;
      return parent && card.contains(parent) ? parent : host;
    }
    function getCardCoverLink(link, card) {
      if (isCoverLink(link)) return link;
      const bvid = getVideoMetaFromLink(link)?.bvid;
      if (!bvid) return null;
      return [...(card.querySelectorAll?.('a[href*="/video/BV"]') || [])].find(candidate => getVideoMetaFromLink(candidate)?.bvid === bvid && isCoverLink(candidate)) || null;
    }
    function syncLivePageButton() {
      if (!supportsDocumentPip() || !isLivePage()) {
        removeLivePageButton();
        return;
      }
      const meta = getCurrentLiveMeta();
      if (!meta) {
        removeLivePageButton();
        return;
      }
      const overlay = ensureControlOverlay();
      let button = state.live.button;
      if (!button?.isConnected) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = `${BUTTON_CLASS} ${APP}__fixed-pip-button ${APP}__live-button`;
        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          state.lastFocus = button;
          state.lastButton = button;
          const nextMeta = getCurrentLiveMeta();
          if (nextMeta) {
            pauseLivePagePlayer();
            openWithRenderer(pipRenderer, {
              ...nextMeta,
              fromLivePageButton: true
            });
          }
        });
        state.live.button = button;
        overlay.appendChild(button);
      }
      button.dataset.roomId = meta.roomId;
      button.dataset.href = meta.href;
      button.dataset.title = meta.title;
      button.title = `Document PiP：${meta.title}`;
      button.setAttribute('aria-label', button.title);
      if (!button.firstElementChild || button.textContent) button.replaceChildren(createPictureInPictureIcon());
    }
    function syncPlaybackPagePipButton() {
      if (!supportsDocumentPip() || !isPlaybackPage()) {
        removePlaybackPagePipButton();
        return;
      }
      const meta = getCurrentPlaybackPageMeta();
      if (!meta) {
        removePlaybackPagePipButton();
        return;
      }
      const overlay = ensureControlOverlay();
      let button = state.playback.button;
      if (!button?.isConnected) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = `${BUTTON_CLASS} ${APP}__fixed-pip-button ${APP}__playback-pip-button`;
        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          state.lastFocus = button;
          state.lastButton = button;
          const nextMeta = getCurrentPlaybackPageMeta();
          if (nextMeta) {
            pausePlaybackPagePlayer();
            openWithRenderer(pipRenderer, nextMeta);
          }
        });
        state.playback.button = button;
        overlay.appendChild(button);
      }
      button.dataset.bvid = meta.bvid;
      button.dataset.href = meta.href;
      button.dataset.title = meta.title;
      button.title = `Document PiP：${meta.title}`;
      button.setAttribute('aria-label', button.title);
      if (!button.firstElementChild || button.textContent) button.replaceChildren(createPictureInPictureIcon());
    }
    function removeLivePageButton() {
      state.live.button?.remove();
      state.live.button = null;
    }
    function removePlaybackPagePipButton() {
      state.playback.button?.remove();
      state.playback.button = null;
    }
    function getCurrentPlaybackPageMeta() {
      const bvid = getCurrentPageBvid();
      if (!bvid) return null;
      const href = location.href;
      const title = cleanCurrentPageTitle(document.querySelector('meta[property="og:title"]')?.getAttribute('content') || document.querySelector('h1[title]')?.getAttribute('title') || document.querySelector('h1')?.textContent || document.title || bvid);
      return {
        bvid,
        href,
        title
      };
    }
    function cleanCurrentPageTitle(value) {
      return String(value || '').replace(/\s+/g, ' ').replace(/_哔哩哔哩_bilibili$/u, '').replace(/- 哔哩哔哩.*$/u, '').trim() || 'Bilibili 视频';
    }
    function getLivePlayerAnchor() {
      return document.getElementById('live-player') || document.getElementById('player-ctnr') || document.querySelector('.live-player-ctnr, .player-section, [class*="player"]');
    }
    function pauseLivePagePlayer() {
      const candidates = [pageWindow.__PLAYER_GLOBAL_INSTANCE__, pageWindow.EmbedPlayer?.instance, pageWindow.Player?.instance];
      for (const player of candidates) {
        if (tryPauseLivePlayer(player)) return true;
      }
      return [...document.querySelectorAll('video')].some(video => {
        try {
          video.pause();
          return true;
        } catch {
          return false;
        }
      });
    }
    function pausePlaybackPagePlayer() {
      const candidates = [...PLAYER_GLOBAL_KEYS.map(key => pageWindow[key]), pageWindow.playerAgent?.player, pageWindow.bilibili?.player, pageWindow.__PLAYER_GLOBAL_INSTANCE__, pageWindow.EmbedPlayer?.instance];
      for (const player of candidates) {
        if (tryPauseLivePlayer(player)) return true;
      }
      return [...document.querySelectorAll('video')].some(video => {
        try {
          video.pause();
          return true;
        } catch {
          return false;
        }
      });
    }
    function tryPauseLivePlayer(player) {
      if (!player) return false;
      const methods = ['pause', 'stop', 'destroyPause'];
      for (const method of methods) {
        if (typeof player[method] !== 'function') continue;
        try {
          player[method]();
          return true;
        } catch {
          // Try the next known pause surface.
        }
      }
      return false;
    }
    function scan() {
      ensureControlOverlay();
      [...document.querySelectorAll(getVideoLinkSelector())].sort((a, b) => Number(isCoverLink(b)) - Number(isCoverLink(a))).forEach(link => {
        const meta = getVideoMetaFromLink(link);
        if (!meta || meta.bvid === getCurrentPageBvid()) return;
        bindLink(link, meta);
      });
      [...document.querySelectorAll(LIVE_CARD_LINK_SELECTOR)].forEach(link => {
        const meta = getLiveMetaFromLink(link);
        const currentLive = getCurrentLiveMeta();
        if (!meta || currentLive?.roomId && String(meta.roomId) === String(currentLive.roomId)) return;
        bindLiveLink(link, meta);
      });
      syncDynamicPortalLiveCards();
      ensureSettings();
      syncLivePageButton();
      syncPlaybackPagePipButton();
      syncSettingsVisibility();
      syncVideoBadges();
      syncOverlayPositions();
      state.cardEntries.forEach(positionCardEntry);
    }
    function syncDynamicPortalLiveCards() {
      if (!isDynamicPage()) return;
      bindDynamicPortalLiveCards(state.dynamicLivePortal.cards);
      if (state.dynamicLivePortal.loading || state.dynamicLivePortal.loaded) return;
      const requestId = state.dynamicLivePortal.requestId + 1;
      state.dynamicLivePortal.requestId = requestId;
      state.dynamicLivePortal.loading = true;
      fetchDynamicLivePortalCards().then(cards => {
        if (requestId !== state.dynamicLivePortal.requestId) return;
        state.dynamicLivePortal.cards = cards;
        state.dynamicLivePortal.error = '';
        state.dynamicLivePortal.loaded = true;
        bindDynamicPortalLiveCards(cards);
        refreshOpenLiveLists();
      }).catch(error => {
        if (requestId !== state.dynamicLivePortal.requestId) return;
        state.dynamicLivePortal.error = error?.message || String(error || '动态直播列表请求失败');
        state.dynamicLivePortal.loaded = true;
      }).finally(() => {
        if (requestId === state.dynamicLivePortal.requestId) state.dynamicLivePortal.loading = false;
      });
    }
    function bindDynamicPortalLiveCards(cards) {
      if (!cards?.length) return;
      const currentLive = getCurrentLiveMeta();
      const used = new Set();
      cards.forEach(card => {
        if (!card?.roomId || currentLive?.roomId && String(card.roomId) === String(currentLive.roomId)) return;
        const element = findDynamicLiveUserElement(card, used);
        if (!element) return;
        used.add(element);
        bindLiveCardElement(element, card);
      });
    }
    function refreshOpenLiveLists() {
      if (state.home.liveListMode) {
        capturePageLiveList('home', state.home.selectedLiveKey);
        renderLiveList('home', '当前页面没有扫到直播卡片');
      }
      if (state.pip.liveListMode) {
        capturePageLiveList('pip', state.pip.selectedLiveKey);
        renderLiveList('pip', '当前页面没有扫到直播卡片');
      }
    }
    function onDomMutated(mutations) {
      if (mutations.some(shouldSyncSettingsVisibilityMutation)) scheduleSettingsVisibilitySync();
      if (state.home.ui && !state.home.overlay?.classList.contains(`${APP}--hidden`)) scheduleHomeBottomFixedWrapperSync();
      if (mutations.some(shouldRescanMutation)) scheduleScan();
    }
    function shouldSyncSettingsVisibilityMutation(mutation) {
      if (!isPlaybackPage() && !isLivePage()) return false;
      if (mutation.type === 'childList') return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
      if (mutation.type !== 'attributes') return false;
      const target = mutation.target;
      if (!(target instanceof Element)) return false;
      if (target === document.documentElement || target === document.body) return true;
      return Boolean(target.closest?.(isLivePage() ? '#live-player, #player-ctnr, .live-player-ctnr, .player-section' : getPlaybackPlayerSelector()));
    }
    function shouldRescanMutation(mutation) {
      if (mutation.type === 'childList') return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
      if (mutation.type !== 'attributes') return false;
      const target = mutation.target;
      if (!(target instanceof Element)) return false;
      return target.matches?.('a[href*="/video/"], a[href*="live.bilibili.com/"], a[href], [title], [aria-label]') || target.closest?.('.bili-video-card, .feed-card, .video-card, .suit-video-card, .bili-dyn-card-video, .bili-dyn-card-live, .bili-dyn-card, .bili-dyn-item, .user-row, [class*="video-card"], [class*="live-card"], [class*="room-card"], [class*="feed-card"], [class*="bili-dyn"]');
    }
    function isPlaybackPageWebFullscreen() {
      if (!isPlaybackPage()) return false;
      if (document.body.classList.contains(`${APP}--modal-open`)) return false;
      const player = document.querySelector(getPlaybackPlayerSelector());
      if (!player) return false;
      return hasWebFullscreenMarker(player) || Boolean(player.querySelector?.(['.bpx-player-web-full', '.bpx-player-mode-webscreen', '.bpx-player-webscreen', '.bilibili-player-video-web-fullscreen'].join(',')));
    }
    function hasWebFullscreenMarker(element) {
      for (let current = element; current && current !== document.documentElement; current = current.parentElement) {
        const className = String(current.className || '');
        if (/\b(?:bpx-player-(?:web-full|mode-webscreen|webscreen)|bilibili-player-video-web-fullscreen|player-mode-webfullscreen)\b/.test(className)) return true;
        const screen = current.getAttribute?.('data-screen') || current.getAttribute?.('data-mode') || '';
        if (/web(?:screen|fullscreen|full)/i.test(screen)) return true;
      }
      const rootClassName = `${document.documentElement.className || ''} ${document.body.className || ''}`;
      return /\b(?:bpx-player-(?:web-full|mode-webscreen|webscreen)|player-mode-webfullscreen|web-fullscreen|webscreen)\b/.test(rootClassName);
    }
    function isLivePageWebFullscreen() {
      if (!isLivePage()) return false;
      if (document.body.classList.contains(`${APP}--modal-open`)) return false;
      const player = getLivePlayerAnchor();
      if (!player) return false;
      const fullscreen = document.fullscreenElement;
      if (fullscreen && (fullscreen === player || player.contains(fullscreen) || fullscreen.contains(player))) return true;
      const rect = player.getBoundingClientRect();
      const coversViewport = rect.width >= innerWidth * 0.9 && rect.height >= innerHeight * 0.9 && rect.top <= 2 && rect.left <= 2;
      if (!coversViewport) return false;
      for (let current = player; current && current !== document.documentElement; current = current.parentElement) {
        const marker = [current.className || '', current.getAttribute?.('data-screen') || '', current.getAttribute?.('data-mode') || ''].join(' ');
        if (/(?:web.*full|full.*web|full-?screen|fullscreen|player-full|webscreen)/i.test(marker)) return true;
      }
      const pageMarker = `${document.documentElement.className || ''} ${document.body.className || ''}`;
      return /(?:web.*full|full.*web|full-?screen|fullscreen|player-full|webscreen)/i.test(pageMarker);
    }
    function getPlaybackPlayerSelector() {
      return '#bilibili-player, #bofqi, .bpx-player-container, .bilibili-player-video';
    }
    function scheduleScan() {
      if (state.scanTimer) return;
      state.scanTimer = window.setTimeout(() => {
        state.scanTimer = 0;
        scan();
      }, 180);
    }
    function startScanWarmup() {
      let count = 0;
      state.scanWarmupTimer = window.setInterval(() => {
        count += 1;
        scan();
        if (count >= 16) stopScanWarmup();
      }, 750);
    }
    function stopScanWarmup() {
      if (!state.scanWarmupTimer) return;
      window.clearInterval(state.scanWarmupTimer);
      state.scanWarmupTimer = 0;
    }
    function getVideoLinkSelector() {
      if (isDynamicPage()) return DYNAMIC_VIDEO_LINK_SELECTOR;
      if (!isPlaybackPage()) return 'a[href*="/video/BV"]';
      return PLAYBACK_VIDEO_LINK_SELECTOR;
    }
    function onDirectCoverClick(event) {
      if (!state.directClick || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (event.target.closest?.(`.${BUTTON_CLASS}, .${SETTINGS_CLASS}, #${APP}-overlay`)) return;
      const liveEntry = getDirectLiveCardEntry(event.target);
      if (liveEntry) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        state.lastFocus = liveEntry.card || liveEntry.link;
        state.lastButton = null;
        openByMode(liveEntry.meta);
        return;
      }
      const link = event.target.closest?.('a[href*="/video/BV"]');
      if (!link || !isCoverLink(link)) return;
      const meta = getVideoMetaFromLink(link);
      if (!meta || meta.bvid === getCurrentPageBvid()) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      state.lastFocus = link;
      state.lastButton = null;
      openByMode(meta);
    }
    function getDirectLiveCardEntry(target) {
      if (!(target instanceof Element)) return null;
      return state.cardEntries.find(entry => {
        if (!isLiveMeta(entry.meta) || !entry.card?.isConnected || !entry.link?.isConnected) return false;
        return entry.card.contains(target) || entry.link.contains(target);
      }) || null;
    }
    function openByMode(meta) {
      if (state.mode === 'pip' && !supportsDocumentPip()) {
        state.mode = 'home';
        setStorageItem(STORAGE_MODE, 'home');
        syncSettings();
      }
      rendererOrchestrator.openByMode(meta);
    }
    function getActiveRenderer() {
      return state.mode === 'pip' && supportsDocumentPip() ? pipRenderer : homeRenderer;
    }
    function openWithRenderer(renderer, meta) {
      return rendererOrchestrator.openWithRenderer(renderer, meta);
    }
    function resolveBootstrap(meta) {
      return isLiveMeta(meta) ? resolveLiveBootstrap(meta) : resolvePlaybackBootstrap(meta);
    }
    function startPlaybackFromUrlParams() {
      if (state.paramStartDone) return;
      const meta = getPlaybackMetaFromUrlParams();
      if (!meta) return;
      state.paramStartDone = true;
      window.setTimeout(() => {
        openWithRenderer(homeRenderer, meta);
      }, 0);
    }
    function getPlaybackMetaFromUrlParams() {
      const url = new URL(location.href);
      if (url.searchParams.get(URL_PARAM_PLAY) !== '1') return null;
      const bvid = url.searchParams.get(URL_PARAM_BVID) || getCurrentPageBvid();
      if (!/^BV[a-zA-Z0-9]+$/.test(String(bvid || ''))) return null;
      const page = Number(url.searchParams.get(URL_PARAM_PAGE) || 0);
      const href = new URL(`/video/${bvid}/`, location.origin);
      if (Number.isInteger(page) && page > 1) href.searchParams.set('p', String(page));
      return {
        bvid,
        href: href.href,
        title: document.title || bvid,
        fromUrlParams: true
      };
    }
    function syncPlaybackPageMeta(kind, bootstrap) {
      if (!bootstrap || isLiveBootstrap(bootstrap)) return;
      const bvid = bootstrap.playerInfo?.bvid;
      if (!bvid) return;
      captureOriginalPageMeta();
      const title = String(bootstrap.title || bvid).trim();
      if (title) document.title = title;
      const page = Number(bootstrap.playerInfo?.p || 0);
      const url = new URL(location.href);
      url.searchParams.set(URL_PARAM_PLAY, '1');
      url.searchParams.set(URL_PARAM_BVID, bvid);
      if (Number.isInteger(page) && page > 1) url.searchParams.set(URL_PARAM_PAGE, String(page));else url.searchParams.delete(URL_PARAM_PAGE);
      const nextHref = `${url.pathname}${url.search}${url.hash}`;
      if (nextHref !== `${location.pathname}${location.search}${location.hash}`) {
        history.replaceState(history.state, '', nextHref);
      }
    }
    function captureOriginalPageMeta() {
      if (state.originalPageMeta) return;
      state.originalPageMeta = {
        title: document.title,
        href: getUrlWithoutPlaybackParams(location.href)
      };
    }
    function restoreOriginalPageMeta() {
      if (state.originalPageMeta?.title != null) document.title = state.originalPageMeta.title;
      const fallbackHref = getUrlWithoutPlaybackParams(location.href);
      const targetHref = state.originalPageMeta?.href || fallbackHref;
      if (targetHref && targetHref !== location.href) {
        const url = new URL(targetHref, location.href);
        history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
      }
      state.originalPageMeta = null;
    }
    function getUrlWithoutPlaybackParams(href) {
      const url = new URL(href, location.href);
      url.searchParams.delete(URL_PARAM_PLAY);
      url.searchParams.delete(URL_PARAM_BVID);
      url.searchParams.delete(URL_PARAM_PAGE);
      return url.href;
    }
    const homeRenderer = {
      getReusable: getReusableHome,
      reuse: reuseHome,
      prepare: prepareHome,
      play: playHome,
      fail: failHome,
      isClosed: () => !state.home.overlay || state.home.overlay.classList.contains(`${APP}--hidden`)
    };
    function getReusableHome(meta) {
      if (!state.home.player || !state.home.bootstrap || !isSamePlayback(meta, state.home.bootstrap)) return null;
      return {
        bootstrap: state.home.bootstrap
      };
    }
    function reuseHome(context, meta, token) {
      const ui = ensureHomeShell();
      const bootstrap = context.bootstrap;
      const preserveRightList = Boolean(meta.fromHistory);
      showHomeShell(bootstrap.title || meta.title || meta.bvid);
      ui.openOriginal.dataset.href = meta.href || bootstrap.href;
      ui.status.textContent = '播放器：继续播放';
      saveLastPlayed(meta, bootstrap);
      recordPlaybackHistory(meta, bootstrap);
      syncPlaybackPageMeta('home', bootstrap);
      if (!preserveRightList) {
        setSelectedPlaylistBvid('home', meta.bvid || bootstrap.playerInfo?.bvid);
        renderPlaylist('home');
        renderPageParts('home', bootstrap);
      }
      renderRecommendations('home', bootstrap);
      syncVideoIntro('home');
      bindHomeScreenChange(state.home.player);
      syncHomeSize();
      syncVideoBadges();
      playHomeSoon(token, 80);
    }
    async function prepareHome(meta) {
      if (isLiveMeta(meta)) return prepareLiveHome(meta);
      const ui = ensureHomeShell();
      setLiveListMode('home', false);
      const preserveRightList = Boolean(meta.fromHistory);
      const preservePageParts = preserveRightList && isBvidInCurrentPageCards('home', meta.bvid);
      showHomeShell(meta.title || meta.bvid, {
        preserveScroll: Boolean(meta.fromPagePart || preserveRightList)
      });
      ui.openOriginal.dataset.href = meta.href;
      ui.status.textContent = state.home.player ? '播放页参数：解析中，准备 reload' : '播放页参数：解析中';
      if (preserveRightList) {
        if (isBvidInCurrentPlaylist('home', meta.bvid)) setSelectedPlaylistBvid('home', meta.bvid);
      } else if (meta.fromPlaylist && state.home.playlistCards.length) {
        setSelectedPlaylistBvid('home', meta.bvid);
        renderPlaylist('home');
      } else {
        resetPlaylistFeed('home');
        capturePagePlaylist('home', meta.bvid);
      }
      if (!preservePageParts) {
        if (meta.fromPagePart && state.home.pageCards.length) setSelectedPageKey('home', meta.pageKey);else renderPageParts('home', null);
      }
      renderRecommendations('home', null);
      return {
        ui,
        preservePageParts,
        preserveRightList
      };
    }
    async function playHome(context, bootstrap, token) {
      if (isLiveBootstrap(bootstrap)) {
        await bootLiveHome(context, bootstrap, token);
        return;
      }
      const {
        ui
      } = context;
      state.home.bootstrap = bootstrap;
      syncPlaybackPageMeta('home', bootstrap);
      ui.title.textContent = bootstrap.title || ui.title.textContent;
      ui.openOriginal.dataset.href = bootstrap.href;
      ui.status.textContent = `播放页参数：aid=${bootstrap.playerInfo.aid} cid=${bootstrap.playerInfo.cid}`;
      if (!context.preserveRightList) {
        setSelectedPlaylistBvid('home', bootstrap.playerInfo?.bvid);
        renderPlaylist('home');
      }
      if (!context.preservePageParts) {
        renderPageParts('home', bootstrap);
      }
      renderRecommendations('home', bootstrap);
      syncVideoIntro('home');
      await loadScriptOnce(document, bootstrap.coreScript, () => pageWindow.nano);
      if (token !== state.switchToken || !pageWindow.nano || homeRenderer.isClosed()) return;
      if (canReloadHome()) await reloadHomePlayer(bootstrap, token);else {
        disposeHomePlayer();
        createHomePlayer(bootstrap, token);
      }
      mountHomeComments(bootstrap, token);
    }
    function prepareLiveHome(meta) {
      const ui = ensureHomeShell();
      showHomeShell(meta.title || `Bilibili 直播 ${meta.roomId}`);
      ui.openOriginal.dataset.href = meta.href;
      ui.status.textContent = state.home.player ? '直播参数：解析中，准备换源' : '直播参数：解析中';
      setLiveListMode('home', true);
      state.home.pageCards = [];
      state.home.recommendationCards = [];
      capturePageLiveList('home', getPlayableKey(meta));
      renderLiveList('home', '当前页面没有扫到直播卡片');
      return {
        ui,
        live: true
      };
    }
    async function bootLiveHome(context, bootstrap, token) {
      const {
        ui
      } = context;
      state.home.bootstrap = bootstrap;
      ui.title.textContent = bootstrap.title || ui.title.textContent;
      ui.openOriginal.dataset.href = bootstrap.href;
      ui.status.textContent = `直播参数：room=${bootstrap.playerInfo.roomId}`;
      setSelectedLiveKey('home', getPlayableKey(bootstrap.playerInfo));
      renderLiveList('home', '当前页面没有扫到直播卡片');
      disposeHomePlayer();
      disposeHomeComments();
      mountLiveHomePlayerShell();
      installLivePipGlobals(pageWindow, bootstrap);
      await loadScriptOnce(document, bootstrap.playerScript, () => pageWindow.Player);
      if (token !== state.switchToken || homeRenderer.isClosed()) return;
      if (!pageWindow.Player) throw new Error('live Player not available after load');
      connectLiveHomePlayer(bootstrap, token);
    }
    function failHome(context, error) {
      console.error('[bili-popup-player] modal init failed', error);
      context.ui.status.textContent = `初始化失败：${error?.message || 'unknown'}`;
    }
    function ensureHomeShell() {
      if (state.home.ui && state.home.overlay?.isConnected) return state.home.ui;
      state.home.ui = mountHomePlayerPage({
        createCommentsTabs,
        onBackToTop: scrollHomeCommentsToTop,
        onBackdropClose: closeHome,
        onClose: closeHome,
        onFullscreen: () => setHomeFullscreen(!state.home.overlay?.classList.contains(`${APP}--fullscreen`)),
        onHistoryNext: () => openPlaybackHistoryOffset(1),
        onHistoryPrevious: () => openPlaybackHistoryOffset(-1),
        onModalResizeStart: startHomeModalResize,
        onOpenOriginal: href => openOriginalPlaybackPage(href, state.home.player),
        onOpenPip: openCurrentHomeInPip,
        onPlayerControlClick: onHomePlayerControlClick,
        onResetSize: resetHomeModalSize,
        onToggleAutoPlay: toggleAutoPlayNext,
        onResizeStart: event => startCommentWidthDrag(event, window),
        supportsPip: supportsDocumentPip()
      });
      state.home.overlay = state.home.ui.overlay;
      attachHomeBackToTopSync();
      attachHomePlaylistAutoRefresh();
      syncHomeCommentLayout();
      syncCommentsTabs('home');
      return state.home.ui;
    }
    function showHomeShell(title, {
      preserveScroll = false
    } = {}) {
      const ui = state.home.ui;
      state.home.overlay.classList.remove(`${APP}--hidden`);
      state.home.overlay.removeAttribute('aria-hidden');
      document.body.classList.add(`${APP}--modal-open`);
      setExternalPlayerFeaturesBlocked(true);
      setHomePlayerFeatureBlocked(false);
      ui.title.textContent = title;
      syncPlaybackHistoryButtons();
      if (!preserveScroll) ui.content.scrollTop = 0;
      syncHomeCommentLayout();
      syncCommentsTabs('home');
      document.documentElement.style.overflow = 'hidden';
      document.addEventListener('keydown', onKeydown, true);
      ui.close.focus();
      syncHomeSize();
      syncHomeModalSizeButton();
      syncAutoPlayNextButton();
      schedulePlaylistAutoRefreshCheck('home');
    }
    function onCommentsTabChange(kind, tab) {
      syncPlayerHandoffAvailability(kind);
      if (tab === 'playlist') schedulePlaylistAutoRefreshCheck(kind);
    }
    function openCurrentHomeInPip() {
      const bootstrap = state.home.bootstrap;
      const ui = state.home.ui;
      const info = bootstrap?.playerInfo;
      const href = bootstrap?.href || ui?.openOriginal?.dataset.href || '';
      if (!bootstrap || !href) return;
      pausePlayer(state.home.player);
      if (ui?.status) ui.status.textContent = '已暂停，正在打开 PiP';
      if (isLiveBootstrap(bootstrap) || info?.roomId) {
        const roomId = info?.roomId;
        if (!roomId) return;
        openWithRenderer(pipRenderer, {
          kind: 'live',
          roomId,
          href,
          title: bootstrap.title || ui?.title?.textContent || `Bilibili 直播 ${roomId}`,
          fromLivePageButton: !state.home.liveListMode
        });
        return;
      }
      const bvid = info?.bvid || getCurrentPageBvid();
      if (!bvid) return;
      openWithRenderer(pipRenderer, {
        bvid,
        href,
        title: bootstrap.title || ui?.title?.textContent || bvid
      });
    }
    function onHomePlayerControlClick(event) {
      const target = event.target;
      const control = target?.closest?.('.bpx-player-ctrl-web, .bpx-player-ctrl-web-enter, .bpx-player-ctrl-web-leave, .bilibili-player-video-btn-web-fullscreen');
      if (!control || !state.home.ui?.playerRoot?.contains(control)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      setHomeFullscreen(!state.home.overlay?.classList.contains(`${APP}--fullscreen`));
    }
    async function likeCurrentPlayback(kind) {
      const slot = state[kind];
      const bootstrap = slot?.bootstrap;
      if (!slot || !bootstrap || isLiveBootstrap(bootstrap)) return false;
      const aid = Number(bootstrap.playerInfo?.aid);
      if (!Number.isFinite(aid) || aid <= 0) return false;
      if (slot.likeBusy) return true;
      const nextLiked = !isBootstrapLiked(bootstrap);
      const message = nextLiked ? '已点赞' : '已取消';
      slot.likeBusy = true;
      try {
        await requestArchiveLike(aid, nextLiked);
        setBootstrapLiked(bootstrap, nextLiked);
        syncPlayerExternalState(kind);
        showLikeBurst(kind, message, nextLiked ? 'success' : 'neutral');
        if (kind === 'home' && state.home.ui?.status) state.home.ui.status.textContent = message;
        if (kind === 'pip') setPipStatus(message);
      } catch (error) {
        showLikeBurst(kind, error?.message || '点赞失败', 'error');
        if (kind === 'home' && state.home.ui?.status) state.home.ui.status.textContent = `点赞失败：${error?.message || 'unknown'}`;
        if (kind === 'pip') setPipStatus(`点赞失败：${error?.message || 'unknown'}`);
      } finally {
        slot.likeBusy = false;
      }
      return true;
    }
    function isBootstrapLiked(bootstrap) {
      const value = bootstrap?.initialState?.videoData?.req_user?.like;
      return value === true || value === 1 || value === '1';
    }
    function setBootstrapLiked(bootstrap, liked) {
      const videoData = bootstrap?.initialState?.videoData;
      if (!videoData) return;
      videoData.req_user ||= {};
      videoData.req_user.like = liked ? 1 : 0;
    }
    function showLikeBurst(kind, message, tone = 'success', {
      icon = true
    } = {}) {
      const slot = state[kind];
      const targetDocument = kind === 'pip' && state.pip.win && !state.pip.win.closed ? state.pip.win.document : document;
      const host = getLikeBurstHost(kind);
      if (!slot || !targetDocument || !host) return;
      if (slot.likeBurstTimer) {
        window.clearTimeout(slot.likeBurstTimer);
        slot.likeBurstTimer = 0;
      }
      host.querySelector?.(`.${APP}__like-burst`)?.remove();
      const burst = targetDocument.createElement('div');
      burst.className = `${APP}__like-burst ${APP}__like-burst--${tone}`;
      burst.setAttribute('role', 'status');
      if (icon) burst.append(createLikeBurstIcon(targetDocument));
      const text = targetDocument.createElement('span');
      text.textContent = message;
      burst.appendChild(text);
      host.appendChild(burst);
      slot.likeBurstTimer = window.setTimeout(() => {
        slot.likeBurstTimer = 0;
        burst.remove();
      }, 900);
    }
    function showSwitchBurst(kind, direction) {
      const offset = Number(direction);
      showLikeBurst(kind, offset < 0 ? '上一条' : '下一条', 'neutral', {
        icon: false
      });
    }
    function getLikeBurstHost(kind) {
      if (kind === 'home') return state.home.ui?.playerWrap || state.home.ui?.playerRoot || null;
      if (kind === 'pip') {
        const pipWindow = state.pip.win;
        if (!pipWindow || pipWindow.closed || isLiveBootstrap(state.pip.bootstrap)) return null;
        return pipWindow.document?.getElementById('stage') || pipWindow.document?.getElementById('bilibili-player') || null;
      }
      return null;
    }
    function createLikeBurstIcon(targetDocument) {
      const svg = targetDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('aria-hidden', 'true');
      ['M7 10v12', 'M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z'].forEach(pathData => {
        const path = targetDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        svg.appendChild(path);
      });
      return svg;
    }
    function syncVideoIntro(kind) {
      const slot = state[kind];
      if (!slot || isLiveBootstrap(slot.bootstrap)) return;
      const targetDocument = getVideoIntroDocument(kind);
      const mount = getVideoIntroMount(kind);
      if (!targetDocument || !mount) return;
      renderVideoIntro({
        targetDocument,
        mount,
        bootstrap: slot.bootstrap,
        followBusy: slot.followBusy,
        onFollow: (mid, follow) => handleFollowUp(kind, mid, follow)
      });
      void ensureOwnerProfile(kind, slot.bootstrap);
    }
    function getVideoIntroDocument(kind) {
      if (kind === 'pip') {
        const pipWindow = state.pip.win;
        return pipWindow && !pipWindow.closed ? pipWindow.document : null;
      }
      return document;
    }
    function getVideoIntroMount(kind) {
      if (kind === 'home') return state.home.ui?.videoIntro || null;
      if (kind === 'pip') {
        const pipWindow = state.pip.win;
        if (!pipWindow || pipWindow.closed) return null;
        return pipWindow.document?.getElementById('video-intro') || null;
      }
      return null;
    }
    async function handleFollowUp(kind, mid, follow) {
      const slot = state[kind];
      if (!slot || slot.followBusy) return;
      const nextFollow = typeof follow === 'boolean' ? follow : !isBootstrapFollowed(slot.bootstrap);
      const message = nextFollow ? '已关注 UP 主' : '已取消关注';
      slot.followBusy = true;
      syncVideoIntro(kind);
      try {
        await requestFollowUp(mid, nextFollow);
        setBootstrapFollowed(slot.bootstrap, nextFollow);
        syncPlayerExternalState(kind);
        showLikeBurst(kind, message, nextFollow ? 'success' : 'neutral', {
          icon: false
        });
        if (kind === 'home' && state.home.ui?.status) state.home.ui.status.textContent = message;
        if (kind === 'pip') setPipStatus(message);
      } catch (error) {
        const action = nextFollow ? '关注' : '取消关注';
        if (kind === 'home' && state.home.ui?.status) state.home.ui.status.textContent = `${action}失败：${error?.message || 'unknown'}`;
        if (kind === 'pip') setPipStatus(`${action}失败：${error?.message || 'unknown'}`);
      } finally {
        slot.followBusy = false;
        syncVideoIntro(kind);
      }
    }
    function isBootstrapFollowed(bootstrap) {
      const value = bootstrap?.initialState?.videoData?.req_user?.attention;
      return value === true || value === 1 || value === '1';
    }
    function setBootstrapFollowed(bootstrap, followed) {
      const videoData = bootstrap?.initialState?.videoData;
      if (!videoData) return;
      videoData.req_user ||= {};
      videoData.req_user.attention = followed ? 1 : 0;
    }
    async function ensureOwnerProfile(kind, bootstrap) {
      const slot = state[kind];
      const owner = bootstrap?.initialState?.videoData?.owner;
      const mid = Number(owner?.mid);
      if (!slot || !owner || !Number.isFinite(mid) || mid <= 0 || owner.__biliPopupPlayerNanoProfileLoaded) return;
      try {
        let profile = state.ownerProfileCache.get(mid);
        if (!profile) {
          let request = state.ownerProfileRequests.get(mid);
          if (!request) {
            request = fetchOwnerProfile(mid).finally(() => {
              state.ownerProfileRequests.delete(mid);
            });
            state.ownerProfileRequests.set(mid, request);
          }
          profile = await request;
          state.ownerProfileCache.set(mid, profile);
        }
        if (slot.bootstrap !== bootstrap) return;
        applyOwnerProfile(bootstrap, profile);
        syncVideoIntro(kind);
        syncPlayerExternalState(kind);
      } catch {
        owner.__biliPopupPlayerNanoProfileLoaded = true;
      }
    }
    function applyOwnerProfile(bootstrap, profile) {
      const videoData = bootstrap?.initialState?.videoData;
      const owner = videoData?.owner;
      if (!owner || !profile) return;
      owner.__biliPopupPlayerNanoProfileLoaded = true;
      if (profile.name) owner.name = profile.name;
      if (profile.face) owner.face = profile.face;
      if (profile.sign) owner.sign = profile.sign;
      const fans = Number(profile.fans);
      if (Number.isFinite(fans) && fans >= 0) owner.fans = fans;
      videoData.req_user ||= {};
      videoData.req_user.attention = profile.followed ? 1 : 0;
    }
    function schedulePlayerExternalStateSync(kind) {
      syncPlayerExternalState(kind);
      schedulePlayerHandoffAvailabilitySync(kind);
      const targetWindow = kind === 'pip' && state.pip.win && !state.pip.win.closed ? state.pip.win : window;
      targetWindow.setTimeout(() => {
        syncPlayerExternalState(kind);
        schedulePlayerHandoffAvailabilitySync(kind);
      }, 300);
    }
    function syncPlayerExternalState(kind) {
      const slot = state[kind];
      if (!slot?.player || !slot.bootstrap || isLiveBootstrap(slot.bootstrap)) return;
      const playerApi = getPlayerApiForKind(kind);
      if (!playerApi?.InternalKind || typeof slot.player.setState !== 'function') return;
      try {
        slot.player.setState(getPlayerExternalState(slot.bootstrap.initialState, playerApi.InternalKind));
        syncPlayerHandoffAvailability(kind);
      } catch {
        // The nano API is not ready until after connect/reload has mounted its stores.
      }
    }
    function schedulePlayerHandoffAvailabilitySync(kind) {
      const targetWindow = kind === 'pip' && state.pip.win && !state.pip.win.closed ? state.pip.win : window;
      [0, 80, 300, 800].forEach(delay => {
        targetWindow.setTimeout(() => syncPlayerHandoffAvailability(kind), delay);
      });
    }
    function getPlayerApiForKind(kind) {
      if (kind === 'pip') {
        const pipWindow = state.pip.win;
        return pipWindow && !pipWindow.closed ? pipWindow.nano : null;
      }
      return pageWindow.nano;
    }
    function setHomeFullscreen(active) {
      if (!state.home.overlay) return;
      state.home.overlay.classList.toggle(`${APP}--fullscreen`, Boolean(active));
      syncHomeFullscreenButton();
      syncHomePlayerOnlyControl();
      syncHomeModalSizeButton();
      syncHomeSize();
    }
    function buildHomePrimarySetting(bootstrap) {
      const runtime = getPlayerApiForKind('home');
      const info = bootstrap.playerInfo;
      const handoff = getPlayerHandoffAvailability('home');
      const setting = {
        element: state.home.ui.playerRoot,
        aid: info.aid,
        cid: info.cid,
        bvid: info.bvid,
        p: info.p,
        t: info.t,
        hasPrev: handoff?.hasPrev ?? Boolean(info.hasPrev),
        hasNext: handoff?.hasNext ?? Boolean(info.hasNext),
        seasonId: info.seasonId,
        kind: runtime.GroupKind.Ugc,
        featureList: new Set(['blackGap']),
        stats: {
          spmId: '333.788.0.0',
          spmIdFrom: '333.788.0.0',
          trackId: ''
        },
        autoplay: true,
        enableHEVC: true,
        enableAV1: true,
        screenKind: getScreenKind(runtime),
        revision: 1,
        viewInfo: getPlayerViewInfo(bootstrap.initialState)
      };
      if (bootstrap.playInfo) setting.prefetch = {
        playUrl: bootstrap.playInfo
      };
      return setting;
    }
    function canReloadHome() {
      return Boolean(state.home.player && typeof state.home.player.reload === 'function' && state.home.ui?.playerRoot?.isConnected);
    }
    async function reloadHomePlayer(bootstrap, token) {
      const setting = buildHomePrimarySetting(bootstrap);
      updateDebug(setting, bootstrap);
      state.home.ui.status.textContent = '播放器：reload 中';
      syncHomeSize();
      await Promise.resolve(state.home.player.reload(setting, bootstrap.initialState?.nanoTheme));
      if (token !== state.switchToken || !state.home.player) return;
      schedulePlayerExternalStateSync('home');
      bindHomeScreenChange(state.home.player);
      bindHomePlayerNavigate(state.home.player);
      bindHomePlayerHandoff(state.home.player);
      bindHomePlayerEnded(state.home.player);
      syncPlayerHandoffAvailability('home');
      setHomePlayerFeatureBlocked(homeRenderer.isClosed());
      state.home.ui.status.textContent = '播放器：已 reload';
      playHomeSoon(token, 300);
    }
    function createHomePlayer(bootstrap, token) {
      const setting = buildHomePrimarySetting(bootstrap);
      const runtime = getPlayerApiForKind('home');
      state.home.ui.playerRoot.textContent = '';
      state.home.ui.playerRoot.classList.remove(`${APP}__live-player-root`);
      state.home.player = runtime.createPlayer(setting, bootstrap.initialState?.nanoTheme);
      bindHomeScreenChange(state.home.player);
      bindHomePlayerNavigate(state.home.player);
      bindHomePlayerHandoff(state.home.player);
      bindHomePlayerEnded(state.home.player);
      syncPlayerHandoffAvailability('home');
      setHomePlayerFeatureBlocked(homeRenderer.isClosed());
      updateDebug(setting, bootstrap);
      state.home.player.connect();
      schedulePlayerExternalStateSync('home');
      state.home.ui.status.textContent = '播放器：已 createPlayer';
      syncHomeSize();
      playHomeSoon(token, 1200);
    }
    async function mountHomeComments(bootstrap, token) {
      state.home.bootstrap = bootstrap;
      const result = await mountComments({
        slot: state.home,
        mount: state.home.ui?.commentsMount,
        targetDocument: document,
        getCtor: () => pageWindow.BiliComments,
        beforeLoad: () => ensureBiliThemeStylesheets(document),
        getPlayer: () => state.home.player,
        getScrollContainer: getHomeCommentInstanceScrollContainer,
        isActive: () => token === state.switchToken && state.home.ui && !state.home.overlay?.classList.contains(`${APP}--hidden`)
      }, bootstrap);
      scheduleHomeBottomFixedWrapperSync();
      return result;
    }
    const pipRenderer = {
      getReusable: getReusablePip,
      reuse: reusePip,
      prepare: preparePip,
      play: playPip,
      fail: failPip,
      done: (_context, bootstrap) => {
        setLastButtonStatus('播放中');
        setPipPlaying(bootstrap);
      },
      isClosed: context => !context?.pipWindow || context.pipWindow.closed
    };
    rendererOrchestrator = createRendererOrchestrator({
      getActiveRenderer,
      nextToken: () => ++state.switchToken,
      isCurrentToken: token => token === state.switchToken,
      resolveBootstrap,
      saveLastPlayed,
      recordPlaybackHistory
    });
    startPlaybackFromUrlParams();
    function getReusablePip(meta) {
      if (!state.pip.win || state.pip.win.closed || state.pip.win.__biliPopupPlayerNanoClosed || !state.pip.player || !state.pip.bootstrap || !isSamePlayback(meta, state.pip.bootstrap)) return null;
      return {
        pipWindow: state.pip.win,
        bootstrap: state.pip.bootstrap
      };
    }
    function reusePip(context, meta) {
      const bootstrap = context.bootstrap;
      saveLastPlayed(meta, bootstrap);
      recordPlaybackHistory(meta, bootstrap);
      syncPlaybackPageMeta('pip', bootstrap);
      ensurePipPlayerControls(context.pipWindow, meta.href || bootstrap.href);
      attachPipCommentsTabs(context.pipWindow);
      setSelectedPlaylistBvid('pip', meta.bvid || bootstrap.playerInfo?.bvid);
      renderPlaylist('pip');
      renderPageParts('pip', bootstrap);
      renderRecommendations('pip', bootstrap);
      syncVideoIntro('pip');
      syncPipCommentLayout(context.pipWindow);
      syncPipSize(context.pipWindow);
      setPipPlaying(bootstrap);
      setPipStatus('播放中');
      try {
        context.pipWindow.focus?.();
        state.pip.player.play?.();
      } catch {
        // Keep the existing PiP instance.
      }
    }
    async function preparePip(meta) {
      if (!supportsDocumentPip()) {
        setLastButtonStatus('不支持 PiP');
        return null;
      }
      let pipWindow;
      if (state.pip.win && !state.pip.win.closed && !state.pip.win.__biliPopupPlayerNanoClosed) {
        pipWindow = state.pip.win;
        setLastButtonStatus('换源中');
      } else {
        setLastButtonStatus('打开中');
        try {
          pipWindow = await window.documentPictureInPicture.requestWindow({
            width: Math.min(960, Math.floor(window.screen.availWidth * 0.55)),
            height: Math.min(540, Math.floor(window.screen.availHeight * 0.55))
          });
        } catch {
          setLastButtonStatus('PiP 被拒绝');
          return null;
        }
        state.pip.win = pipWindow;
      }
      attachPipWindowCloseSync(pipWindow);
      if (isLiveMeta(meta)) {
        setLiveListMode('pip', true);
        state.pip.pageCards = [];
        state.pip.recommendationCards = [];
        state.pip.selectedPageKey = '';
        if (meta.fromLiveList && state.pip.liveCards.some(card => getPlayableKey(card) === getPlayableKey(meta))) {
          setSelectedLiveKey('pip', getPlayableKey(meta));
          renderLiveList('pip', '当前页面没有扫到直播卡片');
        } else if (meta.fromLivePageButton) {
          state.pip.liveCards = [];
          setSelectedLiveKey('pip', '');
        } else {
          capturePageLiveList('pip', getPlayableKey(meta));
          renderLiveList('pip', '当前页面没有扫到直播卡片');
        }
      } else if (meta.fromPlaylist && state.pip.playlistCards.length) {
        setLiveListMode('pip', false);
        setSelectedPlaylistBvid('pip', meta.bvid);
        renderPlaylist('pip');
      } else {
        setLiveListMode('pip', false);
        resetPlaylistFeed('pip');
        capturePagePlaylist('pip', meta.bvid);
      }
      if (state.pip.win && !state.pip.win.closed && !isLiveMeta(meta)) {
        if (meta.fromPagePart && state.pip.pageCards.length) setSelectedPageKey('pip', meta.pageKey);else renderPageParts('pip', null);
      }
      if (state.pip.win && !state.pip.win.closed && !isLiveMeta(meta)) renderRecommendations('pip', null);
      if (!isLiveMeta(meta) && canReloadPip(pipWindow)) setPipStatus('换源中');else {
        disposePipPlayer();
        disposePipComments();
        writePipLoading(pipWindow, meta.title, meta.href);
      }
      return {
        pipWindow,
        href: meta.href
      };
    }
    async function playPip(context, bootstrap, token) {
      syncPlaybackPageMeta('pip', bootstrap);
      await bootPipWindow(context.pipWindow, bootstrap, token);
    }
    function failPip(context, error) {
      setLastButtonStatus('初始化失败');
      writePipError(context.pipWindow, error, context.href);
    }
    async function bootPipWindow(pipWindow, bootstrap, token) {
      state.pip.bootstrap = bootstrap;
      if (isLiveBootstrap(bootstrap)) {
        await bootLivePipWindow(pipWindow, bootstrap, token);
        return;
      }
      if (canReloadPip(pipWindow)) {
        await reloadPipPlayer(pipWindow, bootstrap, token);
        return;
      }
      disposePipPlayer();
      disposePipComments();
      const commentLayoutClass = state.commentLayout === 'right' ? 'comments-right' : 'comments-bottom';
      writePipDocument(pipWindow, renderPipPlayerDocument({
        title: bootstrap.title,
        stylesheets: [...bootstrap.stylesheets, ...getBiliThemeStylesheets()],
        themeClassMarkup: getPipThemeClassMarkup(),
        commentLayoutClass
      }));
      mountPipPlayerPage({
        targetDocument: pipWindow.document,
        createCommentsTabs
      });
      attachPipKeyboardShortcuts(pipWindow);
      attachPipCommentsTabs(pipWindow);
      setSelectedPlaylistBvid('pip', bootstrap.playerInfo?.bvid);
      renderPlaylist('pip');
      renderPageParts('pip', bootstrap);
      renderRecommendations('pip', bootstrap);
      syncVideoIntro('pip');
      syncCommentsTabs('pip');
      attachPipPlaylistAutoRefresh(pipWindow);
      await loadScriptOnce(pipWindow.document, bootstrap.coreScript, () => pipWindow.nano);
      if (token !== state.switchToken || pipWindow.closed) return;
      if (!pipWindow.nano) throw new Error('nano not available after core load');
      attachPipCommentResizer(pipWindow);
      attachPipWindowResizeSync(pipWindow);
      syncCommentWidth();
      connectPipPlayer(pipWindow, bootstrap, token);
      mountPipComments(pipWindow, bootstrap, token);
    }
    function mountLiveHomePlayerShell() {
      const root = state.home.ui?.playerRoot;
      if (!root) return;
      root.textContent = '';
      root.classList.add(`${APP}__live-player-root`);
      root.insertAdjacentHTML('beforeend', getLivePlayerShellMarkup());
    }
    function connectLiveHomePlayer(bootstrap, token) {
      if (token !== state.switchToken || homeRenderer.isClosed()) return;
      const playerRoot = document.getElementById('live-player');
      if (!playerRoot) throw new Error('live-player container not found');
      const player = new pageWindow.Player(playerRoot, buildLivePipPlayerOptions(pageWindow, bootstrap));
      pageWindow.EmbedPlayer = {
        instance: player
      };
      pageWindow.__PLAYER_GLOBAL_INSTANCE__ = player;
      state.home.player = createLivePipPlayerAdapter(pageWindow, player, state.home.ui?.playerWrap || playerRoot);
      setHomePlayerFeatureBlocked(false);
      syncHomeSize();
      window.setTimeout(() => syncHomeSize(), 600);
      window.setTimeout(() => syncHomeSize(), 1600);
      attachLivePlayerOnlyControl();
      window.setTimeout(attachLivePlayerOnlyControl, 600);
      window.setTimeout(attachLivePlayerOnlyControl, 1600);
      state.home.ui.status.textContent = '直播播放器：播放中';
    }
    function attachLivePlayerOnlyControl() {
      const playerRoot = state.home.ui?.playerRoot;
      const liveRoot = playerRoot?.querySelector?.('#live-player');
      if (!liveRoot || !isLiveBootstrap(state.home.bootstrap)) return;
      const layer = findLivePlayerControlLayer(liveRoot);
      if (!layer) return;
      let button = liveRoot.querySelector(`.${APP}__live-player-only-control`);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = `${APP}__live-player-only-control`;
        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation?.();
          toggleHomePlayerOnly();
        });
      }
      layer.classList.add(`${APP}__live-player-controls-layer`);
      if (button.parentElement !== layer) layer.appendChild(button);
      syncHomePlayerOnlyControl();
    }
    function findLivePlayerControlLayer(liveRoot) {
      const rootRect = liveRoot.getBoundingClientRect();
      const candidates = [...liveRoot.querySelectorAll('[class]')].map(element => {
        const rect = element.getBoundingClientRect();
        const className = String(element.className || '');
        if (rect.width < rootRect.width * 0.35 || rect.height < 24 || rect.height > 180) return null;
        if (rect.bottom < rootRect.bottom - 220 || rect.top < rootRect.top + rootRect.height * 0.35) return null;
        if (!/(?:control|controller|toolbar|bottom|operate|panel|wrap)/i.test(className)) return null;
        const score = (/controller|control/i.test(className) ? 8 : 0) + (/wrap|bar|bottom/i.test(className) ? 4 : 0) + Math.max(0, 220 - Math.abs(rootRect.bottom - rect.bottom)) / 20 + rect.width / Math.max(rootRect.width, 1);
        return {
          element,
          score
        };
      }).filter(Boolean).sort((a, b) => b.score - a.score);
      return candidates[0]?.element || null;
    }
    function toggleHomePlayerOnly() {
      setCommentLayout(state.commentLayout === 'right' ? 'bottom' : 'right');
    }
    function syncHomePlayerOnlyControl() {
      const button = state.home.ui?.playerRoot?.querySelector?.(`.${APP}__live-player-only-control`);
      if (!button) return;
      const active = state.commentLayout !== 'right';
      button.title = active ? '退出宽屏' : '宽屏';
      button.setAttribute('aria-label', button.title);
      button.replaceChildren(active ? createMinimizeIcon() : createMaximizeIcon());
    }
    async function bootLivePipWindow(pipWindow, bootstrap, token) {
      disposePipPlayer();
      disposePipComments();
      const liveListCards = state.pip.liveCards || [];
      const hasLiveList = liveListCards.length > 0;
      if (hasLiveList) {
        writePipDocument(pipWindow, renderPipPlayerDocument({
          title: bootstrap.title,
          stylesheets: getBiliThemeStylesheets(),
          themeClassMarkup: getPipThemeClassMarkup(),
          commentLayoutClass: 'comments-right'
        }));
        mountPipPlayerPage({
          targetDocument: pipWindow.document,
          createCommentsTabs
        });
        const stage = pipWindow.document.getElementById('stage');
        if (stage) stage.innerHTML = getLivePlayerShellMarkup();
        attachPipKeyboardShortcuts(pipWindow);
        attachPipCommentsTabs(pipWindow);
        setLiveListMode('pip', true);
        setSelectedLiveKey('pip', getPlayableKey(bootstrap.playerInfo));
        renderLiveList('pip', '当前页面没有扫到直播卡片');
        syncCommentsTabs('pip');
      } else {
        writeLivePipDocument(pipWindow, bootstrap);
      }
      installLivePipGlobals(pipWindow, bootstrap);
      await loadScriptOnce(pipWindow.document, bootstrap.playerScript, () => pipWindow.Player);
      if (token !== state.switchToken || pipWindow.closed) return;
      if (!pipWindow.Player) throw new Error('live Player not available after load');
      connectLivePipPlayer(pipWindow, bootstrap, token);
    }
    function writeLivePipDocument(pipWindow, bootstrap) {
      writePipDocument(pipWindow, renderLivePipDocument({
        title: bootstrap.title,
        href: bootstrap.href,
        themeClassMarkup: getPipThemeClassMarkup()
      }));
    }
    function connectLivePipPlayer(targetWindow, bootstrap, token) {
      if (token !== state.switchToken || targetWindow.closed) return;
      const playerRoot = targetWindow.document.getElementById('live-player');
      if (!playerRoot) throw new Error('live-player container not found');
      const player = new targetWindow.Player(playerRoot, buildLivePipPlayerOptions(targetWindow, bootstrap));
      targetWindow.EmbedPlayer = {
        instance: player
      };
      targetWindow.__PLAYER_GLOBAL_INSTANCE__ = player;
      targetWindow.__biliPopupPlayerNanoDebug = {
        getPlayer: () => player,
        getBootstrap: () => bootstrap,
        getPrimarySetting: () => buildLivePipPlayerOptions(targetWindow, bootstrap)
      };
      state.pip.player = createLivePipPlayerAdapter(targetWindow, player, targetWindow.document.getElementById('stage') || playerRoot);
      attachPipWindowResizeSync(targetWindow);
      syncPipSize(targetWindow);
      targetWindow.setTimeout(() => syncPipSize(targetWindow), 600);
      targetWindow.setTimeout(() => syncPipSize(targetWindow), 1600);
      setPipStatus('播放中');
      targetWindow.addEventListener('pagehide', () => {
        if (state.pip.switchingWindow) return;
        if (state.pip.player) disposePipPlayer();
        if (state.pip.win === targetWindow) state.pip.win = null;
      });
    }
    function attachPipWindowResizeSync(targetWindow) {
      if (!targetWindow || targetWindow.closed) return;
      if (targetWindow.__biliPopupPlayerNanoResizeSyncBound) return;
      targetWindow.__biliPopupPlayerNanoResizeSyncBound = true;
      const onResize = () => schedulePipLayoutSync(targetWindow);
      targetWindow.addEventListener('resize', onResize);
      targetWindow.__biliPopupPlayerNanoResizeSyncCleanup = () => {
        targetWindow.removeEventListener('resize', onResize);
        targetWindow.__biliPopupPlayerNanoResizeObserver?.disconnect?.();
        delete targetWindow.__biliPopupPlayerNanoResizeObserver;
        delete targetWindow.__biliPopupPlayerNanoResizeSyncCleanup;
        delete targetWindow.__biliPopupPlayerNanoResizeSyncBound;
      };
      const stage = targetWindow.document?.getElementById('stage');
      if (stage && targetWindow.ResizeObserver) {
        const observer = new targetWindow.ResizeObserver(onResize);
        observer.observe(stage);
        targetWindow.__biliPopupPlayerNanoResizeObserver = observer;
      }
    }
    function attachPipWindowCloseSync(targetWindow) {
      if (!targetWindow || targetWindow.closed || targetWindow.__biliPopupPlayerNanoCloseSyncBound) return;
      targetWindow.__biliPopupPlayerNanoCloseSyncBound = true;
      targetWindow.__biliPopupPlayerNanoClosed = false;
      targetWindow.addEventListener('pagehide', () => {
        if (state.pip.switchingWindow) return;
        targetWindow.__biliPopupPlayerNanoClosed = true;
        if (state.pip.win === targetWindow) state.pip.win = null;
      }, {
        capture: true
      });
    }
    function attachPipKeyboardShortcuts(targetWindow) {
      if (!targetWindow || targetWindow.closed || targetWindow.__biliPopupPlayerNanoKeydownBound) return;
      const handler = event => onPipKeydown(event);
      targetWindow.__biliPopupPlayerNanoKeydownBound = true;
      targetWindow.document.addEventListener('keydown', handler, true);
      targetWindow.addEventListener('pagehide', () => {
        targetWindow.document?.removeEventListener?.('keydown', handler, true);
        if (state.pip.keydownHandler === handler) state.pip.keydownHandler = null;
        delete targetWindow.__biliPopupPlayerNanoKeydownBound;
      }, {
        once: true
      });
      state.pip.keydownHandler = handler;
    }
    function canReloadPip(pipWindow) {
      return Boolean(pipWindow && !pipWindow.closed && !pipWindow.__biliPopupPlayerNanoClosed && state.pip.win === pipWindow && !isLiveBootstrap(state.pip.bootstrap) && state.pip.player && typeof state.pip.player.reload === 'function' && pipWindow.document?.getElementById('bilibili-player') && pipWindow.nano);
    }
    async function reloadPipPlayer(targetWindow, bootstrap, token) {
      if (token !== state.switchToken || targetWindow.closed) return;
      state.pip.bootstrap = bootstrap;
      ensureStylesheetsInWindow(targetWindow, bootstrap.stylesheets);
      targetWindow.document.title = bootstrap.title || 'Bilibili 小窗播放';
      syncPipCommentLayout(targetWindow);
      ensurePipPlayerControls(targetWindow, bootstrap.href);
      attachPipKeyboardShortcuts(targetWindow);
      attachPipCommentsTabs(targetWindow);
      setSelectedPlaylistBvid('pip', bootstrap.playerInfo?.bvid);
      renderPlaylist('pip');
      renderPageParts('pip', bootstrap);
      renderRecommendations('pip', bootstrap);
      syncVideoIntro('pip');
      attachPipPlaylistAutoRefresh(targetWindow);
      attachPipCommentResizer(targetWindow);
      attachPipWindowResizeSync(targetWindow);
      syncCommentWidth();
      syncPipSize(targetWindow);
      setPipStatus('换源中');
      const setting = buildPipPrimarySetting(targetWindow, bootstrap);
      targetWindow.__biliPopupPlayerNanoCurrentSetting = setting;
      targetWindow.__biliPopupPlayerNanoCurrentBootstrap = bootstrap;
      await Promise.resolve(state.pip.player.reload(setting, bootstrap.initialState?.nanoTheme));
      if (token !== state.switchToken || targetWindow.closed || targetWindow.player !== state.pip.player) return;
      schedulePlayerExternalStateSync('pip');
      bindPipScreenChange(targetWindow, state.pip.player);
      bindPipPlayerNavigate(targetWindow, state.pip.player);
      bindPipPlayerHandoff(targetWindow, state.pip.player);
      bindPipPlayerEnded(targetWindow, state.pip.player);
      syncPlayerHandoffAvailability('pip');
      syncPipSize(targetWindow);
      mountPipComments(targetWindow, bootstrap, token);
      setPipStatus('已切换');
      targetWindow.setTimeout(() => {
        if (token !== state.switchToken || targetWindow.closed || targetWindow.player !== state.pip.player) return;
        syncPipSize(targetWindow);
        try {
          state.pip.player.play?.();
          setPipStatus('播放中');
        } catch {
          setPipStatus('等待用户播放');
        }
      }, 300);
    }
    function connectPipPlayer(targetWindow, bootstrap, token) {
      if (token !== state.switchToken || targetWindow.closed) return;
      const setting = buildPipPrimarySetting(targetWindow, bootstrap);
      const player = targetWindow.nano.createPlayer(setting, bootstrap.initialState?.nanoTheme);
      targetWindow.player = player;
      targetWindow.__biliPopupPlayerNanoDebug = {
        getPlayer: () => targetWindow.player,
        getComments: () => state.pip.comments,
        getPrimarySetting: () => targetWindow.__biliPopupPlayerNanoCurrentSetting,
        getBootstrap: () => targetWindow.__biliPopupPlayerNanoCurrentBootstrap
      };
      targetWindow.__biliPopupPlayerNanoCurrentSetting = setting;
      targetWindow.__biliPopupPlayerNanoCurrentBootstrap = bootstrap;
      state.pip.player = player;
      player.connect();
      schedulePlayerExternalStateSync('pip');
      bindPipScreenChange(targetWindow, player);
      bindPipPlayerNavigate(targetWindow, player);
      bindPipPlayerHandoff(targetWindow, player);
      bindPipPlayerEnded(targetWindow, player);
      syncPlayerHandoffAvailability('pip');
      ensurePipPlayerControls(targetWindow, bootstrap.href);
      syncPipSize(targetWindow);
      setPipStatus('已创建播放器');
      targetWindow.setTimeout(() => {
        if (token !== state.switchToken || targetWindow.closed || state.pip.player !== player) return;
        syncPipSize(targetWindow);
        try {
          player.play?.();
          setPipStatus('播放中');
        } catch {
          setPipStatus('等待用户播放');
        }
      }, 800);
      targetWindow.addEventListener('pagehide', () => {
        if (state.pip.player === player) unbindPipScreenChange();
        if (state.pip.player === player) unbindPipPlayerNavigate();
        if (state.pip.player === player) unbindPipPlayerHandoff();
        if (state.pip.player === player) unbindPipPlayerEnded();
        try {
          player.disconnect?.();
        } catch {
          // Ignore cleanup failures.
        }
        if (state.pip.switchingWindow) return;
        disposePipComments();
        setPipPlaying(null);
        if (state.pip.win === targetWindow) state.pip.win = null;
        if (state.pip.player === player) state.pip.player = null;
      });
    }
    function buildPipPrimarySetting(targetWindow, bootstrap) {
      const info = bootstrap.playerInfo;
      const handoff = getPlayerHandoffAvailability('pip');
      const setting = {
        element: targetWindow.document.getElementById('bilibili-player'),
        aid: info.aid,
        cid: info.cid,
        bvid: info.bvid,
        p: info.p,
        t: info.t,
        hasPrev: handoff?.hasPrev ?? Boolean(info.hasPrev),
        hasNext: handoff?.hasNext ?? Boolean(info.hasNext),
        seasonId: info.seasonId,
        kind: targetWindow.nano.GroupKind.Ugc,
        featureList: new targetWindow.Set(['blackGap']),
        stats: {
          spmId: '333.788.0.0',
          spmIdFrom: '333.788.0.0',
          trackId: ''
        },
        autoplay: true,
        enableHEVC: true,
        enableAV1: true,
        screenKind: getScreenKind(targetWindow.nano),
        revision: 1,
        viewInfo: getPlayerViewInfo(bootstrap.initialState)
      };
      if (bootstrap.playInfo) setting.prefetch = {
        playUrl: bootstrap.playInfo
      };
      return setting;
    }
    async function mountPipComments(targetWindow, bootstrap, token) {
      state.pip.bootstrap = bootstrap;
      const result = await mountComments({
        slot: state.pip,
        mount: targetWindow.document?.getElementById('comments-mount'),
        targetDocument: targetWindow.document,
        getCtor: () => targetWindow.BiliComments,
        getPlayer: () => state.pip.player,
        getScrollContainer: () => getPipCommentInstanceScrollContainer(targetWindow),
        isActive: () => token === state.switchToken && !targetWindow.closed
      }, bootstrap);
      attachPipCommentScrollSync(targetWindow);
      schedulePipLayoutSync(targetWindow);
      schedulePipBottomFixedWrapperSync(targetWindow);
      return result;
    }
    function setCommentLayout(value) {
      const next = value === 'right' ? 'right' : 'bottom';
      if (state.commentLayout === next) return;
      state.commentLayout = next;
      setStorageItem(STORAGE_COMMENT_LAYOUT, next);
      syncCommentLayout();
      syncHomePlayerOnlyControl();
      remountCommentsForLayout();
    }
    function syncCommentLayout() {
      syncHomeCommentLayout();
      if (state.pip.win && !state.pip.win.closed) syncPipCommentLayout(state.pip.win);
      scheduleSelectedPlaylistScrollForLayout();
      scheduleHomeBottomFixedWrapperSync();
      if (state.pip.win && !state.pip.win.closed) schedulePipBottomFixedWrapperSync(state.pip.win);
    }
    function setLiveListMode(kind, active) {
      const scope = state[kind];
      if (!scope) return;
      scope.liveListMode = Boolean(active);
      if (active) scope.activeCommentsTab = 'live';else if (scope.activeCommentsTab === 'live') scope.activeCommentsTab = 'comments';
      const doc = kind === 'pip' ? state.pip.win?.document : document;
      const root = kind === 'pip' ? doc?.getElementById('comments') : state.home.ui?.comments;
      root?.querySelectorAll?.(`.${APP}__comments-tab`)?.forEach(button => {
        button.hidden = active ? button.dataset.tab !== 'live' : button.dataset.tab === 'pages' && !scope.pageCards?.length || button.dataset.tab === 'live';
      });
      if (kind === 'home') syncAutoPlayNextButton();
      syncCommentsTabs(kind);
    }
    function getLivePlayerShellMarkup() {
      return '<div id="fullscreen-container"><div id="live-player"><div id="fullscreen-danmaku-vm"><fullscreen-danmaku></fullscreen-danmaku></div></div></div>';
    }
    function scheduleSelectedPlaylistScrollForLayout() {
      window.requestAnimationFrame(() => {
        if (state.commentLayout !== 'right') return;
        if (state.home.activeCommentsTab === 'playlist') scrollSelectedPlaylistIntoView('home');
        if (state.home.activeCommentsTab === 'live') scrollSelectedLiveIntoView('home');
        if (state.pip.win && !state.pip.win.closed && state.pip.activeCommentsTab === 'playlist') {
          scrollSelectedPlaylistIntoView('pip');
        }
        if (state.pip.win && !state.pip.win.closed && state.pip.activeCommentsTab === 'live') {
          scrollSelectedLiveIntoView('pip');
        }
      });
    }
    function syncCommentWidth() {
      state.commentWidth = clampCommentWidth(state.commentWidth);
      const value = `${state.commentWidth}px`;
      state.home.ui?.overlay?.style.setProperty(`--${APP}-comments-width`, value);
      if (state.home.ui?.commentsResizer) {
        state.home.ui.commentsResizer.setAttribute('aria-valuenow', String(state.commentWidth));
        state.home.ui.commentsResizer.setAttribute('aria-valuemin', String(COMMENT_WIDTH_MIN));
        state.home.ui.commentsResizer.setAttribute('aria-valuemax', String(COMMENT_WIDTH_MAX));
      }
      const pipDocument = state.pip.win && !state.pip.win.closed ? state.pip.win.document : null;
      pipDocument?.documentElement?.style.setProperty(`--${APP}-comments-width`, value);
      const pipResizer = pipDocument?.getElementById('comments-resizer');
      if (pipResizer) {
        pipResizer.setAttribute('aria-valuenow', String(state.commentWidth));
        pipResizer.setAttribute('aria-valuemin', String(COMMENT_WIDTH_MIN));
        pipResizer.setAttribute('aria-valuemax', String(COMMENT_WIDTH_MAX));
      }
      syncHomeSize();
      if (state.pip.win && !state.pip.win.closed) syncPipSize(state.pip.win);
    }
    function attachHomeBackToTopSync() {
      const ui = state.home.ui;
      if (!ui?.content || !ui.comments || ui.backToTop?.__biliPopupPlayerNanoScrollBound) return;
      ui.backToTop.__biliPopupPlayerNanoScrollBound = true;
      ui.content.addEventListener('scroll', () => {
        syncHomeBackToTopButton();
        scheduleHomeBottomFixedWrapperSync();
      }, {
        passive: true
      });
      [ui.commentsPanel, ui.pagesPanel, ui.playlistPanel, ui.recommendPanel].forEach(panel => {
        panel?.addEventListener('scroll', () => {
          syncHomeBackToTopButton();
          scheduleHomeBottomFixedWrapperSync();
        }, {
          passive: true
        });
      });
      syncHomeBackToTopButton();
      scheduleHomeBottomFixedWrapperSync();
    }
    function attachHomePlaylistAutoRefresh() {
      const ui = state.home.ui;
      if (!ui?.content || !ui.playlistPanel) return;
      [ui.content, ui.playlistPanel].forEach(container => {
        if (!container || container.__biliPopupPlayerNanoPlaylistRefreshBound) return;
        container.__biliPopupPlayerNanoPlaylistRefreshBound = true;
        container.addEventListener('scroll', () => schedulePlaylistAutoRefreshCheck('home'), {
          passive: true
        });
      });
    }
    function attachPipPlaylistAutoRefresh(targetWindow) {
      if (!targetWindow || targetWindow.closed) return;
      const doc = targetWindow.document;
      const layout = doc?.getElementById('layout');
      const playlistPanel = doc?.getElementById('playlist-panel');
      [layout, playlistPanel].forEach(container => {
        if (!container || container.__biliPopupPlayerNanoPlaylistRefreshBound) return;
        container.__biliPopupPlayerNanoPlaylistRefreshBound = true;
        container.addEventListener('scroll', () => schedulePlaylistAutoRefreshCheck('pip'), {
          passive: true
        });
      });
    }
    function schedulePlaylistAutoRefreshCheck(kind) {
      const scope = state[kind];
      if (!scope || scope.playlistRefreshFrame) return;
      const targetWindow = kind === 'pip' && state.pip.win && !state.pip.win.closed ? state.pip.win : window;
      scope.playlistRefreshFrame = targetWindow.requestAnimationFrame(() => {
        scope.playlistRefreshFrame = 0;
        void maybeLoadMorePlaylist(kind);
      });
    }
    async function maybeLoadMorePlaylist(kind, {
      force = false,
      ignoreActiveTab = false
    } = {}) {
      const scope = state[kind];
      const feed = scope?.feed;
      if (!feed || feed.loading || feed.exhausted) return;
      if (!isHomeFeedPage()) return;
      if (!ignoreActiveTab && !isPlaylistAutoRefreshActive(kind)) return;
      if (!force && !isPlaylistNearBottom(kind)) return;
      const requestId = feed.requestId + 1;
      feed.requestId = requestId;
      feed.loading = true;
      feed.error = '';
      feed.session ||= createHomeFeedSession();
      renderPlaylist(kind, {
        appendLoading: scope.playlistCards.length > 0,
        autoScrollSelected: false,
        loading: scope.playlistCards.length === 0
      });
      try {
        const cards = await fetchHomeFeedCards({
          existingCards: scope.playlistCards,
          session: feed.session
        });
        if (requestId !== feed.requestId) return;
        if (!cards.length) {
          feed.exhausted = true;
          return;
        }
        appendPlaylistCards(kind, cards);
      } catch (error) {
        if (requestId !== feed.requestId) return;
        feed.error = error?.message || String(error);
        console.warn('[bili-popup-player] home feed refresh failed', error);
      } finally {
        if (requestId === feed.requestId) {
          feed.loading = false;
          renderPlaylist(kind, getPlaylistEmptyText(kind), {
            autoScrollSelected: false
          });
        }
      }
    }
    function appendPlaylistCards(kind, cards) {
      const scope = state[kind];
      if (!scope) return;
      const seen = new Set(scope.playlistCards.map(card => card?.bvid).filter(Boolean));
      const nextCards = cards.filter(card => {
        if (!card?.bvid || seen.has(card.bvid)) return false;
        seen.add(card.bvid);
        return true;
      });
      if (nextCards.length) scope.playlistCards = [...scope.playlistCards, ...nextCards];
    }
    function isPlaylistNearBottom(kind) {
      const container = getPlaylistScrollContainer(kind);
      if (!container) return false;
      return container.scrollHeight - container.scrollTop - container.clientHeight <= 320;
    }
    function getPlaylistScrollContainer(kind) {
      if (kind === 'home') {
        const ui = state.home.ui;
        if (!ui) return null;
        return state.commentLayout === 'right' ? ui.playlistPanel : ui.content;
      }
      const doc = state.pip.win && !state.pip.win.closed ? state.pip.win.document : null;
      if (!doc) return null;
      return state.commentLayout === 'right' ? doc.getElementById('playlist-panel') : doc.getElementById('layout');
    }
    function isPlaylistAutoRefreshActive(kind) {
      if (kind === 'home') {
        return Boolean(state.home.ui && state.home.overlay && !state.home.overlay.classList.contains(`${APP}--hidden`) && state.home.activeCommentsTab === 'playlist');
      }
      return Boolean(state.pip.win && !state.pip.win.closed && state.pip.activeCommentsTab === 'playlist');
    }
    function resetPlaylistFeed(kind) {
      const feed = state[kind]?.feed;
      if (!feed) return;
      feed.error = '';
      feed.exhausted = false;
      feed.loading = false;
      feed.requestId += 1;
      feed.session = null;
    }
    function getPlaylistEmptyText(kind) {
      if (state[kind]?.feed?.error) return '首页推荐加载失败，继续滚动可重试';
      return '当前页面没有扫到可播放卡片';
    }
    function attachPipBackToTopSync(targetWindow) {
      if (!targetWindow || targetWindow.closed) return;
      const doc = targetWindow.document;
      const button = doc?.getElementById('back-to-top');
      const layout = doc?.getElementById('layout');
      const comments = doc?.getElementById('comments');
      if (!button || !layout || !comments || button.__biliPopupPlayerNanoScrollBound) return;
      button.__biliPopupPlayerNanoScrollBound = true;
      button.addEventListener('click', () => scrollPipCommentsToTop(targetWindow));
      layout.addEventListener('scroll', () => syncPipBackToTopButton(targetWindow), {
        passive: true
      });
      comments.addEventListener('scroll', () => syncPipBackToTopButton(targetWindow), {
        passive: true
      });
      syncPipBackToTopButton(targetWindow);
    }
    function syncHomeBackToTopButton() {
      const button = state.home.ui?.backToTop;
      const scrollContainer = getHomeCommentsScrollContainer();
      if (!button || !scrollContainer) return;
      button.classList.toggle(`${APP}--visible`, scrollContainer.scrollTop > 240);
    }
    function scheduleHomeBottomFixedWrapperSync() {
      if (state.bottomFixedFrame) return;
      state.bottomFixedFrame = window.requestAnimationFrame(() => {
        state.bottomFixedFrame = 0;
        syncBottomFixedWrappers({
          doc: document,
          root: state.home.ui?.overlay
        });
      });
    }
    function schedulePipBottomFixedWrapperSync(targetWindow) {
      if (!targetWindow || targetWindow.closed) return;
      if (targetWindow.__biliPopupPlayerNanoBottomFixedFrame) return;
      targetWindow.__biliPopupPlayerNanoBottomFixedFrame = targetWindow.requestAnimationFrame(() => {
        targetWindow.__biliPopupPlayerNanoBottomFixedFrame = 0;
        syncBottomFixedWrappers({
          doc: targetWindow.document,
          root: targetWindow.document?.body
        });
      });
    }
    function syncBottomFixedWrappers({
      doc,
      root
    }) {
      if (!doc || !root) return;
      const wrappers = getBottomFixedWrappers(doc, root);
      if (!wrappers.length) return;
      wrappers.forEach(wrapper => {
        wrapper.classList.add(`${APP}__bottom-fixed-hidden`);
      });
    }
    function getBottomFixedWrappers(doc, root) {
      const selectors = ['.bili-comments-bottom-fixed-wrapper', '[class*="bottom-fixed"]', '[class*="fixed-wrapper"]'];
      const scoped = [...(root.querySelectorAll?.(selectors.join(',')) || [])];
      const bodyPortals = [...(doc.body?.querySelectorAll?.(selectors.join(',')) || [])].filter(element => !root.contains(element) && isLikelyCommentFixedWrapper(element));
      return [...new Set([...scoped, ...bodyPortals])];
    }
    function isLikelyCommentFixedWrapper(element) {
      const text = `${element.className || ''} ${element.id || ''}`.toLowerCase();
      return text.includes('comment') || text.includes('reply') || text.includes('bottom-fixed') || text.includes('fixed-wrapper');
    }
    function syncPipBackToTopButton(targetWindow) {
      if (!targetWindow || targetWindow.closed) return;
      const button = targetWindow.document?.getElementById('back-to-top');
      const scrollContainer = getPipCommentsScrollContainer(targetWindow);
      if (!button || !scrollContainer) return;
      button.classList.toggle(`${APP}--visible`, scrollContainer.scrollTop > 240);
    }
    function scrollHomeCommentsToTop() {
      scrollContainerToTop(getHomeCommentsScrollContainer());
      syncHomeBackToTopButton();
    }
    function scrollPipCommentsToTop(targetWindow) {
      scrollContainerToTop(getPipCommentsScrollContainer(targetWindow));
      syncPipBackToTopButton(targetWindow);
    }
    function scrollContainerToTop(scrollContainer) {
      if (!scrollContainer) return;
      try {
        scrollContainer.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      } catch {
        scrollContainer.scrollTop = 0;
      }
    }
    function syncHomeCommentLayout() {
      const ui = state.home.ui;
      if (!ui?.overlay) return;
      ui.overlay.classList.toggle(`${APP}--comments-right`, state.commentLayout === 'right');
      syncCommentWidth();
      syncHomeBackToTopButton();
      scheduleHomeBottomFixedWrapperSync();
    }
    function getHomeCommentsScrollContainer() {
      if (state.commentLayout !== 'right') return state.home.ui?.content;
      return getHomeActiveCommentsPanel();
    }
    function getHomeCommentInstanceScrollContainer() {
      if (state.commentLayout !== 'right') return state.home.ui?.content;
      return state.home.ui?.commentsPanel;
    }
    function getHomeActiveCommentsPanel() {
      const ui = state.home.ui;
      if (!ui) return null;
      if (state.home.activeCommentsTab === 'pages') return ui.pagesPanel;
      if (state.home.activeCommentsTab === 'playlist') return ui.playlistPanel;
      if (state.home.activeCommentsTab === 'recommend') return ui.recommendPanel;
      return ui.commentsPanel;
    }
    function syncPipCommentLayout(targetWindow, options = {}) {
      if (!targetWindow || targetWindow.closed) return;
      const body = targetWindow.document?.body;
      if (!body) return;
      const {
        resize = true
      } = options;
      body.classList.toggle('comments-right', state.commentLayout === 'right');
      body.classList.toggle('comments-bottom', state.commentLayout !== 'right');
      syncCommentWidth();
      attachPipCommentScrollSync(targetWindow);
      attachPipBackToTopSync(targetWindow);
      syncPipBackToTopButton(targetWindow);
      schedulePipBottomFixedWrapperSync(targetWindow);
      if (resize) syncPipSize(targetWindow);
    }
    function remountCommentsForLayout() {
      const token = state.switchToken;
      if (state.home.bootstrap && state.home.ui && !state.home.overlay?.classList.contains(`${APP}--hidden`)) {
        disposeHomeComments();
        if (state.home.ui.commentsMount) state.home.ui.commentsMount.textContent = '评论加载中...';
        mountHomeComments(state.home.bootstrap, token);
      }
      if (state.pip.bootstrap && state.pip.win && !state.pip.win.closed) {
        disposePipComments();
        const mount = state.pip.win.document?.getElementById('comments-mount');
        if (mount) mount.textContent = '评论加载中...';
        mountPipComments(state.pip.win, state.pip.bootstrap, token);
      }
    }
    function getPipCommentsScrollContainer(targetWindow) {
      if (!targetWindow || targetWindow.closed) return null;
      const doc = targetWindow.document;
      if (state.commentLayout !== 'right') return doc.getElementById('layout');
      return getPipActiveCommentsPanel(doc);
    }
    function getPipCommentInstanceScrollContainer(targetWindow) {
      if (!targetWindow || targetWindow.closed) return null;
      const doc = targetWindow.document;
      if (state.commentLayout !== 'right') return doc.getElementById('layout');
      return doc.getElementById('comments-panel');
    }
    function getPipActiveCommentsPanel(doc) {
      if (!doc) return null;
      if (state.pip.activeCommentsTab === 'pages') return doc.getElementById('pages-panel');
      if (state.pip.activeCommentsTab === 'playlist') return doc.getElementById('playlist-panel');
      if (state.pip.activeCommentsTab === 'recommend') return doc.getElementById('recommend-panel');
      return doc.getElementById('comments-panel');
    }
    function getScreenKind(runtime) {
      const key = state.commentLayout === 'bottom' ? 'Wide' : 'Normal';
      return runtime?.ScreenKind?.[key] ?? (key === 'Wide' ? 1 : 0);
    }
    function isScreenKind(runtime, value, key) {
      return value === runtime?.ScreenKind?.[key] || value === (key === 'Wide' ? 1 : 0);
    }
    function handleScreenChanged(runtime, detail) {
      if (!detail?.mainTrigger) return;
      if (isScreenKind(runtime, detail.mainScreen, 'Wide')) setCommentLayout('bottom');else if (isScreenKind(runtime, detail.mainScreen, 'Normal')) setCommentLayout('right');
    }
    function bindHomeScreenChange(player) {
      unbindHomeScreenChange();
      const runtime = getPlayerApiForKind('home');
      const eventType = runtime?.EventType?.Player_Statue_Changed;
      if (!player?.on || !eventType) return;
      const handler = event => handleScreenChanged(runtime, event?.detail);
      player.on(eventType, handler);
      state.home.screenHandler = {
        player,
        eventType,
        handler
      };
    }
    function unbindHomeScreenChange() {
      const binding = state.home.screenHandler;
      if (!binding) return;
      try {
        binding.player?.off?.(binding.eventType, binding.handler);
      } catch {
        // Ignore event cleanup failures.
      }
      state.home.screenHandler = null;
    }
    function bindHomePlayerNavigate(player) {
      unbindHomePlayerNavigate();
      const eventTypes = getPlayerNavigationEventTypes(getPlayerApiForKind('home'));
      if (!player?.on || !eventTypes.length) return;
      const bindings = eventTypes.map(({
        eventType,
        delay
      }) => {
        const handler = () => schedulePlayerNavigationSync('home', delay);
        player.on(eventType, handler);
        return {
          eventType,
          handler
        };
      });
      state.home.navigateHandler = {
        player,
        bindings
      };
    }
    function unbindHomePlayerNavigate() {
      if (state.home.navigateSyncTimer) {
        window.clearTimeout(state.home.navigateSyncTimer);
        state.home.navigateSyncTimer = 0;
      }
      const binding = state.home.navigateHandler;
      if (!binding) return;
      try {
        binding.bindings?.forEach(({
          eventType,
          handler
        }) => {
          binding.player?.off?.(eventType, handler);
        });
      } catch {
        // Ignore event cleanup failures.
      }
      state.home.navigateHandler = null;
    }
    function bindHomePlayerHandoff(player) {
      unbindHomePlayerHandoff();
      const eventType = getPlayerApiForKind('home')?.EventType?.Player_Handoff_Signal;
      if (!player?.on || !eventType) return;
      const handler = event => handlePlayerHandoff('home', event?.detail);
      player.on(eventType, handler);
      state.home.handoffHandler = {
        player,
        eventType,
        handler
      };
    }
    function unbindHomePlayerHandoff() {
      const binding = state.home.handoffHandler;
      if (!binding) return;
      try {
        binding.player?.off?.(binding.eventType, binding.handler);
      } catch {
        // Ignore event cleanup failures.
      }
      state.home.handoffHandler = null;
    }
    function bindHomePlayerEnded(player) {
      unbindHomePlayerEnded();
      const eventType = getPlayerApiForKind('home')?.EventType?.Player_Ended;
      if (!player?.on || !eventType) return;
      const handler = () => handlePlayerEnded('home');
      player.on(eventType, handler);
      state.home.endedHandler = {
        player,
        eventType,
        handler
      };
    }
    function unbindHomePlayerEnded() {
      const binding = state.home.endedHandler;
      if (!binding) return;
      try {
        binding.player?.off?.(binding.eventType, binding.handler);
      } catch {
        // Ignore event cleanup failures.
      }
      state.home.endedHandler = null;
    }
    function bindPipScreenChange(targetWindow, player) {
      unbindPipScreenChange();
      const eventType = targetWindow.nano?.EventType?.Player_Statue_Changed;
      if (!player?.on || !eventType) return;
      const handler = event => handleScreenChanged(targetWindow.nano, event?.detail);
      player.on(eventType, handler);
      state.pip.screenHandler = {
        player,
        eventType,
        handler
      };
    }
    function unbindPipScreenChange() {
      const binding = state.pip.screenHandler;
      if (!binding) return;
      try {
        binding.player?.off?.(binding.eventType, binding.handler);
      } catch {
        // Ignore event cleanup failures.
      }
      state.pip.screenHandler = null;
    }
    function bindPipPlayerNavigate(targetWindow, player) {
      unbindPipPlayerNavigate();
      const eventTypes = getPlayerNavigationEventTypes(targetWindow.nano);
      if (!player?.on || !eventTypes.length) return;
      const bindings = eventTypes.map(({
        eventType,
        delay
      }) => {
        const handler = () => schedulePlayerNavigationSync('pip', delay);
        player.on(eventType, handler);
        return {
          eventType,
          handler
        };
      });
      state.pip.navigateHandler = {
        player,
        bindings
      };
    }
    function unbindPipPlayerNavigate() {
      const pipWindow = state.pip.win;
      if (state.pip.navigateSyncTimer) {
        if (pipWindow && !pipWindow.closed) pipWindow.clearTimeout(state.pip.navigateSyncTimer);else window.clearTimeout(state.pip.navigateSyncTimer);
        state.pip.navigateSyncTimer = 0;
      }
      const binding = state.pip.navigateHandler;
      if (!binding) return;
      try {
        binding.bindings?.forEach(({
          eventType,
          handler
        }) => {
          binding.player?.off?.(eventType, handler);
        });
      } catch {
        // Ignore event cleanup failures.
      }
      state.pip.navigateHandler = null;
    }
    function bindPipPlayerHandoff(targetWindow, player) {
      unbindPipPlayerHandoff();
      const eventType = targetWindow.nano?.EventType?.Player_Handoff_Signal;
      if (!player?.on || !eventType) return;
      const handler = event => handlePlayerHandoff('pip', event?.detail);
      player.on(eventType, handler);
      state.pip.handoffHandler = {
        player,
        eventType,
        handler
      };
    }
    function unbindPipPlayerHandoff() {
      const binding = state.pip.handoffHandler;
      if (!binding) return;
      try {
        binding.player?.off?.(binding.eventType, binding.handler);
      } catch {
        // Ignore event cleanup failures.
      }
      state.pip.handoffHandler = null;
    }
    function bindPipPlayerEnded(targetWindow, player) {
      unbindPipPlayerEnded();
      const eventType = targetWindow.nano?.EventType?.Player_Ended;
      if (!player?.on || !eventType) return;
      const handler = () => handlePlayerEnded('pip');
      player.on(eventType, handler);
      state.pip.endedHandler = {
        player,
        eventType,
        handler
      };
    }
    function unbindPipPlayerEnded() {
      const binding = state.pip.endedHandler;
      if (!binding) return;
      try {
        binding.player?.off?.(binding.eventType, binding.handler);
      } catch {
        // Ignore event cleanup failures.
      }
      state.pip.endedHandler = null;
    }
    function handlePlayerHandoff(kind, detail) {
      const offset = Number(detail?.offset);
      if (!Number.isInteger(offset)) return;
      if (playAdjacentFromActiveTab(kind, offset, {
        absolute: Boolean(detail?.absolute)
      })) {
        showSwitchBurst(kind, offset);
      }
    }
    function handlePlayerEnded(kind) {
      if (!state.autoPlayNext) return;
      playAdjacentFromActiveTab(kind, 1, {
        auto: true
      });
    }
    function getPlayerNavigationEventTypes(playerApi) {
      const eventType = playerApi?.EventType || {};
      return [{
        eventType: eventType.Player_Navigate,
        delay: 240
      }, {
        eventType: eventType.Player_LoadStart,
        delay: 120
      }, {
        eventType: eventType.Player_PlayUrl_Done,
        delay: 80
      }, {
        eventType: eventType.Player_Prepared,
        delay: 40
      }, {
        eventType: eventType.Player_Committed,
        delay: 0
      }].filter(item => item.eventType);
    }
    function schedulePlayerNavigationSync(kind, delay = 180) {
      const slot = state[kind];
      if (!slot?.player || isLiveBootstrap(slot.bootstrap)) return;
      const targetWindow = kind === 'pip' && state.pip.win && !state.pip.win.closed ? state.pip.win : window;
      if (slot.navigateSyncTimer) targetWindow.clearTimeout(slot.navigateSyncTimer);
      slot.navigateSyncTimer = targetWindow.setTimeout(() => {
        slot.navigateSyncTimer = 0;
        void syncPlayerNavigation(kind);
      }, delay);
    }
    async function syncPlayerNavigation(kind, fallbackMeta = null) {
      const slot = state[kind];
      if (!slot?.player || !slot.bootstrap || isLiveBootstrap(slot.bootstrap)) return;
      const currentMeta = getPlayerNavigationMeta(kind);
      const meta = fallbackMeta?.bvid ? fallbackMeta : currentMeta;
      if (!meta?.bvid || isCurrentBootstrapPlayback(slot.bootstrap, meta)) {
        schedulePlayerHandoffAvailabilitySync(kind);
        return;
      }
      const player = slot.player;
      const token = ++state.switchToken;
      try {
        const bootstrap = await resolvePlaybackBootstrap(meta);
        if (token !== state.switchToken || slot.player !== player) return;
        if (!fallbackMeta?.bvid && !isCurrentPlayerMeta(kind, meta)) return;
        applyInternalPlayerNavigation(kind, meta, bootstrap, token);
      } catch (error) {
        if (kind === 'home' && state.home.ui?.status) state.home.ui.status.textContent = `播放器内部换源同步失败：${error?.message || 'unknown'}`;
        if (kind === 'pip') setPipStatus(`换源同步失败：${error?.message || 'unknown'}`);
      }
    }
    function applyInternalPlayerNavigation(kind, meta, bootstrap, token) {
      state[kind].bootstrap = bootstrap;
      saveLastPlayed(meta, bootstrap);
      recordPlaybackHistory({
        ...meta}, bootstrap);
      syncPlaybackPageMeta(kind, bootstrap);
      setSelectedPlaylistBvid(kind, bootstrap.playerInfo?.bvid || meta.bvid);
      renderPlaylist(kind);
      renderPageParts(kind, bootstrap);
      renderRecommendations(kind, bootstrap);
      syncVideoIntro(kind);
      syncPlayerExternalState(kind);
      schedulePlayerHandoffAvailabilitySync(kind);
      if (kind === 'home') {
        const ui = state.home.ui;
        if (ui) {
          ui.title.textContent = bootstrap.title || meta.title || meta.bvid;
          ui.openOriginal.dataset.href = bootstrap.href || meta.href;
          ui.status.textContent = `播放器内部换源：aid=${bootstrap.playerInfo.aid} cid=${bootstrap.playerInfo.cid}`;
        }
        updateDebug(buildHomePrimarySetting(bootstrap), bootstrap);
        mountHomeComments(bootstrap, token);
        return;
      }
      if (state.pip.win && !state.pip.win.closed) {
        ensurePipPlayerControls(state.pip.win, bootstrap.href || meta.href);
        mountPipComments(state.pip.win, bootstrap, token);
        setPipPlaying(bootstrap);
        setPipStatus('已同步播放器内部换源');
        state.pip.win.__biliPopupPlayerNanoCurrentBootstrap = bootstrap;
      }
    }
    function getPlayerNavigationMeta(kind) {
      const slot = state[kind];
      const info = readPlayerNavigationInfo(slot?.player);
      if (!info.bvid) return null;
      const href = buildPlaybackHref(info.bvid, info.p);
      return {
        bvid: info.bvid,
        href,
        p: Number.isInteger(info.p) && info.p > 0 ? info.p : 1,
        title: info.title || info.bvid
      };
    }
    function readPlayerNavigationInfo(player) {
      const store = player?.rootStore?.configStore || player?.configStore || {};
      const story = player?.rootStore?.storyStore?.state || player?.storyStore?.state || {};
      const primary = player?.primary || {};
      const input = player?.rootPlayer?.input || player?.input || {};
      return {
        aid: readStoreValue(store, 'aid') || story.aid || input.aid || primary.aid,
        bvid: String(readStoreValue(store, 'bvid') || story.bvid || input.bvid || primary.bvid || '').trim(),
        cid: readStoreValue(store, 'cid') || story.cid || input.cid || primary.cid,
        p: Number(readStoreValue(store, 'p') || story.p || input.p || primary.p || 1),
        title: String(story.title || primary.title || '').trim()
      };
    }
    function readStoreValue(store, key) {
      return store?.[key] ?? store?.state?.[key] ?? store?.input?.[key] ?? store?.primary?.[key];
    }
    function buildPlaybackHref(bvid, page) {
      const url = new URL(`/video/${bvid}/`, location.origin);
      const pageNo = Number(page);
      if (Number.isInteger(pageNo) && pageNo > 1) url.searchParams.set('p', String(pageNo));
      return url.href;
    }
    function isCurrentPlayerMeta(kind, meta) {
      const current = getPlayerNavigationMeta(kind);
      return Boolean(current?.bvid && meta?.bvid && current.bvid === meta.bvid);
    }
    function isCurrentBootstrapPlayback(bootstrap, meta) {
      if (!meta?.bvid || !bootstrap?.playerInfo?.bvid || meta.bvid !== bootstrap.playerInfo.bvid) return false;
      const metaPage = Number(meta.p || 1);
      const bootstrapPage = Number(bootstrap.playerInfo?.p || 1);
      return metaPage === bootstrapPage;
    }
    function syncPlayerHandoffAvailability(kind) {
      const availability = getPlayerHandoffAvailability(kind);
      if (!availability) return;
      applyPlayerHandoffAvailability(state[kind]?.player, availability);
    }
    function getPlayerHandoffAvailability(kind) {
      const tab = state[kind]?.activeCommentsTab;
      if (tab === 'pages') {
        return getCardHandoffAvailability(state[kind].pageCards, findCurrentPageCardIndex(kind, state[kind].pageCards));
      }
      if (tab === 'playlist' || tab === 'comments') {
        return getCardHandoffAvailability(state[kind].playlistCards, findSelectedCardIndex(state[kind].playlistCards, state[kind].selectedPlaylistBvid, getPlayableKey));
      }
      if (tab === 'live') {
        return getCardHandoffAvailability(state[kind].liveCards, findSelectedCardIndex(state[kind].liveCards, state[kind].selectedLiveKey, getPlayableKey));
      }
      if (tab === 'recommend') {
        return {
          hasPrev: false,
          hasNext: Boolean(state[kind].recommendationCards?.length)
        };
      }
      return null;
    }
    function getCardHandoffAvailability(cards, currentIndex) {
      if (!Array.isArray(cards) || !cards.length) return {
        hasPrev: false,
        hasNext: false
      };
      if (currentIndex < 0) return {
        hasPrev: false,
        hasNext: true
      };
      return {
        hasPrev: currentIndex > 0,
        hasNext: currentIndex < cards.length - 1
      };
    }
    function applyPlayerHandoffAvailability(player, availability) {
      if (!player || !availability) return;
      const next = {
        hasPrev: Boolean(availability.hasPrev),
        hasNext: Boolean(availability.hasNext)
      };
      trySetPlayerStoreState(player?.rootStore?.episodeStore, next);
      trySetPlayerStoreState(player?.episodeStore, next);
      const configStores = [player?.rootStore?.configStore, player?.configStore];
      configStores.forEach(store => {
        if (!store) return;
        try {
          store.hasPrev = next.hasPrev;
          store.hasNext = next.hasNext;
          if (store.state) {
            store.state.hasPrev = next.hasPrev;
            store.state.hasNext = next.hasNext;
          }
        } catch {
          // Some nano internals are readonly in certain builds.
        }
      });
    }
    function trySetPlayerStoreState(store, next) {
      if (!store) return;
      try {
        store.setState?.(next, true);
      } catch {
        // Fall through to direct observable mutation.
      }
      try {
        if (store.state) {
          store.state.hasPrev = next.hasPrev;
          store.state.hasNext = next.hasNext;
        }
      } catch {
        // Ignore unsupported nano internals.
      }
    }
    function playAdjacentFromActiveTab(kind, direction, options = {}) {
      const tab = state[kind]?.activeCommentsTab;
      if (tab === 'pages') return playAdjacentCard(kind, state[kind].pageCards, direction, {
        ...options,
        selectedKey: state[kind].selectedPageKey,
        getKey: card => card.pageKey,
        findCurrentIndex: cards => findCurrentPageCardIndex(kind, cards),
        fromPagePart: true
      });
      if (tab === 'playlist' || tab === 'comments') return playAdjacentCard(kind, state[kind].playlistCards, direction, {
        ...options,
        selectedKey: state[kind].selectedPlaylistBvid,
        getKey: getPlayableKey,
        fromPlaylist: true
      });
      if (tab === 'live') return playAdjacentCard(kind, state[kind].liveCards, direction, {
        ...options,
        selectedKey: state[kind].selectedLiveKey,
        getKey: getPlayableKey,
        fromLiveList: true
      });
      if (tab === 'recommend') return playFirstRecommendation(kind);
      return false;
    }
    function isBvidInCurrentPageCards(kind, bvid) {
      if (!bvid) return false;
      return state[kind]?.pageCards?.some(card => card?.bvid === bvid) || false;
    }
    function isBvidInCurrentPlaylist(kind, bvid) {
      if (!bvid) return false;
      return state[kind]?.playlistCards?.some(card => card?.bvid === bvid) || false;
    }
    function playAdjacentCard(kind, cards, direction, options = {}) {
      if (!Array.isArray(cards) || !cards.length) return false;
      const offset = Number(direction);
      if (!Number.isInteger(offset)) return false;
      const currentIndex = typeof options.findCurrentIndex === 'function' ? options.findCurrentIndex(cards) : findSelectedCardIndex(cards, options.selectedKey, options.getKey);
      const targetIndex = options.absolute ? offset - 1 : currentIndex + offset;
      if (targetIndex < 0 || targetIndex >= cards.length) return false;
      const card = cards[targetIndex];
      if (!getPlayableKey(card) || !card.href) return false;
      maybePrefetchHomePlaylistForContinuation(kind, cards, targetIndex, options);
      const renderer = kind === 'pip' ? pipRenderer : homeRenderer;
      openWithRenderer(renderer, {
        ...card,
        fromPagePart: Boolean(options.fromPagePart),
        fromPlaylist: Boolean(options.fromPlaylist),
        fromLiveList: Boolean(options.fromLiveList)
      });
      return true;
    }
    function maybePrefetchHomePlaylistForContinuation(kind, cards, targetIndex, options = {}) {
      if (kind !== 'home' || !options.fromPlaylist) return;
      if (!isHomeFeedPage()) return;
      const remaining = cards.length - targetIndex - 1;
      if (remaining > PLAYLIST_CONTINUATION_PREFETCH_REMAINING) return;
      void maybeLoadMorePlaylist('home', {
        force: true,
        ignoreActiveTab: true
      });
    }
    function findSelectedCardIndex(cards, selectedKey, getKey) {
      if (selectedKey && typeof getKey === 'function') {
        const selectedIndex = cards.findIndex(card => getKey(card) === selectedKey);
        if (selectedIndex >= 0) return selectedIndex;
      }
      return -1;
    }
    function playFirstRecommendation(kind) {
      const card = state[kind]?.recommendationCards?.[0];
      if (!getPlayableKey(card) || !card.href) return false;
      const renderer = kind === 'pip' ? pipRenderer : homeRenderer;
      openWithRenderer(renderer, card);
      return true;
    }
    function findCurrentPageCardIndex(kind, cards) {
      const selectedKey = state[kind]?.selectedPageKey;
      const selectedIndex = selectedKey ? cards.findIndex(card => card.pageKey === selectedKey) : -1;
      if (selectedIndex >= 0) return selectedIndex;
      const info = state[kind]?.bootstrap?.playerInfo || {};
      const bvid = info.bvid;
      const page = Number(info.p || 1);
      const exactIndex = cards.findIndex(card => card.bvid === bvid && Number(card.page || 1) === page);
      if (exactIndex >= 0) return exactIndex;
      const bvidIndex = bvid ? cards.findIndex(card => card.bvid === bvid) : -1;
      return bvidIndex >= 0 ? bvidIndex : -1;
    }
    function attachPipCommentResizer(targetWindow) {
      if (!targetWindow || targetWindow.closed) return;
      const resizer = targetWindow.document?.getElementById('comments-resizer');
      if (!resizer || resizer.__biliPopupPlayerNanoResizeBound) return;
      resizer.__biliPopupPlayerNanoResizeBound = true;
      resizer.addEventListener('pointerdown', event => startCommentWidthDrag(event, targetWindow));
    }
    function attachPipCommentScrollSync(targetWindow) {
      if (!targetWindow || targetWindow.closed) return;
      const layout = targetWindow.document?.getElementById('layout');
      if (layout && !layout.__biliPopupPlayerNanoScrollSyncBound) {
        layout.__biliPopupPlayerNanoScrollSyncBound = true;
        layout.addEventListener('scroll', () => {
          syncPipBackToTopButton(targetWindow);
          schedulePipBottomFixedWrapperSync(targetWindow);
          schedulePipLayoutSync(targetWindow);
        }, {
          passive: true
        });
      }
      const panels = [...(targetWindow.document?.querySelectorAll?.('#comments-panel, #pages-panel, #playlist-panel, #recommend-panel') || [])];
      panels.forEach(panel => {
        if (panel.__biliPopupPlayerNanoScrollSyncBound) return;
        panel.__biliPopupPlayerNanoScrollSyncBound = true;
        panel.addEventListener('scroll', () => {
          syncPipBackToTopButton(targetWindow);
          schedulePipBottomFixedWrapperSync(targetWindow);
          schedulePipLayoutSync(targetWindow);
        }, {
          passive: true
        });
      });
    }
    function schedulePipLayoutSync(targetWindow) {
      if (!targetWindow || targetWindow.closed) return;
      if (targetWindow.__biliPopupPlayerNanoLayoutSyncFrame) return;
      targetWindow.__biliPopupPlayerNanoLayoutSyncFrame = targetWindow.requestAnimationFrame(() => {
        targetWindow.__biliPopupPlayerNanoLayoutSyncFrame = 0;
        if (targetWindow.closed || state.pip.win !== targetWindow) return;
        syncPipSize(targetWindow);
      });
    }
    function startCommentWidthDrag(event, targetWindow) {
      if (state.commentLayout !== 'right') return;
      event.preventDefault();
      event.stopPropagation();
      const doc = targetWindow.document;
      const resizer = event.currentTarget;
      const overlay = targetWindow === window ? state.home.overlay : null;
      overlay?.classList.add(`${APP}--resizing`);
      doc.body?.classList.add('resizing-comments');
      resizer?.setPointerCapture?.(event.pointerId);
      const onMove = moveEvent => {
        moveEvent.preventDefault();
        setCommentWidth(calculateCommentWidthFromPointer(moveEvent.clientX, targetWindow));
      };
      const onEnd = () => {
        overlay?.classList.remove(`${APP}--resizing`);
        doc.body?.classList.remove('resizing-comments');
        doc.removeEventListener('pointermove', onMove, true);
        doc.removeEventListener('pointerup', onEnd, true);
        doc.removeEventListener('pointercancel', onEnd, true);
        setStorageItem(STORAGE_COMMENT_WIDTH, String(state.commentWidth));
      };
      doc.addEventListener('pointermove', onMove, true);
      doc.addEventListener('pointerup', onEnd, true);
      doc.addEventListener('pointercancel', onEnd, true);
      onMove(event);
    }
    function calculateCommentWidthFromPointer(clientX, targetWindow) {
      const container = targetWindow === window ? state.home.ui?.content : targetWindow.document?.getElementById('layout');
      const rect = container?.getBoundingClientRect();
      if (!rect) return state.commentWidth;
      return clampCommentWidth(rect.right - clientX, rect.width);
    }
    function setCommentWidth(width) {
      const next = clampCommentWidth(width);
      if (next === state.commentWidth) return;
      state.commentWidth = next;
      syncCommentWidth();
    }
    function clampCommentWidth(width, containerWidth) {
      const numeric = Number(width);
      const fallback = Number.isFinite(numeric) ? numeric : COMMENT_WIDTH_DEFAULT;
      const maxByContainer = Number.isFinite(containerWidth) ? Math.max(COMMENT_WIDTH_MIN, containerWidth - 366) : COMMENT_WIDTH_MAX;
      return Math.round(Math.min(COMMENT_WIDTH_MAX, maxByContainer, Math.max(COMMENT_WIDTH_MIN, fallback)));
    }
    function ensurePipPlayerControls(targetWindow, href) {
      if (!targetWindow || targetWindow.closed) return;
      const doc = targetWindow.document;
      const controls = getOrCreatePipControls(targetWindow, href);
      const controlsToken = (targetWindow.__biliPopupPlayerNanoControlsToken || 0) + 1;
      targetWindow.__biliPopupPlayerNanoControlsToken = controlsToken;
      const isCurrentControlsRun = () => targetWindow.__biliPopupPlayerNanoControlsToken === controlsToken;
      targetWindow.__biliPopupPlayerNanoControlsObserver?.disconnect?.();
      targetWindow.__biliPopupPlayerNanoControlsObserver = null;
      const attach = () => {
        if (!isCurrentControlsRun() || targetWindow.closed || !doc.body) return false;
        const slot = findPipOriginalButtonSlot(doc);
        if (!slot?.container) return false;
        if (controls.parentNode !== slot.container || controls.nextSibling !== slot.before) {
          slot.container.insertBefore(controls, slot.before || null);
        }
        syncPipCommentLayout(targetWindow);
        return true;
      };
      if (attach()) return;
      let scheduled = false;
      let stopped = false;
      const stop = () => {
        if (!isCurrentControlsRun()) return;
        stopped = true;
        targetWindow.__biliPopupPlayerNanoControlsObserver?.disconnect?.();
        targetWindow.__biliPopupPlayerNanoControlsObserver = null;
      };
      const scheduleAttach = () => {
        if (!isCurrentControlsRun() || scheduled || stopped || targetWindow.closed) return;
        scheduled = true;
        targetWindow.setTimeout(() => {
          scheduled = false;
          if (!isCurrentControlsRun()) return;
          if (attach()) stop();
        }, 120);
      };
      [250, 600, 1200, 2400, 4800].forEach(delay => targetWindow.setTimeout(scheduleAttach, delay));
      targetWindow.setTimeout(stop, 7000);
      const observer = new targetWindow.MutationObserver(scheduleAttach);
      observer.observe(doc.body || doc.documentElement, {
        childList: true,
        subtree: true
      });
      targetWindow.__biliPopupPlayerNanoControlsObserver = observer;
    }
    function getOrCreatePipControls(targetWindow, href) {
      const doc = targetWindow.document;
      let controls = doc.getElementById(`${APP}-pip-controls`);
      if (controls) {
        const original = doc.getElementById(`${APP}-pip-original`);
        if (original) {
          original.dataset.href = href;
          original.href = href;
        }
        return controls;
      }
      controls = doc.createElement('div');
      controls.id = `${APP}-pip-controls`;
      const original = doc.createElement('a');
      original.id = `${APP}-pip-original`;
      original.href = href;
      original.dataset.href = href;
      original.target = '_blank';
      original.rel = 'noopener noreferrer';
      original.title = '打开原播放页';
      original.setAttribute('aria-label', '打开原播放页');
      original.textContent = '原页面';
      original.addEventListener('pointerdown', () => {
        original.href = getPipOriginalHref(targetWindow, original.dataset.href);
      });
      original.addEventListener('click', () => {
        original.href = getPipOriginalHref(targetWindow, original.dataset.href);
      });
      controls.append(original);
      return controls;
    }
    function getPipOriginalHref(targetWindow, href) {
      return withPlaybackTime(href, getPlaybackTime(state.pip.player));
    }
    function findPipOriginalButtonSlot(doc) {
      const container = doc.querySelector(['.bpx-player-control-bottom-right', '.bpx-player-control-bottom .bpx-player-control-bottom-right', '.bpx-player-control-wrap .bpx-player-control-bottom-right', '.bpx-player-ctrl-right'].join(','));
      if (!container) return null;
      const quality = container.querySelector(['.bpx-player-ctrl-quality', '[aria-label="清晰度"]', 'button[aria-label="清晰度"]'].join(','));
      return {
        container,
        before: quality || container.firstElementChild
      };
    }
    function saveLastPlayed(meta, bootstrap) {
      const playbackId = getPlaybackIdentity(meta, bootstrap);
      if (!playbackId || !meta.href) return;
      const next = {
        id: playbackId,
        kind: bootstrap.kind || meta.kind || 'video',
        bvid: bootstrap.playerInfo?.bvid || meta.bvid,
        roomId: bootstrap.playerInfo?.roomId || meta.roomId,
        href: meta.href,
        title: bootstrap.title || meta.title,
        savedAt: Date.now()
      };
      if (next.kind === 'live' || next.roomId) {
        syncVideoBadges();
        return;
      }
      const previous = state.lastPlayed;
      if (isDifferentPlayback(previous, next)) state.playlistLastPlayed = previous;
      state.lastPlayed = next;
      setStorageItem(STORAGE_LAST_PLAYED, JSON.stringify(next));
      syncLastPlayed();
      syncSettings();
      syncVideoBadges();
    }
    function isDifferentPlayback(previous, next) {
      const previousKey = getPlayableKey(previous);
      const nextKey = getPlayableKey(next);
      if (!previousKey || !nextKey) return false;
      return previousKey !== nextKey;
    }
    function recordPlaybackHistory(meta, bootstrap) {
      const playbackId = getPlaybackIdentity(meta, bootstrap);
      const bvid = bootstrap.playerInfo?.bvid || meta.bvid;
      const roomId = bootstrap.playerInfo?.roomId || meta.roomId;
      const href = bootstrap.href || meta.href;
      if (!playbackId || !href) return;
      if (meta.fromHistory && Number.isInteger(meta.historyIndex)) {
        state.playbackHistory.index = clampHistoryIndex(meta.historyIndex);
        syncPlaybackHistoryButtons();
        return;
      }
      const next = {
        id: playbackId,
        kind: bootstrap.kind || meta.kind || 'video',
        bvid,
        roomId,
        href,
        title: bootstrap.title || meta.title || bvid || `直播 ${roomId}`
      };
      const history = state.playbackHistory;
      const current = history.entries[history.index];
      if (current?.id === next.id || next.bvid && current?.bvid === next.bvid || next.roomId && current?.roomId === next.roomId) {
        history.entries[history.index] = {
          ...current,
          ...next
        };
        syncPlaybackHistoryButtons();
        return;
      }
      const keptEntries = history.index >= 0 ? history.entries.slice(0, history.index + 1) : history.entries.slice();
      keptEntries.push(next);
      history.entries = keptEntries.slice(-20);
      history.index = history.entries.length - 1;
      syncPlaybackHistoryButtons();
    }
    function openPlaybackHistoryOffset(offset) {
      const history = state.playbackHistory;
      const nextIndex = history.index + offset;
      const entry = history.entries[nextIndex];
      if (!entry) return;
      history.index = nextIndex;
      syncPlaybackHistoryButtons();
      openWithRenderer(homeRenderer, {
        ...entry,
        fromHistory: true,
        historyIndex: nextIndex
      });
    }
    function syncPlaybackHistoryButtons() {
      const ui = state.home.ui;
      if (!ui?.historyPrevious || !ui.historyNext) return;
      const previous = state.playbackHistory.entries[state.playbackHistory.index - 1];
      const next = state.playbackHistory.entries[state.playbackHistory.index + 1];
      syncPlaybackHistoryButton(ui.historyPrevious, previous, '上一次播放');
      syncPlaybackHistoryButton(ui.historyNext, next, '下一次播放');
    }
    function syncPlaybackHistoryButton(button, entry, label) {
      const disabled = !entry;
      button.disabled = disabled;
      const title = entry?.title ? `${label}：${entry.title}` : label;
      button.title = title;
      button.setAttribute('aria-label', title);
    }
    function clampHistoryIndex(index) {
      const max = state.playbackHistory.entries.length - 1;
      return Math.max(-1, Math.min(max, index));
    }
    function isSamePlayback(meta, bootstrap) {
      if (isLiveMeta(meta) || isLiveBootstrap(bootstrap)) {
        const roomId = String(meta?.roomId || '');
        const info = bootstrap?.playerInfo || {};
        return Boolean(roomId && (roomId === String(info.roomId || '') || roomId === String(info.shortId || '')));
      }
      return Boolean(meta?.bvid && bootstrap?.playerInfo?.bvid && meta.bvid === bootstrap.playerInfo.bvid);
    }
    function getPlaybackIdentity(meta, bootstrap) {
      if (isLiveMeta(meta) || isLiveBootstrap(bootstrap)) {
        const roomId = bootstrap?.playerInfo?.roomId || meta?.roomId;
        return roomId ? `live:${roomId}` : '';
      }
      const bvid = bootstrap?.playerInfo?.bvid || meta?.bvid;
      return bvid ? `video:${bvid}` : '';
    }
    function updateDebug(primarySetting, bootstrap) {
      pageWindow.__biliPopupPlayerNanoDebug = {
        getMode: () => state.mode,
        getHomePlayer: () => state.home.player,
        getPipPlayer: () => state.pip.player,
        getHomeComments: () => state.home.comments,
        getPipComments: () => state.pip.comments,
        getPrimarySetting: () => primarySetting,
        getBootstrap: () => bootstrap
      };
    }
    function playHomeSoon(token, delay) {
      window.setTimeout(() => {
        if (token !== state.switchToken || !state.home.player || state.home.overlay?.classList.contains(`${APP}--hidden`)) return;
        syncHomeSize();
        try {
          state.home.player.play?.();
        } catch {
          // Player may already be playing.
        }
      }, delay);
    }
    function startHomeModalResize(event) {
      if (state.home.overlay?.classList.contains(`${APP}--fullscreen`)) return;
      const ui = state.home.ui;
      const rect = ui?.dialog?.getBoundingClientRect();
      if (!rect) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget?.setPointerCapture?.(event.pointerId);
      state.home.overlay?.classList.add(`${APP}--modal-resizing`);
      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = rect.width;
      const startHeight = rect.height;
      const onMove = moveEvent => {
        moveEvent.preventDefault();
        const axis = Math.abs(moveEvent.clientY - startY) > Math.abs(moveEvent.clientX - startX) ? 'height' : 'width';
        setHomeModalSize({
          width: startWidth + moveEvent.clientX - startX,
          height: startHeight + moveEvent.clientY - startY
        }, axis);
      };
      const onEnd = () => {
        state.home.overlay?.classList.remove(`${APP}--modal-resizing`);
        document.removeEventListener('pointermove', onMove, true);
        document.removeEventListener('pointerup', onEnd, true);
        document.removeEventListener('pointercancel', onEnd, true);
        if (state.modalSize) setStorageItem(STORAGE_MODAL_SIZE, JSON.stringify(state.modalSize));
      };
      document.addEventListener('pointermove', onMove, true);
      document.addEventListener('pointerup', onEnd, true);
      document.addEventListener('pointercancel', onEnd, true);
      onMove(event);
    }
    function setHomeModalSize(size, axis = 'width') {
      state.modalSize = fitHomeModalSizeToPlayerRatio(size, axis);
      syncHomeSize();
      syncHomeModalSizeButton();
    }
    function resetHomeModalSize() {
      state.modalSize = null;
      removeStorageItem(STORAGE_MODAL_SIZE);
      syncHomeSize();
      syncHomeModalSizeButton();
    }
    function clampHomeModalSize(size) {
      const width = Number(size?.width);
      const height = Number(size?.height);
      const fallbackWidth = Number.isFinite(width) ? width : getDefaultHomeModalWidth();
      const fallbackHeight = Number.isFinite(height) ? height : MODAL_HEIGHT_DEFAULT;
      const {
        minWidth,
        maxWidth,
        minHeight,
        maxHeight
      } = getHomeModalSizeBounds();
      return {
        width: Math.round(Math.min(maxWidth, Math.max(minWidth, fallbackWidth))),
        height: Math.round(Math.min(maxHeight, Math.max(minHeight, fallbackHeight)))
      };
    }
    function fitHomeModalSizeToPlayerRatio(size, axis = 'width') {
      const bounds = getHomeModalSizeBounds();
      const extraWidth = getHomeModalExtraWidth();
      const extraHeight = MODAL_HEADER_HEIGHT + getHomePlayerChromeHeight();
      const width = Number(size?.width);
      const height = Number(size?.height);
      const fallbackPlayerWidth = Math.max(1, getDefaultHomeModalWidth() - extraWidth);
      const requestedPlayerWidth = axis === 'height' ? ((Number.isFinite(height) ? height : MODAL_HEIGHT_DEFAULT) - extraHeight) * 16 / 9 : (Number.isFinite(width) ? width : getDefaultHomeModalWidth()) - extraWidth;
      const playerMinByWidth = Math.max(1, bounds.minWidth - extraWidth);
      const playerMaxByWidth = Math.max(1, bounds.maxWidth - extraWidth);
      const playerMinByHeight = Math.max(1, (bounds.minHeight - extraHeight) * 16 / 9);
      const playerMaxByHeight = Math.max(1, (bounds.maxHeight - extraHeight) * 16 / 9);
      const playerMax = Math.max(1, Math.min(playerMaxByWidth, playerMaxByHeight));
      const playerMin = Math.min(playerMax, Math.max(playerMinByWidth, playerMinByHeight));
      const playerWidth = Math.min(playerMax, Math.max(playerMin, Number.isFinite(requestedPlayerWidth) ? requestedPlayerWidth : fallbackPlayerWidth));
      return {
        width: Math.round(playerWidth + extraWidth),
        height: Math.round(playerWidth * 9 / 16 + extraHeight)
      };
    }
    function getHomeModalSizeBounds() {
      const maxWidth = Math.max(1, window.innerWidth - getHomeModalInlineMargin() * 2);
      const maxHeight = Math.max(1, window.innerHeight - getHomeModalBlockMargin());
      return {
        maxWidth,
        maxHeight,
        minWidth: Math.min(MODAL_WIDTH_MIN, maxWidth),
        minHeight: Math.min(MODAL_HEIGHT_MIN, maxHeight)
      };
    }
    function getHomeModalInlineMargin() {
      return Math.min(MODAL_INLINE_MARGIN_MAX, Math.max(MODAL_INLINE_MARGIN_MIN, window.innerWidth * MODAL_INLINE_MARGIN_RATIO));
    }
    function getHomeModalBlockMargin() {
      return Math.min(MODAL_BLOCK_MARGIN_MAX, Math.max(MODAL_BLOCK_MARGIN_MIN, window.innerHeight * MODAL_BLOCK_MARGIN_RATIO));
    }
    function getDefaultHomeModalWidth() {
      return Math.max(1, window.innerWidth - getHomeModalInlineMargin() * 2);
    }
    function getHomeModalExtraWidth() {
      return state.commentLayout === 'right' && window.innerWidth > 900 ? state.commentWidth + MODAL_COMMENTS_RESIZER_WIDTH : 0;
    }
    function applyHomeModalSize() {
      const ui = state.home.ui;
      if (!ui?.dialog) return null;
      if (state.home.overlay?.classList.contains(`${APP}--fullscreen`)) {
        ui.dialog.style.width = '';
        ui.dialog.style.height = '';
        return null;
      }
      if (!state.modalSize) {
        const size = fitHomeModalSizeToPlayerRatio({
          width: getDefaultHomeModalWidth(),
          height: MODAL_HEIGHT_DEFAULT
        }, 'width');
        ui.dialog.style.width = `${size.width}px`;
        ui.dialog.style.height = `${size.height}px`;
        return size;
      }
      const size = clampHomeModalSize(state.modalSize);
      state.modalSize = size;
      ui.dialog.style.width = `${size.width}px`;
      ui.dialog.style.height = `${size.height}px`;
      return size;
    }
    function syncHomeModalSizeButton() {
      const ui = state.home.ui;
      if (!ui?.resetSize) return;
      const disabled = !state.modalSize || state.home.overlay?.classList.contains(`${APP}--fullscreen`);
      ui.resetSize.disabled = Boolean(disabled);
    }
    function toggleAutoPlayNext() {
      if (state.home.liveListMode) return;
      setAutoPlayNext(!state.autoPlayNext);
      showAutoPlayHint();
    }
    function setAutoPlayNext(value) {
      state.autoPlayNext = Boolean(value);
      setStorageItem(STORAGE_AUTO_PLAY_NEXT, state.autoPlayNext ? '1' : '0');
      syncAutoPlayNextButton();
    }
    function syncAutoPlayNextButton() {
      const button = state.home.ui?.autoPlayNext;
      if (!button) return;
      button.hidden = Boolean(state.home.liveListMode);
      if (state.home.liveListMode) return;
      const active = Boolean(state.autoPlayNext);
      button.classList.toggle(`${APP}__header-button--active`, active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.title = active ? '自动联播已开启：按当前右侧标签继续播放。按 J / L 手动切换' : '自动联播已关闭。按 J / L 手动切换';
      button.setAttribute('aria-label', button.title);
    }
    function showAutoPlayHint() {
      const hint = state.home.ui?.autoPlayHint;
      if (!hint) return;
      window.clearTimeout(state.autoPlayHintTimer);
      hint.textContent = '按 J / L 手动切换';
      hint.classList.add(`${APP}--visible`);
      state.autoPlayHintTimer = window.setTimeout(() => {
        hint.classList.remove(`${APP}--visible`);
      }, 3000);
    }
    function syncHomeSize() {
      if (!state.home.ui?.playerRoot?.isConnected) return;
      syncHomePlayerFrame();
      try {
        state.home.player?.resize?.();
      } catch {
        // Ignore resize failures.
      }
      scheduleHomeBottomFixedWrapperSync();
    }
    function syncHomePlayerFrame() {
      const ui = state.home.ui;
      if (!ui?.dialog || !ui.content || !ui.playerWrap) return;
      const modalSize = applyHomeModalSize();
      const fullscreen = state.home.overlay?.classList.contains(`${APP}--fullscreen`);
      if (state.commentLayout === 'right') {
        ui.playerWrap.style.height = '';
        syncHomeModalSizeButton();
        return;
      }
      const availableWidth = ui.content.clientWidth;
      if (!availableWidth) return;
      const headerHeight = 46;
      const desiredHeight = Math.round(availableWidth * 9 / 16 + getHomePlayerChromeHeight());
      const availableHeight = fullscreen ? ui.content.clientHeight || window.innerHeight : Math.max(1, modalSize.height - headerHeight);
      ui.playerWrap.style.height = `${Math.min(desiredHeight, availableHeight)}px`;
      syncHomeModalSizeButton();
    }
    function getHomePlayerChromeHeight() {
      return window.innerWidth >= PLAYER_CHROME_HEIGHT_WIDE_BREAKPOINT ? PLAYER_CHROME_HEIGHT_WIDE : PLAYER_CHROME_HEIGHT;
    }
    function syncHomeFullscreenButton() {
      const ui = state.home.ui;
      if (!ui?.fullscreen) return;
      const active = Boolean(state.home.overlay?.classList.contains(`${APP}--fullscreen`));
      ui.fullscreen.classList.toggle(`${APP}__header-button--active`, active);
      ui.fullscreen.title = active ? '退出网页内全屏' : '网页内全屏';
      ui.fullscreen.setAttribute('aria-label', ui.fullscreen.title);
      ui.fullscreen.replaceChildren(active ? createMinimizeIcon() : createMaximizeIcon());
    }
    function syncPipSize(targetWindow) {
      const root = targetWindow.document?.getElementById('bilibili-player') || targetWindow.document?.getElementById('live-player');
      if (!root) return;
      const stage = targetWindow.document.getElementById('stage');
      const rect = stage?.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect?.width || targetWindow.innerWidth));
      const height = Math.max(1, Math.floor(rect?.height || targetWindow.innerHeight));
      root.style.width = `${width}px`;
      root.style.height = `${height}px`;
      root.style.minWidth = '0px';
      root.style.minHeight = '0px';
      targetWindow.dispatchEvent(new targetWindow.Event('resize'));
      try {
        state.pip.player?.resize?.();
      } catch {
        // Ignore resize failures.
      }
      schedulePipBottomFixedWrapperSync(targetWindow);
      targetWindow.requestAnimationFrame(() => {
        const nextRect = stage?.getBoundingClientRect();
        const nextWidth = Math.max(1, Math.floor(nextRect?.width || targetWindow.innerWidth));
        const nextHeight = Math.max(1, Math.floor(nextRect?.height || targetWindow.innerHeight));
        root.style.width = `${nextWidth}px`;
        root.style.height = `${nextHeight}px`;
        root.style.minWidth = '0px';
        root.style.minHeight = '0px';
        targetWindow.dispatchEvent(new targetWindow.Event('resize'));
        try {
          state.pip.player?.resize?.();
        } catch {
          // Ignore resize failures.
        }
      });
    }
    function writePipLoading(pipWindow, title, href) {
      writePipDocument(pipWindow, renderPipLoadingDocument({
        title,
        href,
        stylesheets: getBiliThemeStylesheets(),
        themeClassMarkup: getPipThemeClassMarkup()
      }));
    }
    function writePipError(pipWindow, error, href) {
      disposePipPlayer();
      disposePipComments();
      writePipDocument(pipWindow, renderPipErrorDocument({
        error,
        href,
        stylesheets: getBiliThemeStylesheets(),
        themeClassMarkup: getPipThemeClassMarkup()
      }));
    }
    function writePipDocument(pipWindow, html) {
      state.pip.switchingWindow = true;
      pipWindow.__biliPopupPlayerNanoControlsObserver?.disconnect?.();
      pipWindow.__biliPopupPlayerNanoResizeSyncCleanup?.();
      delete pipWindow.__biliPopupPlayerNanoControlsObserver;
      pipWindow.__biliPopupPlayerNanoControlsToken = (pipWindow.__biliPopupPlayerNanoControlsToken || 0) + 1;
      pipWindow.document.open();
      pipWindow.document.write(html);
      pipWindow.document.close();
      window.setTimeout(() => {
        state.pip.switchingWindow = false;
      }, 0);
    }
    function getPipThemeClassMarkup() {
      return getThemeStyle() === 'dark' ? ' class="night-mode"' : '';
    }
    function setPipStatus(message) {
      setLastButtonStatus(message);
    }
    function setLastButtonStatus(message) {
      if (!state.lastButton?.isConnected) return;
      state.lastButton.textContent = message;
      window.setTimeout(() => {
        if (state.lastButton?.isConnected) {
          if (state.lastButton.classList.contains(`${APP}__fixed-pip-button`)) {
            state.lastButton.replaceChildren(createPictureInPictureIcon());
          } else {
            state.lastButton.textContent = '小窗播放';
          }
        }
      }, 1800);
    }
    function closeHome() {
      state.switchToken += 1;
      const home = state.home;
      if (home.overlay) {
        home.overlay.classList.remove(`${APP}--fullscreen`);
        home.overlay.classList.add(`${APP}--hidden`);
        home.overlay.setAttribute('aria-hidden', 'true');
        syncHomeFullscreenButton();
      }
      try {
        home.player?.pause?.();
      } catch {
        // Keep instance alive.
      }
      setHomePlayerFeatureBlocked(true);
      setExternalPlayerFeaturesBlocked(false);
      document.documentElement.style.overflow = '';
      document.body.classList.remove(`${APP}--modal-open`);
      document.removeEventListener('keydown', onKeydown, true);
      restoreOriginalPageMeta();
      if (state.lastFocus?.isConnected) state.lastFocus.focus({
        preventScroll: true
      });
    }
    function onKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeHome();
        return;
      }
      if (isEditableKeyTarget(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;
      const key = String(event.key || '').toLowerCase();
      if (key === 'k') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        void likeCurrentPlayback('home');
        return;
      }
      if (key !== 'j' && key !== 'l') return;
      const direction = key === 'j' ? -1 : 1;
      if (playAdjacentFromActiveTab('home', direction)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        showSwitchBurst('home', direction);
      }
    }
    function onPipKeydown(event) {
      if (isEditableKeyTarget(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;
      const key = String(event.key || '').toLowerCase();
      if (key !== 'k') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      void likeCurrentPlayback('pip');
    }
    function isEditableKeyTarget(target) {
      if (!target?.closest) return false;
      return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]'));
    }
    function disposeHomePlayer() {
      if (state.home.likeBurstTimer) {
        window.clearTimeout(state.home.likeBurstTimer);
        state.home.likeBurstTimer = 0;
      }
      state.home.likeBusy = false;
      if (!state.home.player) return;
      unbindHomeScreenChange();
      unbindHomePlayerNavigate();
      unbindHomePlayerHandoff();
      unbindHomePlayerEnded();
      state.home.ui?.playerRoot?.querySelector?.(`.${APP}__live-player-only-control`)?.remove();
      setHomePlayerFeatureBlocked(false);
      try {
        state.home.player.disconnect?.();
      } catch {
        // Ignore player cleanup failures.
      }
      state.home.player = null;
      state.home.featureBlocked = false;
    }
    function disposePipPlayer() {
      if (state.pip.likeBurstTimer) {
        window.clearTimeout(state.pip.likeBurstTimer);
        state.pip.likeBurstTimer = 0;
      }
      state.pip.likeBusy = false;
      if (!state.pip.player) return;
      unbindPipScreenChange();
      unbindPipPlayerNavigate();
      unbindPipPlayerHandoff();
      unbindPipPlayerEnded();
      try {
        state.pip.player.disconnect?.();
      } catch {
        // Ignore player cleanup failures.
      }
      state.pip.player = null;
      setPipPlaying(null);
    }
    function disposeHomeComments() {
      disposeCommentInstance(state, 'home');
    }
    function disposePipComments() {
      disposeCommentInstance(state, 'pip');
    }
    function destroy() {
      state.observer?.disconnect();
      if (state.scanTimer) window.clearTimeout(state.scanTimer);
      if (state.viewportFrame) cancelAnimationFrame(state.viewportFrame);
      if (state.homeSizeFrame) cancelAnimationFrame(state.homeSizeFrame);
      if (state.settingsVisibilityFrame) cancelAnimationFrame(state.settingsVisibilityFrame);
      if (state.bottomFixedFrame) cancelAnimationFrame(state.bottomFixedFrame);
      stopScanWarmup();
      closeHome();
      disposeHomePlayer();
      disposePipPlayer();
      disposeHomeComments();
      disposePipComments();
      state.home.ui?.dispose?.();
      state.home.ui = null;
      state.home.overlay = null;
      removeLivePageButton();
      removePlaybackPagePipButton();
      settingsUi.destroy();
      document.removeEventListener('mousemove', onDocumentMouseMove, true);
      document.removeEventListener('mouseleave', onDocumentMouseLeave, true);
      document.removeEventListener('click', onDirectCoverClick, true);
      document.removeEventListener('fullscreenchange', scheduleSettingsVisibilitySync, true);
      window.removeEventListener('scroll', scheduleViewportSync, true);
      window.removeEventListener('resize', scheduleViewportSync, true);
      state.shadowHost?.remove();
      state.overlay?.remove();
      document.getElementById(DOCUMENT_STYLE_ID)?.remove();
      document.documentElement.style.overflow = '';
      delete pageWindow.__biliPopupPlayerNano;
    }
  }

})();
