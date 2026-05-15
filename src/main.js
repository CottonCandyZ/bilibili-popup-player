import {
  APP,
  BADGE_CLASS,
  BUTTON_CLASS,
  DOCUMENT_STYLE_ID,
  ENABLED_URL_RE,
  HOST_ID,
  SETTINGS_CLASS,
  STORAGE_DIRECT_CLICK,
  STORAGE_LAST_PLAYED,
  STORAGE_MODE,
  STYLE_ID,
} from './constants.js';
import { disposeCommentInstance, mountComments } from './comments.js';
import {
  createExternalLinkIcon,
  createMaximizeIcon,
  createMinimizeIcon,
  externalLinkIconMarkup,
} from './icons.js';
import { getPlayerViewInfo } from './player-view-info.js';
import { resolvePlaybackBootstrap } from './playback-bootstrap.js';
import { loadScriptOnce } from './script-loader.js';
import { createSettingsUi } from './settings-ui.js';
import { escapeHtml } from './text.js';
import {
  ensureBiliThemeStylesheets,
  ensureStylesheetsInWindow,
  getBiliThemeStylesheets,
} from './theme.js';
import {
  getCardRoot,
  getCurrentPageBvid,
  getVideoMetaFromLink,
  isCoverLink,
  isPlaybackPage,
} from './video-meta.js';

  if (ENABLED_URL_RE.test(location.href)) {
    bootstrap();
  }

  function bootstrap() {

  const initialLastPlayed = (() => {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_LAST_PLAYED) || 'null');
      if (!value?.href || !value?.bvid) return null;
      return value;
    } catch {
      return null;
    }
  })();

  const state = {
    observer: null,
    scanTimer: 0,
    lastFocus: null,
    lastButton: null,
    mode: localStorage.getItem(STORAGE_MODE) === 'pip' ? 'pip' : 'home',
    directClick: localStorage.getItem(STORAGE_DIRECT_CLICK) === '1',
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
    },
    pip: {
      win: null,
      player: null,
      comments: null,
      switchingWindow: false,
    },
  };

  const settingsUi = createSettingsUi({
    state,
    getShadowRoot: () => state.shadowRoot,
    syncCardButtons,
  });

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

      #${APP}-player,
      #${APP}-player .bpx-player-container {
        width: 100% !important;
        height: 100% !important;
      }

      #${APP}-comments {
        min-height: 520px;
        padding: 24px 32px 48px;
        color: var(--text1, #18191c);
        background: var(--bg1, #fff);
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

    const comments = document.createElement('section');
    comments.id = `${APP}-comments`;

    const commentsTitle = document.createElement('h2');
    commentsTitle.id = `${APP}-comments-title`;
    commentsTitle.textContent = '评论';

    const commentsMount = document.createElement('div');
    commentsMount.id = `${APP}-comments-mount`;

    playerWrap.append(playerRoot);
    comments.append(commentsTitle, commentsMount);
    content.append(playerWrap, comments);
    header.append(title, status, openOriginal, fullscreen, close);
    dialog.append(header, content);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeHome();
    });

    openOriginal.addEventListener('click', () => {
      openOriginalPage(openOriginal.dataset.href);
    });

    fullscreen.addEventListener('click', () => {
      const active = !overlay.classList.contains(`${APP}--fullscreen`);
      overlay.classList.toggle(`${APP}--fullscreen`, active);
      syncHomeFullscreenButton();
      syncHomeSize();
    });

    state.home.overlay = overlay;
    state.home.ui = { overlay, dialog, title, status, openOriginal, fullscreen, close, content, playerWrap, playerRoot, comments, commentsMount };
    return state.home.ui;
  }

  function showHomeShell(title) {
    const ui = state.home.ui;
    state.home.overlay.classList.remove(`${APP}--hidden`);
    state.home.overlay.removeAttribute('aria-hidden');
    ui.title.textContent = title;
    ui.content.scrollTop = 0;
    document.documentElement.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeydown, true);
    ui.close.focus();
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
    state.home.ui.status.textContent = '播放器：已 reload';
    playHomeSoon(token, 300);
  }

  function createHomePlayer(bootstrap, token) {
    const setting = buildHomePrimarySetting(bootstrap);
    state.home.player = nano.createPlayer(setting, bootstrap.initialState?.nanoTheme);
    updateDebug(setting, bootstrap);
    state.home.player.connect();
    state.home.ui.status.textContent = '播放器：已 createPlayer';
    syncHomeSize();
    playHomeSoon(token, 1200);
  }

  async function mountHomeComments(bootstrap, token) {
    return mountComments({
      slot: state.home,
      mount: state.home.ui?.commentsMount,
      targetDocument: document,
      getCtor: () => window.BiliComments,
      beforeLoad: () => ensureBiliThemeStylesheets(document),
      getPlayer: () => state.home.player,
      getScrollContainer: () => state.home.ui?.content,
      isActive: () => token === state.switchToken && state.home.ui && !state.home.overlay?.classList.contains(`${APP}--hidden`),
    }, bootstrap, token);
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
    if (canReloadPip(pipWindow)) {
      await reloadPipPlayer(pipWindow, bootstrap, token);
      return;
    }

    disposePipPlayer();
    disposePipComments();

    const stylesheetLinks = [...new Set([...bootstrap.stylesheets, ...getBiliThemeStylesheets()])]
      .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
      .join('\n');

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
        position: relative;
        overflow-x: hidden;
        overflow-y: auto;
      }
      #open-original {
        position: fixed;
        top: 10px;
        right: 10px;
        z-index: 2147483647;
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        border: 1px solid rgba(255, 255, 255, 0.24);
        border-radius: 8px;
        color: #fff;
        background: rgba(24, 25, 28, 0.62);
        text-decoration: none;
        opacity: 0.52;
        transition: opacity 0.16s ease, background 0.16s ease;
      }
      #open-original:hover,
      #open-original:focus-visible {
        opacity: 1;
        background: rgba(251, 114, 153, 0.92);
        outline: none;
      }
      #open-original svg {
        width: 17px;
        height: 17px;
        display: block;
        stroke: currentColor;
      }
      #stage {
        position: relative;
        width: 100vw;
        height: 100vh;
        background: #000;
      }
      #bilibili-player {
        position: relative;
        width: 100vw !important;
        height: 100vh !important;
        min-width: 100vw;
        min-height: 100vh;
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
    </style>
  </head>
  <body>
    <a id="open-original" href="${escapeHtml(bootstrap.href)}" target="_blank" rel="noopener noreferrer" title="打开原播放页" aria-label="打开原播放页">${externalLinkIconMarkup()}</a>
    <div id="stage"><div id="bilibili-player"></div></div>
    <section id="comments"><h2>评论</h2><div id="comments-mount">评论加载中...</div></section>
  </body>
</html>`);

    await loadScriptOnce(pipWindow.document, bootstrap.coreScript, () => pipWindow.nano);
    if (token !== state.switchToken || pipWindow.closed) return;
    if (!pipWindow.nano) throw new Error('nano not available after core load');
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

    ensureStylesheetsInWindow(targetWindow, bootstrap.stylesheets);
    targetWindow.document.title = bootstrap.title || 'Bilibili 小窗播放';
    const openOriginal = targetWindow.document.getElementById('open-original');
    if (openOriginal) openOriginal.href = bootstrap.href;
    syncPipSize(targetWindow);
    setPipStatus('换源中');

    const setting = buildPipPrimarySetting(targetWindow, bootstrap);
    targetWindow.__biliPopupPlayerNanoCurrentSetting = setting;
    targetWindow.__biliPopupPlayerNanoCurrentBootstrap = bootstrap;

    await Promise.resolve(state.pip.player.reload(setting, bootstrap.initialState?.nanoTheme));
    if (token !== state.switchToken || targetWindow.closed || targetWindow.player !== state.pip.player) return;

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
      revision: 1,
      viewInfo: getPlayerViewInfo(bootstrap.initialState),
    };
    if (bootstrap.playInfo) setting.prefetch = { playUrl: bootstrap.playInfo };
    return setting;
  }

  async function mountPipComments(targetWindow, bootstrap, token) {
    return mountComments({
      slot: state.pip,
      mount: targetWindow.document?.getElementById('comments-mount'),
      targetDocument: targetWindow.document,
      getCtor: () => targetWindow.BiliComments,
      getPlayer: () => state.pip.player,
      isActive: () => token === state.switchToken && !targetWindow.closed,
    }, bootstrap, token);
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
    try {
      state.home.player?.resize?.();
    } catch {
      // Ignore resize failures.
    }
    window.dispatchEvent(new Event('resize'));
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
    root.style.width = `${targetWindow.innerWidth}px`;
    root.style.height = `${targetWindow.innerHeight}px`;
    root.style.minWidth = `${targetWindow.innerWidth}px`;
    root.style.minHeight = `${targetWindow.innerHeight}px`;
    try {
      state.pip.player?.resize?.();
    } catch {
      // Ignore resize failures.
    }
    targetWindow.dispatchEvent(new targetWindow.Event('resize'));
    targetWindow.requestAnimationFrame(() => {
      root.style.width = `${targetWindow.innerWidth}px`;
      root.style.height = `${targetWindow.innerHeight}px`;
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
    try {
      state.home.player.disconnect?.();
    } catch {
      // Ignore player cleanup failures.
    }
    state.home.player = null;
  }

  function disposePipPlayer() {
    if (!state.pip.player) return;
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
