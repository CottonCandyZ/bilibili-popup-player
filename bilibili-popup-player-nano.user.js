// ==UserScript==
// @name         Bilibili Popup Player - Nano
// @namespace    https://www.bilibili.com/
// @version      3.2.2
// @description  B 站小窗播放合并版：支持首页和播放页推荐视频，网页内弹窗/Chrome Document PiP 两种模式可切换。
// @author       Codex & Cotton
// @match        https://www.bilibili.com/*
// @match        https://space.bilibili.com/*
// @match        https://search.bilibili.com/*
// @run-at       document-idle
// @grant        none
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
  const ENABLED_URL_RE = /^https?:\/\/(?:www\.bilibili\.com\/(?:$|[?#]|index\.html|video\/BV|account\/history|history)|space\.bilibili\.com\/|search\.bilibili\.com\/)/;
  const BV_RE = /\/video\/(BV[0-9A-Za-z]+)/;
  const CORE_FALLBACK = 'https://s1.hdslb.com/bfs/static/player/main/core.6dcbfdb4.js';
  const COMMENT_FALLBACK = 'https://s1.hdslb.com/bfs/seed/jinkela/commentpc/bili-comments.js';
  const THEME_BASE = 'https://s1.hdslb.com/bfs/seed/jinkela/short/bili-theme';

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

  const COVER_HOST_SELECTOR = ['.bili-video-card__image', '.bili-video-card__cover', '.pic-box', '.pic', '.framepreview-box', '.video-awesome-img', '.cover', '.cover-contain', '.history-card__cover', '.bili-history-card__cover', '[class*="cover"]', '[class*="pic"]', '[class*="image"]', '[class*="poster"]', '[class*="thumbnail"]'].join(',');
  const CARD_ROOT_SELECTORS = ['.bili-video-card', '.feed-card', '.floor-single-card', '.carousel-item', '[class*="carousel-item"]', '.bili-video-card__wrap', '.small-item', '.history-card', '.history-record', '.bili-history-card', '.video-item', '.video-list-item', '.search-card', '.search-item', '.list-item', '.section-item', '.video-card', '.video-page-card-small', '.video-page-operator-card-small', '.card-box', '.recommended-card', '[class*="video-card"]', '[class*="video-page-card"]', '[class*="history"]', '[class*="search"]', '[class*="list-item"]', '[class*="small-item"]', '[class*="feed-card"]'];
  const PLAYBACK_VIDEO_LINK_SELECTOR = ['.video-page-card-small a[href*="/video/BV"]', '.video-page-operator-card-small a[href*="/video/BV"]', '.rec-list .video-page-card-small a[href*="/video/BV"]', '.rec-list .video-page-operator-card-small a[href*="/video/BV"]', '.recommend-list .video-page-card-small a[href*="/video/BV"]', '.recommend-list .video-page-operator-card-small a[href*="/video/BV"]'].join(',');
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
    const title = link.getAttribute('title') || link.getAttribute('aria-label') || link.querySelector('img')?.getAttribute('alt') || link.textContent || 'Bilibili 视频';
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
    const title = String(value).replace(/\s+/g, ' ').trim();
    if (!title || title === '不感兴趣') return 'Bilibili 视频';
    return title;
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

  const TAB_KEYS = ['comments', 'playlist', 'recommend'];
  const PLAYING_ICON_URL = 'https://i0.hdslb.com/bfs/static/jinkela/playlist-video/asserts/playing.gif';
  function createCommentsTabsUi({
    state,
    getHomeRenderer,
    getPipRenderer,
    getCommentLayout,
    openWithRenderer,
    syncHomeSize,
    schedulePipLayoutSync
  }) {
    const activeSignals = new Map();
    const selectedSignals = new Map();
    const listViews = new Map();
    function createTabs(targetDocument, kind) {
      const tabs = targetDocument.createElement('div');
      tabs.className = `${APP}__comments-tabs`;
      tabs.setAttribute('role', 'tablist');
      tabs.setAttribute('aria-label', '评论区内容');
      tabs.append(createTab(targetDocument, kind, 'comments', '评论'), createTab(targetDocument, kind, 'playlist', '播放列表'), createTab(targetDocument, kind, 'recommend', '推荐列表'));
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
      button.addEventListener('click', () => setTab(kind, tab));
      return button;
    }
    function setTab(kind, tab) {
      state[kind].activeCommentsTab = tab === 'playlist' || tab === 'recommend' ? tab : 'comments';
      getActiveSignal(kind)[1](state[kind].activeCommentsTab);
      syncTabs(kind);
      if (state[kind].activeCommentsTab === 'playlist') scrollSelectedPlaylistIntoView(kind);
      if (kind === 'home') syncHomeSize();else if (state.pip.win && !state.pip.win.closed) schedulePipLayoutSync(state.pip.win);
    }
    function syncTabs(kind) {
      const ui = getUi(kind);
      if (!ui) return;
      const activeTab = TAB_KEYS.includes(state[kind].activeCommentsTab) ? state[kind].activeCommentsTab : 'comments';
      getActiveSignal(kind)[1](activeTab);
      syncTabButtonSet([ui.commentsTab, ui.playlistTab, ui.recommendTab], activeTab);
      ui.commentsPanel.hidden = activeTab !== 'comments';
      ui.playlistPanel.hidden = activeTab !== 'playlist';
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
        if (!ui?.commentsPanel || !ui.playlistPanel || !ui.recommendPanel) return null;
        return {
          commentsTab: ui.commentsTabs?.querySelector?.('[data-tab="comments"]'),
          playlistTab: ui.commentsTabs?.querySelector?.('[data-tab="playlist"]'),
          recommendTab: ui.commentsTabs?.querySelector?.('[data-tab="recommend"]'),
          commentsPanel: ui.commentsPanel,
          playlistPanel: ui.playlistPanel,
          playlistList: ui.playlistList,
          playlistEmpty: ui.playlistEmpty,
          recommendPanel: ui.recommendPanel,
          recommendList: ui.recommendList,
          recommendEmpty: ui.recommendEmpty
        };
      }
      const doc = state.pip.win && !state.pip.win.closed ? state.pip.win.document : null;
      if (!doc) return null;
      const commentsPanel = doc.getElementById('comments-panel');
      const playlistPanel = doc.getElementById('playlist-panel');
      const recommendPanel = doc.getElementById('recommend-panel');
      if (!commentsPanel || !playlistPanel || !recommendPanel) return null;
      return {
        commentsTab: doc.getElementById('tab-comments'),
        playlistTab: doc.getElementById('tab-playlist'),
        recommendTab: doc.getElementById('tab-recommend'),
        commentsPanel,
        playlistPanel,
        playlistList: doc.getElementById('playlist-list'),
        playlistEmpty: doc.getElementById('playlist-empty'),
        recommendPanel,
        recommendList: doc.getElementById('recommend-list'),
        recommendEmpty: doc.getElementById('recommend-empty')
      };
    }
    function capturePagePlaylist(kind, selectedBvid) {
      state[kind].playlistCards = getScannedPlaylistCards();
      setSelectedPlaylistBvid(kind, selectedBvid);
      renderPlaylist(kind);
    }
    function setSelectedPlaylistBvid(kind, bvid) {
      state[kind].selectedPlaylistBvid = bvid || '';
      getSelectedSignal(kind)[1](state[kind].selectedPlaylistBvid);
      scrollSelectedPlaylistIntoView(kind);
    }
    function getScannedPlaylistCards() {
      const seen = new Set();
      return state.cardEntries.filter(entry => entry.card?.isConnected && entry.link?.isConnected).map(entry => getPlaylistCardFromEntry(entry)).filter(card => {
        if (!card?.bvid || seen.has(card.bvid)) return false;
        seen.add(card.bvid);
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
        cover: getEntryCardCover(root, entry.link),
        subtitle: getEntryCardSubtitle(root),
        duration: getEntryCardDuration(root),
        stats: getEntryCardStats(root)
      };
    }
    function renderPlaylist(kind, statusText = '当前页面没有扫到可播放卡片') {
      const ui = getUi(kind);
      if (!ui?.playlistList || !ui.playlistEmpty) return;
      renderCardList({
        list: ui.playlistList,
        empty: ui.playlistEmpty,
        cards: state[kind].playlistCards,
        emptyText: statusText,
        kind,
        source: 'playlist'
      });
    }
    function renderRecommendations(kind, bootstrap, statusText = '推荐列表加载中...') {
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
    }
    function renderCardList({
      list,
      empty,
      cards,
      emptyText,
      kind,
      source,
      loading = false
    }) {
      const view = ensureListView({
        list,
        empty,
        kind,
        source
      });
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
      const dispose = createRoot(disposeRoot => {
        createEffect(() => {
          const currentCards = cards();
          const currentLoading = loading();
          const selected = source === 'playlist' ? getSelectedSignal(kind)[0]() : '';
          list.textContent = '';
          empty.hidden = Boolean(currentLoading || currentCards.length);
          empty.textContent = currentLoading || currentCards.length ? '' : emptyText();
          if (currentLoading) {
            appendSkeletonCards(list.ownerDocument, list, 6);
            return;
          }
          currentCards.forEach(card => {
            list.appendChild(createCardButton(list.ownerDocument, kind, card, source, selected));
          });
          if (source === 'playlist') scrollSelectedPlaylistIntoView(kind);
        });
        return disposeRoot;
      });
      const view = {
        dispose,
        empty,
        list,
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
    function createCardButton(targetDocument, kind, card, source = 'playlist', selectedBvid = '') {
      const selected = source === 'playlist' && selectedBvid === card.bvid;
      const button = targetDocument.createElement('div');
      button.className = `${APP}__playlist-card`;
      button.dataset.bvid = card.bvid || '';
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
        if (source === 'playlist') setSelectedPlaylistBvid(kind, card.bvid);
        const renderer = kind === 'pip' ? getPipRenderer() : getHomeRenderer();
        openWithRenderer(renderer, source === 'playlist' ? {
          ...card,
          fromPlaylist: true
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
      if (selected) {
        const playing = targetDocument.createElement('img');
        playing.className = `${APP}__playlist-playing`;
        playing.src = PLAYING_ICON_URL;
        playing.alt = '';
        playing.loading = 'lazy';
        title.appendChild(playing);
      }
      const titleText = targetDocument.createElement('span');
      titleText.className = `${APP}__playlist-title-text`;
      titleText.textContent = card.title || 'Bilibili 视频';
      title.appendChild(titleText);
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
        tab.addEventListener('click', () => setTab('pip', tab.dataset.tab));
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
    function scrollSelectedPlaylistIntoView(kind) {
      if (getCommentLayout?.() !== 'right') return;
      const bvid = state[kind].selectedPlaylistBvid;
      if (!bvid) return;
      const ui = getUi(kind);
      const list = ui?.playlistList;
      if (!list || ui.playlistPanel?.hidden) return;
      const item = [...(list.querySelectorAll?.(`.${APP}__playlist-card`) || [])].find(card => card.dataset.bvid === bvid);
      item?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
    return {
      attachPipTabs,
      capturePagePlaylist,
      createTabs,
      renderPlaylist,
      renderRecommendations,
      setSelectedPlaylistBvid,
      syncTabs
    };
  }
  function appendStats(targetDocument, container, stats) {
    const values = normalizeStats(stats);
    if (!values.view && !values.danmaku) {
      container.textContent = typeof stats === 'object' ? '' : cleanText(stats);
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
    const template = targetDocument.createElement('template');
    template.innerHTML = type === 'danmaku' ? danmakuIconMarkup() : viewIconMarkup();
    const icon = template.content.firstElementChild;
    icon.classList.add(`${APP}__playlist-stat-icon`);
    return icon;
  }
  function normalizeStats(stats) {
    if (!stats) return {
      view: '',
      danmaku: ''
    };
    if (typeof stats === 'object') {
      return {
        view: cleanText(stats.view),
        danmaku: cleanText(stats.danmaku)
      };
    }
    const parts = cleanText(stats).split(/\s+/).filter(Boolean);
    return {
      view: parts[0] || '',
      danmaku: parts[1] || ''
    };
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
    const candidate = textLink?.textContent || getSafeTitleElementText$1(root, ['.bili-video-card__info--tit', '.video-page-card-small-title', '.title', '.info-title'].join(',')) || link?.getAttribute?.('title') || link?.getAttribute?.('aria-label') || root?.querySelector?.('img')?.getAttribute('alt') || fallback;
    return cleanTitle(candidate || fallback || 'Bilibili 视频');
  }
  function getEntryTextLink(root, bvid) {
    if (!root || !bvid) return null;
    return [...(root.querySelectorAll?.('a[href*="/video/BV"]') || [])].find(candidate => {
      const meta = getVideoMetaFromLink(candidate);
      return meta?.bvid === bvid && !isCoverLink(candidate) && isUsefulTitle$1(candidate.textContent);
    }) || null;
  }
  function getSafeTitleElementText$1(root, selector) {
    return [...(root?.querySelectorAll?.(selector) || [])].map(element => element.textContent || element.getAttribute?.('title') || '').find(isUsefulTitle$1) || '';
  }
  function getEntryCardCover(root, link) {
    const img = root?.querySelector?.('img[src], img[data-src], img[data-lazy-src], img[data-original], img[data-url]') || link?.querySelector?.('img[src], img[data-src], img[data-lazy-src], img[data-original], img[data-url]');
    const source = root?.querySelector?.('source[srcset], source[data-srcset]') || link?.querySelector?.('source[srcset], source[data-srcset]');
    const raw = img?.getAttribute('data-src') || img?.getAttribute('data-lazy-src') || img?.getAttribute('data-original') || img?.getAttribute('data-url') || img?.getAttribute('src') || getFirstSrcsetUrl$1(source?.getAttribute('data-srcset') || source?.getAttribute('srcset')) || '';
    return normalizeResourceUrl(raw);
  }
  function getEntryCardSubtitle(root) {
    return cleanText(root?.querySelector?.(['.upname', '.name', '.bili-video-card__info--author', '.video-page-card-small-author', '[class*="author"]'].join(','))?.textContent);
  }
  function getEntryCardDuration(root) {
    return cleanText(root?.querySelector?.(['.duration', '.bili-video-card__stats__duration', '[class*="duration"]'].join(','))?.textContent);
  }
  function getEntryCardStats(root) {
    const playInfo = root?.querySelector?.('.playinfo')?.textContent;
    if (playInfo) return cleanText(playInfo);
    const items = uniqueList([...(root?.querySelectorAll?.(['.bili-video-card__stats--text', '.bili-video-card__stats--item', '[class*="stats"] [class*="text"]'].join(',')) || [])].map(element => cleanText(element.textContent)).filter(Boolean));
    return items.slice(0, 2).join(' ');
  }
  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }
  function cleanTitle(value) {
    const title = cleanText(value);
    return isUsefulTitle$1(title) ? title : 'Bilibili 视频';
  }
  function isUsefulTitle$1(value) {
    const title = cleanText(value);
    return Boolean(title && title !== '不感兴趣' && title !== '撤销' && !title.includes('将减少此类内容推荐'));
  }
  function uniqueList(values) {
    return [...new Set(values)];
  }
  function getFirstSrcsetUrl$1(srcset) {
    return String(srcset || '').split(',')[0]?.trim().split(/\s+/)[0] || '';
  }

  function createSettingsIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke-width', '2');
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
    const template = document.createElement('template');
    template.innerHTML = externalLinkIconMarkup();
    return template.content.firstElementChild;
  }
  function createMaximizeIcon() {
    const template = document.createElement('template');
    template.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M21 8V5a2 2 0 0 0-2-2h-3"></path><path d="M3 16v3a2 2 0 0 0 2 2h3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path></svg>';
    return template.content.firstElementChild;
  }
  function createMinimizeIcon() {
    const template = document.createElement('template');
    template.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3"></path><path d="M21 8h-3a2 2 0 0 1-2-2V3"></path><path d="M3 16h3a2 2 0 0 1 2 2v3"></path><path d="M16 21v-3a2 2 0 0 1 2-2h3"></path></svg>';
    return template.content.firstElementChild;
  }
  function externalLinkIconMarkup() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>';
  }
  function arrowUpIconMarkup() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6"></path></svg>';
  }

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

  var _tmpl$ = /*#__PURE__*/template(`<div role=dialog aria-modal=true data-backdrop-pointer=0><section><header><div></div><div></div><button type=button title=打开原播放页 aria-label=打开原播放页></button><button type=button title=网页内全屏 aria-label=网页内全屏></button><button type=button title=关闭 aria-label=关闭首页播放器>×</button></header><div><div><div></div></div><div tabindex=0 role=separator aria-orientation=vertical aria-label=调整评论区宽度></div><section><div><div></div></div><div><div></div><div>播放列表加载中...</div></div><div><div></div><div>推荐列表加载中...</div></div></section></div><button type=button title=回到顶部 aria-label=回到顶部>`),
    _tmpl$2 = /*#__PURE__*/template(`<div id=shell><main id=layout><div id=stage><div id=bilibili-player></div></div><div id=comments-resizer tabindex=0 role=separator aria-orientation=vertical aria-label=调整评论区宽度></div><section id=comments><div id=comments-panel><div id=comments-mount>评论加载中...</div></div><div id=playlist-panel><div id=playlist-list></div><div id=playlist-empty>播放列表加载中...</div></div><div id=recommend-panel><div id=recommend-list></div><div id=recommend-empty>推荐列表加载中...</div></div></section></main><button type=button id=back-to-top title=回到顶部 aria-label=回到顶部>`);
  function mountHomePlayerPage({
    targetDocument = document,
    createCommentsTabs,
    onBackToTop,
    onBackdropClose,
    onClose,
    onFullscreen,
    onOpenOriginal,
    onPlayerControlClick,
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
      onOpenOriginal: onOpenOriginal,
      onPlayerControlClick: onPlayerControlClick,
      onResizeStart: onResizeStart,
      targetDocument: targetDocument
    }), mount);
    return {
      ...refs,
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
        _el$5 = _el$4.nextSibling,
        _el$6 = _el$5.nextSibling,
        _el$7 = _el$6.nextSibling,
        _el$8 = _el$7.nextSibling,
        _el$9 = _el$3.nextSibling,
        _el$0 = _el$9.firstChild,
        _el$1 = _el$0.firstChild,
        _el$10 = _el$0.nextSibling,
        _el$11 = _el$10.nextSibling,
        _el$12 = _el$11.firstChild,
        _el$13 = _el$12.firstChild,
        _el$14 = _el$12.nextSibling,
        _el$15 = _el$14.firstChild,
        _el$16 = _el$15.nextSibling,
        _el$17 = _el$14.nextSibling,
        _el$18 = _el$17.firstChild,
        _el$19 = _el$18.nextSibling,
        _el$20 = _el$9.nextSibling;
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
      var _ref$3 = props.refs('title');
      typeof _ref$3 === "function" && use(_ref$3, _el$4);
      setAttribute(_el$4, "id", `${APP}-title`);
      var _ref$4 = props.refs('status');
      typeof _ref$4 === "function" && use(_ref$4, _el$5);
      setAttribute(_el$5, "id", `${APP}-status`);
      _el$6.$$click = event => props.onOpenOriginal?.(event.currentTarget.dataset.href);
      var _ref$5 = props.refs('openOriginal');
      typeof _ref$5 === "function" && use(_ref$5, _el$6);
      className(_el$6, `${APP}__header-button`);
      insert(_el$6, createExternalLinkIcon);
      _el$7.$$click = () => props.onFullscreen?.();
      var _ref$6 = props.refs('fullscreen');
      typeof _ref$6 === "function" && use(_ref$6, _el$7);
      className(_el$7, `${APP}__header-button`);
      insert(_el$7, createMaximizeIcon);
      _el$8.$$click = () => props.onClose?.();
      var _ref$7 = props.refs('close');
      typeof _ref$7 === "function" && use(_ref$7, _el$8);
      className(_el$8, `${APP}__header-button`);
      var _ref$8 = props.refs('content');
      typeof _ref$8 === "function" && use(_ref$8, _el$9);
      setAttribute(_el$9, "id", `${APP}-content`);
      var _ref$9 = props.refs('playerWrap');
      typeof _ref$9 === "function" && use(_ref$9, _el$0);
      setAttribute(_el$0, "id", `${APP}-player-wrap`);
      _el$1.addEventListener("clickcapture", event => props.onPlayerControlClick?.(event));
      var _ref$0 = props.refs('playerRoot');
      typeof _ref$0 === "function" && use(_ref$0, _el$1);
      setAttribute(_el$1, "id", `${APP}-player`);
      _el$10.$$pointerdown = event => props.onResizeStart?.(event);
      var _ref$1 = props.refs('commentsResizer');
      typeof _ref$1 === "function" && use(_ref$1, _el$10);
      setAttribute(_el$10, "id", `${APP}-comments-resizer`);
      var _ref$10 = props.refs('comments');
      typeof _ref$10 === "function" && use(_ref$10, _el$11);
      setAttribute(_el$11, "id", `${APP}-comments`);
      insert(_el$11, () => props.commentsTabs, _el$12);
      var _ref$11 = props.refs('commentsPanel');
      typeof _ref$11 === "function" && use(_ref$11, _el$12);
      setAttribute(_el$12, "id", `${APP}-comments-panel`);
      className(_el$12, `${APP}__comments-panel`);
      var _ref$12 = props.refs('commentsMount');
      typeof _ref$12 === "function" && use(_ref$12, _el$13);
      setAttribute(_el$13, "id", `${APP}-comments-mount`);
      var _ref$13 = props.refs('playlistPanel');
      typeof _ref$13 === "function" && use(_ref$13, _el$14);
      setAttribute(_el$14, "id", `${APP}-playlist-panel`);
      className(_el$14, `${APP}__comments-panel`);
      var _ref$14 = props.refs('playlistList');
      typeof _ref$14 === "function" && use(_ref$14, _el$15);
      setAttribute(_el$15, "id", `${APP}-playlist-list`);
      className(_el$15, `${APP}__playlist`);
      var _ref$15 = props.refs('playlistEmpty');
      typeof _ref$15 === "function" && use(_ref$15, _el$16);
      setAttribute(_el$16, "id", `${APP}-playlist-empty`);
      className(_el$16, `${APP}__playlist-empty`);
      var _ref$16 = props.refs('recommendPanel');
      typeof _ref$16 === "function" && use(_ref$16, _el$17);
      setAttribute(_el$17, "id", `${APP}-recommend-panel`);
      className(_el$17, `${APP}__comments-panel`);
      var _ref$17 = props.refs('recommendList');
      typeof _ref$17 === "function" && use(_ref$17, _el$18);
      setAttribute(_el$18, "id", `${APP}-recommend-list`);
      className(_el$18, `${APP}__playlist`);
      var _ref$18 = props.refs('recommendEmpty');
      typeof _ref$18 === "function" && use(_ref$18, _el$19);
      setAttribute(_el$19, "id", `${APP}-recommend-empty`);
      className(_el$19, `${APP}__playlist-empty`);
      _el$20.$$click = () => props.onBackToTop?.();
      var _ref$19 = props.refs('backToTop');
      typeof _ref$19 === "function" && use(_ref$19, _el$20);
      className(_el$20, `${APP}__back-to-top`);
      insert(_el$20, () => backToTopIcon.content.firstElementChild);
      return _el$;
    })();
  }
  function PipPlayerPage(props) {
    const backToTopIcon = props.targetDocument.createElement('template');
    backToTopIcon.innerHTML = arrowUpIconMarkup();
    return (() => {
      var _el$21 = _tmpl$2(),
        _el$22 = _el$21.firstChild,
        _el$23 = _el$22.firstChild,
        _el$24 = _el$23.nextSibling,
        _el$25 = _el$24.nextSibling,
        _el$26 = _el$25.firstChild,
        _el$27 = _el$26.nextSibling,
        _el$28 = _el$27.firstChild,
        _el$29 = _el$28.nextSibling,
        _el$30 = _el$27.nextSibling,
        _el$31 = _el$30.firstChild,
        _el$32 = _el$31.nextSibling,
        _el$33 = _el$22.nextSibling;
      insert(_el$25, () => props.commentsTabs, _el$26);
      className(_el$26, `${APP}__comments-panel`);
      className(_el$27, `${APP}__comments-panel`);
      className(_el$28, `${APP}__playlist`);
      className(_el$29, `${APP}__playlist-empty`);
      className(_el$30, `${APP}__comments-panel`);
      className(_el$31, `${APP}__playlist`);
      className(_el$32, `${APP}__playlist-empty`);
      className(_el$33, `${APP}__back-to-top`);
      insert(_el$33, () => backToTopIcon.content.firstElementChild);
      return _el$21;
    })();
  }
  delegateEvents(["pointerdown", "pointerup", "click"]);

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
    if (!Array.isArray(staffData)) return [];
    return staffData.map(staff => ({
      face: staff.face,
      follower: staff.follower,
      label: staff.label,
      mid: staff.mid,
      name: staff.name,
      official: staff.official,
      title: staff.title,
      vip: staff.vip
    }));
  }
  function getPlayerViewInfo(initialState) {
    const vd = initialState.videoData || {};
    const upData = initialState.upData || {};
    const page = vd.pages?.[Number(initialState.p || 1) - 1] || vd.pages?.[0] || {};
    return {
      aid: vd.aid,
      bvid: vd.bvid,
      cid: page.cid || initialState.cid,
      copyright: vd.copyright,
      ctime: vd.ctime,
      desc: vd.desc,
      dimension: page.dimension || vd.dimension,
      duration: vd.duration,
      enable_vt: vd.enable_vt,
      honor_reply: vd.honor_reply,
      is_360: vd.is_360,
      is_owner: vd.is_owner,
      is_upower_exclusive: vd.is_upower_exclusive,
      is_upower_play: vd.is_upower_play,
      is_upower_preview: vd.is_upower_preview,
      mission_id: vd.mission_id,
      no_cache: vd.no_cache,
      owner: vd.owner || {
        mid: upData.mid,
        name: upData.name,
        face: upData.face
      },
      pages: vd.pages,
      pic: vd.pic,
      premiere: vd.premiere,
      pubdate: vd.pubdate,
      rights: vd.rights,
      staff: getUpStaffs(vd.staff),
      stat: vd.stat,
      teenage_mode: vd.teenage_mode,
      tid: vd.tid,
      tid_info: getTidInfo(initialState.channel, vd.tid),
      title: vd.title,
      tname: vd.tname,
      videos: vd.videos
    };
  }

  async function resolvePlaybackBootstrap(meta) {
    const html = await fetch(meta.href, {
      credentials: 'include'
    }).then(res => res.text());
    const initialState = JSON.parse(extractAssignedJson(html, 'window.__INITIAL_STATE__'));
    const playInfoJson = extractAssignedJson(html, 'window.__playinfo__');
    const playInfo = playInfoJson ? JSON.parse(playInfoJson) : null;
    const vd = initialState.videoData;
    const p = Number(initialState.p || 1);
    const page = vd.pages?.[p - 1] || vd.pages?.[0] || {};
    const currentBvid = vd.bvid || meta.bvid;
    const recommendationCards = mergePlaylistCards(extractPlaylistCardsFromHtml(html, meta.href, currentBvid), extractPlaylistCardsFromInitialState(initialState, meta.href, currentBvid));
    return {
      title: vd.title || meta.title,
      coreScript: extractCoreScriptUrl(html) || CORE_FALLBACK,
      commentScript: extractCommentScriptUrl(html) || COMMENT_FALLBACK,
      stylesheets: extractStylesheetUrls(html),
      initialState,
      playInfo,
      recommendationCards,
      playerInfo: {
        aid: vd.aid || initialState.aid,
        bvid: currentBvid,
        cid: page.cid || initialState.cid,
        p,
        t: 0
      },
      href: meta.href,
      commentInfo: {
        params: `1,${vd.aid || initialState.aid}`,
        spmPrefix: initialState.spmidPrefix || '333.788',
        cmFromTrackId: new URL(meta.href, location.href).searchParams.get('track_id') || ''
      }
    };
  }
  function mergePlaylistCards(...groups) {
    const byBvid = new Map();
    groups.flat().forEach(card => {
      if (!card?.bvid) return;
      byBvid.set(card.bvid, mergePlaylistCard(byBvid.get(card.bvid), card));
    });
    return [...byBvid.values()];
  }
  function mergePlaylistCard(base, next) {
    if (!base) return next;
    return {
      ...base,
      href: base.href || next.href,
      title: isUsefulTitle(base.title) ? base.title : next.title,
      cover: base.cover || next.cover,
      subtitle: base.subtitle || next.subtitle,
      duration: base.duration || next.duration,
      stats: base.stats || next.stats
    };
  }
  function extractPlaylistCardsFromHtml(html, baseUrl, currentBvid) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const seen = new Set();
    return [...doc.querySelectorAll(PLAYBACK_VIDEO_LINK_SELECTOR)].sort((a, b) => Number(isCoverLink(b)) - Number(isCoverLink(a))).map(link => buildPlaylistCard(link, baseUrl)).filter(card => {
      if (!card || card.bvid === currentBvid || seen.has(card.bvid)) return false;
      seen.add(card.bvid);
      return true;
    });
  }
  function buildPlaylistCard(link, baseUrl) {
    const meta = getVideoMetaFromLink(link, baseUrl);
    if (!meta) return null;
    const root = getCardRoot(link);
    const title = getPlaylistCardTitle(link, root, meta.title);
    const cover = getPlaylistCardCover(root, baseUrl);
    const subtitle = getPlaylistCardSubtitle(root);
    const duration = getPlaylistCardDuration(root);
    const stats = getPlaylistCardStats(root);
    return {
      ...meta,
      title,
      cover,
      subtitle,
      duration,
      stats
    };
  }
  function extractPlaylistCardsFromInitialState(initialState, baseUrl, currentBvid) {
    return (initialState.related || []).map(item => {
      const bvid = item?.bvid;
      if (!bvid || bvid === currentBvid) return null;
      return {
        bvid,
        href: normalizeVideoHref(item.uri || `/video/${bvid}`, baseUrl),
        title: String(item.title || 'Bilibili 视频').replace(/\s+/g, ' ').trim(),
        cover: normalizeResourceUrl(item.pic, baseUrl),
        subtitle: String(item.owner?.name || item.author || '').replace(/\s+/g, ' ').trim(),
        duration: formatDuration(item.duration),
        stats: formatRelatedStats(item)
      };
    }).filter(card => card?.href);
  }
  function getPlaylistCardTitle(link, root, fallback) {
    const candidate = link.getAttribute('title') || link.getAttribute('aria-label') || getSafeTitleElementText(root, ['.title', '.info-title', '.bili-video-card__info--tit', '.video-page-card-small-title'].join(',')) || root?.querySelector?.('img')?.getAttribute('alt') || fallback;
    const title = String(candidate || fallback || 'Bilibili 视频').replace(/\s+/g, ' ').trim();
    return isUsefulTitle(title) ? title : 'Bilibili 视频';
  }
  function getSafeTitleElementText(root, selector) {
    return [...(root?.querySelectorAll?.(selector) || [])].map(element => element.textContent || element.getAttribute?.('title') || '').find(isUsefulTitle) || '';
  }
  function getPlaylistCardCover(root, baseUrl) {
    const img = root?.querySelector?.('img[src], img[data-src], img[data-lazy-src], img[data-original], img[data-url]');
    const source = root?.querySelector?.('source[srcset], source[data-srcset]');
    const raw = img?.getAttribute('data-src') || img?.getAttribute('data-lazy-src') || img?.getAttribute('data-original') || img?.getAttribute('data-url') || img?.getAttribute('src') || getFirstSrcsetUrl(source?.getAttribute('data-srcset') || source?.getAttribute('srcset')) || '';
    return normalizeResourceUrl(raw, baseUrl);
  }
  function getPlaylistCardSubtitle(root) {
    const candidate = root?.querySelector?.(['.upname', '.name', '.bili-video-card__info--author', '.video-page-card-small-author', '[class*="author"]'].join(','))?.textContent || '';
    return candidate.replace(/\s+/g, ' ').trim();
  }
  function getPlaylistCardDuration(root) {
    const candidate = root?.querySelector?.(['.duration', '.bili-video-card__stats__duration', '[class*="duration"]'].join(','))?.textContent || '';
    return candidate.replace(/\s+/g, ' ').trim();
  }
  function getPlaylistCardStats(root) {
    const playInfo = root?.querySelector?.('.playinfo')?.textContent;
    if (playInfo) return playInfo.replace(/\s+/g, ' ').trim();
    const items = [...(root?.querySelectorAll?.(['.bili-video-card__stats--text', '.bili-video-card__stats--item', '[class*="stats"] [class*="text"]'].join(',')) || [])].map(element => element.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
    return [...new Set(items)].slice(0, 2).join(' ');
  }
  function getFirstSrcsetUrl(srcset) {
    return String(srcset || '').split(',')[0]?.trim().split(/\s+/)[0] || '';
  }
  function isUsefulTitle(value) {
    const title = String(value || '').replace(/\s+/g, ' ').trim();
    return Boolean(title && title !== '不感兴趣' && title !== '撤销' && !title.includes('将减少此类内容推荐'));
  }
  function formatRelatedStats(item) {
    const view = formatCount(item?.stat?.view ?? item?.play);
    const danmaku = formatCount(item?.stat?.danmaku ?? item?.video_review);
    return view || danmaku ? {
      view,
      danmaku
    } : '';
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
  function extractAssignedJson(html, marker) {
    const start = html.indexOf(`${marker}=`);
    if (start < 0) {
      if (marker === 'window.__playinfo__') return null;
      throw new Error(`${marker} not found`);
    }
    const jsonStart = start + marker.length + 1;
    const first = html[jsonStart];
    if (first !== '{' && first !== '[') throw new Error(`${marker} assignment is not JSON`);
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = jsonStart; i < html.length; i += 1) {
      const char = html[i];
      if (inString) {
        if (escaped) escaped = false;else if (char === '\\') escaped = true;else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;else if (char === '{' || char === '[') depth += 1;else if (char === '}' || char === ']') {
        depth -= 1;
        if (depth === 0) return html.slice(jsonStart, i + 1);
      }
    }
    throw new Error(`${marker} JSON is not closed`);
  }
  function extractCoreScriptUrl(html) {
    const candidates = [...html.matchAll(/<script[^>]+src="([^"]*\/player\/main\/core\.[^"]+\.js[^"]*)"[^>]*>/g)].map(match => normalizeResourceUrl(match[1])).filter(Boolean);
    return candidates[0] || '';
  }
  function extractCommentScriptUrl(html) {
    const hash = html.match(/"comment_version_hash":"([^"]+)"/)?.[1];
    if (hash) return `https://s1.hdslb.com/bfs/seed/jinkela/commentpc/bili-comments.${hash}.js`;
    const src = html.match(/<script[^>]+src="([^"]*bili-comments[^"]+\.js[^"]*)"[^>]*>/)?.[1];
    return normalizeResourceUrl(src);
  }
  function extractStylesheetUrls(html) {
    const urls = [];
    const patterns = [/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/g, /<link[^>]+href="([^"]+)"[^>]+rel="stylesheet"[^>]*>/g];
    patterns.forEach(pattern => {
      for (const match of html.matchAll(pattern)) {
        const href = normalizeResourceUrl(match[1]);
        if (href && !urls.includes(href)) urls.push(href);
      }
    });
    return urls;
  }

  function createSettingsUi({
    state,
    getShadowRoot,
    syncCardButtons
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
      menu.append(createSettingsLabel('播放模式'), createSettingsOption('mode', 'home', '网页内弹窗'), createSettingsOption('mode', 'pip', 'Document PiP'), createSettingsLabel('封面点击'), createSettingsOption('direct', 'off', '按钮起播'), createSettingsOption('direct', 'on', '封面起播'));
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
    function sync() {
      setModeSignal(state.mode);
      setDirectClickSignal(state.directClick);
      syncCardButtons();
    }
    function setPlaybackMode(value) {
      state.mode = value;
      localStorage.setItem(STORAGE_MODE, value);
      setModeSignal(value);
      syncCardButtons();
    }
    function setDirectCoverClick(value) {
      state.directClick = value;
      localStorage.setItem(STORAGE_DIRECT_CLICK, value ? '1' : '0');
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
    if (themeStyle === 'dark') return [`${THEME_BASE}/map.css`, `${THEME_BASE}/dark.css`];
    return [`${THEME_BASE}/map.css`, `${THEME_BASE}/light_u.css`, `${THEME_BASE}/light.css`];
  }
  function getThemeStyle() {
    const value = getCookieValue('theme_style');
    if (value === 'dark' || value === 'light') return value;
    const hasDarkTheme = [...document.querySelectorAll('link[rel~="stylesheet"][href]')].some(link => String(link.getAttribute('href')).includes('/bili-theme/dark.css'));
    return hasDarkTheme ? 'dark' : 'light';
  }
  function getCookieValue(name) {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : '';
  }

  if (ENABLED_URL_RE.test(location.href)) {
    bootstrap();
  }
  function bootstrap() {
    const COMMENT_WIDTH_DEFAULT = 420;
    const COMMENT_WIDTH_MIN = 300;
    const COMMENT_WIDTH_MAX = 720;
    const PLAYER_CHROME_HEIGHT = 48;
    const PLAYER_CHROME_HEIGHT_WIDE = 56;
    const PLAYER_CHROME_HEIGHT_WIDE_BREAKPOINT = 1680;
    const initialLastPlayed = (() => {
      try {
        const value = JSON.parse(localStorage.getItem(STORAGE_LAST_PLAYED) || 'null');
        if (!value?.href || !value?.bvid) return null;
        return value;
      } catch {
        return null;
      }
    })();
    const initialCommentWidth = (() => {
      const value = Number(localStorage.getItem(STORAGE_COMMENT_WIDTH));
      return clampCommentWidth(Number.isFinite(value) ? value : COMMENT_WIDTH_DEFAULT);
    })();
    const initialCommentLayout = localStorage.getItem(STORAGE_COMMENT_LAYOUT) === 'bottom' ? 'bottom' : 'right';
    const state = {
      observer: null,
      scanTimer: 0,
      scanWarmupTimer: 0,
      viewportFrame: 0,
      lastFocus: null,
      lastButton: null,
      mode: localStorage.getItem(STORAGE_MODE) === 'pip' ? 'pip' : 'home',
      directClick: localStorage.getItem(STORAGE_DIRECT_CLICK) === '1',
      commentLayout: initialCommentLayout,
      commentWidth: initialCommentWidth,
      lastPlayed: initialLastPlayed,
      pipPlaying: null,
      switchToken: 0,
      pointer: null,
      settings: null,
      shadowHost: null,
      shadowRoot: null,
      overlay: null,
      cardEntries: [],
      home: {
        overlay: null,
        ui: null,
        player: null,
        comments: null,
        bootstrap: null,
        screenHandler: null,
        activeCommentsTab: 'comments',
        playlistCards: [],
        recommendationCards: [],
        selectedPlaylistBvid: ''
      },
      pip: {
        win: null,
        player: null,
        comments: null,
        bootstrap: null,
        screenHandler: null,
        switchingWindow: false,
        activeCommentsTab: 'comments',
        playlistCards: [],
        recommendationCards: [],
        selectedPlaylistBvid: ''
      }
    };
    const settingsUi = createSettingsUi({
      state,
      getShadowRoot: () => state.shadowRoot,
      syncCardButtons});
    const commentsTabsUi = createCommentsTabsUi({
      state,
      getHomeRenderer: () => homeRenderer,
      getPipRenderer: () => pipRenderer,
      getCommentLayout: () => state.commentLayout,
      openWithRenderer,
      syncHomeSize,
      schedulePipLayoutSync
    });
    const {
      attachPipTabs: attachPipCommentsTabs,
      capturePagePlaylist,
      createTabs: createCommentsTabs,
      renderPlaylist,
      renderRecommendations,
      setSelectedPlaylistBvid,
      syncTabs: syncCommentsTabs
    } = commentsTabsUi;
    window.__biliPopupPlayerNano = {
      scan,
      close: closeHome,
      destroy,
      getState: () => state
    };
    ensureShadowUi();
    ensureDocumentStyle();
    ensureSettings();
    scan();
    document.addEventListener('mousemove', onDocumentMouseMove, true);
    document.addEventListener('mouseleave', onDocumentMouseLeave, true);
    document.addEventListener('click', onDirectCoverClick, true);
    window.addEventListener('scroll', scheduleViewportSync, true);
    window.addEventListener('resize', scheduleViewportSync, true);
    state.observer = new MutationObserver(onDomMutated);
    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'title', 'aria-label']
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
      const overlay = document.createElement('div');
      overlay.className = `${APP}__overlay`;
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
      root.append(style, overlay);
      state.shadowHost = host;
      state.shadowRoot = root;
      state.overlay = overlay;
    }
    function ensureDocumentStyle() {
      if (document.getElementById(DOCUMENT_STYLE_ID)) return;
      const style = document.createElement('style');
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
        width: min(1360px, calc(100vw - 32px));
        height: min(860px, calc(100vh - 32px));
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

      #${APP}-header {
        display: grid;
        grid-template-columns: 1fr auto auto auto;
        align-items: center;
        gap: 8px;
        min-width: 0;
        padding: 0 10px 0 16px;
        color: var(--${APP}-text);
        background: var(--${APP}-surface-elevated);
        border-bottom: 1px solid var(--${APP}-border);
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
        display: inline-grid;
        place-items: center;
        border: 0;
        border-radius: 6px;
        color: var(--${APP}-text-subtle);
        background: transparent;
        cursor: pointer;
      }

      .${APP}__header-button svg {
        width: 17px;
        height: 17px;
        display: block;
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
        background: var(--${APP}-surface-soft);
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
        background: transparent;
      }

      #${APP}-overlay.${APP}--comments-right #${APP}-comments-resizer::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 50%;
        width: 1px;
        transform: translateX(-50%);
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
        height: calc(min(860px, calc(100vh - 32px)) - 46px);
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

      #${APP}-comments {
        display: flex;
        flex-direction: column;
        min-height: 520px;
        padding: 0;
        color: var(--text1, #18191c);
        background: var(--bg1, #fff);
      }

      #${APP}-overlay.${APP}--comments-right #${APP}-comments {
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
        align-items: center;
        gap: 4px;
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        border-bottom: 1px solid var(--line_regular, #e3e5e7);
        background: var(--bg1, #fff);
      }

      #${APP}-overlay.${APP}--comments-right .${APP}__comments-tabs {
        margin: 0;
        padding: 0;
      }

      .${APP}__comments-tab {
        height: 34px;
        padding: 0 4px;
        border: 0;
        border-bottom: 2px solid transparent;
        color: var(--text2, #61666d);
        background: transparent;
        font: 600 16px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: pointer;
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
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
      }

      #${APP}-comments-mount {
        box-sizing: border-box;
        min-height: 360px;
        padding-right: 18px;
        color: var(--text1, #18191c);
        background: var(--bg1, #fff);
      }

      #${APP}-overlay.${APP}--comments-right #${APP}-comments-mount {
        padding-right: 16px;
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
        flex: 0 0 auto;
        display: block;
        margin: 2px 4px 0 0;
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
        display: flex;
        align-items: flex-start;
        gap: 0;
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

      #${APP}-content .bili-comments-bottom-fixed-wrapper,
      #${APP}-comments .bili-comments-bottom-fixed-wrapper,
      #${APP}-comments-mount [class*="bottom-fixed"],
      #${APP}-comments-mount [class*="fixed-wrapper"] {
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
          height: calc(min(860px, calc(100vh - 32px)) - 46px);
        }

        #${APP}-overlay.${APP}--comments-right #${APP}-comments {
          height: auto;
          overflow: visible;
          border-left: 0;
        }
      }
    `;
      document.head.appendChild(style);
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
    function setPipPlaying(bootstrap) {
      state.pipPlaying = bootstrap ? {
        title: bootstrap.title,
        bvid: bootstrap.playerInfo?.bvid,
        aid: bootstrap.playerInfo?.aid
      } : null;
      syncVideoBadges();
    }
    function syncSettings() {
      settingsUi.sync();
    }
    function bindLink(link, meta = getVideoMetaFromLink(link)) {
      if (!meta) return;
      const card = getCardRoot(link);
      if (!card) return;
      const existing = state.cardEntries.find(entry => entry.card === card || entry.link === link);
      if (existing) {
        upgradeCardEntry(existing, link, card, meta);
        return;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = BUTTON_CLASS;
      button.dataset.bvid = meta.bvid;
      button.dataset.href = meta.href;
      button.dataset.title = meta.title;
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
        openByMode({
          bvid: button.dataset.bvid,
          href: button.dataset.href,
          title: button.dataset.title
        });
      });
      const badge = document.createElement('div');
      badge.className = BADGE_CLASS;
      badge.dataset.bvid = meta.bvid;
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
      const currentIsCover = isCoverLink(entry.link);
      const nextIsCover = isCoverLink(link);
      if (entry.link === link || currentIsCover || !nextIsCover) {
        entry.meta = meta;
        entry.button.dataset.bvid = meta.bvid;
        entry.button.dataset.href = meta.href;
        entry.button.dataset.title = meta.title;
        entry.badge.dataset.bvid = meta.bvid;
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
      entry.button.dataset.bvid = meta.bvid;
      entry.button.dataset.href = meta.href;
      entry.button.dataset.title = meta.title;
      entry.badge.dataset.bvid = meta.bvid;
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
      const bvid = badge.dataset.bvid;
      const isPlaying = Boolean(state.pipPlaying?.bvid && state.pipPlaying.bvid === bvid);
      const isLastPlayed = Boolean(state.lastPlayed?.bvid && state.lastPlayed.bvid === bvid);
      const active = isPlaying || isLastPlayed;
      badge.textContent = isPlaying ? '正在播放' : isLastPlayed ? '上次播放' : '';
      badge.classList.toggle(`${APP}--active`, active);
      badge.classList.toggle(`${APP}--playing`, isPlaying);
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
      if (isPlaybackPage() || isSpacePage()) return true;
      if (card?.tagName === 'A') return true;
      const host = getCardControlHost(link, card);
      return host?.tagName === 'A';
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
      });
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
    function scan() {
      [...document.querySelectorAll(getVideoLinkSelector())].sort((a, b) => Number(isCoverLink(b)) - Number(isCoverLink(a))).forEach(link => {
        const meta = getVideoMetaFromLink(link);
        if (!meta || meta.bvid === getCurrentPageBvid()) return;
        bindLink(link, meta);
      });
      ensureSettings();
      syncVideoBadges();
      syncOverlayPositions();
      state.cardEntries.forEach(positionCardEntry);
    }
    function onDomMutated(mutations) {
      if (mutations.some(shouldRescanMutation)) scheduleScan();
    }
    function shouldRescanMutation(mutation) {
      if (mutation.type === 'childList') return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
      if (mutation.type !== 'attributes') return false;
      const target = mutation.target;
      if (!(target instanceof Element)) return false;
      return target.matches?.('a[href*="/video/"], a[href], [title], [aria-label]') || target.closest?.('.bili-video-card, .feed-card, .video-card, [class*="video-card"], [class*="feed-card"]');
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
      if (!isPlaybackPage()) return 'a[href*="/video/BV"]';
      return PLAYBACK_VIDEO_LINK_SELECTOR;
    }
    function onDirectCoverClick(event) {
      if (!state.directClick || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (event.target.closest?.(`.${BUTTON_CLASS}, .${SETTINGS_CLASS}, #${APP}-overlay`)) return;
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
    function openByMode(meta) {
      openWithRenderer(getActiveRenderer(), meta);
    }
    function getActiveRenderer() {
      return state.mode === 'pip' ? pipRenderer : homeRenderer;
    }
    async function openWithRenderer(renderer, meta) {
      const reusable = renderer.getReusable?.(meta);
      if (reusable) {
        const token = ++state.switchToken;
        renderer.reuse(reusable, meta, token);
        return;
      }
      const token = ++state.switchToken;
      const context = await renderer.prepare(meta, token);
      if (!context || token !== state.switchToken) return;
      try {
        const bootstrap = await resolvePlaybackBootstrap(meta);
        if (token !== state.switchToken || renderer.isClosed(context)) return;
        saveLastPlayed(meta, bootstrap);
        await renderer.play(context, bootstrap, token);
        if (token !== state.switchToken || renderer.isClosed(context)) return;
        renderer.done?.(context, bootstrap);
      } catch (error) {
        if (token !== state.switchToken || renderer.isClosed(context)) return;
        renderer.fail(context, error);
      }
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
      showHomeShell(bootstrap.title || meta.title || meta.bvid);
      ui.openOriginal.dataset.href = meta.href || bootstrap.href;
      ui.status.textContent = '播放器：继续播放';
      saveLastPlayed(meta, bootstrap);
      setSelectedPlaylistBvid('home', meta.bvid || bootstrap.playerInfo?.bvid);
      renderPlaylist('home');
      renderRecommendations('home', bootstrap);
      bindHomeScreenChange(state.home.player);
      syncHomeSize();
      syncVideoBadges();
      playHomeSoon(token, 80);
    }
    async function prepareHome(meta) {
      const ui = ensureHomeShell();
      showHomeShell(meta.title || meta.bvid);
      ui.openOriginal.dataset.href = meta.href;
      ui.status.textContent = state.home.player ? '播放页参数：解析中，准备 reload' : '播放页参数：解析中';
      if (meta.fromPlaylist && state.home.playlistCards.length) {
        setSelectedPlaylistBvid('home', meta.bvid);
        renderPlaylist('home');
      } else {
        capturePagePlaylist('home', meta.bvid);
      }
      renderRecommendations('home', null);
      return {
        ui
      };
    }
    async function playHome(context, bootstrap, token) {
      const {
        ui
      } = context;
      state.home.bootstrap = bootstrap;
      ui.title.textContent = bootstrap.title || ui.title.textContent;
      ui.openOriginal.dataset.href = bootstrap.href;
      ui.status.textContent = `播放页参数：aid=${bootstrap.playerInfo.aid} cid=${bootstrap.playerInfo.cid}`;
      setSelectedPlaylistBvid('home', bootstrap.playerInfo?.bvid);
      renderPlaylist('home');
      renderRecommendations('home', bootstrap);
      await loadScriptOnce(document, bootstrap.coreScript, () => window.nano);
      if (token !== state.switchToken || !window.nano || homeRenderer.isClosed()) return;
      if (canReloadHome()) await reloadHomePlayer(bootstrap, token);else {
        disposeHomePlayer();
        createHomePlayer(bootstrap, token);
      }
      mountHomeComments(bootstrap, token);
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
        onOpenOriginal: href => openOriginalPlaybackPage(href, state.home.player),
        onPlayerControlClick: onHomePlayerControlClick,
        onResizeStart: event => startCommentWidthDrag(event, window)
      });
      state.home.overlay = state.home.ui.overlay;
      attachHomeBackToTopSync();
      syncHomeCommentLayout();
      syncCommentsTabs('home');
      return state.home.ui;
    }
    function showHomeShell(title) {
      const ui = state.home.ui;
      state.home.overlay.classList.remove(`${APP}--hidden`);
      state.home.overlay.removeAttribute('aria-hidden');
      document.body.classList.add(`${APP}--modal-open`);
      ui.title.textContent = title;
      ui.content.scrollTop = 0;
      syncHomeCommentLayout();
      syncCommentsTabs('home');
      document.documentElement.style.overflow = 'hidden';
      document.addEventListener('keydown', onKeydown, true);
      ui.close.focus();
      syncHomeSize();
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
    function setHomeFullscreen(active) {
      if (!state.home.overlay) return;
      state.home.overlay.classList.toggle(`${APP}--fullscreen`, Boolean(active));
      syncHomeFullscreenButton();
      syncHomeSize();
    }
    function buildHomePrimarySetting(bootstrap) {
      const info = bootstrap.playerInfo;
      const setting = {
        element: state.home.ui.playerRoot,
        aid: info.aid,
        cid: info.cid,
        bvid: info.bvid,
        p: info.p,
        t: info.t,
        kind: nano.GroupKind.Ugc,
        featureList: new Set(['blackGap']),
        stats: {
          spmId: '333.788.0.0',
          spmIdFrom: '333.788.0.0',
          trackId: ''
        },
        autoplay: true,
        enableHEVC: true,
        enableAV1: true,
        screenKind: getScreenKind(nano),
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
      bindHomeScreenChange(state.home.player);
      state.home.ui.status.textContent = '播放器：已 reload';
      playHomeSoon(token, 300);
    }
    function createHomePlayer(bootstrap, token) {
      const setting = buildHomePrimarySetting(bootstrap);
      state.home.player = nano.createPlayer(setting, bootstrap.initialState?.nanoTheme);
      bindHomeScreenChange(state.home.player);
      updateDebug(setting, bootstrap);
      state.home.player.connect();
      state.home.ui.status.textContent = '播放器：已 createPlayer';
      syncHomeSize();
      playHomeSoon(token, 1200);
    }
    async function mountHomeComments(bootstrap, token) {
      state.home.bootstrap = bootstrap;
      return mountComments({
        slot: state.home,
        mount: state.home.ui?.commentsMount,
        targetDocument: document,
        getCtor: () => window.BiliComments,
        beforeLoad: () => ensureBiliThemeStylesheets(document),
        getPlayer: () => state.home.player,
        getScrollContainer: getHomeCommentInstanceScrollContainer,
        isActive: () => token === state.switchToken && state.home.ui && !state.home.overlay?.classList.contains(`${APP}--hidden`)
      }, bootstrap);
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
    function getReusablePip(meta) {
      if (!state.pip.win || state.pip.win.closed || !state.pip.player || !state.pip.bootstrap || !isSamePlayback(meta, state.pip.bootstrap)) return null;
      return {
        pipWindow: state.pip.win,
        bootstrap: state.pip.bootstrap
      };
    }
    function reusePip(context, meta) {
      const bootstrap = context.bootstrap;
      saveLastPlayed(meta, bootstrap);
      ensurePipPlayerControls(context.pipWindow, meta.href || bootstrap.href);
      attachPipCommentsTabs(context.pipWindow);
      setSelectedPlaylistBvid('pip', meta.bvid || bootstrap.playerInfo?.bvid);
      renderPlaylist('pip');
      renderRecommendations('pip', bootstrap);
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
      if (!('documentPictureInPicture' in window)) {
        setLastButtonStatus('不支持 PiP');
        return null;
      }
      let pipWindow;
      if (state.pip.win && !state.pip.win.closed) {
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
      if (meta.fromPlaylist && state.pip.playlistCards.length) {
        setSelectedPlaylistBvid('pip', meta.bvid);
        renderPlaylist('pip');
      } else {
        capturePagePlaylist('pip', meta.bvid);
      }
      if (state.pip.win && !state.pip.win.closed) renderRecommendations('pip', null);
      if (canReloadPip(pipWindow)) setPipStatus('换源中');else {
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
      await bootPipWindow(context.pipWindow, bootstrap, token);
    }
    function failPip(context, error) {
      setLastButtonStatus('初始化失败');
      writePipError(context.pipWindow, error, context.href);
    }
    async function bootPipWindow(pipWindow, bootstrap, token) {
      state.pip.bootstrap = bootstrap;
      if (canReloadPip(pipWindow)) {
        await reloadPipPlayer(pipWindow, bootstrap, token);
        return;
      }
      disposePipPlayer();
      disposePipComments();
      const stylesheetLinks = [...new Set([...bootstrap.stylesheets, ...getBiliThemeStylesheets()])].map(href => `<link rel="stylesheet" href="${escapeHtml(href)}">`).join('\n');
      const commentLayoutClass = state.commentLayout === 'right' ? 'comments-right' : 'comments-bottom';
      writePipDocument(pipWindow, `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(bootstrap.title || 'Bilibili 小窗播放')}</title>
    ${stylesheetLinks}
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
        inset: 0 auto 0 50%;
        width: 1px;
        transform: translateX(-50%);
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
      #comments {
        display: flex;
        flex-direction: column;
        min-height: 520px;
        padding: 0;
        color: var(--text1, #18191c);
        background: var(--bg1, #fff);
      }
      body.comments-right #comments {
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
        align-items: center;
        gap: 4px;
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        border-bottom: 1px solid var(--line_regular, #e3e5e7);
        background: var(--bg1, #fff);
      }
      body.comments-right .${APP}__comments-tabs {
        margin: 0;
        padding: 0;
      }
      .${APP}__comments-tab {
        height: 34px;
        padding: 0 4px;
        border: 0;
        border-bottom: 2px solid transparent;
        color: var(--text2, #61666d);
        background: transparent;
        font: 600 16px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: pointer;
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
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      #comments-mount {
        box-sizing: border-box;
        min-height: 360px;
        padding-right: 18px;
        color: var(--text1, #18191c);
        background: var(--bg1, #fff);
      }
      body.comments-right #comments-mount {
        padding-right: 16px;
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
        flex: 0 0 auto;
        display: block;
        margin: 2px 4px 0 0;
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
        display: flex;
        align-items: flex-start;
        gap: 0;
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
      #layout .bili-comments-bottom-fixed-wrapper,
      #comments .bili-comments-bottom-fixed-wrapper,
      #comments-mount [class*="bottom-fixed"],
      #comments-mount [class*="fixed-wrapper"] {
        display: none !important;
      }
    </style>
  </head>
  <body class="${commentLayoutClass}"></body>
</html>`);
      mountPipPlayerPage({
        targetDocument: pipWindow.document,
        createCommentsTabs
      });
      attachPipCommentsTabs(pipWindow);
      setSelectedPlaylistBvid('pip', bootstrap.playerInfo?.bvid);
      renderPlaylist('pip');
      renderRecommendations('pip', bootstrap);
      syncCommentsTabs('pip');
      await loadScriptOnce(pipWindow.document, bootstrap.coreScript, () => pipWindow.nano);
      if (token !== state.switchToken || pipWindow.closed) return;
      if (!pipWindow.nano) throw new Error('nano not available after core load');
      attachPipCommentResizer(pipWindow);
      syncCommentWidth();
      connectPipPlayer(pipWindow, bootstrap, token);
      mountPipComments(pipWindow, bootstrap, token);
    }
    function canReloadPip(pipWindow) {
      return Boolean(pipWindow && !pipWindow.closed && state.pip.win === pipWindow && state.pip.player && typeof state.pip.player.reload === 'function' && pipWindow.document?.getElementById('bilibili-player') && pipWindow.nano);
    }
    async function reloadPipPlayer(targetWindow, bootstrap, token) {
      if (token !== state.switchToken || targetWindow.closed) return;
      state.pip.bootstrap = bootstrap;
      ensureStylesheetsInWindow(targetWindow, bootstrap.stylesheets);
      targetWindow.document.title = bootstrap.title || 'Bilibili 小窗播放';
      syncPipCommentLayout(targetWindow);
      ensurePipPlayerControls(targetWindow, bootstrap.href);
      attachPipCommentsTabs(targetWindow);
      setSelectedPlaylistBvid('pip', bootstrap.playerInfo?.bvid);
      renderPlaylist('pip');
      renderRecommendations('pip', bootstrap);
      attachPipCommentResizer(targetWindow);
      syncCommentWidth();
      syncPipSize(targetWindow);
      setPipStatus('换源中');
      const setting = buildPipPrimarySetting(targetWindow, bootstrap);
      targetWindow.__biliPopupPlayerNanoCurrentSetting = setting;
      targetWindow.__biliPopupPlayerNanoCurrentBootstrap = bootstrap;
      await Promise.resolve(state.pip.player.reload(setting, bootstrap.initialState?.nanoTheme));
      if (token !== state.switchToken || targetWindow.closed || targetWindow.player !== state.pip.player) return;
      bindPipScreenChange(targetWindow, state.pip.player);
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
      bindPipScreenChange(targetWindow, player);
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
      const setting = {
        element: targetWindow.document.getElementById('bilibili-player'),
        aid: info.aid,
        cid: info.cid,
        bvid: info.bvid,
        p: info.p,
        t: info.t,
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
      return result;
    }
    function setCommentLayout(value) {
      const next = value === 'right' ? 'right' : 'bottom';
      if (state.commentLayout === next) return;
      state.commentLayout = next;
      localStorage.setItem(STORAGE_COMMENT_LAYOUT, next);
      syncCommentLayout();
      remountCommentsForLayout();
    }
    function syncCommentLayout() {
      syncHomeCommentLayout();
      if (state.pip.win && !state.pip.win.closed) syncPipCommentLayout(state.pip.win);
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
      ui.content.addEventListener('scroll', syncHomeBackToTopButton, {
        passive: true
      });
      [ui.commentsPanel, ui.playlistPanel, ui.recommendPanel].forEach(panel => {
        panel?.addEventListener('scroll', syncHomeBackToTopButton, {
          passive: true
        });
      });
      syncHomeBackToTopButton();
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
      const eventType = window.nano?.EventType?.Player_Statue_Changed;
      if (!player?.on || !eventType) return;
      const handler = event => handleScreenChanged(window.nano, event?.detail);
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
          schedulePipLayoutSync(targetWindow);
        }, {
          passive: true
        });
      }
      const panels = [...(targetWindow.document?.querySelectorAll?.('#comments-panel, #playlist-panel, #recommend-panel') || [])];
      panels.forEach(panel => {
        if (panel.__biliPopupPlayerNanoScrollSyncBound) return;
        panel.__biliPopupPlayerNanoScrollSyncBound = true;
        panel.addEventListener('scroll', () => {
          syncPipBackToTopButton(targetWindow);
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
        localStorage.setItem(STORAGE_COMMENT_WIDTH, String(state.commentWidth));
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
      const next = {
        bvid: bootstrap.playerInfo?.bvid || meta.bvid,
        href: meta.href,
        title: bootstrap.title || meta.title,
        savedAt: Date.now()
      };
      state.lastPlayed = next;
      localStorage.setItem(STORAGE_LAST_PLAYED, JSON.stringify(next));
      syncSettings();
      syncVideoBadges();
    }
    function isSamePlayback(meta, bootstrap) {
      return Boolean(meta?.bvid && bootstrap?.playerInfo?.bvid && meta.bvid === bootstrap.playerInfo.bvid);
    }
    function updateDebug(primarySetting, bootstrap) {
      window.__biliPopupPlayerNanoDebug = {
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
    function syncHomeSize() {
      if (!state.home.ui?.playerRoot?.isConnected) return;
      syncHomePlayerFrame();
      try {
        state.home.player?.resize?.();
      } catch {
        // Ignore resize failures.
      }
      window.dispatchEvent(new Event('resize'));
    }
    function syncHomePlayerFrame() {
      const ui = state.home.ui;
      if (!ui?.dialog || !ui.content || !ui.playerWrap) return;
      if (state.commentLayout === 'right') {
        ui.dialog.style.height = '';
        ui.playerWrap.style.height = '';
        return;
      }
      const availableWidth = ui.content.clientWidth;
      if (!availableWidth) return;
      const headerHeight = 46;
      const desiredHeight = Math.round(availableWidth * 9 / 16 + getHomePlayerChromeHeight());
      const fullscreen = state.home.overlay?.classList.contains(`${APP}--fullscreen`);
      if (!fullscreen) {
        const desiredDialogHeight = desiredHeight + headerHeight;
        const maxDialogHeight = Math.max(320, window.innerHeight - 32);
        ui.dialog.style.height = `${Math.min(desiredDialogHeight, maxDialogHeight)}px`;
      } else {
        ui.dialog.style.height = '';
      }
      const availableHeight = fullscreen ? ui.content.clientHeight || window.innerHeight : Math.max(1, Math.min(desiredHeight, window.innerHeight - 32 - headerHeight));
      ui.playerWrap.style.height = `${Math.min(desiredHeight, availableHeight)}px`;
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
      const root = targetWindow.document?.getElementById('bilibili-player');
      if (!root) return;
      const stage = targetWindow.document.getElementById('stage');
      const rect = stage?.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect?.width || targetWindow.innerWidth));
      const height = Math.max(1, Math.floor(rect?.height || targetWindow.innerHeight));
      root.style.width = `${width}px`;
      root.style.height = `${height}px`;
      root.style.minWidth = '0px';
      root.style.minHeight = '0px';
      try {
        state.pip.player?.resize?.();
      } catch {
        // Ignore resize failures.
      }
      targetWindow.dispatchEvent(new targetWindow.Event('resize'));
      targetWindow.requestAnimationFrame(() => {
        const nextRect = stage?.getBoundingClientRect();
        const nextWidth = Math.max(1, Math.floor(nextRect?.width || targetWindow.innerWidth));
        const nextHeight = Math.max(1, Math.floor(nextRect?.height || targetWindow.innerHeight));
        root.style.width = `${nextWidth}px`;
        root.style.height = `${nextHeight}px`;
        root.style.minWidth = '0px';
        root.style.minHeight = '0px';
        try {
          state.pip.player?.resize?.();
        } catch {
          // Ignore resize failures.
        }
        targetWindow.dispatchEvent(new targetWindow.Event('resize'));
      });
    }
    function writePipLoading(pipWindow, title, href) {
      const stylesheetLinks = getBiliThemeStylesheets().map(href => `<link rel="stylesheet" href="${escapeHtml(href)}">`).join('\n');
      writePipDocument(pipWindow, `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title || 'Bilibili 小窗播放')}</title>
    ${stylesheetLinks}
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
</html>`);
    }
    function writePipError(pipWindow, error, href) {
      disposePipPlayer();
      disposePipComments();
      const stylesheetLinks = getBiliThemeStylesheets().map(href => `<link rel="stylesheet" href="${escapeHtml(href)}">`).join('\n');
      writePipDocument(pipWindow, `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>初始化失败</title>
    ${stylesheetLinks}
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
</html>`);
    }
    function writePipDocument(pipWindow, html) {
      state.pip.switchingWindow = true;
      pipWindow.__biliPopupPlayerNanoControlsObserver?.disconnect?.();
      delete pipWindow.__biliPopupPlayerNanoControlsObserver;
      pipWindow.__biliPopupPlayerNanoControlsToken = (pipWindow.__biliPopupPlayerNanoControlsToken || 0) + 1;
      pipWindow.document.open();
      pipWindow.document.write(html);
      pipWindow.document.close();
      window.setTimeout(() => {
        state.pip.switchingWindow = false;
      }, 0);
    }
    function setPipStatus(message) {
      setLastButtonStatus(message);
    }
    function setLastButtonStatus(message) {
      if (!state.lastButton?.isConnected) return;
      state.lastButton.textContent = message;
      window.setTimeout(() => {
        if (state.lastButton?.isConnected) state.lastButton.textContent = '小窗播放';
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
      document.documentElement.style.overflow = '';
      document.body.classList.remove(`${APP}--modal-open`);
      document.removeEventListener('keydown', onKeydown, true);
      if (state.lastFocus?.isConnected) state.lastFocus.focus({
        preventScroll: true
      });
    }
    function onKeydown(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeHome();
    }
    function disposeHomePlayer() {
      if (!state.home.player) return;
      unbindHomeScreenChange();
      try {
        state.home.player.disconnect?.();
      } catch {
        // Ignore player cleanup failures.
      }
      state.home.player = null;
    }
    function disposePipPlayer() {
      if (!state.pip.player) return;
      unbindPipScreenChange();
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
      stopScanWarmup();
      closeHome();
      disposeHomePlayer();
      disposePipPlayer();
      disposeHomeComments();
      disposePipComments();
      state.home.ui?.dispose?.();
      state.home.ui = null;
      state.home.overlay = null;
      settingsUi.destroy();
      document.removeEventListener('mousemove', onDocumentMouseMove, true);
      document.removeEventListener('mouseleave', onDocumentMouseLeave, true);
      document.removeEventListener('click', onDirectCoverClick, true);
      window.removeEventListener('scroll', scheduleViewportSync, true);
      window.removeEventListener('resize', scheduleViewportSync, true);
      state.shadowHost?.remove();
      document.getElementById(DOCUMENT_STYLE_ID)?.remove();
      document.documentElement.style.overflow = '';
      delete window.__biliPopupPlayerNano;
    }
  }

})();
