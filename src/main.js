import {
  APP,
  BADGE_CLASS,
  BUTTON_CLASS,
  DOCUMENT_STYLE_ID,
  ENABLED_URL_RE,
  HOST_ID,
  SETTINGS_CLASS,
  STORAGE_COMMENT_LAYOUT,
  STORAGE_COMMENT_WIDTH,
  STORAGE_DIRECT_CLICK,
  STORAGE_LAST_PLAYED,
  STORAGE_MODE,
  STYLE_ID,
} from './constants.js';
import { disposeCommentInstance, mountComments } from './comments.js';
import { createCommentsTabsUi } from './comments-tabs-ui.js';
import {
  createHomeFeedSession,
  fetchHomeFeedCards,
  isHomeFeedPage,
} from './home-feed.js';
import {
  createMaximizeIcon,
  createMinimizeIcon,
  externalLinkIconMarkup,
} from './icons.js';
import { mountHomePlayerPage, mountPipPlayerPage } from './player-shell-ui.jsx';
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
  COVER_HOST_SELECTOR,
  PLAYBACK_VIDEO_LINK_SELECTOR,
  getCardRoot,
  getCurrentPageBvid,
  getVideoMetaFromLink,
  isCoverLink,
  isPlaybackPage,
  isSpacePage,
} from './video-meta.js';

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
  const PLAYBACK_HISTORY_LIMIT = 20;

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
    settingsVisibilityFrame: 0,
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
    externalFeatureBlocks: [],
    playbackHistory: {
      entries: [],
      index: -1,
    },
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
      featureBlocked: false,
      activeCommentsTab: 'comments',
      feed: {
        error: '',
        exhausted: false,
        loading: false,
        requestId: 0,
        session: null,
      },
      playlistRefreshFrame: 0,
      playlistCards: [],
      recommendationCards: [],
      selectedPlaylistBvid: '',
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
      selectedPlaylistBvid: '',
    },
  };

  const settingsUi = createSettingsUi({
    state,
    getShadowRoot: () => state.shadowRoot,
    syncCardButtons,
    syncCommentLayout,
  });
  const commentsTabsUi = createCommentsTabsUi({
    state,
    getHomeRenderer: () => homeRenderer,
    getPipRenderer: () => pipRenderer,
    getCommentLayout: () => state.commentLayout,
    onTabChange: onCommentsTabChange,
    openWithRenderer,
    syncHomeSize,
    schedulePipLayoutSync,
  });
  const {
    attachPipTabs: attachPipCommentsTabs,
    capturePagePlaylist,
    createTabs: createCommentsTabs,
    renderPlaylist,
    renderRecommendations,
    setSelectedPlaylistBvid,
    syncTabs: syncCommentsTabs,
  } = commentsTabsUi;

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
    attributeFilter: ['href', 'title', 'aria-label', 'class', 'style'],
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

    const root = host.attachShadow({ mode: 'open' });
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
        grid-template-columns: auto minmax(0, 1fr) auto auto auto;
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

      .${APP}__header-button:disabled {
        color: var(--${APP}-text-muted);
        cursor: default;
        opacity: 0.45;
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

      .${APP}__header-button:disabled:hover,
      .${APP}__header-button:disabled:focus-visible {
        color: var(--${APP}-text-muted);
        background: transparent;
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
    console.debug('[bili-popup-player] open original page', { href, nextHref });
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

  const PLAYER_GLOBAL_KEYS = [
    'player',
    'bilibiliPlayer',
    'biliPlayer',
    '__PLAYER__',
    '__BILI_PLAYER__',
    '__bilibiliPlayer',
  ];

  function togglePlayerFeatures(player, isBlockPlay) {
    const blocked = Boolean(isBlockPlay);
    if (!player || typeof player.toggleFeature !== 'function') return false;
    try {
      player.toggleFeature({
        play: blocked,
        seek: blocked,
        shortcut: blocked,
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
      state.externalFeatureBlocks.forEach((player) => togglePlayerFeatures(player, false));
      state.externalFeatureBlocks = [];
      return;
    }

    const known = new Set(state.externalFeatureBlocks);
    getExternalFeaturePlayers().forEach((player) => {
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
    const add = (player) => {
      if (!player || typeof player.toggleFeature !== 'function') return;
      if (player === state.home.player || player === state.pip.player || seen.has(player)) return;
      seen.add(player);
      players.push(player);
    };

    PLAYER_GLOBAL_KEYS.forEach((key) => add(window[key]));
    add(window.playerAgent?.player);
    add(window.bilibili?.player);
    return players;
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
    if (!card) return;

    const existing = state.cardEntries.find((entry) => entry.card === card || entry.link === link);
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
    button.addEventListener('click', (event) => {
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
        title: button.dataset.title,
      });
    });

    const badge = document.createElement('div');
    badge.className = BADGE_CLASS;
    badge.dataset.bvid = meta.bvid;

    const overlayMode = shouldUseCardOverlayFor(link, card);
    const host = overlayMode ? state.overlay : getCardControlHost(link, card);
    if (!overlayMode) ensureCardHost(host);
    host.append(button, badge);
    state.cardEntries.push({ card, host, link, button, badge, meta, overlayMode });
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
  }

  function syncOverlayPositions() {
    state.cardEntries = state.cardEntries.filter((entry) => {
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
    state.pointer = { x: event.clientX, y: event.clientY };
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
      syncSettingsVisibility();
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
    state.shadowHost?.classList.toggle(`${APP}--playback-web-fullscreen`, isPlaybackPageWebFullscreen());
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
    const host = coverLink.matches?.(COVER_HOST_SELECTOR)
      ? coverLink
      : coverLink.closest?.(COVER_HOST_SELECTOR);
    if (!host || !card.contains(host)) return link.parentElement && card.contains(link.parentElement) ? link.parentElement : link;
    if (host.tagName !== 'A' || host === card) return host;
    const parent = host.parentElement;
    return parent && card.contains(parent) ? parent : host;
  }

  function getCardCoverLink(link, card) {
    if (isCoverLink(link)) return link;
    const bvid = getVideoMetaFromLink(link)?.bvid;
    if (!bvid) return null;
    return [...(card.querySelectorAll?.('a[href*="/video/BV"]') || [])]
      .find((candidate) => getVideoMetaFromLink(candidate)?.bvid === bvid && isCoverLink(candidate)) || null;
  }

  function scan() {
    [...document.querySelectorAll(getVideoLinkSelector())]
      .sort((a, b) => Number(isCoverLink(b)) - Number(isCoverLink(a)))
      .forEach((link) => {
        const meta = getVideoMetaFromLink(link);
        if (!meta || meta.bvid === getCurrentPageBvid()) return;
        bindLink(link, meta);
      });
    ensureSettings();
    syncSettingsVisibility();
    syncVideoBadges();
    syncOverlayPositions();
    state.cardEntries.forEach(positionCardEntry);
  }

  function onDomMutated(mutations) {
    if (mutations.some(shouldSyncSettingsVisibilityMutation)) scheduleSettingsVisibilitySync();
    if (mutations.some(shouldRescanMutation)) scheduleScan();
  }

  function shouldSyncSettingsVisibilityMutation(mutation) {
    if (!isPlaybackPage()) return false;
    if (mutation.type === 'childList') return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
    if (mutation.type !== 'attributes') return false;
    const target = mutation.target;
    if (!(target instanceof Element)) return false;
    if (target === document.documentElement || target === document.body) return true;
    return Boolean(target.closest?.(getPlaybackPlayerSelector()));
  }

  function shouldRescanMutation(mutation) {
    if (mutation.type === 'childList') return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
    if (mutation.type !== 'attributes') return false;
    const target = mutation.target;
    if (!(target instanceof Element)) return false;
    return target.matches?.('a[href*="/video/"], a[href], [title], [aria-label]') ||
      target.closest?.('.bili-video-card, .feed-card, .video-card, [class*="video-card"], [class*="feed-card"]');
  }

  function isPlaybackPageWebFullscreen() {
    if (!isPlaybackPage()) return false;
    if (document.body.classList.contains(`${APP}--modal-open`)) return false;
    const player = document.querySelector(getPlaybackPlayerSelector());
    if (!player) return false;
    return hasWebFullscreenMarker(player) ||
      Boolean(player.querySelector?.([
        '.bpx-player-web-full',
        '.bpx-player-mode-webscreen',
        '.bpx-player-webscreen',
        '.bilibili-player-video-web-fullscreen',
      ].join(',')));
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
      recordPlaybackHistory(meta, bootstrap);
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
    isClosed: () => !state.home.overlay || state.home.overlay.classList.contains(`${APP}--hidden`),
  };

  function getReusableHome(meta) {
    if (!state.home.player || !state.home.bootstrap || !isSamePlayback(meta, state.home.bootstrap)) return null;
    return { bootstrap: state.home.bootstrap };
  }

  function reuseHome(context, meta, token) {
    const ui = ensureHomeShell();
    const bootstrap = context.bootstrap;
    showHomeShell(bootstrap.title || meta.title || meta.bvid);
    ui.openOriginal.dataset.href = meta.href || bootstrap.href;
    ui.status.textContent = '播放器：继续播放';
    saveLastPlayed(meta, bootstrap);
    recordPlaybackHistory(meta, bootstrap);
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
      resetHomePlaylistFeed();
      capturePagePlaylist('home', meta.bvid);
    }
    renderRecommendations('home', null);
    return { ui };
  }

  async function playHome(context, bootstrap, token) {
    const { ui } = context;
    state.home.bootstrap = bootstrap;
    ui.title.textContent = bootstrap.title || ui.title.textContent;
    ui.openOriginal.dataset.href = bootstrap.href;
    ui.status.textContent = `播放页参数：aid=${bootstrap.playerInfo.aid} cid=${bootstrap.playerInfo.cid}`;
    setSelectedPlaylistBvid('home', bootstrap.playerInfo?.bvid);
    renderPlaylist('home');
    renderRecommendations('home', bootstrap);
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
      onOpenOriginal: (href) => openOriginalPlaybackPage(href, state.home.player),
      onPlayerControlClick: onHomePlayerControlClick,
      onResizeStart: (event) => startCommentWidthDrag(event, window),
    });
    state.home.overlay = state.home.ui.overlay;
    attachHomeBackToTopSync();
    attachHomePlaylistAutoRefresh();
    syncHomeCommentLayout();
    syncCommentsTabs('home');
    return state.home.ui;
  }

  function showHomeShell(title) {
    const ui = state.home.ui;
    state.home.overlay.classList.remove(`${APP}--hidden`);
    state.home.overlay.removeAttribute('aria-hidden');
    document.body.classList.add(`${APP}--modal-open`);
    setExternalPlayerFeaturesBlocked(true);
    setHomePlayerFeatureBlocked(false);
    ui.title.textContent = title;
    syncPlaybackHistoryButtons();
    ui.content.scrollTop = 0;
    syncHomeCommentLayout();
    syncCommentsTabs('home');
    document.documentElement.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeydown, true);
    ui.close.focus();
    syncHomeSize();
    scheduleHomePlaylistAutoRefreshCheck();
  }

  function onCommentsTabChange(kind, tab) {
    if (kind !== 'home' || tab !== 'playlist') return;
    scheduleHomePlaylistAutoRefreshCheck();
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
    setHomePlayerFeatureBlocked(homeRenderer.isClosed());
    state.home.ui.status.textContent = '播放器：已 reload';
    playHomeSoon(token, 300);
  }

  function createHomePlayer(bootstrap, token) {
    const setting = buildHomePrimarySetting(bootstrap);
    state.home.player = nano.createPlayer(setting, bootstrap.initialState?.nanoTheme);
    bindHomeScreenChange(state.home.player);
    setHomePlayerFeatureBlocked(homeRenderer.isClosed());
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
      isActive: () => token === state.switchToken && state.home.ui && !state.home.overlay?.classList.contains(`${APP}--hidden`),
    }, bootstrap, token);
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
    isClosed: (context) => !context?.pipWindow || context.pipWindow.closed,
  };

  function getReusablePip(meta) {
    if (!state.pip.win || state.pip.win.closed || !state.pip.player || !state.pip.bootstrap || !isSamePlayback(meta, state.pip.bootstrap)) return null;
    return { pipWindow: state.pip.win, bootstrap: state.pip.bootstrap };
  }

  function reusePip(context, meta) {
    const bootstrap = context.bootstrap;
    saveLastPlayed(meta, bootstrap);
    recordPlaybackHistory(meta, bootstrap);
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
          height: Math.min(540, Math.floor(window.screen.availHeight * 0.55)),
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
      createCommentsTabs,
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
      getScrollContainer: () => getPipCommentInstanceScrollContainer(targetWindow),
      isActive: () => token === state.switchToken && !targetWindow.closed,
    }, bootstrap, token);
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
    ui.content.addEventListener('scroll', syncHomeBackToTopButton, { passive: true });
    [ui.commentsPanel, ui.playlistPanel, ui.recommendPanel].forEach((panel) => {
      panel?.addEventListener('scroll', syncHomeBackToTopButton, { passive: true });
    });
    syncHomeBackToTopButton();
  }

  function attachHomePlaylistAutoRefresh() {
    const ui = state.home.ui;
    if (!ui?.content || !ui.playlistPanel) return;
    [
      ui.content,
      ui.playlistPanel,
    ].forEach((container) => {
      if (!container || container.__biliPopupPlayerNanoPlaylistRefreshBound) return;
      container.__biliPopupPlayerNanoPlaylistRefreshBound = true;
      container.addEventListener('scroll', scheduleHomePlaylistAutoRefreshCheck, { passive: true });
    });
  }

  function scheduleHomePlaylistAutoRefreshCheck() {
    if (state.home.playlistRefreshFrame) return;
    state.home.playlistRefreshFrame = window.requestAnimationFrame(() => {
      state.home.playlistRefreshFrame = 0;
      void maybeLoadMoreHomePlaylist();
    });
  }

  async function maybeLoadMoreHomePlaylist({ force = false } = {}) {
    const feed = state.home.feed;
    if (!feed || feed.loading || feed.exhausted) return;
    if (!isHomeFeedPage()) return;
    if (!state.home.ui || !state.home.overlay || state.home.overlay.classList.contains(`${APP}--hidden`)) return;
    if (state.home.activeCommentsTab !== 'playlist') return;
    if (!force && !isHomePlaylistNearBottom()) return;

    const requestId = feed.requestId + 1;
    feed.requestId = requestId;
    feed.loading = true;
    feed.error = '';
    feed.session ||= createHomeFeedSession();
    renderPlaylist('home', {
      appendLoading: state.home.playlistCards.length > 0,
      autoScrollSelected: false,
      loading: state.home.playlistCards.length === 0,
    });

    try {
      const cards = await fetchHomeFeedCards({
        existingCards: state.home.playlistCards,
        session: feed.session,
      });
      if (requestId !== feed.requestId) return;
      if (!cards.length) {
        feed.exhausted = true;
        return;
      }
      appendHomePlaylistCards(cards);
    } catch (error) {
      if (requestId !== feed.requestId) return;
      feed.error = error?.message || String(error);
      console.warn('[bili-popup-player] home feed refresh failed', error);
    } finally {
      if (requestId === feed.requestId) {
        feed.loading = false;
        renderPlaylist('home', getHomePlaylistEmptyText(), { autoScrollSelected: false });
      }
    }
  }

  function appendHomePlaylistCards(cards) {
    const seen = new Set(state.home.playlistCards.map((card) => card?.bvid).filter(Boolean));
    const nextCards = cards.filter((card) => {
      if (!card?.bvid || seen.has(card.bvid)) return false;
      seen.add(card.bvid);
      return true;
    });
    if (nextCards.length) state.home.playlistCards = [...state.home.playlistCards, ...nextCards];
  }

  function isHomePlaylistNearBottom() {
    const container = getHomePlaylistScrollContainer();
    if (!container) return false;
    return container.scrollHeight - container.scrollTop - container.clientHeight <= 320;
  }

  function getHomePlaylistScrollContainer() {
    const ui = state.home.ui;
    if (!ui) return null;
    return state.commentLayout === 'right' ? ui.playlistPanel : ui.content;
  }

  function resetHomePlaylistFeed() {
    const feed = state.home.feed;
    if (!feed) return;
    feed.error = '';
    feed.exhausted = false;
    feed.loading = false;
    feed.requestId += 1;
    feed.session = null;
  }

  function getHomePlaylistEmptyText() {
    if (state.home.feed?.error) return '首页推荐加载失败，继续滚动可重试';
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
    layout.addEventListener('scroll', () => syncPipBackToTopButton(targetWindow), { passive: true });
    comments.addEventListener('scroll', () => syncPipBackToTopButton(targetWindow), { passive: true });
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
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
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
    const { resize = true } = options;
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
    const layout = targetWindow.document?.getElementById('layout');
    if (layout && !layout.__biliPopupPlayerNanoScrollSyncBound) {
      layout.__biliPopupPlayerNanoScrollSyncBound = true;
      layout.addEventListener('scroll', () => {
        syncPipBackToTopButton(targetWindow);
        schedulePipLayoutSync(targetWindow);
      }, { passive: true });
    }
    const panels = [...(targetWindow.document?.querySelectorAll?.('#comments-panel, #playlist-panel, #recommend-panel') || [])];
    panels.forEach((panel) => {
      if (panel.__biliPopupPlayerNanoScrollSyncBound) return;
      panel.__biliPopupPlayerNanoScrollSyncBound = true;
      panel.addEventListener('scroll', () => {
        syncPipBackToTopButton(targetWindow);
        schedulePipLayoutSync(targetWindow);
      }, { passive: true });
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
    return withPlaybackTime(
      href,
      getPlaybackTime(state.pip.player),
    );
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

  function recordPlaybackHistory(meta, bootstrap) {
    const bvid = bootstrap.playerInfo?.bvid || meta.bvid;
    const href = bootstrap.href || meta.href;
    if (!bvid || !href) return;

    if (meta.fromHistory && Number.isInteger(meta.historyIndex)) {
      state.playbackHistory.index = clampHistoryIndex(meta.historyIndex);
      syncPlaybackHistoryButtons();
      return;
    }

    const next = {
      bvid,
      href,
      title: bootstrap.title || meta.title || bvid,
    };
    const history = state.playbackHistory;
    const current = history.entries[history.index];
    if (current?.bvid === next.bvid) {
      history.entries[history.index] = { ...current, ...next };
      syncPlaybackHistoryButtons();
      return;
    }

    const keptEntries = history.index >= 0
      ? history.entries.slice(0, history.index + 1)
      : history.entries.slice();
    keptEntries.push(next);
    history.entries = keptEntries.slice(-PLAYBACK_HISTORY_LIMIT);
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
      historyIndex: nextIndex,
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
    const stylesheetLinks = getBiliThemeStylesheets()
      .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
      .join('\n');
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
    const stylesheetLinks = getBiliThemeStylesheets()
      .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
      .join('\n');
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
    setHomePlayerFeatureBlocked(true);
    setExternalPlayerFeaturesBlocked(false);
    document.documentElement.style.overflow = '';
    document.body.classList.remove(`${APP}--modal-open`);
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
    if (state.settingsVisibilityFrame) cancelAnimationFrame(state.settingsVisibilityFrame);
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
    document.removeEventListener('fullscreenchange', scheduleSettingsVisibilitySync, true);
    window.removeEventListener('scroll', scheduleViewportSync, true);
    window.removeEventListener('resize', scheduleViewportSync, true);
    state.shadowHost?.remove();
    document.getElementById(DOCUMENT_STYLE_ID)?.remove();
    document.documentElement.style.overflow = '';
    delete window.__biliPopupPlayerNano;
  }

  }
