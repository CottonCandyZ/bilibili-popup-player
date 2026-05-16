// ==UserScript==
// @name         Bilibili Popup Player - Nano
// @namespace    https://www.bilibili.com/
// @version      0.2.0
// @description  B 站小窗播放合并版：支持首页和播放页推荐视频，网页内弹窗/Chrome Document PiP 两种模式可切换。
// @author       Codex & Cotton
// @match        https://www.bilibili.com/*
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
  const ENABLED_URL_RE = /^https?:\/\/www\.bilibili\.com\/(?:$|[?#]|index\.html|video\/BV)/;
  const BV_RE = /\/video\/(BV[0-9A-Za-z]+)/;
  const CORE_FALLBACK = 'https://s1.hdslb.com/bfs/static/player/main/core.6dcbfdb4.js';
  const COMMENT_FALLBACK = 'https://s1.hdslb.com/bfs/seed/jinkela/commentpc/bili-comments.js';
  const THEME_BASE = 'https://s1.hdslb.com/bfs/seed/jinkela/short/bili-theme';

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
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

  async function mountComments(adapter, bootstrap) {
    const { slot, mount, targetDocument, getCtor, beforeLoad, getPlayer, getScrollContainer, isActive } = adapter;
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
      slot.comments.addEventListener?.('seek', (event) => {
        try {
          const { time } = event.detail || {};
          getPlayer()?.seek?.({ value: time, autoplay: true });
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
      spmPrefix: bootstrap.commentInfo.spmPrefix,
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
      instance.dispatchAction({ type: 'reload', args: [props], callback() {} });
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

  function createSettingsIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    [
      ['path', { d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915' }],
      ['circle', { cx: '12', cy: '12', r: '3' }],
    ].forEach(([name, attrs]) => {
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
            subTid: sub.tid,
          };
        }
      }
    }
    return null;
  }

  function getUpStaffs(staffData) {
    if (!Array.isArray(staffData)) return [];
    return staffData.map((staff) => ({
      face: staff.face,
      follower: staff.follower,
      label: staff.label,
      mid: staff.mid,
      name: staff.name,
      official: staff.official,
      title: staff.title,
      vip: staff.vip,
    }));
  }

  function getPlayerViewInfo(initialState) {
    const vd = initialState.videoData || {};
    const upData = initialState.upData || {};
    const page = vd.pages?.[(Number(initialState.p || 1) - 1)] || vd.pages?.[0] || {};
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
        face: upData.face,
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
      videos: vd.videos,
    };
  }

  function normalizeVideoHref(rawHref) {
    if (!rawHref) return '';
    try {
      const url = new URL(rawHref, location.href);
      if (!url.hostname.endsWith('bilibili.com')) return '';
      return url.href;
    } catch {
      return '';
    }
  }

  function normalizeResourceUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
      return new URL(rawUrl, location.href).href;
    } catch {
      return '';
    }
  }

  function getVideoMetaFromLink(link) {
    const href = normalizeVideoHref(link.getAttribute('href') || link.href);
    const match = href?.match(BV_RE);
    if (!match) return null;
    const title = link.getAttribute('title') ||
      link.getAttribute('aria-label') ||
      link.querySelector('img')?.getAttribute('alt') ||
      link.closest('[title]')?.getAttribute('title') ||
      'Bilibili 视频';
    return { bvid: match[1], href, title: title.trim() || 'Bilibili 视频' };
  }

  function getCurrentPageBvid() {
    return location.href.match(BV_RE)?.[1] || '';
  }

  function isPlaybackPage() {
    return /^https?:\/\/www\.bilibili\.com\/video\/BV/.test(location.href);
  }

  function getCardRoot(link) {
    return link.closest('.bili-video-card') ||
      link.closest('.feed-card') ||
      link.closest('.video-card') ||
      link.closest('.video-page-card-small') ||
      link.closest('.card-box') ||
      link.closest('.recommended-card') ||
      link.closest('[class*="video-card"]') ||
      link.closest('[class*="video-page-card"]') ||
      link.closest('[class*="feed-card"]') ||
      link.parentElement;
  }

  function isCoverLink(link) {
    const coverSelector = '.bili-video-card__image, .bili-video-card__cover, .bili-video-card__wrap, .pic-box, .pic, .framepreview-box, .video-awesome-img, .cover, [class*="cover"], [class*="pic"], [class*="image"]';
    return Boolean(
      link.matches?.(coverSelector) ||
      link.closest?.(coverSelector) ||
      link.querySelector?.('img, picture, video, canvas, svg[class*="play"]') ||
      /cover|pic|image/i.test(String(link.className || ''))
    );
  }

  async function resolvePlaybackBootstrap(meta) {
    const html = await fetch(meta.href, { credentials: 'include' }).then((res) => res.text());
    const initialState = JSON.parse(extractAssignedJson(html, 'window.__INITIAL_STATE__'));
    const playInfoJson = extractAssignedJson(html, 'window.__playinfo__');
    const playInfo = playInfoJson ? JSON.parse(playInfoJson) : null;
    const vd = initialState.videoData;
    const p = Number(initialState.p || 1);
    const page = vd.pages?.[p - 1] || vd.pages?.[0] || {};

    return {
      title: vd.title || meta.title,
      coreScript: extractCoreScriptUrl(html) || CORE_FALLBACK,
      commentScript: extractCommentScriptUrl(html) || COMMENT_FALLBACK,
      stylesheets: extractStylesheetUrls(html),
      initialState,
      playInfo,
      playerInfo: {
        aid: vd.aid || initialState.aid,
        bvid: vd.bvid || meta.bvid,
        cid: page.cid || initialState.cid,
        p,
        t: 0,
      },
      href: meta.href,
      commentInfo: {
        params: `1,${vd.aid || initialState.aid}`,
        spmPrefix: initialState.spmidPrefix || '333.788',
        cmFromTrackId: new URL(meta.href, location.href).searchParams.get('track_id') || '',
      },
    };
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
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === '{' || char === '[') depth += 1;
      else if (char === '}' || char === ']') {
        depth -= 1;
        if (depth === 0) return html.slice(jsonStart, i + 1);
      }
    }
    throw new Error(`${marker} JSON is not closed`);
  }

  function extractCoreScriptUrl(html) {
    const candidates = [...html.matchAll(/<script[^>]+src="([^"]*\/player\/main\/core\.[^"]+\.js[^"]*)"[^>]*>/g)]
      .map((match) => normalizeResourceUrl(match[1]))
      .filter(Boolean);
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
    const patterns = [
      /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/g,
      /<link[^>]+href="([^"]+)"[^>]+rel="stylesheet"[^>]*>/g,
    ];
    patterns.forEach((pattern) => {
      for (const match of html.matchAll(pattern)) {
        const href = normalizeResourceUrl(match[1]);
        if (href && !urls.includes(href)) urls.push(href);
      }
    });
    return urls;
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
  function insert(parent, accessor, marker, initial) {
    if (marker !== undefined && !initial) initial = [];
    if (typeof accessor !== "function") return insertExpression(parent, accessor, initial, marker);
    createRenderEffect(current => insertExpression(parent, accessor(), current, marker), initial);
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
      if (item == null || item === true || item === false) ; else if ((t = typeof item) === "object" && item.nodeType) {
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

  function createSettingsUi({ state, getShadowRoot, syncCardButtons }) {
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
      state.settings = { root: mount, dispose };
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

      menu.append(
        createSettingsLabel('播放模式'),
        createSettingsOption('mode', 'home', '网页内弹窗'),
        createSettingsOption('mode', 'pip', 'Document PiP'),
        createSettingsLabel('封面点击'),
        createSettingsOption('direct', 'off', '按钮起播'),
        createSettingsOption('direct', 'on', '封面起播'),
      );

      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setSettingsOpen((open) => !open);
      });

      const closeOnDocumentClick = (event) => {
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
      option.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (type === 'mode') setPlaybackMode(value);
        else if (type === 'direct') setDirectCoverClick(value === 'on');
      });
      createEffect(() => {
        const active = type === 'mode'
          ? modeSignal() === value
          : type === 'direct'
            ? directClickSignal() === (value === 'on')
            : false;
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

    return { ensure, sync, destroy };
  }

  function ensureStylesheetsInWindow(targetWindow, stylesheets) {
    const doc = targetWindow.document;
    const existing = new Set([...doc.querySelectorAll('link[rel~="stylesheet"][href]')].map((link) => link.href));
    [...new Set([...stylesheets, ...getBiliThemeStylesheets()])].forEach((href) => {
      if (existing.has(href)) return;
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      doc.head.appendChild(link);
    });
  }

  function ensureBiliThemeStylesheets(targetDocument) {
    const existing = new Set([...targetDocument.querySelectorAll('link[rel~="stylesheet"][href]')].map((link) => link.href));
    getBiliThemeStylesheets().forEach((href) => {
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
    const hasDarkTheme = [...document.querySelectorAll('link[rel~="stylesheet"][href]')]
      .some((link) => String(link.getAttribute('href')).includes('/bili-theme/dark.css'));
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
      },
      pip: {
        win: null,
        player: null,
        comments: null,
        bootstrap: null,
        screenHandler: null,
        switchingWindow: false,
      },
    };

    const settingsUi = createSettingsUi({
      state,
      getShadowRoot: () => state.shadowRoot,
      syncCardButtons});

    window.__biliPopupPlayerNano = {
      scan,
      close: closeHome,
      destroy,
      getState: () => state,
    };

    ensureShadowUi();
    ensureDocumentStyle();
    ensureSettings();
    scan();
    window.addEventListener('scroll', scheduleOverlaySync, true);
    window.addEventListener('resize', scheduleOverlaySync, true);
    document.addEventListener('mousemove', onDocumentMouseMove, true);
    document.addEventListener('mouseleave', onDocumentMouseLeave, true);
    document.addEventListener('click', onDirectCoverClick, true);
    state.observer = new MutationObserver(scheduleScan);
    state.observer.observe(document.body, { childList: true, subtree: true });

    function ensureShadowUi() {
      if (state.shadowRoot) return;

      const previous = document.getElementById(HOST_ID);
      if (previous) previous.remove();

      const host = document.createElement('div');
      host.id = HOST_ID;
      host.style.position = 'fixed';
      host.style.inset = '0';
      host.style.zIndex = '2147483646';
      host.style.pointerEvents = 'none';
      document.documentElement.appendChild(host);

      const root = host.attachShadow({ mode: 'open' });
      const overlay = document.createElement('div');
      overlay.className = `${APP}__overlay`;

      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
      .${BUTTON_CLASS} {
        position: absolute;
        z-index: 20;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 72px;
        height: 28px;
        padding: 0 10px;
        border: 0;
        border-radius: 6px;
        color: #fff;
        background: rgba(251, 114, 153, 0.96);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.24);
        font: 500 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: pointer;
        opacity: 0.92;
        pointer-events: auto;
        transform: translate(-100%, -100%);
        transition: opacity 0.16s ease, transform 0.16s ease, background 0.16s ease;
      }

      .${BUTTON_CLASS}:hover,
      .${BUTTON_CLASS}:focus-visible {
        opacity: 1;
        outline: none;
        transform: translate(-100%, -100%);
      }

      .${BADGE_CLASS} {
        position: absolute;
        z-index: 21;
        display: none;
        align-items: center;
        height: 24px;
        padding: 0 8px;
        border-radius: 6px;
        color: #fff;
        background: rgba(24, 25, 28, 0.86);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22);
        font: 500 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: none;
      }

      .${APP}__overlay {
        position: fixed;
        inset: 0;
        pointer-events: none;
      }

      .${BADGE_CLASS}.${APP}--active {
        display: inline-flex;
      }

      .${BADGE_CLASS}.${APP}--playing {
        background: rgba(251, 114, 153, 0.96);
      }

      .${SETTINGS_CLASS} {
        position: fixed;
        right: 16px;
        bottom: 96px;
        z-index: 2147483646;
        font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: auto;
      }

      .${SETTINGS_CLASS}__button {
        width: 52px;
        height: 52px;
        display: grid;
        place-items: center;
        border: 1px solid #e3e5e7;
        border-radius: 10px;
        color: #61666d;
        background: #fff;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
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
        border-color: #fb7299;
        background: #fb7299;
        outline: none;
      }

      .${SETTINGS_CLASS}__menu {
        position: absolute;
        right: 0;
        bottom: 60px;
        width: 184px;
        padding: 8px;
        display: none;
        border: 1px solid #e3e5e7;
        border-radius: 8px;
        color: #18191c;
        background: #fff;
        box-shadow: 0 10px 32px rgba(0, 0, 0, 0.18);
      }

      .${SETTINGS_CLASS}.${APP}--open .${SETTINGS_CLASS}__menu {
        display: block;
      }

      .${SETTINGS_CLASS}__label {
        margin: 4px 6px 6px;
        color: #9499a0;
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
        color: #18191c;
        background: transparent;
        cursor: pointer;
        text-align: left;
      }

      .${SETTINGS_CLASS}__option:hover,
      .${SETTINGS_CLASS}__option:focus-visible,
      .${SETTINGS_CLASS}__option.${APP}--active {
        color: #fb7299;
        background: #f6f7f8;
        outline: none;
      }

      .${SETTINGS_CLASS}__option:disabled {
        color: #c9ccd0;
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

      #${APP}-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: grid;
        place-items: center;
        padding: 16px;
        background: rgba(15, 18, 24, 0.68);
      }

      #${APP}-overlay.${APP}--hidden {
        display: none;
      }

      #${APP}-dialog {
        width: min(1360px, calc(100vw - 32px));
        height: min(860px, calc(100vh - 32px));
        display: grid;
        grid-template-rows: 46px 1fr;
        overflow: hidden;
        border-radius: 8px;
        background: #11151d;
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
        grid-template-columns: 1fr auto auto auto auto;
        align-items: center;
        gap: 8px;
        min-width: 0;
        padding: 0 10px 0 16px;
        color: #f7f8fa;
        background: #1c222d;
      }

      #${APP}-title {
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        font: 500 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      #${APP}-status {
        max-width: 360px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        color: #aeb7c6;
        font-size: 12px;
      }

      .${APP}__header-button {
        width: 32px;
        height: 32px;
        display: inline-grid;
        place-items: center;
        border: 0;
        border-radius: 6px;
        color: #d8dde6;
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
        color: #fff;
        background: rgba(255, 255, 255, 0.12);
        outline: none;
      }

      #${APP}-content {
        min-width: 0;
        min-height: 0;
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
        background: #0f1117;
      }

      #${APP}-overlay.${APP}--comments-right #${APP}-content {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 10px var(--${APP}-comments-width, 420px);
        overflow: hidden;
      }

      #${APP}-comments-resizer {
        display: none;
      }

      #${APP}-overlay.${APP}--comments-right #${APP}-comments-resizer {
        display: block;
        position: relative;
        z-index: 2;
        min-width: 10px;
        height: 100%;
        cursor: col-resize;
        background: transparent;
      }

      #${APP}-overlay.${APP}--comments-right #${APP}-comments-resizer::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 4px;
        width: 2px;
        background: var(--line_regular, #e3e5e7);
      }

      #${APP}-overlay.${APP}--comments-right #${APP}-comments-resizer:hover::before,
      #${APP}-overlay.${APP}--comments-right #${APP}-comments-resizer:focus-visible::before,
      #${APP}-overlay.${APP}--resizing #${APP}-comments-resizer::before {
        background: #fb7299;
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
        min-height: 520px;
        padding: 24px 32px 48px;
        color: var(--text1, #18191c);
        background: var(--bg1, #fff);
      }

      #${APP}-overlay.${APP}--comments-right #${APP}-comments {
        min-width: 0;
        min-height: 0;
        height: 100%;
        padding: 18px 22px 40px;
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
        border-left: 0;
      }

      #${APP}-comments-title {
        margin: 0 0 16px;
        color: var(--text1, #18191c);
        font: 600 18px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      #${APP}-comments-mount {
        min-height: 360px;
        color: var(--text1, #18191c);
        background: var(--bg1, #fff);
      }

      #${APP}-content .bili-comments-bottom-fixed-wrapper,
      #${APP}-comments .bili-comments-bottom-fixed-wrapper {
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

    function setPipPlaying(bootstrap) {
      state.pipPlaying = bootstrap ? {
        title: bootstrap.title,
        bvid: bootstrap.playerInfo?.bvid,
        aid: bootstrap.playerInfo?.aid,
      } : null;
      syncVideoBadges();
    }

    function syncSettings() {
      settingsUi.sync();
    }

    function bindLink(link, meta = getVideoMetaFromLink(link)) {
      if (!meta) return;
      const card = getCardRoot(link);
      if (!card || state.cardEntries.some((entry) => entry.card === card || entry.link === link)) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = BUTTON_CLASS;
      button.dataset.bvid = meta.bvid;
      button.dataset.href = meta.href;
      button.dataset.title = meta.title;
      syncCardButton(button);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        state.lastFocus = button;
        state.lastButton = button;
        if (state.directClick) {
          location.href = button.dataset.href;
          return;
        }
        openByMode({
          bvid: button.dataset.bvid,
          href: button.dataset.href,
          title: button.dataset.title,
        });
      });

      const badge = document.createElement('div');
      badge.className = BADGE_CLASS;
      badge.dataset.bvid = meta.bvid;

      state.overlay.append(button, badge);
      state.cardEntries.push({ card, link, button, badge, meta });
      positionCardEntry(state.cardEntries[state.cardEntries.length - 1]);
      syncVideoBadge(badge);
    }

    function syncCardButtons() {
      state.cardEntries.forEach((entry) => syncCardButton(entry.button));
    }

    function syncCardButton(button) {
      const title = button.dataset.title || 'Bilibili 视频';
      button.textContent = state.directClick ? '跳转' : '小窗播放';
      button.setAttribute('aria-label', state.directClick ? `跳转：${title}` : `小窗播放：${title}`);
      button.title = state.directClick ? '跳转到播放页' : '小窗播放';
    }

    function syncVideoBadges() {
      state.cardEntries.forEach((entry) => syncVideoBadge(entry.badge));
    }

    function syncVideoBadge(badge) {
      const bvid = badge.dataset.bvid;
      const isPlaying = Boolean(state.pipPlaying?.bvid && state.pipPlaying.bvid === bvid);
      const isLastPlayed = Boolean(state.lastPlayed?.bvid && state.lastPlayed.bvid === bvid);
      const active = isPlaying || isLastPlayed;

      badge.textContent = isPlaying ? '正在播放' : isLastPlayed ? '上次播放' : '';
      badge.classList.toggle(`${APP}--active`, active);
      badge.classList.toggle(`${APP}--playing`, isPlaying);
      const entry = state.cardEntries.find((item) => item.badge === badge);
      if (entry) positionCardEntry(entry);
    }

    function scheduleOverlaySync() {
      if (state.overlayFrame) return;
      state.overlayFrame = requestAnimationFrame(() => {
        state.overlayFrame = 0;
        syncOverlayPositions();
      });
    }

    function syncOverlayPositions() {
      state.cardEntries = state.cardEntries.filter((entry) => {
        if (!entry.card.isConnected || !entry.link.isConnected) {
          entry.button.remove();
          entry.badge.remove();
          return false;
        }
        positionCardEntry(entry);
        return true;
      });
    }

    function positionCardEntry(entry) {
      const cardRect = getCardRect(entry);
      const coverRect = getCoverRect(entry);
      const visible = cardRect.width > 36 && cardRect.height > 28 && cardRect.bottom > 0 && cardRect.right > 0 && cardRect.top < innerHeight && cardRect.left < innerWidth;
      const buttonVisible = visible && shouldShowCardButton(entry, cardRect);
      entry.button.style.display = buttonVisible ? 'inline-flex' : 'none';
      entry.badge.style.display = visible && entry.badge.classList.contains(`${APP}--active`) ? 'inline-flex' : 'none';
      if (!visible) return;

      entry.button.style.left = `${Math.max(80, cardRect.right - 8)}px`;
      entry.button.style.top = `${Math.max(36, cardRect.bottom - 8)}px`;
      entry.badge.style.left = `${Math.max(0, coverRect.left + 8)}px`;
      entry.badge.style.top = `${Math.max(0, coverRect.top + 8)}px`;
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
      state.pointer = { x: event.clientX, y: event.clientY };
      scheduleOverlaySync();
    }

    function onDocumentMouseLeave() {
      state.pointer = null;
      scheduleOverlaySync();
    }

    function getCoverRect(entry) {
      const cover = entry.link.closest?.('.bili-video-card__image, .bili-video-card__cover, .bili-video-card__wrap, .pic-box, .pic, .framepreview-box, .video-awesome-img, .cover, [class*="cover"], [class*="pic"], [class*="image"]');
      return (cover || entry.link).getBoundingClientRect();
    }

    function scan() {
      document.querySelectorAll(getVideoLinkSelector()).forEach((link) => {
        const meta = getVideoMetaFromLink(link);
        if (!meta || meta.bvid === getCurrentPageBvid()) return;
        bindLink(link, meta);
      });
      ensureSettings();
      syncVideoBadges();
      syncOverlayPositions();
    }

    function scheduleScan() {
      if (state.scanTimer) return;
      state.scanTimer = window.setTimeout(() => {
        state.scanTimer = 0;
        scan();
      }, 180);
    }

    function getVideoLinkSelector() {
      if (!isPlaybackPage()) return 'a[href*="/video/BV"]';
      return [
        '.video-page-card-small a[href*="/video/BV"]',
        '.rec-list .video-page-card-small a[href*="/video/BV"]',
        '.recommend-list .video-page-card-small a[href*="/video/BV"]',
      ].join(',');
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
      prepare: prepareHome,
      play: playHome,
      fail: failHome,
      isClosed: () => !state.home.overlay || state.home.overlay.classList.contains(`${APP}--hidden`),
    };

    async function prepareHome(meta) {
      const ui = ensureHomeShell();
      showHomeShell(meta.title || meta.bvid);
      ui.openOriginal.dataset.href = meta.href;
      ui.status.textContent = state.home.player ? '播放页参数：解析中，准备 reload' : '播放页参数：解析中';
      return { ui };
    }

    async function playHome(context, bootstrap, token) {
      const { ui } = context;
      state.home.bootstrap = bootstrap;
      ui.title.textContent = bootstrap.title || ui.title.textContent;
      ui.openOriginal.dataset.href = bootstrap.href;
      ui.status.textContent = `播放页参数：aid=${bootstrap.playerInfo.aid} cid=${bootstrap.playerInfo.cid}`;
      await loadScriptOnce(document, bootstrap.coreScript, () => window.nano);
      if (token !== state.switchToken || !window.nano || homeRenderer.isClosed()) return;

      if (canReloadHome()) await reloadHomePlayer(bootstrap, token);
      else {
        disposeHomePlayer();
        createHomePlayer(bootstrap, token);
      }
      mountHomeComments(bootstrap, token);
    }

    function failHome(context, error) {
      context.ui.status.textContent = `初始化失败：${error?.message || 'unknown'}`;
    }

    function ensureHomeShell() {
      if (state.home.ui && state.home.overlay?.isConnected) return state.home.ui;

      const overlay = document.createElement('div');
      overlay.id = `${APP}-overlay`;
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.dataset.backdropPointer = '0';

      const dialog = document.createElement('section');
      dialog.id = `${APP}-dialog`;

      const header = document.createElement('header');
      header.id = `${APP}-header`;

      const title = document.createElement('div');
      title.id = `${APP}-title`;

      const status = document.createElement('div');
      status.id = `${APP}-status`;

      const openOriginal = document.createElement('button');
      openOriginal.type = 'button';
      openOriginal.className = `${APP}__header-button`;
      openOriginal.title = '打开原播放页';
      openOriginal.setAttribute('aria-label', '打开原播放页');
      openOriginal.appendChild(createExternalLinkIcon());

      const fullscreen = document.createElement('button');
      fullscreen.type = 'button';
      fullscreen.className = `${APP}__header-button`;
      fullscreen.title = '网页内全屏';
      fullscreen.setAttribute('aria-label', '网页内全屏');
      fullscreen.appendChild(createMaximizeIcon());

      const close = document.createElement('button');
      close.type = 'button';
      close.className = `${APP}__header-button`;
      close.title = '关闭';
      close.setAttribute('aria-label', '关闭首页播放器');
      close.textContent = '×';
      close.addEventListener('click', closeHome);

      const content = document.createElement('div');
      content.id = `${APP}-content`;

      const playerWrap = document.createElement('div');
      playerWrap.id = `${APP}-player-wrap`;

      const playerRoot = document.createElement('div');
      playerRoot.id = `${APP}-player`;

      const commentsResizer = document.createElement('div');
      commentsResizer.id = `${APP}-comments-resizer`;
      commentsResizer.tabIndex = 0;
      commentsResizer.setAttribute('role', 'separator');
      commentsResizer.setAttribute('aria-orientation', 'vertical');
      commentsResizer.setAttribute('aria-label', '调整评论区宽度');
      commentsResizer.addEventListener('pointerdown', (event) => startCommentWidthDrag(event, window));

      const comments = document.createElement('section');
      comments.id = `${APP}-comments`;

      const commentsTitle = document.createElement('h2');
      commentsTitle.id = `${APP}-comments-title`;
      commentsTitle.textContent = '评论';

      const commentsMount = document.createElement('div');
      commentsMount.id = `${APP}-comments-mount`;

      playerWrap.append(playerRoot);
      comments.append(commentsTitle, commentsMount);
      content.append(playerWrap, commentsResizer, comments);
      header.append(title, status, openOriginal, fullscreen, close);
      dialog.append(header, content);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      overlay.addEventListener('pointerdown', (event) => {
        overlay.dataset.backdropPointer = event.target === overlay ? '1' : '0';
      });

      overlay.addEventListener('pointerup', (event) => {
        const startedOnBackdrop = overlay.dataset.backdropPointer === '1';
        overlay.dataset.backdropPointer = '0';
        if (startedOnBackdrop && event.target === overlay) closeHome();
      });

      overlay.addEventListener('pointercancel', () => {
        overlay.dataset.backdropPointer = '0';
      });

      openOriginal.addEventListener('click', () => {
        openOriginalPage(openOriginal.dataset.href);
      });

      fullscreen.addEventListener('click', () => {
        setHomeFullscreen(!overlay.classList.contains(`${APP}--fullscreen`));
      });
      playerRoot.addEventListener('click', onHomePlayerControlClick, true);

      state.home.overlay = overlay;
      state.home.ui = { overlay, dialog, title, status, openOriginal, fullscreen, close, content, playerWrap, playerRoot, commentsResizer, comments, commentsMount };
      syncHomeCommentLayout();
      return state.home.ui;
    }

    function showHomeShell(title) {
      const ui = state.home.ui;
      state.home.overlay.classList.remove(`${APP}--hidden`);
      state.home.overlay.removeAttribute('aria-hidden');
      ui.title.textContent = title;
      ui.content.scrollTop = 0;
      syncHomeCommentLayout();
      document.documentElement.style.overflow = 'hidden';
      document.addEventListener('keydown', onKeydown, true);
      ui.close.focus();
      syncHomeSize();
    }

    function onHomePlayerControlClick(event) {
      const target = event.target;
      const control = target?.closest?.(
        '.bpx-player-ctrl-web, .bpx-player-ctrl-web-enter, .bpx-player-ctrl-web-leave, .bilibili-player-video-btn-web-fullscreen',
      );
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
        stats: { spmId: '333.788.0.0', spmIdFrom: '333.788.0.0', trackId: '' },
        autoplay: true,
        enableHEVC: true,
        enableAV1: true,
        screenKind: getScreenKind(nano),
        revision: 1,
        viewInfo: getPlayerViewInfo(bootstrap.initialState),
      };
      if (bootstrap.playInfo) setting.prefetch = { playUrl: bootstrap.playInfo };
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
        getScrollContainer: getHomeCommentsScrollContainer,
        isActive: () => token === state.switchToken && state.home.ui && !state.home.overlay?.classList.contains(`${APP}--hidden`),
      }, bootstrap);
    }

    const pipRenderer = {
      prepare: preparePip,
      play: playPip,
      fail: failPip,
      done: (_context, bootstrap) => {
        setLastButtonStatus('播放中');
        setPipPlaying(bootstrap);
      },
      isClosed: (context) => !context?.pipWindow || context.pipWindow.closed,
    };

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
            height: Math.min(540, Math.floor(window.screen.availHeight * 0.55)),
          });
        } catch {
          setLastButtonStatus('PiP 被拒绝');
          return null;
        }
        state.pip.win = pipWindow;
      }

      if (canReloadPip(pipWindow)) setPipStatus('换源中');
      else {
        disposePipPlayer();
        disposePipComments();
        writePipLoading(pipWindow, meta.title, meta.href);
      }

      return { pipWindow, href: meta.href };
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

      const stylesheetLinks = [...new Set([...bootstrap.stylesheets, ...getBiliThemeStylesheets()])]
        .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
        .join('\n');
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
        grid-template-columns: minmax(0, 1fr) 10px var(--${APP}-comments-width, 420px);
        overflow: hidden;
      }
      body.comments-right #stage {
        grid-column: 1;
        grid-row: 1;
      }
      #comments-resizer {
        display: none;
      }
      body.comments-right #comments-resizer {
        display: block;
        position: relative;
        grid-column: 2;
        grid-row: 1;
        z-index: 2;
        width: 10px;
        min-width: 10px;
        height: 100vh;
        cursor: col-resize;
        background: transparent;
      }
      body.comments-right #comments-resizer::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 4px;
        width: 2px;
        background: var(--line_regular, #e3e5e7);
      }
      body.comments-right #comments-resizer:hover::before,
      body.comments-right #comments-resizer:focus-visible::before,
      body.resizing-comments #comments-resizer::before {
        background: #fb7299;
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
        min-height: 520px;
        padding: 22px 24px 44px;
        color: var(--text1, #18191c);
        background: var(--bg1, #fff);
      }
      body.comments-right #comments {
        grid-column: 3;
        grid-row: 1;
        min-width: 0;
        min-height: 0;
        height: 100vh;
        padding: 18px 20px 40px;
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
        border-left: 0;
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
      #comments h2 {
        margin: 0 0 16px;
        color: var(--text1, #18191c);
        font: 600 18px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #comments-mount {
        min-height: 360px;
        color: var(--text1, #18191c);
        background: var(--bg1, #fff);
      }
      #layout .bili-comments-bottom-fixed-wrapper,
      #comments .bili-comments-bottom-fixed-wrapper {
        display: none !important;
      }
    </style>
  </head>
  <body class="${commentLayoutClass}">
    <div id="shell">
      <main id="layout">
        <div id="stage"><div id="bilibili-player"></div></div>
        <div id="comments-resizer" tabindex="0" role="separator" aria-orientation="vertical" aria-label="调整评论区宽度"></div>
        <section id="comments"><h2>评论</h2><div id="comments-mount">评论加载中...</div></section>
      </main>
    </div>
  </body>
</html>`);

      await loadScriptOnce(pipWindow.document, bootstrap.coreScript, () => pipWindow.nano);
      if (token !== state.switchToken || pipWindow.closed) return;
      if (!pipWindow.nano) throw new Error('nano not available after core load');
      attachPipCommentResizer(pipWindow);
      syncCommentWidth();
      connectPipPlayer(pipWindow, bootstrap, token);
      mountPipComments(pipWindow, bootstrap, token);
    }

    function canReloadPip(pipWindow) {
      return Boolean(
        pipWindow &&
        !pipWindow.closed &&
        state.pip.win === pipWindow &&
        state.pip.player &&
        typeof state.pip.player.reload === 'function' &&
        pipWindow.document?.getElementById('bilibili-player') &&
        pipWindow.nano
      );
    }

    async function reloadPipPlayer(targetWindow, bootstrap, token) {
      if (token !== state.switchToken || targetWindow.closed) return;

      state.pip.bootstrap = bootstrap;
      ensureStylesheetsInWindow(targetWindow, bootstrap.stylesheets);
      targetWindow.document.title = bootstrap.title || 'Bilibili 小窗播放';
      syncPipCommentLayout(targetWindow);
      ensurePipPlayerControls(targetWindow, bootstrap.href);
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
        getBootstrap: () => targetWindow.__biliPopupPlayerNanoCurrentBootstrap,
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
        stats: { spmId: '333.788.0.0', spmIdFrom: '333.788.0.0', trackId: '' },
        autoplay: true,
        enableHEVC: true,
        enableAV1: true,
        screenKind: getScreenKind(targetWindow.nano),
        revision: 1,
        viewInfo: getPlayerViewInfo(bootstrap.initialState),
      };
      if (bootstrap.playInfo) setting.prefetch = { playUrl: bootstrap.playInfo };
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
        getScrollContainer: () => getPipCommentsScrollContainer(targetWindow),
        isActive: () => token === state.switchToken && !targetWindow.closed,
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

    function syncHomeCommentLayout() {
      const ui = state.home.ui;
      if (!ui?.overlay) return;
      ui.overlay.classList.toggle(`${APP}--comments-right`, state.commentLayout === 'right');
      syncCommentWidth();
    }

    function getHomeCommentsScrollContainer() {
      return state.commentLayout === 'right' ? state.home.ui?.comments : state.home.ui?.content;
    }

    function syncPipCommentLayout(targetWindow, options = {}) {
      if (!targetWindow || targetWindow.closed) return;
      const body = targetWindow.document?.body;
      if (!body) return;
      const { resize = true } = options;
      body.classList.toggle('comments-right', state.commentLayout === 'right');
      body.classList.toggle('comments-bottom', state.commentLayout !== 'right');
      syncCommentWidth();
      attachPipCommentScrollSync(targetWindow);
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
      return state.commentLayout === 'right' ? doc.getElementById('comments') : doc.getElementById('layout');
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
      if (isScreenKind(runtime, detail.mainScreen, 'Wide')) setCommentLayout('bottom');
      else if (isScreenKind(runtime, detail.mainScreen, 'Normal')) setCommentLayout('right');
    }

    function bindHomeScreenChange(player) {
      unbindHomeScreenChange();
      const eventType = window.nano?.EventType?.Player_Statue_Changed;
      if (!player?.on || !eventType) return;
      const handler = (event) => handleScreenChanged(window.nano, event?.detail);
      player.on(eventType, handler);
      state.home.screenHandler = { player, eventType, handler };
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
      const handler = (event) => handleScreenChanged(targetWindow.nano, event?.detail);
      player.on(eventType, handler);
      state.pip.screenHandler = { player, eventType, handler };
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
      resizer.addEventListener('pointerdown', (event) => startCommentWidthDrag(event, targetWindow));
    }

    function attachPipCommentScrollSync(targetWindow) {
      if (!targetWindow || targetWindow.closed) return;
      const comments = targetWindow.document?.getElementById('comments');
      if (!comments || comments.__biliPopupPlayerNanoScrollSyncBound) return;
      comments.__biliPopupPlayerNanoScrollSyncBound = true;
      comments.addEventListener('scroll', () => schedulePipLayoutSync(targetWindow), { passive: true });
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

      const onMove = (moveEvent) => {
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
      const container = targetWindow === window
        ? state.home.ui?.content
        : targetWindow.document?.getElementById('layout');
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
      const maxByContainer = Number.isFinite(containerWidth)
        ? Math.max(COMMENT_WIDTH_MIN, containerWidth - 366)
        : COMMENT_WIDTH_MAX;
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

      [250, 600, 1200, 2400, 4800].forEach((delay) => targetWindow.setTimeout(scheduleAttach, delay));
      targetWindow.setTimeout(stop, 7000);

      const observer = new targetWindow.MutationObserver(scheduleAttach);
      observer.observe(doc.body || doc.documentElement, { childList: true, subtree: true });
      targetWindow.__biliPopupPlayerNanoControlsObserver = observer;
    }

    function getOrCreatePipControls(targetWindow, href) {
      const doc = targetWindow.document;
      let controls = doc.getElementById(`${APP}-pip-controls`);
      if (controls) {
        const original = doc.getElementById(`${APP}-pip-original`);
        if (original) original.href = href;
        return controls;
      }

      controls = doc.createElement('div');
      controls.id = `${APP}-pip-controls`;

      const original = doc.createElement('a');
      original.id = `${APP}-pip-original`;
      original.href = href;
      original.target = '_blank';
      original.rel = 'noopener noreferrer';
      original.title = '打开原播放页';
      original.setAttribute('aria-label', '打开原播放页');
      original.textContent = '原页面';

      controls.append(original);
      return controls;
    }

    function findPipOriginalButtonSlot(doc) {
      const container = doc.querySelector([
        '.bpx-player-control-bottom-right',
        '.bpx-player-control-bottom .bpx-player-control-bottom-right',
        '.bpx-player-control-wrap .bpx-player-control-bottom-right',
        '.bpx-player-ctrl-right',
      ].join(','));
      if (!container) return null;
      const quality = container.querySelector([
        '.bpx-player-ctrl-quality',
        '[aria-label="清晰度"]',
        'button[aria-label="清晰度"]',
      ].join(','));
      return { container, before: quality || container.firstElementChild };
    }

    function saveLastPlayed(meta, bootstrap) {
      const next = {
        bvid: bootstrap.playerInfo?.bvid || meta.bvid,
        href: meta.href,
        title: bootstrap.title || meta.title,
        savedAt: Date.now(),
      };
      state.lastPlayed = next;
      localStorage.setItem(STORAGE_LAST_PLAYED, JSON.stringify(next));
      syncSettings();
      syncVideoBadges();
    }

    function updateDebug(primarySetting, bootstrap) {
      window.__biliPopupPlayerNanoDebug = {
        getMode: () => state.mode,
        getHomePlayer: () => state.home.player,
        getPipPlayer: () => state.pip.player,
        getHomeComments: () => state.home.comments,
        getPipComments: () => state.pip.comments,
        getPrimarySetting: () => primarySetting,
        getBootstrap: () => bootstrap,
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
      const desiredHeight = Math.round((availableWidth * 9) / 16 + getHomePlayerChromeHeight());
      const fullscreen = state.home.overlay?.classList.contains(`${APP}--fullscreen`);
      if (!fullscreen) {
        const desiredDialogHeight = desiredHeight + headerHeight;
        const maxDialogHeight = Math.max(320, window.innerHeight - 32);
        ui.dialog.style.height = `${Math.min(desiredDialogHeight, maxDialogHeight)}px`;
      } else {
        ui.dialog.style.height = '';
      }

      const availableHeight = fullscreen
        ? ui.content.clientHeight || window.innerHeight
        : Math.max(1, Math.min(desiredHeight, window.innerHeight - 32 - headerHeight));
      ui.playerWrap.style.height = `${Math.min(desiredHeight, availableHeight)}px`;
    }

    function getHomePlayerChromeHeight() {
      return window.innerWidth >= PLAYER_CHROME_HEIGHT_WIDE_BREAKPOINT
        ? PLAYER_CHROME_HEIGHT_WIDE
        : PLAYER_CHROME_HEIGHT;
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
      writePipDocument(pipWindow, `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title || 'Bilibili 小窗播放')}</title>
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        color: #d8dde6;
        background: #11151d;
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
        border-radius: 8px;
        color: #fff;
        background: rgba(255, 255, 255, 0.12);
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
      writePipDocument(pipWindow, `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>初始化失败</title>
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        color: #f7f8fa;
        background: #11151d;
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
        border-radius: 8px;
        color: #fff;
        background: rgba(255, 255, 255, 0.12);
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
      document.removeEventListener('keydown', onKeydown, true);
      if (state.lastFocus?.isConnected) state.lastFocus.focus({ preventScroll: true });
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
      closeHome();
      disposeHomePlayer();
      disposePipPlayer();
      disposeHomeComments();
      disposePipComments();
      if (state.home.overlay) state.home.overlay.remove();
      settingsUi.destroy();
      window.removeEventListener('scroll', scheduleOverlaySync, true);
      window.removeEventListener('resize', scheduleOverlaySync, true);
      document.removeEventListener('mousemove', onDocumentMouseMove, true);
      document.removeEventListener('mouseleave', onDocumentMouseLeave, true);
      document.removeEventListener('click', onDirectCoverClick, true);
      state.shadowHost?.remove();
      document.getElementById(DOCUMENT_STYLE_ID)?.remove();
      document.documentElement.style.overflow = '';
      delete window.__biliPopupPlayerNano;
    }

    }

})();
