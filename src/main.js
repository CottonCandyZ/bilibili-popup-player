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
  STORAGE_HOME_COMMENT_LAYOUT,
  STORAGE_HOME_COMMENT_WIDTH,
  STORAGE_PIP_COMMENT_LAYOUT,
  STORAGE_PIP_COMMENT_WIDTH,
  STORAGE_AUTO_PLAY_COUNTDOWN,
  STORAGE_AUTO_PLAY_NEXT,
  STORAGE_DIRECT_CLICK,
  STORAGE_GAMEPAD_CONTROLS,
  STORAGE_LAST_PLAYED,
  STORAGE_MODAL_SIZE,
  STORAGE_MODE,
  STYLE_ID,
} from './constants.js';
import { requestArchiveLike } from './archive-actions.js';
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
  createPictureInPictureIcon,
} from './icons.js';
import {
  getCurrentLiveMeta,
  isLiveBootstrap,
  isLiveMeta,
  isLivePage,
  resolveLiveBootstrap,
} from './live-bootstrap.js';
import {
  buildLivePipPlayerOptions,
  createLivePipPlayerAdapter,
  installLivePipGlobals,
} from './live-pip-player.js';
import {
  LIVE_CARD_LINK_SELECTOR,
  fetchDynamicLivePortalCards,
  findDynamicLiveUserElement,
  getLiveCardRoot,
  getLiveMetaFromLink,
  getPlayableKey,
} from './live-cards.js';
import { installDocumentStyle } from './document-style.js';
import { mountHomePlayerPage, mountPipPlayerPage } from './player-shell-ui.jsx';
import {
  renderLivePipDocument,
  renderPipErrorDocument,
  renderPipLoadingDocument,
  renderPipPlayerDocument,
} from './pip-document.js';
import { getPlayerExternalState, getPlayerViewInfo } from './player-view-info.js';
import { resolvePlaybackBootstrap } from './playback-bootstrap.js';
import { createRendererOrchestrator } from './renderer-orchestrator.js';
import { loadScriptOnce } from './script-loader.js';
import { createSettingsUi } from './settings-ui.js';
import { getStorageItem, removeStorageItem, setStorageItem } from './storage.js';
import {
  ensureBiliThemeStylesheets,
  ensureStylesheetsInWindow,
  getBiliThemeStylesheets,
  getThemeStyle,
} from './theme.js';
import {
  fetchOwnerProfile,
  renderVideoIntro,
  requestFollowUp,
} from './video-intro.js';
import {
  COVER_HOST_SELECTOR,
  DYNAMIC_VIDEO_LINK_SELECTOR,
  OGV_VIDEO_LINK_SELECTOR,
  PLAYBACK_VIDEO_LINK_SELECTOR,
  getCardRoot,
  getCurrentPageBvid,
  getCurrentPageOgvKey,
  getCurrentPageOgvMeta,
  getOgvMetaFromLink,
  getVideoMetaFromLink,
  isDynamicPage,
  isCoverLink,
  isOgvPage,
  isPlaybackPage,
  isSpacePage,
  normalizeVideoHref,
} from './video-meta.js';

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
  const AUTO_PLAY_COUNTDOWN_SECONDS = 5;
  const GAMEPAD_REPEAT_DELAY_MS = 360;
  const GAMEPAD_REPEAT_INTERVAL_MS = 180;
  const GAMEPAD_STICK_DEADZONE = 0.28;
  const GAMEPAD_SCROLL_SPEED = 14;
  const PLAYER_CHROME_HEIGHT = 48;
  const PLAYER_CHROME_HEIGHT_WIDE = 56;
  const PLAYER_CHROME_HEIGHT_WIDE_BREAKPOINT = 1680;
  const PLAYBACK_HISTORY_LIMIT = 20;
  const supportsDocumentPip = () => typeof window.documentPictureInPicture?.requestWindow === 'function';

  const initialLastPlayed = (() => {
    try {
      const value = JSON.parse(getStorageItem(STORAGE_LAST_PLAYED, 'null') || 'null');
      if (!value?.href || value?.kind === 'live' || value?.roomId) return null;
      if (!value?.bvid && !value?.seasonId && !value?.epId) return null;
      return value;
    } catch {
      return null;
    }
  })();

  const initialHomeCommentWidth = readCommentWidth(STORAGE_HOME_COMMENT_WIDTH);
  const initialPipCommentWidth = readCommentWidth(STORAGE_PIP_COMMENT_WIDTH);
  const initialHomeCommentLayout = readCommentLayout(STORAGE_HOME_COMMENT_LAYOUT);
  const initialPipCommentLayout = readCommentLayout(STORAGE_PIP_COMMENT_LAYOUT);
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
    gamepadFrame: 0,
    gamepadButtons: new Map(),
    gamepadRepeatAt: new Map(),
    gamepadConnected: false,
    gamepadControlsEnabled: getStorageItem(STORAGE_GAMEPAD_CONTROLS) !== '0',
    gamepadIgnoreInput: false,
    autoPlayHintTimer: 0,
    lastFocus: null,
    lastButton: null,
    mode: getStorageItem(STORAGE_MODE) === 'pip' && supportsDocumentPip() ? 'pip' : 'home',
    directClick: getStorageItem(STORAGE_DIRECT_CLICK) === '1',
    autoPlayNext: getStorageItem(STORAGE_AUTO_PLAY_NEXT) === '1',
    autoPlayCountdown: getStorageItem(STORAGE_AUTO_PLAY_COUNTDOWN) !== '0',
    homeCommentLayout: initialHomeCommentLayout,
    pipCommentLayout: initialPipCommentLayout,
    homeCommentWidth: initialHomeCommentWidth,
    pipCommentWidth: initialPipCommentWidth,
    modalSize: initialModalSize,
    lastPlayed: initialLastPlayed,
    playlistLastPlayed: initialLastPlayed,
    pipPlaying: null,
    switchToken: 0,
    externalFeatureBlocks: [],
    externalPlaybackResume: null,
    ownerProfileCache: new Map(),
    ownerProfileRequests: new Map(),
    originalPageMeta: null,
    paramStartDone: false,
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
    dynamicLivePortal: {
      cards: [],
      error: '',
      loaded: false,
      loading: false,
      requestId: 0,
    },
    live: {
      button: null,
      buttonFrame: 0,
    },
    playback: {
      button: null,
    },
    home: {
      overlay: null,
      ui: null,
      player: null,
      comments: null,
      commentContext: '',
      bootstrap: null,
      screenHandler: null,
      navigateHandler: null,
      handoffHandler: null,
      endedHandler: null,
      navigateSyncTimer: 0,
      autoPlayCountdownHandler: null,
      autoPlayCountdownNotice: null,
      autoPlayCountdownKey: '',
      autoPlayCountdownCanceledKey: '',
      liveControlFrame: 0,
      liveControlObserver: null,
      followBusy: false,
      likeBusy: false,
      likeBurstTimer: 0,
      featureBlocked: false,
      activeCommentsTab: 'comments',
      liveListMode: false,
      ogvListMode: false,
      feed: {
        error: '',
        exhausted: false,
        loading: false,
        requestId: 0,
        session: null,
      },
      playlistRefreshFrame: 0,
      pageCards: [],
      playlistCards: [],
      liveCards: [],
      recommendationCards: [],
      selectedPageKey: '',
      selectedPlaylistBvid: '',
      selectedLiveKey: '',
    },
    pip: {
      win: null,
      player: null,
      comments: null,
      commentContext: '',
      bootstrap: null,
      screenHandler: null,
      navigateHandler: null,
      handoffHandler: null,
      endedHandler: null,
      navigateSyncTimer: 0,
      autoPlayCountdownHandler: null,
      autoPlayCountdownNotice: null,
      autoPlayCountdownKey: '',
      autoPlayCountdownCanceledKey: '',
      liveControlFrame: 0,
      liveControlObserver: null,
      liveControlWindow: null,
      followBusy: false,
      likeBusy: false,
      likeBurstTimer: 0,
      keydownHandler: null,
      switchingWindow: false,
      activeCommentsTab: 'comments',
      liveListMode: false,
      ogvListMode: false,
      feed: {
        error: '',
        exhausted: false,
        loading: false,
        requestId: 0,
        session: null,
      },
      playlistRefreshFrame: 0,
      pageCards: [],
      playlistCards: [],
      liveCards: [],
      recommendationCards: [],
      selectedPageKey: '',
      selectedPlaylistBvid: '',
      selectedLiveKey: '',
    },
  };

  const settingsUi = createSettingsUi({
    state,
    getShadowRoot: () => state.shadowRoot,
    syncCardButtons,
    syncCommentLayout,
    supportsPip: supportsDocumentPip,
    onAutoPlayCountdownChange,
    onGamepadControlsChange,
  });
  const commentsTabsUi = createCommentsTabsUi({
    state,
    getHomeRenderer: () => homeRenderer,
    getPipRenderer: () => pipRenderer,
    getCommentLayout,
    onTabChange: onCommentsTabChange,
    onListChange: syncPlayerHandoffAvailability,
    openWithRenderer,
    syncHomeSize,
    schedulePipLayoutSync,
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
    syncTabs: syncCommentsTabs,
  } = commentsTabsUi;
  let rendererOrchestrator = null;

  pageWindow.__biliPopupPlayerNano = {
    scan,
    close: closeHome,
    destroy,
    getState: () => state,
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
  window.addEventListener('gamepadconnected', onGamepadConnectionChanged);
  window.addEventListener('gamepaddisconnected', onGamepadConnectionChanged);
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
    console.debug('[bili-popup-player] open original page', { href, nextHref });
    openOriginalPage(nextHref);
    pausePlayer(player);
  }

  function withPlaybackTime(href, seconds) {
    if (!href) return '';
    const time = Math.floor(Number(seconds));
    const normalizedHref = normalizeVideoHref(href) || href;
    if (!Number.isFinite(time) || time <= 0) return normalizedHref;
    try {
      const url = new URL(normalizedHref, location.href);
      url.searchParams.set('t', String(time));
      return url.href;
    } catch {
      return normalizedHref;
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

  function pauseExternalPlaybackPagePlayer() {
    if (!isPlaybackPage() && !isLivePage()) return false;
    state.externalPlaybackResume ||= captureExternalPlaybackResume();
    if (isLivePage()) return pauseLivePagePlayer();
    return pausePlaybackPagePlayer();
  }

  function captureExternalPlaybackResume() {
    const videos = getExternalPageVideos();
    const playingVideos = videos.filter((video) => !video.paused && !video.ended);
    return {
      shouldResume: playingVideos.length > 0,
      videos: playingVideos,
    };
  }

  function restoreExternalPlaybackPagePlayer() {
    const resume = state.externalPlaybackResume;
    state.externalPlaybackResume = null;
    if (!resume?.shouldResume) return false;

    return resume.videos
      .filter((video) => video?.isConnected)
      .some((video) => {
        try {
          const result = video.play?.();
          result?.catch?.(() => {});
          return true;
        } catch {
          return false;
        }
      });
  }

  function getExternalPageVideos() {
    return [...document.querySelectorAll('video')]
      .filter((video) => !state.home.ui?.overlay?.contains(video));
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

    PLAYER_GLOBAL_KEYS.forEach((key) => add(pageWindow[key]));
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
      cid: bootstrap.playerInfo?.cid,
      seasonId: bootstrap.playerInfo?.seasonId,
      epId: bootstrap.playerInfo?.epId,
      roomId: bootstrap.playerInfo?.roomId,
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

  function bindOgvLink(link, meta = getOgvMetaFromLink(link)) {
    if (!meta) return;
    bindPlayableLink(link, getCardRoot(link), meta);
  }

  function bindLiveCardElement(element, meta) {
    if (!element || !meta) return;
    bindPlayableLink(element, getLiveCardRoot(element), meta);
  }

  function bindPlayableLink(link, card, meta) {
    if (!card) return;

    const existing = state.cardEntries.find((entry) => entry.card === card || entry.link === link);
    if (existing) {
      upgradeCardEntry(existing, link, card, meta);
      return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = BUTTON_CLASS;
    setCardDataset(button, meta);
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
      openByMode(getMetaFromCardDataset(button));
    });

    const badge = document.createElement('div');
    badge.className = BADGE_CLASS;
    setCardDataset(badge, meta);

    const overlayMode = shouldUseCardOverlayFor(link, card, meta);
    const host = overlayMode ? state.overlay : getCardControlHost(link, card);
    if (!overlayMode) ensureCardHost(host);
    host.append(button, badge);
    state.cardEntries.push({ card, host, link, button, badge, meta, overlayMode });
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

    const overlayMode = shouldUseCardOverlayFor(link, card, meta);
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
    element.dataset.aid = meta.aid || '';
    element.dataset.cid = meta.cid || '';
    element.dataset.seasonId = meta.seasonId || '';
    element.dataset.epId = meta.epId || '';
    element.dataset.roomId = meta.roomId || '';
    element.dataset.key = getPlayableKey(meta);
    element.dataset.href = meta.href || '';
    element.dataset.title = meta.title || (isLiveMeta(meta) ? `Bilibili 直播 ${meta.roomId}` : isOgvMeta(meta) ? 'Bilibili 番剧' : 'Bilibili 视频');
  }

  function getMetaFromCardDataset(element) {
    if (element.dataset.kind === 'live' || element.dataset.roomId) {
      return {
        kind: 'live',
        roomId: element.dataset.roomId,
        href: element.dataset.href,
        title: element.dataset.title,
      };
    }
    if (element.dataset.kind === 'ogv' || element.dataset.epId || element.dataset.seasonId) {
      return {
        kind: 'ogv',
        aid: element.dataset.aid,
        bvid: element.dataset.bvid,
        cid: element.dataset.cid,
        seasonId: element.dataset.seasonId,
        epId: element.dataset.epId,
        href: element.dataset.href,
        title: element.dataset.title,
      };
    }
    return {
      aid: element.dataset.aid,
      bvid: element.dataset.bvid,
      cid: element.dataset.cid,
      href: element.dataset.href,
      title: element.dataset.title,
    };
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

  function shouldUseCardOverlayFor(link, card, meta = null) {
    if (isLiveMeta(meta)) return true;
    if (isPlaybackPage() || isOgvPage() || isSpacePage() || isDynamicPage()) return true;
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
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        state.lastFocus = button;
        state.lastButton = button;
        const nextMeta = getCurrentLiveMeta();
        if (nextMeta) {
          pauseLivePagePlayer();
          openWithRenderer(pipRenderer, { ...nextMeta, fromLivePageButton: true });
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
    if (!supportsDocumentPip() || (!isPlaybackPage() && !isOgvPage())) {
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
      button.addEventListener('click', (event) => {
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

    button.dataset.kind = meta.kind || 'video';
    button.dataset.bvid = meta.bvid || '';
    button.dataset.seasonId = meta.seasonId || '';
    button.dataset.epId = meta.epId || '';
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
    if (isOgvPage()) return getCurrentPageOgvMeta();

    const bvid = getCurrentPageBvid();
    if (!bvid) return null;
    const href = location.href;
    const title = cleanCurrentPageTitle(
      document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
      document.querySelector('h1[title]')?.getAttribute('title') ||
      document.querySelector('h1')?.textContent ||
      document.title ||
      bvid,
    );
    return { bvid, href, title };
  }

  function cleanCurrentPageTitle(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .replace(/_哔哩哔哩_bilibili$/u, '')
      .replace(/- 哔哩哔哩.*$/u, '')
      .trim() || 'Bilibili 视频';
  }

  function getLivePlayerAnchor() {
    return document.getElementById('live-player') ||
      document.getElementById('player-ctnr') ||
      document.querySelector('.live-player-ctnr, .player-section, [class*="player"]');
  }

  function pauseLivePagePlayer() {
    const candidates = [
      pageWindow.__PLAYER_GLOBAL_INSTANCE__,
      pageWindow.EmbedPlayer?.instance,
      pageWindow.Player?.instance,
    ];
    for (const player of candidates) {
      if (tryPauseLivePlayer(player)) return true;
    }

    return [...document.querySelectorAll('video')]
      .some((video) => {
        try {
          video.pause();
          return true;
        } catch {
          return false;
        }
      });
  }

  function pausePlaybackPagePlayer() {
    const candidates = [
      ...PLAYER_GLOBAL_KEYS.map((key) => pageWindow[key]),
      pageWindow.playerAgent?.player,
      pageWindow.bilibili?.player,
      pageWindow.__PLAYER_GLOBAL_INSTANCE__,
      pageWindow.EmbedPlayer?.instance,
    ];
    for (const player of candidates) {
      if (tryPauseLivePlayer(player)) return true;
    }

    return [...document.querySelectorAll('video')]
      .some((video) => {
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
    const currentOgvKey = getCurrentPageOgvKey();
    [...document.querySelectorAll(getVideoLinkSelector())]
      .sort((a, b) => Number(isCoverLink(b)) - Number(isCoverLink(a)))
      .forEach((link) => {
        const meta = getVideoMetaFromLink(link);
        if (!meta || meta.bvid === getCurrentPageBvid()) return;
        bindLink(link, meta);
      });
    [...document.querySelectorAll(OGV_VIDEO_LINK_SELECTOR)]
      .sort((a, b) => Number(isCoverLink(b)) - Number(isCoverLink(a)))
      .forEach((link) => {
        const meta = getOgvMetaFromLink(link);
        const key = meta?.epId ? `ep${meta.epId}` : meta?.seasonId ? `ss${meta.seasonId}` : '';
        if (!meta || (currentOgvKey && key === currentOgvKey)) return;
        bindOgvLink(link, meta);
      });
    [...document.querySelectorAll(LIVE_CARD_LINK_SELECTOR)]
      .forEach((link) => {
        const meta = getLiveMetaFromLink(link);
        const currentLive = getCurrentLiveMeta();
        if (!meta || (currentLive?.roomId && String(meta.roomId) === String(currentLive.roomId))) return;
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
    fetchDynamicLivePortalCards()
      .then((cards) => {
        if (requestId !== state.dynamicLivePortal.requestId) return;
        state.dynamicLivePortal.cards = cards;
        state.dynamicLivePortal.error = '';
        state.dynamicLivePortal.loaded = true;
        bindDynamicPortalLiveCards(cards);
        refreshOpenLiveLists();
      })
      .catch((error) => {
        if (requestId !== state.dynamicLivePortal.requestId) return;
        state.dynamicLivePortal.error = error?.message || String(error || '动态直播列表请求失败');
        state.dynamicLivePortal.loaded = true;
      })
      .finally(() => {
        if (requestId === state.dynamicLivePortal.requestId) state.dynamicLivePortal.loading = false;
      });
  }

  function bindDynamicPortalLiveCards(cards) {
    if (!cards?.length) return;
    const currentLive = getCurrentLiveMeta();
    const used = new Set();
    cards.forEach((card) => {
      if (!card?.roomId || (currentLive?.roomId && String(card.roomId) === String(currentLive.roomId))) return;
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
    if (!isPlaybackPage() && !isOgvPage() && !isLivePage()) return false;
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
    return target.matches?.('a[href*="/video/"], a[href*="/bangumi/play/"], a[href*="live.bilibili.com/"], a[href], [title], [aria-label]') ||
      target.closest?.('.bili-video-card, .feed-card, .video-card, .suit-video-card, .bili-dyn-card-video, .bili-dyn-card-live, .bili-dyn-card, .bili-dyn-item, .user-row, .bangumi-card, .season-item, .episode-item, .ep-list-item, .media-card, [class*="video-card"], [class*="live-card"], [class*="room-card"], [class*="feed-card"], [class*="bangumi"], [class*="season"], [class*="episode"], [class*="bili-dyn"]');
  }

  function isPlaybackPageWebFullscreen() {
    if (!isPlaybackPage() && !isOgvPage()) return false;
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

  function isLivePageWebFullscreen() {
    if (!isLivePage()) return false;
    if (document.body.classList.contains(`${APP}--modal-open`)) return false;
    const player = getLivePlayerAnchor();
    if (!player) return false;

    const fullscreen = document.fullscreenElement;
    if (fullscreen && (fullscreen === player || player.contains(fullscreen) || fullscreen.contains(player))) return true;

    const rect = player.getBoundingClientRect();
    const coversViewport = rect.width >= innerWidth * 0.9 &&
      rect.height >= innerHeight * 0.9 &&
      rect.top <= 2 &&
      rect.left <= 2;
    if (!coversViewport) return false;

    for (let current = player; current && current !== document.documentElement; current = current.parentElement) {
      const marker = [
        current.className || '',
        current.getAttribute?.('data-screen') || '',
        current.getAttribute?.('data-mode') || '',
      ].join(' ');
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
    if (link && isCoverLink(link)) {
      const meta = getVideoMetaFromLink(link);
      if (!meta || meta.bvid === getCurrentPageBvid()) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      state.lastFocus = link;
      state.lastButton = null;
      openByMode(meta);
      return;
    }

    const ogvLink = event.target.closest?.(OGV_VIDEO_LINK_SELECTOR);
    if (!ogvLink || !isCoverLink(ogvLink)) return;

    const ogvMeta = getOgvMetaFromLink(ogvLink);
    const ogvKey = ogvMeta?.epId ? `ep${ogvMeta.epId}` : ogvMeta?.seasonId ? `ss${ogvMeta.seasonId}` : '';
    if (!ogvMeta || (getCurrentPageOgvKey() && ogvKey === getCurrentPageOgvKey())) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    state.lastFocus = ogvLink;
    state.lastButton = null;
    openByMode(ogvMeta);
  }

  function getDirectLiveCardEntry(target) {
    if (!(target instanceof Element)) return null;
    return state.cardEntries.find((entry) => {
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
    pauseExternalPlaybackPagePlayer();
    rendererOrchestrator.openByMode(meta);
  }

  function getActiveRenderer() {
    return state.mode === 'pip' && supportsDocumentPip() ? pipRenderer : homeRenderer;
  }

  function openWithRenderer(renderer, meta) {
    pauseExternalPlaybackPagePlayer();
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
    const href = new URL(`/video/${bvid}/`, 'https://www.bilibili.com');
    if (Number.isInteger(page) && page > 1) href.searchParams.set('p', String(page));

    return {
      bvid,
      href: href.href,
      title: document.title || bvid,
      fromUrlParams: true,
    };
  }

  function syncPlaybackPageMeta(kind, bootstrap) {
    if (!bootstrap || isLiveBootstrap(bootstrap)) return;
    if (isOgvBootstrap(bootstrap)) {
      captureOriginalPageMeta();
      const title = String(bootstrap.title || bootstrap.playerInfo?.epId || '').trim();
      if (title) document.title = title;
      return;
    }
    const bvid = bootstrap.playerInfo?.bvid;
    if (!bvid) return;
    captureOriginalPageMeta();

    const title = String(bootstrap.title || bvid).trim();
    if (title) document.title = title;

    const page = Number(bootstrap.playerInfo?.p || 0);
    const url = new URL(location.href);
    url.searchParams.set(URL_PARAM_PLAY, '1');
    url.searchParams.set(URL_PARAM_BVID, bvid);
    if (Number.isInteger(page) && page > 1) url.searchParams.set(URL_PARAM_PAGE, String(page));
    else url.searchParams.delete(URL_PARAM_PAGE);

    const nextHref = `${url.pathname}${url.search}${url.hash}`;
    if (nextHref !== `${location.pathname}${location.search}${location.hash}`) {
      history.replaceState(history.state, '', nextHref);
    }
  }

  function captureOriginalPageMeta() {
    if (state.originalPageMeta) return;
    state.originalPageMeta = {
      title: document.title,
      href: getUrlWithoutPlaybackParams(location.href),
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
    isClosed: () => !state.home.overlay || state.home.overlay.classList.contains(`${APP}--hidden`),
  };

  function getReusableHome(meta) {
    if (!state.home.player || !state.home.bootstrap || !isSamePlayback(meta, state.home.bootstrap)) return null;
    return { bootstrap: state.home.bootstrap };
  }

  function reuseHome(context, meta, token) {
    const ui = ensureHomeShell();
    const bootstrap = context.bootstrap;
    const preserveRightList = Boolean(meta.fromHistory);
    const ogv = isOgvBootstrap(bootstrap);
    showHomeShell(bootstrap.title || meta.title || meta.bvid);
    ui.openOriginal.dataset.href = meta.href || bootstrap.href;
    ui.status.textContent = '播放器：继续播放';
    saveLastPlayed(meta, bootstrap);
    recordPlaybackHistory(meta, bootstrap);
    syncPlaybackPageMeta('home', bootstrap);
    setOgvListMode('home', ogv);
    if (ogv) {
      state.home.playlistCards = [];
      setSelectedPageKey('home', meta.pageKey || getSelectedOgvPageKey(bootstrap));
      renderPageParts('home', bootstrap);
    } else if (!preserveRightList) {
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
    const ogv = isOgvMeta(meta);
    setOgvListMode('home', ogv);
    const preserveRightList = Boolean(meta.fromHistory);
    const preservePageParts = preserveRightList && isMetaInCurrentPageCards('home', meta);
    showHomeShell(meta.title || meta.bvid, { preserveScroll: Boolean(meta.fromPagePart || preserveRightList) });
    ui.openOriginal.dataset.href = meta.href;
    ui.status.textContent = state.home.player ? '播放页参数：解析中，准备 reload' : '播放页参数：解析中';
    if (ogv) {
      state.home.playlistCards = [];
      state.home.liveCards = [];
      state.home.selectedPlaylistBvid = '';
      state.home.selectedLiveKey = '';
    } else if (preserveRightList) {
      if (isBvidInCurrentPlaylist('home', meta.bvid)) setSelectedPlaylistBvid('home', meta.bvid);
    } else if (meta.fromPlaylist && state.home.playlistCards.length) {
      setSelectedPlaylistBvid('home', meta.bvid);
      renderPlaylist('home');
    } else {
      resetPlaylistFeed('home');
      capturePagePlaylist('home', meta.bvid);
    }
    if (!preservePageParts) {
      if (meta.fromPagePart && state.home.pageCards.length) setSelectedPageKey('home', meta.pageKey);
      else renderPageParts('home', null, ogv ? '选集加载中...' : '合集加载中...');
    }
    renderRecommendations('home', null, ogv ? '推荐加载中...' : '相关推荐加载中...');
    ensureBiliThemeStylesheets(document);
    return { ui, ogv, preservePageParts, preserveRightList };
  }

  async function playHome(context, bootstrap, token) {
    if (isLiveBootstrap(bootstrap)) {
      await bootLiveHome(context, bootstrap, token);
      return;
    }

    const { ui } = context;
    const previousBootstrap = state.home.bootstrap;
    state.home.bootstrap = bootstrap;
    const ogv = isOgvBootstrap(bootstrap);
    setOgvListMode('home', ogv);
    syncPlaybackPageMeta('home', bootstrap);
    ui.title.textContent = bootstrap.title || ui.title.textContent;
    ui.openOriginal.dataset.href = bootstrap.href;
    ui.status.textContent = ogv
      ? `OGV 参数：ep=${bootstrap.playerInfo.epId || '-'} aid=${bootstrap.playerInfo.aid} cid=${bootstrap.playerInfo.cid}`
      : `播放页参数：aid=${bootstrap.playerInfo.aid} cid=${bootstrap.playerInfo.cid}`;
    if (ogv) {
      state.home.playlistCards = [];
      renderPageParts('home', bootstrap);
    } else if (!context.preserveRightList) {
      setSelectedPlaylistBvid('home', bootstrap.playerInfo?.bvid);
      renderPlaylist('home');
    }
    if (!ogv && !context.preservePageParts) {
      renderPageParts('home', bootstrap);
    }
    renderRecommendations('home', bootstrap);
    syncVideoIntro('home');
    ensureStylesheetsInWindow(window, bootstrap.stylesheets);
    await loadScriptOnce(document, bootstrap.coreScript, () => pageWindow.nano);
    if (token !== state.switchToken || !pageWindow.nano || homeRenderer.isClosed()) return;

    if (canReloadHome(bootstrap, previousBootstrap)) await reloadHomePlayer(bootstrap, token);
    else {
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
    setOgvListMode('home', false);
    setLiveListMode('home', true);
    state.home.pageCards = [];
    state.home.recommendationCards = [];
    capturePageLiveList('home', getPlayableKey(meta));
    renderLiveList('home', '当前页面没有扫到直播卡片');
    return { ui, live: true };
  }

  async function bootLiveHome(context, bootstrap, token) {
    const { ui } = context;
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
      onFitLayout: fitHomeLayout,
      onFullscreen: () => setHomeFullscreen(!state.home.overlay?.classList.contains(`${APP}--fullscreen`)),
      onHistoryNext: () => openPlaybackHistoryOffset(1),
      onHistoryPrevious: () => openPlaybackHistoryOffset(-1),
      onModalResizeStart: startHomeModalResize,
      onOpenOriginal: (href) => openOriginalPlaybackPage(href, state.home.player),
      onOpenPip: openCurrentHomeInPip,
      onPlayerControlClick: onHomePlayerControlClick,
      onResetSize: resetHomeModalSize,
      onToggleAutoPlay: toggleAutoPlayNext,
      onResizeStart: (event) => startCommentWidthDrag(event, window),
      supportsPip: supportsDocumentPip(),
    });
    state.home.overlay = state.home.ui.overlay;
    attachHomePlayerControlCapture(state.home.ui);
    attachHomeBackToTopSync();
    attachHomePlaylistAutoRefresh();
    syncHomeCommentLayout();
    syncCommentsTabs('home');
    return state.home.ui;
  }

  function showHomeShell(title, { preserveScroll = false } = {}) {
    const ui = state.home.ui;
    state.home.overlay.classList.remove(`${APP}--hidden`);
    state.home.overlay.removeAttribute('aria-hidden');
    ensureBiliThemeStylesheets(document);
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
    ui.dialog?.focus?.({ preventScroll: true });
    syncHomeSize();
    syncHomeModalSizeButton();
    syncAutoPlayNextButton();
    syncGamepadIndicator();
    if (state.home.player) startAutoPlayCountdownMonitor('home');
    startGamepadControls();
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
        fromLivePageButton: !state.home.liveListMode,
      });
      return;
    }

    if (isOgvBootstrap(bootstrap)) {
      openWithRenderer(pipRenderer, {
        kind: 'ogv',
        aid: info?.aid,
        bvid: info?.bvid,
        cid: info?.cid,
        seasonId: info?.seasonId,
        epId: info?.epId,
        href,
        title: bootstrap.title || ui?.title?.textContent || `Bilibili 番剧 ${info?.epId || ''}`,
      });
      return;
    }

    const bvid = info?.bvid || getCurrentPageBvid();
    if (!bvid) return;
    openWithRenderer(pipRenderer, {
      bvid,
      href,
      title: bootstrap.title || ui?.title?.textContent || bvid,
    });
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
    if (event.type === 'click' && control.__biliPopupPlayerNanoWebFullscreenPointer) {
      control.__biliPopupPlayerNanoWebFullscreenPointer = false;
      return;
    }
    if (event.type === 'pointerdown') {
      if (event.button != null && event.button !== 0) return;
      control.__biliPopupPlayerNanoWebFullscreenPointer = true;
    }
    setHomeFullscreen(!state.home.overlay?.classList.contains(`${APP}--fullscreen`));
  }

  function attachHomePlayerControlCapture(ui) {
    const root = ui?.playerRoot;
    if (!root || root.__biliPopupPlayerNanoControlCaptureBound) return;
    root.__biliPopupPlayerNanoControlCaptureBound = true;
    root.addEventListener('pointerdown', onHomePlayerControlClick, true);
    root.addEventListener('click', onHomePlayerControlClick, true);
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

  function showLikeBurst(kind, message, tone = 'success', { icon = true } = {}) {
    const slot = state[kind];
    const targetDocument = kind === 'pip' && state.pip.win && !state.pip.win.closed
      ? state.pip.win.document
      : document;
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
    showLikeBurst(kind, offset < 0 ? '上一条' : '下一条', 'neutral', { icon: false });
  }

  function getLikeBurstHost(kind) {
    if (kind === 'home') return state.home.ui?.playerWrap || state.home.ui?.playerRoot || null;
    if (kind === 'pip') {
      const pipWindow = state.pip.win;
      if (!pipWindow || pipWindow.closed || isLiveBootstrap(state.pip.bootstrap)) return null;
      const playerRoot = pipWindow.document?.getElementById('bilibili-player') || null;
      return playerRoot?.querySelector?.('.bpx-player-video-wrap') ||
        pipWindow.document?.getElementById('stage') ||
        playerRoot ||
        null;
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
    [
      'M7 10v12',
      'M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z',
    ].forEach((pathData) => {
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
      onFollow: (mid, follow) => handleFollowUp(kind, mid, follow),
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
      showLikeBurst(kind, message, nextFollow ? 'success' : 'neutral', { icon: false });
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
    [0, 80, 300, 800].forEach((delay) => {
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
    const ogv = isOgvBootstrap(bootstrap);
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
      kind: ogv ? (runtime.GroupKind.Pgc || 1) : runtime.GroupKind.Ugc,
      featureList: new Set(ogv ? ['blackGap', 'outSideReload', 'hasAdvPermission'] : ['blackGap']),
      stats: ogv
        ? { spmId: '666.25.0.0', spmIdFrom: '666.25.0.0', trackId: '' }
        : { spmId: '333.788.0.0', spmIdFrom: '333.788.0.0', trackId: '' },
      autoplay: true,
      enableHEVC: true,
      enableAV1: true,
      screenKind: getScreenKind(runtime, 'home'),
      revision: 1,
      viewInfo: getPlayerViewInfo(bootstrap.initialState),
    };
    if (ogv) applyOgvPrimarySetting(setting, bootstrap);
    if (bootstrap.playInfo) setting.prefetch = { playUrl: bootstrap.playInfo };
    return setting;
  }

  function applyOgvPrimarySetting(setting, bootstrap) {
    const info = bootstrap?.playerInfo || {};
    delete setting.aid;
    delete setting.cid;
    delete setting.bvid;
    delete setting.p;
    setting.episodeId = info.epId;
    setting.seasonId = info.seasonId;
    setting.seasonType = info.seasonType;
    setting.stats = {
      ...(setting.stats || {}),
      spmId: '666.25',
      spmIdFrom: setting.stats?.spmIdFrom || '',
    };
    const quality = getInitialOgvQuality();
    if (quality) setting.quality = quality;
    setting.httpQuery = {
      ...(setting.httpQuery || {}),
      playUrl: {
        ...(setting.httpQuery?.playUrl || {}),
        exp_info: {
          ...(setting.httpQuery?.playUrl?.exp_info || {}),
          ogv_half_pay: true,
        },
      },
    };
    if (typeof bootstrap?.requestPlayUrlInfo === 'function') {
      setting.requestConfig = {
        ...(setting.requestConfig || {}),
        reqHttpPlayUrlInfo: (input = {}, headers = {}) => bootstrap.requestPlayUrlInfo(input, headers),
      };
    }
  }

  function canReloadHome(bootstrap, previousBootstrap = state.home.bootstrap) {
    return Boolean(
      state.home.player &&
      !isOgvBootstrap(bootstrap) &&
      typeof state.home.player.reload === 'function' &&
      state.home.ui?.playerRoot?.isConnected &&
      getBootstrapPlaybackKind(previousBootstrap) === getBootstrapPlaybackKind(bootstrap)
    );
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
    startAutoPlayCountdownMonitor('home');
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
    startAutoPlayCountdownMonitor('home');
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
      isActive: () => token === state.switchToken && state.home.ui && !state.home.overlay?.classList.contains(`${APP}--hidden`),
    }, bootstrap, token);
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
    isClosed: (context) => !context?.pipWindow || context.pipWindow.closed,
  };
  rendererOrchestrator = createRendererOrchestrator({
    getActiveRenderer,
    nextToken: () => ++state.switchToken,
    isCurrentToken: (token) => token === state.switchToken,
    resolveBootstrap,
    saveLastPlayed,
    recordPlaybackHistory,
  });
  startPlaybackFromUrlParams();

  function getReusablePip(meta) {
    if (!state.pip.win || state.pip.win.closed || state.pip.win.__biliPopupPlayerNanoClosed || !state.pip.player || !state.pip.bootstrap || !isSamePlayback(meta, state.pip.bootstrap)) return null;
    return { pipWindow: state.pip.win, bootstrap: state.pip.bootstrap };
  }

  function reusePip(context, meta) {
    const bootstrap = context.bootstrap;
    const ogv = isOgvBootstrap(bootstrap);
    saveLastPlayed(meta, bootstrap);
    recordPlaybackHistory(meta, bootstrap);
    syncPlaybackPageMeta('pip', bootstrap);
    ensurePipPlayerControls(context.pipWindow, meta.href || bootstrap.href);
    attachPipCommentsTabs(context.pipWindow);
    setOgvListMode('pip', ogv);
    if (ogv) {
      state.pip.playlistCards = [];
      setSelectedPageKey('pip', meta.pageKey || getSelectedOgvPageKey(bootstrap));
    } else {
      setSelectedPlaylistBvid('pip', meta.bvid || bootstrap.playerInfo?.bvid);
      renderPlaylist('pip');
    }
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
          height: Math.min(540, Math.floor(window.screen.availHeight * 0.55)),
        });
      } catch {
        setLastButtonStatus('PiP 被拒绝');
        return null;
      }
      state.pip.win = pipWindow;
    }
    attachPipWindowCloseSync(pipWindow);

    const ogv = isOgvMeta(meta);
    if (isLiveMeta(meta)) {
      setOgvListMode('pip', false);
      setLiveListMode('pip', true);
      state.pip.pageCards = [];
      state.pip.recommendationCards = [];
      state.pip.selectedPageKey = '';
      if (meta.fromLiveList && state.pip.liveCards.some((card) => getPlayableKey(card) === getPlayableKey(meta))) {
        setSelectedLiveKey('pip', getPlayableKey(meta));
        renderLiveList('pip', '当前页面没有扫到直播卡片');
      } else if (meta.fromLivePageButton) {
        state.pip.liveCards = [];
        setSelectedLiveKey('pip', '');
      } else {
        capturePageLiveList('pip', getPlayableKey(meta));
        renderLiveList('pip', '当前页面没有扫到直播卡片');
      }
    } else if (ogv) {
      setLiveListMode('pip', false);
      setOgvListMode('pip', true);
      state.pip.playlistCards = [];
      state.pip.liveCards = [];
      state.pip.selectedPlaylistBvid = '';
      state.pip.selectedLiveKey = '';
    } else if (meta.fromPlaylist && state.pip.playlistCards.length) {
      setLiveListMode('pip', false);
      setOgvListMode('pip', false);
      setSelectedPlaylistBvid('pip', meta.bvid);
      renderPlaylist('pip');
    } else {
      setLiveListMode('pip', false);
      setOgvListMode('pip', false);
      resetPlaylistFeed('pip');
      capturePagePlaylist('pip', meta.bvid);
    }
    if (state.pip.win && !state.pip.win.closed && !isLiveMeta(meta)) {
      if (meta.fromPagePart && state.pip.pageCards.length) setSelectedPageKey('pip', meta.pageKey);
      else renderPageParts('pip', null, ogv ? '选集加载中...' : '合集加载中...');
    }
    if (state.pip.win && !state.pip.win.closed && !isLiveMeta(meta)) renderRecommendations('pip', null, ogv ? '推荐加载中...' : '相关推荐加载中...');

    if (!isLiveMeta(meta) && canReloadPip(pipWindow)) setPipStatus('换源中');
    else {
      disposePipPlayer();
      disposePipComments();
      writePipLoading(pipWindow, meta.title, meta.href);
    }

    return { pipWindow, href: meta.href };
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
    const previousBootstrap = state.pip.bootstrap;
    state.pip.bootstrap = bootstrap;
    if (isLiveBootstrap(bootstrap)) {
      await bootLivePipWindow(pipWindow, bootstrap, token);
      return;
    }
    if (canReloadPip(pipWindow, bootstrap, previousBootstrap)) {
      await reloadPipPlayer(pipWindow, bootstrap, token);
      return;
    }

    disposePipPlayer();
    disposePipComments();

    const commentLayoutClass = getCommentLayout('pip') === 'right' ? 'comments-right' : 'comments-bottom';

    writePipDocument(pipWindow, renderPipPlayerDocument({
      title: bootstrap.title,
      stylesheets: [...bootstrap.stylesheets, ...getBiliThemeStylesheets()],
      themeClassMarkup: getPipThemeClassMarkup(),
      commentLayoutClass,
    }));

    mountPipPlayerPage({
      targetDocument: pipWindow.document,
      createCommentsTabs,
    });
    attachPipKeyboardShortcuts(pipWindow);
    attachPipCommentsTabs(pipWindow);
    const ogv = isOgvBootstrap(bootstrap);
    setOgvListMode('pip', ogv);
    if (ogv) {
      state.pip.playlistCards = [];
      setSelectedPageKey('pip', getSelectedOgvPageKey(bootstrap));
    } else {
      setSelectedPlaylistBvid('pip', bootstrap.playerInfo?.bvid);
      renderPlaylist('pip');
    }
    renderPageParts('pip', bootstrap);
    renderRecommendations('pip', bootstrap);
    syncVideoIntro('pip');
    syncCommentsTabs('pip');
    attachPipPlaylistAutoRefresh(pipWindow);
    ensureStylesheetsInWindow(pipWindow, bootstrap.stylesheets);
    await loadScriptOnce(pipWindow.document, bootstrap.coreScript, () => pipWindow.nano);
    if (token !== state.switchToken || pipWindow.closed) return;
    if (!pipWindow.nano) throw new Error('nano not available after core load');
    attachPipCommentResizer(pipWindow);
    attachPipWindowResizeSync(pipWindow);
    syncCommentWidth('pip');
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
    pageWindow.EmbedPlayer = { instance: player };
    pageWindow.__PLAYER_GLOBAL_INSTANCE__ = player;
    state.home.player = createLivePipPlayerAdapter(pageWindow, player, state.home.ui?.playerWrap || playerRoot);
    setHomePlayerFeatureBlocked(false);
    syncHomeSize();
    window.setTimeout(() => syncHomeSize(), 600);
    window.setTimeout(() => syncHomeSize(), 1600);
    attachLivePlayerOnlyControl();
    startLivePlayerOnlyControlObserver();
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
    }
    installLivePlayerOnlyControlHandlers(button, 'home');
    layer.classList.add(`${APP}__live-player-controls-layer`);
    if (button.parentElement !== layer) layer.appendChild(button);
    syncHomePlayerOnlyControl();
  }

  function startLivePlayerOnlyControlObserver() {
    stopLivePlayerOnlyControlObserver();
    const playerRoot = state.home.ui?.playerRoot;
    if (!playerRoot || !isLiveBootstrap(state.home.bootstrap)) return;
    state.home.liveControlObserver = new MutationObserver(() => scheduleLivePlayerOnlyControlAttach());
    state.home.liveControlObserver.observe(playerRoot, { childList: true, subtree: true });
    scheduleLivePlayerOnlyControlAttach();
  }

  function scheduleLivePlayerOnlyControlAttach() {
    if (state.home.liveControlFrame) return;
    state.home.liveControlFrame = window.requestAnimationFrame(() => {
      state.home.liveControlFrame = 0;
      attachLivePlayerOnlyControl();
    });
  }

  function stopLivePlayerOnlyControlObserver() {
    if (state.home.liveControlFrame) {
      window.cancelAnimationFrame(state.home.liveControlFrame);
      state.home.liveControlFrame = 0;
    }
    state.home.liveControlObserver?.disconnect();
    state.home.liveControlObserver = null;
    state.home.ui?.playerRoot?.querySelector?.(`.${APP}__live-player-only-control`)?.remove();
  }

  function findLivePlayerControlLayer(liveRoot) {
    const rootRect = liveRoot.getBoundingClientRect();
    const candidates = [...liveRoot.querySelectorAll('[class]')]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const className = String(element.className || '');
        if (rect.width < rootRect.width * 0.35 || rect.height < 24 || rect.height > 180) return null;
        if (rect.bottom < rootRect.bottom - 220 || rect.top < rootRect.top + rootRect.height * 0.35) return null;
        if (!/(?:control|controller|toolbar|bottom|operate|panel|wrap)/i.test(className)) return null;
        const score =
          (/controller|control/i.test(className) ? 8 : 0) +
          (/wrap|bar|bottom/i.test(className) ? 4 : 0) +
          Math.max(0, 220 - Math.abs(rootRect.bottom - rect.bottom)) / 20 +
          rect.width / Math.max(rootRect.width, 1);
        return { element, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    return candidates[0]?.element || null;
  }

  function togglePlayerOnly(kind) {
    setCommentLayout(kind, getCommentLayout(kind) === 'right' ? 'bottom' : 'right');
  }

  function installLivePlayerOnlyControlHandlers(button, kind) {
    if (!button || button.__biliPopupPlayerNanoLiveOnlyBound) return;
    button.__biliPopupPlayerNanoLiveOnlyBound = true;
    button.addEventListener('pointerdown', (event) => {
      if (event.button != null && event.button !== 0) return;
      stopLivePlayerOnlyControlEvent(event);
      button.__biliPopupPlayerNanoLiveOnlyPointer = true;
      togglePlayerOnly(kind);
    });
    button.addEventListener('click', (event) => {
      stopLivePlayerOnlyControlEvent(event);
      if (button.__biliPopupPlayerNanoLiveOnlyPointer) {
        button.__biliPopupPlayerNanoLiveOnlyPointer = false;
        return;
      }
      togglePlayerOnly(kind);
    });
  }

  function stopLivePlayerOnlyControlEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  function syncHomePlayerOnlyControl() {
    const button = state.home.ui?.playerRoot?.querySelector?.(`.${APP}__live-player-only-control`);
    if (!button) return;
    const active = getCommentLayout('home') !== 'right';
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
        commentLayoutClass: getCommentLayout('pip') === 'right' ? 'comments-right' : 'comments-bottom',
      }));
      mountPipPlayerPage({
        targetDocument: pipWindow.document,
        createCommentsTabs,
      });
      const stage = pipWindow.document.getElementById('stage');
      if (stage) stage.innerHTML = getLivePlayerShellMarkup();
      attachPipKeyboardShortcuts(pipWindow);
      attachPipCommentsTabs(pipWindow);
      setOgvListMode('pip', false);
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
      themeClassMarkup: getPipThemeClassMarkup(),
    }));
  }

  function connectLivePipPlayer(targetWindow, bootstrap, token) {
    if (token !== state.switchToken || targetWindow.closed) return;
    const playerRoot = targetWindow.document.getElementById('live-player');
    if (!playerRoot) throw new Error('live-player container not found');

    const player = new targetWindow.Player(playerRoot, buildLivePipPlayerOptions(targetWindow, bootstrap));
    targetWindow.EmbedPlayer = { instance: player };
    targetWindow.__PLAYER_GLOBAL_INSTANCE__ = player;
    targetWindow.__biliPopupPlayerNanoDebug = {
      getPlayer: () => player,
      getBootstrap: () => bootstrap,
      getPrimarySetting: () => buildLivePipPlayerOptions(targetWindow, bootstrap),
    };

    state.pip.player = createLivePipPlayerAdapter(targetWindow, player, targetWindow.document.getElementById('stage') || playerRoot);
    attachPipWindowResizeSync(targetWindow);
    syncPipSize(targetWindow);
    targetWindow.setTimeout(() => syncPipSize(targetWindow), 600);
    targetWindow.setTimeout(() => syncPipSize(targetWindow), 1600);
    attachPipLivePlayerOnlyControl(targetWindow);
    startPipLivePlayerOnlyControlObserver(targetWindow);
    targetWindow.setTimeout(() => attachPipLivePlayerOnlyControl(targetWindow), 600);
    targetWindow.setTimeout(() => attachPipLivePlayerOnlyControl(targetWindow), 1600);
    setPipStatus('播放中');

    targetWindow.addEventListener('pagehide', () => {
      if (state.pip.switchingWindow) return;
      stopPipLivePlayerOnlyControlObserver();
      if (state.pip.player) disposePipPlayer();
      if (state.pip.win === targetWindow) state.pip.win = null;
    });
  }

  function attachPipLivePlayerOnlyControl(targetWindow = state.pip.win) {
    if (!targetWindow || targetWindow.closed || !isLiveBootstrap(state.pip.bootstrap) || !state.pip.liveCards?.length) return;
    const liveRoot = targetWindow.document?.getElementById('live-player');
    if (!liveRoot) return;
    const layer = findLivePlayerControlLayer(liveRoot);
    if (!layer) return;

    let button = liveRoot.querySelector(`.${APP}__live-player-only-control`);
    if (!button) {
      button = targetWindow.document.createElement('button');
      button.type = 'button';
      button.className = `${APP}__live-player-only-control`;
    }
    installLivePlayerOnlyControlHandlers(button, 'pip');
    layer.classList.add(`${APP}__live-player-controls-layer`);
    if (button.parentElement !== layer) layer.appendChild(button);
    syncPipLivePlayerOnlyControl(targetWindow);
  }

  function startPipLivePlayerOnlyControlObserver(targetWindow = state.pip.win) {
    stopPipLivePlayerOnlyControlObserver();
    if (!targetWindow || targetWindow.closed || !isLiveBootstrap(state.pip.bootstrap) || !state.pip.liveCards?.length) return;
    const playerRoot = targetWindow.document?.getElementById('stage');
    if (!playerRoot || !targetWindow.MutationObserver) return;
    state.pip.liveControlWindow = targetWindow;
    state.pip.liveControlObserver = new targetWindow.MutationObserver(() => schedulePipLivePlayerOnlyControlAttach());
    state.pip.liveControlObserver.observe(playerRoot, { childList: true, subtree: true });
    schedulePipLivePlayerOnlyControlAttach();
  }

  function schedulePipLivePlayerOnlyControlAttach() {
    const targetWindow = state.pip.liveControlWindow || state.pip.win;
    if (!targetWindow || targetWindow.closed || state.pip.liveControlFrame) return;
    state.pip.liveControlFrame = targetWindow.requestAnimationFrame(() => {
      state.pip.liveControlFrame = 0;
      attachPipLivePlayerOnlyControl(targetWindow);
    });
  }

  function stopPipLivePlayerOnlyControlObserver() {
    const targetWindow = state.pip.liveControlWindow || state.pip.win;
    if (state.pip.liveControlFrame && targetWindow && !targetWindow.closed) {
      targetWindow.cancelAnimationFrame(state.pip.liveControlFrame);
    }
    state.pip.liveControlFrame = 0;
    state.pip.liveControlObserver?.disconnect();
    state.pip.liveControlObserver = null;
    state.pip.liveControlWindow = null;
    if (targetWindow && !targetWindow.closed) {
      targetWindow.document?.getElementById('live-player')?.querySelector?.(`.${APP}__live-player-only-control`)?.remove();
    }
  }

  function syncPipLivePlayerOnlyControl(targetWindow = state.pip.win) {
    if (!targetWindow || targetWindow.closed) return;
    const button = targetWindow.document?.getElementById('live-player')?.querySelector?.(`.${APP}__live-player-only-control`);
    if (!button) return;
    const active = getCommentLayout('pip') !== 'right';
    button.title = active ? '退出宽屏' : '宽屏';
    button.setAttribute('aria-label', button.title);
    button.replaceChildren(active ? createMinimizeIcon() : createMaximizeIcon());
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
      if (!isHomeShellOpen()) restoreExternalPlaybackPagePlayer();
    }, { capture: true });
  }

  function isHomeShellOpen() {
    return Boolean(state.home.overlay && !state.home.overlay.classList.contains(`${APP}--hidden`));
  }

  function attachPipKeyboardShortcuts(targetWindow) {
    if (!targetWindow || targetWindow.closed || targetWindow.__biliPopupPlayerNanoKeydownBound) return;
    const handler = (event) => onPipKeydown(event);
    targetWindow.__biliPopupPlayerNanoKeydownBound = true;
    targetWindow.document.addEventListener('keydown', handler, true);
    targetWindow.addEventListener('pagehide', () => {
      targetWindow.document?.removeEventListener?.('keydown', handler, true);
      if (state.pip.keydownHandler === handler) state.pip.keydownHandler = null;
      delete targetWindow.__biliPopupPlayerNanoKeydownBound;
    }, { once: true });
    state.pip.keydownHandler = handler;
  }

  function canReloadPip(pipWindow, bootstrap = state.pip.bootstrap, previousBootstrap = state.pip.bootstrap) {
    return Boolean(
      pipWindow &&
      !pipWindow.closed &&
      !pipWindow.__biliPopupPlayerNanoClosed &&
      state.pip.win === pipWindow &&
      !isLiveBootstrap(state.pip.bootstrap) &&
      !isOgvBootstrap(bootstrap) &&
      getBootstrapPlaybackKind(previousBootstrap) === getBootstrapPlaybackKind(bootstrap) &&
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
    attachPipKeyboardShortcuts(targetWindow);
    attachPipCommentsTabs(targetWindow);
    const ogv = isOgvBootstrap(bootstrap);
    setOgvListMode('pip', ogv);
    if (ogv) {
      state.pip.playlistCards = [];
      setSelectedPageKey('pip', getSelectedOgvPageKey(bootstrap));
    } else {
      setSelectedPlaylistBvid('pip', bootstrap.playerInfo?.bvid);
      renderPlaylist('pip');
    }
    renderPageParts('pip', bootstrap);
    renderRecommendations('pip', bootstrap);
    syncVideoIntro('pip');
    attachPipPlaylistAutoRefresh(targetWindow);
    attachPipCommentResizer(targetWindow);
    attachPipWindowResizeSync(targetWindow);
    syncCommentWidth('pip');
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
    startAutoPlayCountdownMonitor('pip');
    startGamepadControls();
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
      getBootstrap: () => targetWindow.__biliPopupPlayerNanoCurrentBootstrap,
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
    startAutoPlayCountdownMonitor('pip');
    startGamepadControls();
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
      if (!isHomeShellOpen()) stopGamepadControls();
    });
  }

  function buildPipPrimarySetting(targetWindow, bootstrap) {
    const info = bootstrap.playerInfo;
    const handoff = getPlayerHandoffAvailability('pip');
    const ogv = isOgvBootstrap(bootstrap);
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
      kind: ogv ? (targetWindow.nano.GroupKind.Pgc || 1) : targetWindow.nano.GroupKind.Ugc,
      featureList: new targetWindow.Set(ogv ? ['blackGap', 'outSideReload', 'hasAdvPermission'] : ['blackGap']),
      stats: ogv
        ? { spmId: '666.25.0.0', spmIdFrom: '666.25.0.0', trackId: '' }
        : { spmId: '333.788.0.0', spmIdFrom: '333.788.0.0', trackId: '' },
      autoplay: true,
      enableHEVC: true,
      enableAV1: true,
      screenKind: getScreenKind(targetWindow.nano, 'pip'),
      revision: 1,
      viewInfo: getPlayerViewInfo(bootstrap.initialState),
    };
    if (ogv) applyOgvPrimarySetting(setting, bootstrap);
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
    schedulePipBottomFixedWrapperSync(targetWindow);
    return result;
  }

  function readCommentLayout(storageKey) {
    const value = getStorageItem(storageKey, getStorageItem(STORAGE_COMMENT_LAYOUT, 'right'));
    return value === 'bottom' ? 'bottom' : 'right';
  }

  function readCommentWidth(storageKey) {
    const value = Number(getStorageItem(storageKey, getStorageItem(STORAGE_COMMENT_WIDTH)));
    return clampCommentWidth(Number.isFinite(value) ? value : COMMENT_WIDTH_DEFAULT);
  }

  function getCommentLayout(kind) {
    return kind === 'pip' ? state.pipCommentLayout : state.homeCommentLayout;
  }

  function getCommentWidth(kind) {
    return kind === 'pip' ? state.pipCommentWidth : state.homeCommentWidth;
  }

  function setCommentWidthValue(kind, width) {
    if (kind === 'pip') state.pipCommentWidth = width;
    else state.homeCommentWidth = width;
  }

  function getCommentLayoutStorageKey(kind) {
    return kind === 'pip' ? STORAGE_PIP_COMMENT_LAYOUT : STORAGE_HOME_COMMENT_LAYOUT;
  }

  function getCommentWidthStorageKey(kind) {
    return kind === 'pip' ? STORAGE_PIP_COMMENT_WIDTH : STORAGE_HOME_COMMENT_WIDTH;
  }

  function setCommentLayout(kind, value) {
    const next = value === 'right' ? 'right' : 'bottom';
    if (kind === 'pip') {
      if (state.pipCommentLayout === next) return;
      state.pipCommentLayout = next;
    } else {
      if (state.homeCommentLayout === next) return;
      state.homeCommentLayout = next;
    }
    setStorageItem(getCommentLayoutStorageKey(kind), next);
    syncCommentLayout(kind);
    if (kind === 'pip') syncPipLivePlayerOnlyControl(state.pip.win);
    else syncHomePlayerOnlyControl();
    remountCommentsForLayout(kind);
  }

  function syncCommentLayout(kind) {
    if (!kind || kind === 'home') syncHomeCommentLayout();
    if ((!kind || kind === 'pip') && state.pip.win && !state.pip.win.closed) syncPipCommentLayout(state.pip.win);
    scheduleSelectedPlaylistScrollForLayout();
    scheduleHomeBottomFixedWrapperSync();
    if (state.pip.win && !state.pip.win.closed) schedulePipBottomFixedWrapperSync(state.pip.win);
  }

  function setLiveListMode(kind, active) {
    const scope = state[kind];
    if (!scope) return;
    scope.liveListMode = Boolean(active);
    if (active) scope.ogvListMode = false;
    if (active) scope.activeCommentsTab = 'live';
    else if (scope.activeCommentsTab === 'live') scope.activeCommentsTab = 'comments';
    const doc = kind === 'pip' ? state.pip.win?.document : document;
    const root = kind === 'pip' ? doc?.getElementById('comments') : state.home.ui?.comments;
    root?.querySelectorAll?.(`.${APP}__comments-tab`)?.forEach((button) => {
      button.hidden = active
        ? button.dataset.tab !== 'live'
        : (button.dataset.tab === 'pages' && !scope.pageCards?.length) ||
          button.dataset.tab === 'live';
    });
    if (kind === 'home') syncAutoPlayNextButton();
    syncCommentsTabs(kind);
  }

  function setOgvListMode(kind, active) {
    const scope = state[kind];
    if (!scope) return;
    scope.ogvListMode = Boolean(active);
    if (active) {
      scope.liveListMode = false;
      if (scope.activeCommentsTab === 'playlist' || scope.activeCommentsTab === 'live') {
        scope.activeCommentsTab = 'pages';
      }
    } else if (scope.activeCommentsTab === 'pages' && !scope.pageCards?.length) {
      scope.activeCommentsTab = 'comments';
    }
    if (kind === 'home') syncAutoPlayNextButton();
    syncCommentsTabs(kind);
  }

  function getLivePlayerShellMarkup() {
    return '<div id="fullscreen-container"><div id="live-player"><div id="fullscreen-danmaku-vm"><fullscreen-danmaku></fullscreen-danmaku></div></div></div>';
  }

  function scheduleSelectedPlaylistScrollForLayout() {
    window.requestAnimationFrame(() => {
      if (getCommentLayout('home') === 'right' && state.home.activeCommentsTab === 'playlist') scrollSelectedPlaylistIntoView('home');
      if (getCommentLayout('home') === 'right' && state.home.activeCommentsTab === 'live') scrollSelectedLiveIntoView('home');
      if (getCommentLayout('pip') === 'right' && state.pip.win && !state.pip.win.closed && state.pip.activeCommentsTab === 'playlist') {
        scrollSelectedPlaylistIntoView('pip');
      }
      if (getCommentLayout('pip') === 'right' && state.pip.win && !state.pip.win.closed && state.pip.activeCommentsTab === 'live') {
        scrollSelectedLiveIntoView('pip');
      }
    });
  }

  function syncCommentWidth(kind) {
    if (!kind || kind === 'home') syncHomeCommentWidth();
    if (!kind || kind === 'pip') syncPipCommentWidth();
  }

  function syncHomeCommentWidth() {
    state.homeCommentWidth = clampCommentWidth(state.homeCommentWidth);
    const value = `${state.homeCommentWidth}px`;
    state.home.ui?.overlay?.style.setProperty(`--${APP}-comments-width`, value);
    if (state.home.ui?.commentsResizer) {
      state.home.ui.commentsResizer.setAttribute('aria-valuenow', String(state.homeCommentWidth));
      state.home.ui.commentsResizer.setAttribute('aria-valuemin', String(COMMENT_WIDTH_MIN));
      state.home.ui.commentsResizer.setAttribute('aria-valuemax', String(COMMENT_WIDTH_MAX));
    }
    syncHomeSize();
  }

  function syncPipCommentWidth() {
    state.pipCommentWidth = clampCommentWidth(state.pipCommentWidth);
    const value = `${state.pipCommentWidth}px`;
    const pipDocument = state.pip.win && !state.pip.win.closed ? state.pip.win.document : null;
    pipDocument?.documentElement?.style.setProperty(`--${APP}-comments-width`, value);
    const pipResizer = pipDocument?.getElementById('comments-resizer');
    if (pipResizer) {
      pipResizer.setAttribute('aria-valuenow', String(state.pipCommentWidth));
      pipResizer.setAttribute('aria-valuemin', String(COMMENT_WIDTH_MIN));
      pipResizer.setAttribute('aria-valuemax', String(COMMENT_WIDTH_MAX));
    }
    if (state.pip.win && !state.pip.win.closed) syncPipSize(state.pip.win);
  }

  function attachHomeBackToTopSync() {
    const ui = state.home.ui;
    if (!ui?.content || !ui.comments || ui.backToTop?.__biliPopupPlayerNanoScrollBound) return;
    ui.backToTop.__biliPopupPlayerNanoScrollBound = true;
    ui.content.addEventListener('scroll', () => {
      syncHomeBackToTopButton();
      scheduleHomeBottomFixedWrapperSync();
    }, { passive: true });
    [ui.commentsPanel, ui.pagesPanel, ui.playlistPanel, ui.recommendPanel].forEach((panel) => {
      panel?.addEventListener('scroll', () => {
        syncHomeBackToTopButton();
        scheduleHomeBottomFixedWrapperSync();
      }, { passive: true });
    });
    syncHomeBackToTopButton();
    scheduleHomeBottomFixedWrapperSync();
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
      container.addEventListener('scroll', () => schedulePlaylistAutoRefreshCheck('home'), { passive: true });
    });
  }

  function attachPipPlaylistAutoRefresh(targetWindow) {
    if (!targetWindow || targetWindow.closed) return;
    const doc = targetWindow.document;
    const layout = doc?.getElementById('layout');
    const playlistPanel = doc?.getElementById('playlist-panel');
    [
      layout,
      playlistPanel,
    ].forEach((container) => {
      if (!container || container.__biliPopupPlayerNanoPlaylistRefreshBound) return;
      container.__biliPopupPlayerNanoPlaylistRefreshBound = true;
      container.addEventListener('scroll', () => schedulePlaylistAutoRefreshCheck('pip'), { passive: true });
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

  async function maybeLoadMorePlaylist(kind, { force = false, ignoreActiveTab = false } = {}) {
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
      loading: scope.playlistCards.length === 0,
    });

    try {
      const cards = await fetchHomeFeedCards({
        existingCards: scope.playlistCards,
        session: feed.session,
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
        renderPlaylist(kind, getPlaylistEmptyText(kind), { autoScrollSelected: false });
      }
    }
  }

  function appendPlaylistCards(kind, cards) {
    const scope = state[kind];
    if (!scope) return;
    const seen = new Set(scope.playlistCards.map((card) => card?.bvid).filter(Boolean));
    const nextCards = cards.filter((card) => {
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
      return getCommentLayout('home') === 'right' ? ui.playlistPanel : ui.content;
    }
    const doc = state.pip.win && !state.pip.win.closed ? state.pip.win.document : null;
    if (!doc) return null;
    return getCommentLayout('pip') === 'right' ? doc.getElementById('playlist-panel') : doc.getElementById('layout');
  }

  function isPlaylistAutoRefreshActive(kind) {
    if (kind === 'home') {
      return Boolean(
        state.home.ui &&
        state.home.overlay &&
        !state.home.overlay.classList.contains(`${APP}--hidden`) &&
        state.home.activeCommentsTab === 'playlist',
      );
    }
    return Boolean(
      state.pip.win &&
      !state.pip.win.closed &&
      state.pip.activeCommentsTab === 'playlist',
    );
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

  function scheduleHomeBottomFixedWrapperSync() {
    if (state.bottomFixedFrame) return;
    state.bottomFixedFrame = window.requestAnimationFrame(() => {
      state.bottomFixedFrame = 0;
      syncBottomFixedWrappers({
        doc: document,
        root: state.home.ui?.overlay,
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
        root: targetWindow.document?.body,
      });
    });
  }

  function syncBottomFixedWrappers({ doc, root }) {
    if (!doc || !root) return;
    const wrappers = getBottomFixedWrappers(doc, root);
    if (!wrappers.length) return;
    wrappers.forEach((wrapper) => {
      wrapper.classList.add(`${APP}__bottom-fixed-hidden`);
    });
  }

  function getBottomFixedWrappers(doc, root) {
    const selectors = [
      '.bili-comments-bottom-fixed-wrapper',
      '[class*="bottom-fixed"]',
      '[class*="fixed-wrapper"]',
    ];
    const scoped = [...(root.querySelectorAll?.(selectors.join(',')) || [])];
    const bodyPortals = [...(doc.body?.querySelectorAll?.(selectors.join(',')) || [])]
      .filter((element) => !root.contains(element) && isLikelyCommentFixedWrapper(element));
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
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      scrollContainer.scrollTop = 0;
    }
  }

  function syncHomeCommentLayout() {
    const ui = state.home.ui;
    if (!ui?.overlay) return;
    ui.overlay.classList.toggle(`${APP}--comments-right`, getCommentLayout('home') === 'right');
    syncCommentWidth('home');
    syncHomeBackToTopButton();
    scheduleHomeBottomFixedWrapperSync();
  }

  function getHomeCommentsScrollContainer() {
    if (getCommentLayout('home') !== 'right') return state.home.ui?.content;
    return getHomeActiveCommentsPanel();
  }

  function getHomeCommentInstanceScrollContainer() {
    if (getCommentLayout('home') !== 'right') return state.home.ui?.content;
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
    const { resize = true } = options;
    body.classList.toggle('comments-right', getCommentLayout('pip') === 'right');
    body.classList.toggle('comments-bottom', getCommentLayout('pip') !== 'right');
    syncCommentWidth('pip');
    attachPipCommentScrollSync(targetWindow);
    attachPipBackToTopSync(targetWindow);
    syncPipBackToTopButton(targetWindow);
    schedulePipBottomFixedWrapperSync(targetWindow);
    if (resize) syncPipSize(targetWindow);
  }

  function remountCommentsForLayout(kind) {
    const token = state.switchToken;
    if ((!kind || kind === 'home') && state.home.bootstrap && state.home.ui && !state.home.overlay?.classList.contains(`${APP}--hidden`)) {
      disposeHomeComments();
      if (state.home.ui.commentsMount) state.home.ui.commentsMount.textContent = '评论加载中...';
      mountHomeComments(state.home.bootstrap, token);
    }
    if ((!kind || kind === 'pip') && state.pip.bootstrap && state.pip.win && !state.pip.win.closed) {
      disposePipComments();
      const mount = state.pip.win.document?.getElementById('comments-mount');
      if (mount) mount.textContent = '评论加载中...';
      mountPipComments(state.pip.win, state.pip.bootstrap, token);
    }
  }

  function getPipCommentsScrollContainer(targetWindow) {
    if (!targetWindow || targetWindow.closed) return null;
    const doc = targetWindow.document;
    if (getCommentLayout('pip') !== 'right') return doc.getElementById('layout');
    return getPipActiveCommentsPanel(doc);
  }

  function getPipCommentInstanceScrollContainer(targetWindow) {
    if (!targetWindow || targetWindow.closed) return null;
    const doc = targetWindow.document;
    if (getCommentLayout('pip') !== 'right') return doc.getElementById('layout');
    return doc.getElementById('comments-panel');
  }

  function getPipActiveCommentsPanel(doc) {
    if (!doc) return null;
    if (state.pip.activeCommentsTab === 'pages') return doc.getElementById('pages-panel');
    if (state.pip.activeCommentsTab === 'playlist') return doc.getElementById('playlist-panel');
    if (state.pip.activeCommentsTab === 'recommend') return doc.getElementById('recommend-panel');
    return doc.getElementById('comments-panel');
  }

  function getScreenKind(runtime, kind) {
    const key = getCommentLayout(kind) === 'bottom' ? 'Wide' : 'Normal';
    return runtime?.ScreenKind?.[key] ?? (key === 'Wide' ? 1 : 0);
  }

  function getInitialOgvQuality() {
    const memoryQuality = getOgvMemoryQuality();
    if (memoryQuality) return memoryQuality;
    return getNumericCookieValue('CURRENT_QUALITY') || undefined;
  }

  function getOgvMemoryQuality() {
    const raw = getStorageItem('OGV_MEMORY_QUALITY', '');
    const quality = String(raw || '').split(';')
      .map((item) => item.split('='))
      .find(([key]) => key === 'quality')?.[1];
    const number = Number(quality);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function getNumericCookieValue(name) {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    const number = Number(match ? decodeURIComponent(match[1]) : 0);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function isScreenKind(runtime, value, key) {
    return value === runtime?.ScreenKind?.[key] || value === (key === 'Wide' ? 1 : 0);
  }

  function handleScreenChanged(kind, runtime, detail) {
    if (!detail?.mainTrigger) return;
    if (isScreenKind(runtime, detail.mainScreen, 'Wide')) setCommentLayout(kind, 'bottom');
    else if (isScreenKind(runtime, detail.mainScreen, 'Normal')) setCommentLayout(kind, 'right');
  }

  function bindHomeScreenChange(player) {
    unbindHomeScreenChange();
    const runtime = getPlayerApiForKind('home');
    const eventType = runtime?.EventType?.Player_Statue_Changed;
    if (!player?.on || !eventType) return;
    const handler = (event) => handleScreenChanged('home', runtime, event?.detail);
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

  function bindHomePlayerNavigate(player) {
    unbindHomePlayerNavigate();
    const eventTypes = getPlayerNavigationEventTypes(getPlayerApiForKind('home'));
    if (!player?.on || !eventTypes.length) return;
    const bindings = eventTypes.map(({ eventType, delay }) => {
      const handler = () => schedulePlayerNavigationSync('home', delay);
      player.on(eventType, handler);
      return { eventType, handler };
    });
    state.home.navigateHandler = { player, bindings };
  }

  function unbindHomePlayerNavigate() {
    if (state.home.navigateSyncTimer) {
      window.clearTimeout(state.home.navigateSyncTimer);
      state.home.navigateSyncTimer = 0;
    }
    const binding = state.home.navigateHandler;
    if (!binding) return;
    try {
      binding.bindings?.forEach(({ eventType, handler }) => {
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
    const handler = (event) => handlePlayerHandoff('home', event?.detail);
    player.on(eventType, handler);
    state.home.handoffHandler = { player, eventType, handler };
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
    state.home.endedHandler = { player, eventType, handler };
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
    const handler = (event) => handleScreenChanged('pip', targetWindow.nano, event?.detail);
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

  function bindPipPlayerNavigate(targetWindow, player) {
    unbindPipPlayerNavigate();
    const eventTypes = getPlayerNavigationEventTypes(targetWindow.nano);
    if (!player?.on || !eventTypes.length) return;
    const bindings = eventTypes.map(({ eventType, delay }) => {
      const handler = () => schedulePlayerNavigationSync('pip', delay);
      player.on(eventType, handler);
      return { eventType, handler };
    });
    state.pip.navigateHandler = { player, bindings };
  }

  function unbindPipPlayerNavigate() {
    const pipWindow = state.pip.win;
    if (state.pip.navigateSyncTimer) {
      if (pipWindow && !pipWindow.closed) pipWindow.clearTimeout(state.pip.navigateSyncTimer);
      else window.clearTimeout(state.pip.navigateSyncTimer);
      state.pip.navigateSyncTimer = 0;
    }
    const binding = state.pip.navigateHandler;
    if (!binding) return;
    try {
      binding.bindings?.forEach(({ eventType, handler }) => {
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
    const handler = (event) => handlePlayerHandoff('pip', event?.detail);
    player.on(eventType, handler);
    state.pip.handoffHandler = { player, eventType, handler };
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
    state.pip.endedHandler = { player, eventType, handler };
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
      absolute: Boolean(detail?.absolute),
      preferPageTree: true,
    })) {
      showSwitchBurst(kind, offset);
    }
  }

  function handlePlayerEnded(kind) {
    if (!state.autoPlayNext) return;
    const key = getCurrentBootstrapPlaybackKey(kind);
    if (key && state[kind]?.autoPlayCountdownCanceledKey === key) {
      hideAutoPlayCountdown(kind);
      return;
    }
    hideAutoPlayCountdown(kind);
    playAdjacentFromActiveTab(kind, 1, { auto: true, preferPageTree: true });
  }

  function startAutoPlayCountdownMonitor(kind) {
    stopAutoPlayCountdownMonitor(kind);
    const slot = state[kind];
    if (!slot?.player || !state.autoPlayNext || !state.autoPlayCountdown || isLiveBootstrap(slot.bootstrap)) return;
    const eventTypes = getAutoPlayCountdownEventTypes(getPlayerApiForKind(kind));
    if (!slot.player?.on || !eventTypes.length) return;
    const handler = () => checkAutoPlayCountdown(kind);
    const bindings = eventTypes.map((eventType) => {
      slot.player.on(eventType, handler);
      return { eventType, handler };
    });
    slot.autoPlayCountdownHandler = { player: slot.player, bindings };
    checkAutoPlayCountdown(kind);
  }

  function stopAutoPlayCountdownMonitor(kind) {
    const slot = state[kind];
    if (!slot) return;
    const binding = slot.autoPlayCountdownHandler;
    if (binding) {
      try {
        binding.bindings?.forEach(({ eventType, handler }) => {
          binding.player?.off?.(eventType, handler);
        });
      } catch {
        // Ignore event cleanup failures.
      }
    }
    slot.autoPlayCountdownHandler = null;
    hideAutoPlayCountdown(kind);
  }

  function checkAutoPlayCountdown(kind) {
    const slot = state[kind];
    if (!slot?.player || isLiveBootstrap(slot.bootstrap) || !state.autoPlayNext || !state.autoPlayCountdown) {
      hideAutoPlayCountdown(kind);
      return;
    }

    if (isPlaybackPaused(kind)) {
      hideAutoPlayCountdown(kind);
      return;
    }

    const key = getCurrentBootstrapPlaybackKey(kind);
    const nextCard = getNextAutoPlayCard(kind);
    if (!key || slot.autoPlayCountdownCanceledKey === key || !nextCard) {
      hideAutoPlayCountdown(kind);
      return;
    }

    const timing = getPlaybackTiming(kind);
    if (!timing) {
      hideAutoPlayCountdown(kind);
      return;
    }

    const remaining = timing.duration - timing.currentTime;
    if (remaining > AUTO_PLAY_COUNTDOWN_SECONDS || remaining <= 0.25) {
      hideAutoPlayCountdown(kind);
      return;
    }

    showAutoPlayCountdown(kind, remaining, key, nextCard);
  }

  function getNextAutoPlayCard(kind) {
    const pageContext = getCurrentPageTraversalContext(kind);
    if (pageContext) {
      return getAdjacentCard(pageContext.cards, 1, {
        findCurrentIndex: () => pageContext.currentIndex,
      });
    }

    const tab = state[kind]?.activeCommentsTab;
    if (tab === 'pages') {
      const pageCards = getPageTraversalCards(state[kind].pageCards);
      return getAdjacentCard(pageCards, 1, {
        selectedKey: state[kind].selectedPageKey,
        getKey: (card) => card.pageKey,
        findCurrentIndex: (cards) => findCurrentPageCardIndex(kind, cards),
      });
    }
    if (tab === 'playlist' || tab === 'comments') {
      return getAdjacentCard(state[kind].playlistCards, 1, {
        selectedKey: state[kind].selectedPlaylistBvid,
        getKey: getPlayableKey,
      });
    }
    if (tab === 'recommend') {
      return getPlayableCard(state[kind]?.recommendationCards?.[0]);
    }
    return null;
  }

  function getPlaybackTiming(kind) {
    const slot = state[kind];
    const player = slot?.player;
    const currentTime = readNumericPlayerValue(player, ['getCurrentTime', 'currentTime', 'time']);
    const duration = readNumericPlayerValue(player, ['getDuration', 'duration']);
    if (Number.isFinite(currentTime) && Number.isFinite(duration) && duration > 0) {
      return { currentTime, duration };
    }

    const video = getPlaybackVideo(kind);
    if (!video) return null;
    const videoCurrent = Number(video.currentTime);
    const videoDuration = Number(video.duration);
    if (!Number.isFinite(videoCurrent) || !Number.isFinite(videoDuration) || videoDuration <= 0) return null;
    return { currentTime: videoCurrent, duration: videoDuration };
  }

  function isPlaybackPaused(kind) {
    const player = state[kind]?.player;
    const values = [
      readBooleanPlayerValue(player, ['isPaused', 'getPaused', 'paused']),
      readBooleanPlayerValue(player, ['isEnded', 'ended']),
      player?.rootStore?.mediaStore?.state?.paused,
      player?.rootStore?.mediaStore?.state?.ended,
      player?.mediaStore?.state?.paused,
      player?.mediaStore?.state?.ended,
    ];
    for (const value of values) {
      if (value === true) return true;
    }
    if (values.some((value) => value === false)) return false;

    const video = getPlaybackVideo(kind);
    return Boolean(video?.paused || video?.ended);
  }

  function readBooleanPlayerValue(player, names) {
    for (const name of names) {
      try {
        const value = typeof player?.[name] === 'function' ? player[name]() : player?.[name];
        if (typeof value === 'boolean') return value;
      } catch {
        // Try the next known surface.
      }
    }
    return null;
  }

  function readNumericPlayerValue(player, names) {
    for (const name of names) {
      try {
        const value = typeof player?.[name] === 'function' ? player[name]() : player?.[name];
        const numeric = Number(value);
        if (Number.isFinite(numeric)) return numeric;
      } catch {
        // Try the next known surface.
      }
    }
    return NaN;
  }

  function getPlaybackVideo(kind) {
    if (kind === 'home') return state.home.ui?.playerRoot?.querySelector?.('video') || null;
    const pipWindow = state.pip.win;
    if (!pipWindow || pipWindow.closed) return null;
    return pipWindow.document?.getElementById('bilibili-player')?.querySelector?.('video') ||
      pipWindow.document?.querySelector?.('video') ||
      null;
  }

  function getCurrentBootstrapPlaybackKey(kind) {
    const bootstrap = state[kind]?.bootstrap;
    if (!bootstrap || isLiveBootstrap(bootstrap)) return '';
    const info = bootstrap.playerInfo || {};
    return [info.bvid || info.aid || '', info.cid || '', info.p || ''].filter(Boolean).join(':');
  }

  function showAutoPlayCountdown(kind, remaining, key, nextCard) {
    const slot = state[kind];
    const host = getAutoPlayCountdownHost(kind);
    const targetDocument = kind === 'pip' && state.pip.win && !state.pip.win.closed
      ? state.pip.win.document
      : document;
    if (!slot || !host || !targetDocument) return;
    if (
      slot.autoPlayCountdownNotice?.isConnected &&
      slot.autoPlayCountdownKey === key &&
      slot.autoPlayCountdownNotice.parentElement === host
    ) return;

    hideAutoPlayCountdown(kind);
    host.style.position = 'relative';
    const notice = targetDocument.createElement('div');
    notice.className = `${APP}__auto-play-countdown`;
    notice.setAttribute('role', 'status');
    const circumference = 62.83;
    const startOffset = circumference * (1 - Math.max(0, Math.min(remaining, AUTO_PLAY_COUNTDOWN_SECONDS)) / AUTO_PLAY_COUNTDOWN_SECONDS);
    notice.style.setProperty(`--${APP}-countdown-duration`, `${Math.max(0.1, remaining)}s`);
    notice.style.setProperty(`--${APP}-countdown-start-offset`, String(startOffset));

    const ring = targetDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ring.setAttribute('viewBox', '0 0 24 24');
    ring.setAttribute('aria-hidden', 'true');
    ring.classList.add(`${APP}__auto-play-countdown-ring`);
    const track = targetDocument.createElementNS('http://www.w3.org/2000/svg', 'circle');
    track.setAttribute('cx', '12');
    track.setAttribute('cy', '12');
    track.setAttribute('r', '10');
    track.classList.add(`${APP}__auto-play-countdown-track`);
    const progress = targetDocument.createElementNS('http://www.w3.org/2000/svg', 'circle');
    progress.setAttribute('cx', '12');
    progress.setAttribute('cy', '12');
    progress.setAttribute('r', '10');
    progress.classList.add(`${APP}__auto-play-countdown-progress`);
    ring.append(track, progress);

    const text = targetDocument.createElement('div');
    text.className = `${APP}__auto-play-countdown-text`;
    const title = targetDocument.createElement('div');
    title.className = `${APP}__auto-play-countdown-title`;
    title.textContent = '即将播放下一个视频';
    const next = targetDocument.createElement('div');
    next.className = `${APP}__auto-play-countdown-next`;
    next.textContent = getCardDisplayTitle(nextCard) || '下一个视频';
    const hint = targetDocument.createElement('div');
    hint.className = `${APP}__auto-play-countdown-hint`;
    hint.textContent = '按 Esc 取消';
    text.append(title, next, hint);
    notice.append(ring, text);
    host.appendChild(notice);
    slot.autoPlayCountdownNotice = notice;
    slot.autoPlayCountdownKey = key;
  }

  function getAutoPlayCountdownHost(kind) {
    if (kind === 'home') {
      const playerRoot = state.home.ui?.playerRoot || null;
      const videoWrap = playerRoot?.querySelector?.('.bpx-player-video-wrap') || null;
      return videoWrap || state.home.ui?.playerWrap || playerRoot;
    }
    if (kind === 'pip') {
      const pipWindow = state.pip.win;
      if (!pipWindow || pipWindow.closed || isLiveBootstrap(state.pip.bootstrap)) return null;
      const playerRoot = pipWindow.document?.getElementById('bilibili-player') || null;
      return playerRoot?.querySelector?.('.bpx-player-video-wrap') ||
        pipWindow.document?.getElementById('stage') ||
        playerRoot ||
        null;
    }
    return null;
  }

  function getCardDisplayTitle(card) {
    return String(card?.title || card?.name || card?.desc || '').trim();
  }

  function hideAutoPlayCountdown(kind) {
    const slot = state[kind];
    if (!slot) return;
    slot.autoPlayCountdownNotice?.remove();
    slot.autoPlayCountdownNotice = null;
    slot.autoPlayCountdownKey = '';
  }

  function cancelAutoPlayCountdown(kind) {
    const slot = state[kind];
    if (!slot?.autoPlayCountdownNotice?.isConnected) return false;
    slot.autoPlayCountdownCanceledKey = getCurrentBootstrapPlaybackKey(kind) || slot.autoPlayCountdownKey;
    hideAutoPlayCountdown(kind);
    showLikeBurst(kind, '已取消自动切换', 'neutral', { icon: false });
    return true;
  }

  function getAutoPlayCountdownEventTypes(playerApi) {
    const eventType = playerApi?.EventType || {};
    return [
      eventType.Player_TimeUpdate,
      eventType.Player_DurationChange,
      eventType.Player_Play,
      eventType.Player_Seeked,
      eventType.Player_Pause,
      eventType.Player_Ended,
      eventType.Player_LoadStart,
    ].filter(Boolean);
  }

  function getPlayerNavigationEventTypes(playerApi) {
    const eventType = playerApi?.EventType || {};
    return [
      { eventType: eventType.Player_Navigate, delay: 240 },
      { eventType: eventType.Player_LoadStart, delay: 120 },
      { eventType: eventType.Player_PlayUrl_Done, delay: 80 },
      { eventType: eventType.Player_Prepared, delay: 40 },
      { eventType: eventType.Player_Committed, delay: 0 },
    ].filter((item) => item.eventType);
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
    const meta = getPlayableKey(fallbackMeta) ? fallbackMeta : currentMeta;
    if (!getPlayableKey(meta) || isCurrentBootstrapPlayback(slot.bootstrap, meta)) {
      schedulePlayerHandoffAvailabilitySync(kind);
      return;
    }

    const player = slot.player;
    const token = ++state.switchToken;
    try {
      const bootstrap = await resolvePlaybackBootstrap(meta);
      if (token !== state.switchToken || slot.player !== player) return;
      if (!getPlayableKey(fallbackMeta) && !isCurrentPlayerMeta(kind, meta)) return;
      applyInternalPlayerNavigation(kind, meta, bootstrap, token);
    } catch (error) {
      if (kind === 'home' && state.home.ui?.status) state.home.ui.status.textContent = `播放器内部换源同步失败：${error?.message || 'unknown'}`;
      if (kind === 'pip') setPipStatus(`换源同步失败：${error?.message || 'unknown'}`);
    }
  }

  function applyInternalPlayerNavigation(kind, meta, bootstrap, token) {
    state[kind].bootstrap = bootstrap;
    const ogv = isOgvBootstrap(bootstrap);
    saveLastPlayed(meta, bootstrap);
    recordPlaybackHistory({ ...meta, fromInternalPlayer: true }, bootstrap);
    syncPlaybackPageMeta(kind, bootstrap);
    setOgvListMode(kind, ogv);
    if (ogv) {
      setSelectedPageKey(kind, meta.pageKey || getSelectedOgvPageKey(bootstrap));
      state[kind].playlistCards = [];
    } else {
      setSelectedPlaylistBvid(kind, bootstrap.playerInfo?.bvid || meta.bvid);
      renderPlaylist(kind);
    }
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
    if (info.epId || (isOgvBootstrap(slot?.bootstrap) && info.seasonId)) {
      const epId = info.epId || slot?.bootstrap?.playerInfo?.epId || '';
      const seasonId = info.seasonId || slot?.bootstrap?.playerInfo?.seasonId || '';
      const href = epId
        ? `https://www.bilibili.com/bangumi/play/ep${epId}`
        : seasonId
          ? `https://www.bilibili.com/bangumi/play/ss${seasonId}`
          : slot?.bootstrap?.href;
      return {
        kind: 'ogv',
        aid: info.aid,
        bvid: info.bvid,
        cid: info.cid,
        seasonId,
        epId,
        href,
        title: info.title || slot?.bootstrap?.title || `Bilibili 番剧 ${epId || seasonId}`,
      };
    }
    if (!info.bvid) return null;
    const href = buildPlaybackHref(info.bvid, info.p);
    return {
      bvid: info.bvid,
      href,
      p: Number.isInteger(info.p) && info.p > 0 ? info.p : 1,
      title: info.title || info.bvid,
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
      seasonId: readFirstStoreValue(store, ['seasonId', 'season_id']) ||
        story.seasonId || story.season_id || input.seasonId || input.season_id || primary.seasonId || primary.season_id,
      epId: readFirstStoreValue(store, ['epId', 'ep_id', 'episodeId', 'episode_id']) ||
        story.epId || story.ep_id || story.episodeId || story.episode_id ||
        input.epId || input.ep_id || input.episodeId || input.episode_id ||
        primary.epId || primary.ep_id || primary.episodeId || primary.episode_id,
      p: Number(readStoreValue(store, 'p') || story.p || input.p || primary.p || 1),
      title: String(story.title || primary.title || '').trim(),
    };
  }

  function readStoreValue(store, key) {
    return store?.[key] ?? store?.state?.[key] ?? store?.input?.[key] ?? store?.primary?.[key];
  }

  function readFirstStoreValue(store, keys) {
    for (const key of keys) {
      const value = readStoreValue(store, key);
      if (value != null && value !== '') return value;
    }
    return undefined;
  }

  function buildPlaybackHref(bvid, page) {
    const url = new URL(`/video/${bvid}/`, 'https://www.bilibili.com');
    const pageNo = Number(page);
    if (Number.isInteger(pageNo) && pageNo > 1) url.searchParams.set('p', String(pageNo));
    return url.href;
  }

  function isCurrentPlayerMeta(kind, meta) {
    const current = getPlayerNavigationMeta(kind);
    const currentKey = getPlayableKey(current);
    const metaKey = getPlayableKey(meta);
    return Boolean(currentKey && metaKey && currentKey === metaKey);
  }

  function isCurrentBootstrapPlayback(bootstrap, meta) {
    if (isOgvMeta(meta) || isOgvBootstrap(bootstrap)) {
      const info = bootstrap?.playerInfo || {};
      const metaEpId = Number(meta?.epId || 0);
      const infoEpId = Number(info.epId || 0);
      if (metaEpId && infoEpId) return metaEpId === infoEpId;
      const metaCid = Number(meta?.cid || 0);
      if (metaCid) return Number(info.cid || 0) === metaCid;
      const metaSeasonId = Number(meta?.seasonId || 0);
      return Boolean(metaSeasonId && Number(info.seasonId || 0) === metaSeasonId && !infoEpId);
    }
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
    const pageContext = getCurrentPageTraversalContext(kind);
    if (pageContext) return getCardHandoffAvailability(pageContext.cards, pageContext.currentIndex);

    const tab = state[kind]?.activeCommentsTab;
    if (tab === 'pages') {
      const pageCards = getPageTraversalCards(state[kind].pageCards);
      return getCardHandoffAvailability(pageCards, findCurrentPageCardIndex(kind, pageCards));
    }
    if (tab === 'playlist' || tab === 'comments') {
      return getCardHandoffAvailability(
        state[kind].playlistCards,
        findSelectedCardIndex(state[kind].playlistCards, state[kind].selectedPlaylistBvid, getPlayableKey),
      );
    }
    if (tab === 'live') {
      return getCardHandoffAvailability(
        state[kind].liveCards,
        findSelectedCardIndex(state[kind].liveCards, state[kind].selectedLiveKey, getPlayableKey),
      );
    }
    if (tab === 'recommend') {
      return {
        hasPrev: false,
        hasNext: Boolean(state[kind].recommendationCards?.length),
      };
    }
    return null;
  }

  function getCardHandoffAvailability(cards, currentIndex) {
    if (!Array.isArray(cards) || !cards.length) return { hasPrev: false, hasNext: false };
    if (currentIndex < 0) return { hasPrev: false, hasNext: true };
    return {
      hasPrev: currentIndex > 0,
      hasNext: currentIndex < cards.length - 1,
    };
  }

  function applyPlayerHandoffAvailability(player, availability) {
    if (!player || !availability) return;
    const next = {
      hasPrev: Boolean(availability.hasPrev),
      hasNext: Boolean(availability.hasNext),
    };

    trySetPlayerStoreState(player?.rootStore?.episodeStore, next);
    trySetPlayerStoreState(player?.episodeStore, next);

    const configStores = [
      player?.rootStore?.configStore,
      player?.configStore,
    ];
    configStores.forEach((store) => {
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
    const pageContext = options.preferPageTree ? getCurrentPageTraversalContext(kind) : null;
    if (pageContext) return playAdjacentCard(kind, pageContext.cards, direction, {
      ...options,
      selectedKey: state[kind].selectedPageKey,
      getKey: (card) => card.pageKey,
      findCurrentIndex: () => pageContext.currentIndex,
      fromPagePart: true,
    });
    if (tab === 'pages') return playAdjacentCard(kind, getPageTraversalCards(state[kind].pageCards), direction, {
      ...options,
      selectedKey: state[kind].selectedPageKey,
      getKey: (card) => card.pageKey,
      findCurrentIndex: (cards) => findCurrentPageCardIndex(kind, cards),
      fromPagePart: true,
    });
    if (tab === 'playlist' || tab === 'comments') return playAdjacentCard(kind, state[kind].playlistCards, direction, {
      ...options,
      selectedKey: state[kind].selectedPlaylistBvid,
      getKey: getPlayableKey,
      fromPlaylist: true,
    });
    if (tab === 'live') return playAdjacentCard(kind, state[kind].liveCards, direction, {
      ...options,
      selectedKey: state[kind].selectedLiveKey,
      getKey: getPlayableKey,
      fromLiveList: true,
    });
    if (tab === 'recommend') return playFirstRecommendation(kind, options);
    return false;
  }

  function isBvidInCurrentPageCards(kind, bvid) {
    if (!bvid) return false;
    return flattenPageCards(state[kind]?.pageCards).some((card) => card?.bvid === bvid) || false;
  }

  function isMetaInCurrentPageCards(kind, meta) {
    const key = getPlayableKey(meta);
    if (!key && !meta?.pageKey) return false;
    return flattenPageCards(state[kind]?.pageCards).some((card) => (
      (meta.pageKey && card?.pageKey === meta.pageKey) ||
      (key && getPlayableKey(card) === key)
    ));
  }

  function isBvidInCurrentPlaylist(kind, bvid) {
    if (!bvid) return false;
    return state[kind]?.playlistCards?.some((card) => card?.bvid === bvid) || false;
  }

  function playAdjacentCard(kind, cards, direction, options = {}) {
    const card = getAdjacentCard(cards, direction, options);
    if (!card) return false;
    if (options.dryRun) return true;
    const targetIndex = cards.indexOf(card);
    maybePrefetchHomePlaylistForContinuation(kind, cards, targetIndex, options);
    const renderer = kind === 'pip' ? pipRenderer : homeRenderer;
    openWithRenderer(renderer, {
      ...card,
      fromPagePart: Boolean(options.fromPagePart),
      fromPlaylist: Boolean(options.fromPlaylist),
      fromLiveList: Boolean(options.fromLiveList),
    });
    return true;
  }

  function getAdjacentCard(cards, direction, options = {}) {
    if (!Array.isArray(cards) || !cards.length) return null;
    const offset = Number(direction);
    if (!Number.isInteger(offset)) return null;

    const currentIndex = typeof options.findCurrentIndex === 'function'
      ? options.findCurrentIndex(cards)
      : findSelectedCardIndex(cards, options.selectedKey, options.getKey);
    const targetIndex = options.absolute
      ? offset - 1
      : currentIndex + offset;
    if (targetIndex < 0 || targetIndex >= cards.length) return null;
    return getPlayableCard(cards[targetIndex]);
  }

  function getPlayableCard(card) {
    return getPlayableKey(card) && card.href ? card : null;
  }

  function getPageTraversalCards(cards) {
    return flattenPageTraversalCards(cards).filter(getPlayableCard);
  }

  function flattenPageTraversalCards(cards) {
    return (Array.isArray(cards) ? cards : []).flatMap((card) => {
      const children = Array.isArray(card?.children) ? card.children.filter(Boolean) : [];
      return children.length ? children : [card];
    }).filter(Boolean);
  }

  function getCurrentPageTraversalContext(kind) {
    const cards = getPageTraversalCards(state[kind]?.pageCards);
    if (!cards.length) return null;
    const currentIndex = findCurrentPageCardIndex(kind, cards);
    return currentIndex >= 0 ? { cards, currentIndex } : null;
  }

  function flattenPageCards(cards) {
    return (Array.isArray(cards) ? cards : []).flatMap((card) => [
      card,
      ...(Array.isArray(card?.children) ? card.children : []),
    ]).filter(Boolean);
  }

  function maybePrefetchHomePlaylistForContinuation(kind, cards, targetIndex, options = {}) {
    if (kind !== 'home' || !options.fromPlaylist) return;
    if (!isHomeFeedPage()) return;
    const remaining = cards.length - targetIndex - 1;
    if (remaining > PLAYLIST_CONTINUATION_PREFETCH_REMAINING) return;
    void maybeLoadMorePlaylist('home', {
      force: true,
      ignoreActiveTab: true,
    });
  }

  function findSelectedCardIndex(cards, selectedKey, getKey) {
    if (selectedKey && typeof getKey === 'function') {
      const selectedIndex = cards.findIndex((card) => getKey(card) === selectedKey);
      if (selectedIndex >= 0) return selectedIndex;
    }
    return -1;
  }

  function playFirstRecommendation(kind, options = {}) {
    const card = state[kind]?.recommendationCards?.[0];
    if (!getPlayableKey(card) || !card.href) return false;
    if (options.dryRun) return true;
    const renderer = kind === 'pip' ? pipRenderer : homeRenderer;
    openWithRenderer(renderer, card);
    return true;
  }

  function findCurrentPageCardIndex(kind, cards) {
    const selectedKey = state[kind]?.selectedPageKey;
    const selectedIndex = selectedKey
      ? cards.findIndex((card) => card.pageKey === selectedKey)
      : -1;
    if (selectedIndex >= 0) return selectedIndex;

    const info = state[kind]?.bootstrap?.playerInfo || {};
    const epId = Number(info.epId || 0);
    if (epId) {
      const epIndex = cards.findIndex((card) => Number(card.epId || 0) === epId);
      if (epIndex >= 0) return epIndex;
    }
    const cid = Number(info.cid || 0);
    if (cid) {
      const cidIndex = cards.findIndex((card) => Number(card.cid || 0) === cid);
      if (cidIndex >= 0) return cidIndex;
    }
    const bvid = info.bvid;
    const page = Number(info.p || 1);
    const exactIndex = cards.findIndex((card) => (
      card.bvid === bvid &&
      Number(card.page || 1) === page
    ));
    if (exactIndex >= 0) return exactIndex;

    const bvidIndex = bvid ? cards.findIndex((card) => card.bvid === bvid) : -1;
    return bvidIndex >= 0 ? bvidIndex : -1;
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
        schedulePipBottomFixedWrapperSync(targetWindow);
        schedulePipLayoutSync(targetWindow);
      }, { passive: true });
    }
    const panels = [...(targetWindow.document?.querySelectorAll?.('#comments-panel, #pages-panel, #playlist-panel, #recommend-panel') || [])];
    panels.forEach((panel) => {
      if (panel.__biliPopupPlayerNanoScrollSyncBound) return;
      panel.__biliPopupPlayerNanoScrollSyncBound = true;
      panel.addEventListener('scroll', () => {
        syncPipBackToTopButton(targetWindow);
        schedulePipBottomFixedWrapperSync(targetWindow);
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
    const kind = targetWindow === window ? 'home' : 'pip';
    if (getCommentLayout(kind) !== 'right') return;
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
      setCommentWidth(kind, calculateCommentWidthFromPointer(kind, moveEvent.clientX, targetWindow));
    };
    const onEnd = () => {
      overlay?.classList.remove(`${APP}--resizing`);
      doc.body?.classList.remove('resizing-comments');
      doc.removeEventListener('pointermove', onMove, true);
      doc.removeEventListener('pointerup', onEnd, true);
      doc.removeEventListener('pointercancel', onEnd, true);
      setStorageItem(getCommentWidthStorageKey(kind), String(getCommentWidth(kind)));
    };

    doc.addEventListener('pointermove', onMove, true);
    doc.addEventListener('pointerup', onEnd, true);
    doc.addEventListener('pointercancel', onEnd, true);
    onMove(event);
  }

  function calculateCommentWidthFromPointer(kind, clientX, targetWindow) {
    const container = targetWindow === window
      ? state.home.ui?.content
      : targetWindow.document?.getElementById('layout');
    const rect = container?.getBoundingClientRect();
    if (!rect) return getCommentWidth(kind);
    return clampCommentWidth(rect.right - clientX, rect.width);
  }

  function setCommentWidth(kind, width) {
    const next = clampCommentWidth(width);
    if (next === getCommentWidth(kind)) return;
    setCommentWidthValue(kind, next);
    syncCommentWidth(kind);
  }

  function fitHomeLayout() {
    const ui = state.home.ui;
    if (!ui?.dialog || !ui.content) return;

    if (getCommentLayout('home') === 'right') {
      const rect = ui.content.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const targetPlayerWidth = Math.round(Math.max(1, (rect.height - getHomePlayerChromeHeight()) * 16 / 9));
      const nextWidth = clampCommentWidth(
        rect.width - MODAL_COMMENTS_RESIZER_WIDTH - targetPlayerWidth,
        rect.width,
      );
      state.homeCommentWidth = nextWidth;
      setStorageItem(STORAGE_HOME_COMMENT_WIDTH, String(state.homeCommentWidth));
      syncCommentWidth('home');
      return;
    }

    if (state.home.overlay?.classList.contains(`${APP}--fullscreen`)) {
      syncHomeSize();
      return;
    }

    const rect = ui.dialog.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    state.modalSize = fitHomeModalSizeToPlayerRatio({
      width: rect.width,
      height: rect.height,
    }, 'width');
    setStorageItem(STORAGE_MODAL_SIZE, JSON.stringify(state.modalSize));
    syncHomeSize();
    syncHomeModalSizeButton();
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

  function isOgvMeta(meta) {
    return meta?.kind === 'ogv' || Boolean(meta?.epId || meta?.seasonId || /\/bangumi\/play\/(?:ss|ep)\d+/.test(String(meta?.href || '')));
  }

  function isOgvBootstrap(bootstrap) {
    return bootstrap?.kind === 'ogv' || bootstrap?.playerInfo?.kind === 'ogv';
  }

  function getBootstrapPlaybackKind(bootstrap) {
    if (!bootstrap) return '';
    if (isLiveBootstrap(bootstrap)) return 'live';
    if (isOgvBootstrap(bootstrap)) return 'ogv';
    return 'video';
  }

  function getSelectedOgvPageKey(bootstrap) {
    const info = bootstrap?.playerInfo || {};
    const seasonId = info.seasonId || '';
    const epId = info.epId || info.cid || '';
    return ['ogv', seasonId, epId].filter(Boolean).join(':');
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
    const playbackId = getPlaybackIdentity(meta, bootstrap);
    const href = bootstrap.href || meta.href;
    if (!playbackId || !href) return;
    const next = {
      id: playbackId,
      kind: bootstrap.kind || meta.kind || 'video',
      aid: bootstrap.playerInfo?.aid || meta.aid,
      bvid: bootstrap.playerInfo?.bvid || meta.bvid,
      cid: bootstrap.playerInfo?.cid || meta.cid,
      p: bootstrap.playerInfo?.p || meta.p || meta.page,
      seasonId: bootstrap.playerInfo?.seasonId || meta.seasonId,
      epId: bootstrap.playerInfo?.epId || meta.epId,
      roomId: bootstrap.playerInfo?.roomId || meta.roomId,
      href,
      title: bootstrap.title || meta.title,
      savedAt: Date.now(),
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
    const previousKey = previous?.id || getPlayableKey(previous);
    const nextKey = next?.id || getPlayableKey(next);
    if (!previousKey || !nextKey) return false;
    return previousKey !== nextKey;
  }

  function recordPlaybackHistory(meta, bootstrap) {
    const playbackId = getPlaybackIdentity(meta, bootstrap);
    const bvid = bootstrap.playerInfo?.bvid || meta.bvid;
    const roomId = bootstrap.playerInfo?.roomId || meta.roomId;
    const seasonId = bootstrap.playerInfo?.seasonId || meta.seasonId;
    const epId = bootstrap.playerInfo?.epId || meta.epId;
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
      aid: bootstrap.playerInfo?.aid || meta.aid,
      bvid,
      cid: bootstrap.playerInfo?.cid || meta.cid,
      p: bootstrap.playerInfo?.p || meta.p || meta.page,
      seasonId,
      epId,
      roomId,
      href,
      title: bootstrap.title || meta.title || bvid || (epId ? `番剧 ${epId}` : seasonId ? `番剧 ${seasonId}` : `直播 ${roomId}`),
    };
    const history = state.playbackHistory;
    const current = history.entries[history.index];
    if (current?.id === next.id || (next.roomId && current?.roomId === next.roomId)) {
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
    if (isLiveMeta(meta) || isLiveBootstrap(bootstrap)) {
      const roomId = String(meta?.roomId || '');
      const info = bootstrap?.playerInfo || {};
      return Boolean(roomId && (roomId === String(info.roomId || '') || roomId === String(info.shortId || '')));
    }
    if (isOgvMeta(meta) || isOgvBootstrap(bootstrap)) {
      const info = bootstrap?.playerInfo || {};
      const metaEpId = Number(meta?.epId || 0);
      if (metaEpId) return Number(info.epId || 0) === metaEpId;
      const metaCid = Number(meta?.cid || 0);
      if (metaCid) return Number(info.cid || 0) === metaCid;
      const metaSeasonId = Number(meta?.seasonId || 0);
      return Boolean(metaSeasonId && Number(info.seasonId || 0) === metaSeasonId && !info.epId);
    }
    const info = bootstrap?.playerInfo || {};
    if (!meta?.bvid || !info.bvid || meta.bvid !== info.bvid) return false;
    const metaCid = Number(meta.cid || 0);
    if (metaCid) return Number(info.cid || 0) === metaCid;
    const metaPage = Number(meta.p || meta.page || 0);
    if (metaPage) return Number(info.p || 1) === metaPage;
    return true;
  }

  function getPlaybackIdentity(meta, bootstrap) {
    if (isLiveMeta(meta) || isLiveBootstrap(bootstrap)) {
      const roomId = bootstrap?.playerInfo?.roomId || meta?.roomId;
      return roomId ? `live:${roomId}` : '';
    }
    if (isOgvMeta(meta) || isOgvBootstrap(bootstrap)) {
      const info = bootstrap?.playerInfo || {};
      const epId = info.epId || meta?.epId;
      if (epId) return `ogv:ep:${epId}`;
      const seasonId = info.seasonId || meta?.seasonId;
      if (seasonId) return `ogv:ss:${seasonId}`;
      const cid = info.cid || meta?.cid;
      return cid ? `ogv:cid:${cid}` : '';
    }
    const info = bootstrap?.playerInfo || {};
    const bvid = info.bvid || meta?.bvid;
    if (!bvid) return '';
    const cid = info.cid || meta?.cid;
    if (cid) return `video:${bvid}:${cid}`;
    const page = Number(info.p || meta?.p || meta?.page || 0);
    return page > 1 ? `video:${bvid}:p${page}` : `video:${bvid}`;
  }

  function updateDebug(primarySetting, bootstrap) {
    pageWindow.__biliPopupPlayerNanoDebug = {
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

    const onMove = (moveEvent) => {
      moveEvent.preventDefault();
      const axis = Math.abs(moveEvent.clientY - startY) > Math.abs(moveEvent.clientX - startX) ? 'height' : 'width';
      setHomeModalSize({
        width: startWidth + moveEvent.clientX - startX,
        height: startHeight + moveEvent.clientY - startY,
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
    const { minWidth, maxWidth, minHeight, maxHeight } = getHomeModalSizeBounds();
    return {
      width: Math.round(Math.min(maxWidth, Math.max(minWidth, fallbackWidth))),
      height: Math.round(Math.min(maxHeight, Math.max(minHeight, fallbackHeight))),
    };
  }

  function fitHomeModalSizeToPlayerRatio(size, axis = 'width') {
    const bounds = getHomeModalSizeBounds();
    const extraWidth = getHomeModalExtraWidth();
    const extraHeight = MODAL_HEADER_HEIGHT + getHomePlayerChromeHeight();
    const width = Number(size?.width);
    const height = Number(size?.height);
    const fallbackPlayerWidth = Math.max(1, getDefaultHomeModalWidth() - extraWidth);
    const requestedPlayerWidth = axis === 'height'
      ? ((Number.isFinite(height) ? height : MODAL_HEIGHT_DEFAULT) - extraHeight) * 16 / 9
      : (Number.isFinite(width) ? width : getDefaultHomeModalWidth()) - extraWidth;
    const playerMinByWidth = Math.max(1, bounds.minWidth - extraWidth);
    const playerMaxByWidth = Math.max(1, bounds.maxWidth - extraWidth);
    const playerMinByHeight = Math.max(1, (bounds.minHeight - extraHeight) * 16 / 9);
    const playerMaxByHeight = Math.max(1, (bounds.maxHeight - extraHeight) * 16 / 9);
    const playerMax = Math.max(1, Math.min(playerMaxByWidth, playerMaxByHeight));
    const playerMin = Math.min(playerMax, Math.max(playerMinByWidth, playerMinByHeight));
    const playerWidth = Math.min(
      playerMax,
      Math.max(playerMin, Number.isFinite(requestedPlayerWidth) ? requestedPlayerWidth : fallbackPlayerWidth),
    );
    return {
      width: Math.round(playerWidth + extraWidth),
      height: Math.round((playerWidth * 9) / 16 + extraHeight),
    };
  }

  function getHomeModalSizeBounds() {
    const maxWidth = Math.max(1, window.innerWidth - getHomeModalInlineMargin() * 2);
    const maxHeight = Math.max(1, window.innerHeight - getHomeModalBlockMargin());
    return {
      maxWidth,
      maxHeight,
      minWidth: Math.min(MODAL_WIDTH_MIN, maxWidth),
      minHeight: Math.min(MODAL_HEIGHT_MIN, maxHeight),
    };
  }

  function getHomeModalInlineMargin() {
    return Math.min(
      MODAL_INLINE_MARGIN_MAX,
      Math.max(MODAL_INLINE_MARGIN_MIN, window.innerWidth * MODAL_INLINE_MARGIN_RATIO),
    );
  }

  function getHomeModalBlockMargin() {
    return Math.min(
      MODAL_BLOCK_MARGIN_MAX,
      Math.max(MODAL_BLOCK_MARGIN_MIN, window.innerHeight * MODAL_BLOCK_MARGIN_RATIO),
    );
  }

  function getDefaultHomeModalWidth() {
    return Math.max(1, window.innerWidth - getHomeModalInlineMargin() * 2);
  }

  function getHomeModalExtraWidth() {
    return getCommentLayout('home') === 'right' && window.innerWidth > 900
      ? state.homeCommentWidth + MODAL_COMMENTS_RESIZER_WIDTH
      : 0;
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
        height: MODAL_HEIGHT_DEFAULT,
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
    if (state.autoPlayNext && state.autoPlayCountdown) {
      if (state.home.player) startAutoPlayCountdownMonitor('home');
      if (state.pip.player) startAutoPlayCountdownMonitor('pip');
    } else {
      stopAutoPlayCountdownMonitor('home');
      stopAutoPlayCountdownMonitor('pip');
    }
  }

  function onAutoPlayCountdownChange(value) {
    state.autoPlayCountdown = Boolean(value);
    if (state.autoPlayCountdown && state.autoPlayNext) {
      if (state.home.player) startAutoPlayCountdownMonitor('home');
      if (state.pip.player) startAutoPlayCountdownMonitor('pip');
    } else {
      stopAutoPlayCountdownMonitor('home');
      stopAutoPlayCountdownMonitor('pip');
    }
  }

  function syncAutoPlayNextButton() {
    const button = state.home.ui?.autoPlayNext;
    if (!button) return;
    button.hidden = Boolean(state.home.liveListMode);
    if (state.home.liveListMode) return;
    const active = Boolean(state.autoPlayNext);
    button.classList.toggle(`${APP}__header-button--active`, active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.title = active
      ? '自动联播已开启：按当前右侧标签继续播放。按 J / L 手动切换'
      : '自动联播已关闭。按 J / L 手动切换';
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
    if (getCommentLayout('home') === 'right') {
      ui.playerWrap.style.height = '';
      syncHomeModalSizeButton();
      return;
    }

    const availableWidth = ui.content.clientWidth;
    if (!availableWidth) return;

    const headerHeight = 46;
    const desiredHeight = Math.round((availableWidth * 9) / 16 + getHomePlayerChromeHeight());

    const availableHeight = fullscreen
      ? ui.content.clientHeight || window.innerHeight
      : Math.max(1, modalSize.height - headerHeight);
    ui.playerWrap.style.height = `${Math.min(desiredHeight, availableHeight)}px`;
    syncHomeModalSizeButton();
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
    const root = targetWindow.document?.getElementById('bilibili-player') ||
      targetWindow.document?.getElementById('live-player');
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
      themeClassMarkup: getPipThemeClassMarkup(),
    }));
  }

  function writePipError(pipWindow, error, href) {
    disposePipPlayer();
    disposePipComments();
    writePipDocument(pipWindow, renderPipErrorDocument({
      error,
      href,
      stylesheets: getBiliThemeStylesheets(),
      themeClassMarkup: getPipThemeClassMarkup(),
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
    restoreExternalPlaybackPagePlayer();
    stopAutoPlayCountdownMonitor('home');
    document.documentElement.style.overflow = '';
    document.body.classList.remove(`${APP}--modal-open`);
    document.removeEventListener('keydown', onKeydown, true);
    if (!state.pip.player) stopGamepadControls();
    restoreOriginalPageMeta();
    if (state.lastFocus?.isConnected) state.lastFocus.focus({ preventScroll: true });
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      if (cancelAutoPlayCountdown('home')) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        return;
      }
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
    if (key === 'escape') {
      if (cancelAutoPlayCountdown('pip')) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
      }
      return;
    }
    if (key !== 'k') return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    void likeCurrentPlayback('pip');
  }

  function startGamepadControls() {
    if (!state.gamepadControlsEnabled || state.gamepadFrame || !navigator.getGamepads) {
      syncGamepadIndicator();
      return;
    }
    updateGamepadConnectionState([...navigator.getGamepads()].some(Boolean));
    state.gamepadFrame = window.requestAnimationFrame(pollGamepadControls);
  }

  function stopGamepadControls() {
    if (state.gamepadFrame) {
      window.cancelAnimationFrame(state.gamepadFrame);
      state.gamepadFrame = 0;
    }
    state.gamepadButtons.clear();
    state.gamepadRepeatAt.clear();
  }

  function onGamepadConnectionChanged() {
    const connected = Boolean(navigator.getGamepads && [...navigator.getGamepads()].some(Boolean));
    updateGamepadConnectionState(connected);
    if (state.gamepadControlsEnabled && connected && getActiveGamepadKind()) startGamepadControls();
  }

  function updateGamepadConnectionState(connected) {
    const next = Boolean(connected);
    if (state.gamepadConnected === next) return false;
    state.gamepadConnected = next;
    state.gamepadIgnoreInput = next;
    if (!next) {
      state.gamepadButtons.clear();
      state.gamepadRepeatAt.clear();
    }
    syncGamepadIndicator();
    return true;
  }

  function syncGamepadIndicator() {
    const indicator = state.home.ui?.gamepadIndicator;
    if (!indicator) return;
    indicator.classList.toggle(`${APP}--disabled`, !state.gamepadControlsEnabled);
    indicator.classList.toggle(`${APP}--connected`, state.gamepadConnected);
    indicator.title = !state.gamepadControlsEnabled
      ? '手柄控制已禁用'
      : state.gamepadConnected
        ? '手柄已连接'
        : '手柄未连接';
    indicator.setAttribute('aria-label', indicator.title);
  }

  function pollGamepadControls(now) {
    state.gamepadFrame = 0;
    if (!state.gamepadControlsEnabled) {
      stopGamepadControls();
      syncGamepadIndicator();
      return;
    }
    const kind = getActiveGamepadKind();
    if (!kind) {
      stopGamepadControls();
      return;
    }

    const gamepads = navigator.getGamepads?.() || [];
    const connected = gamepads.some(Boolean);
    const connectionChanged = updateGamepadConnectionState(connected);
    if (!connected) {
      state.gamepadFrame = window.requestAnimationFrame(pollGamepadControls);
      return;
    }
    if (connectionChanged || state.gamepadIgnoreInput) {
      primeGamepadButtons(gamepads);
      state.gamepadIgnoreInput = false;
      state.gamepadFrame = window.requestAnimationFrame(pollGamepadControls);
      return;
    }

    for (const gamepad of gamepads) {
      if (!gamepad) continue;
      handleGamepadButton(kind, gamepad, 0, 'toggle-play', now, false);
      handleGamepadButton(kind, gamepad, 1, 'arrow-right', now, true);
      handleGamepadButton(kind, gamepad, 2, 'arrow-left', now, true);
      handleGamepadButton(kind, gamepad, 3, 'video-fullscreen', now, false);
      handleGamepadButton(kind, gamepad, 4, 'previous-tab', now, false);
      handleGamepadButton(kind, gamepad, 5, 'next-tab', now, false);
      handleGamepadButton(kind, gamepad, 6, 'previous', now, false);
      handleGamepadButton(kind, gamepad, 7, 'next', now, false);
      handleGamepadButton(kind, gamepad, 9, 'web-fullscreen', now, false);
      handleGamepadAxes(kind, gamepad);
    }
    state.gamepadFrame = window.requestAnimationFrame(pollGamepadControls);
  }

  function primeGamepadButtons(gamepads) {
    state.gamepadButtons.clear();
    state.gamepadRepeatAt.clear();
    for (const gamepad of gamepads) {
      if (!gamepad) continue;
      [0, 1, 2, 3, 4, 5, 6, 7, 9].forEach((buttonIndex) => {
        state.gamepadButtons.set(`${gamepad.index}:${buttonIndex}`, Boolean(gamepad.buttons?.[buttonIndex]?.pressed));
      });
    }
  }

  function getActiveGamepadKind() {
    if (isHomeShellOpen() && state.home.player) return 'home';
    if (state.pip.player && state.pip.win && !state.pip.win.closed) return 'pip';
    return '';
  }

  function handleGamepadButton(kind, gamepad, buttonIndex, action, now, repeat) {
    const key = `${gamepad.index}:${buttonIndex}`;
    const pressed = Boolean(gamepad.buttons?.[buttonIndex]?.pressed);
    const wasPressed = state.gamepadButtons.get(key) === true;
    state.gamepadButtons.set(key, pressed);
    if (!pressed) {
      if (wasPressed && isGamepadKeyboardAction(action)) dispatchGamepadKeyboard(kind, action, 'keyup', false);
      state.gamepadRepeatAt.delete(key);
      return;
    }

    if (!wasPressed) {
      runGamepadAction(kind, action, false);
      if (repeat) state.gamepadRepeatAt.set(key, now + GAMEPAD_REPEAT_DELAY_MS);
      return;
    }

    if (!repeat) return;
    const repeatAt = state.gamepadRepeatAt.get(key) || 0;
    if (now < repeatAt) return;
    runGamepadAction(kind, action, true);
    state.gamepadRepeatAt.set(key, now + GAMEPAD_REPEAT_INTERVAL_MS);
  }

  function runGamepadAction(kind, action, repeat = false) {
    if (action === 'next' || action === 'previous') {
      const direction = action === 'next' ? 1 : -1;
      if (playAdjacentFromActiveTab(kind, direction)) showSwitchBurst(kind, direction);
      return;
    }
    if (action === 'next-tab' || action === 'previous-tab') {
      switchCommentsTabByGamepad(kind, action === 'next-tab' ? 1 : -1);
      return;
    }
    if (action === 'web-fullscreen') {
      toggleGamepadWebFullscreen(kind);
      return;
    }
    if (action === 'video-fullscreen') {
      dispatchGamepadVideoFullscreenKey(kind);
      return;
    }
    if (action === 'toggle-play') {
      dispatchGamepadKeyboard(kind, action, 'keydown', false);
      dispatchGamepadKeyboard(kind, action, 'keyup', false);
      return;
    }
    if (isGamepadKeyboardAction(action)) {
      dispatchGamepadKeyboard(kind, action, 'keydown', repeat);
    }
  }

  function toggleGamepadWebFullscreen(kind) {
    if (kind !== 'home' || !state.home.overlay) return;
    setHomeFullscreen(!state.home.overlay.classList.contains(`${APP}--fullscreen`));
  }

  function handleGamepadAxes(kind, gamepad) {
    const vertical = Math.abs(gamepad.axes?.[3] || 0) > Math.abs(gamepad.axes?.[1] || 0)
      ? Number(gamepad.axes?.[3] || 0)
      : Number(gamepad.axes?.[1] || 0);
    if (!Number.isFinite(vertical) || Math.abs(vertical) < GAMEPAD_STICK_DEADZONE) return;
    const container = getGamepadScrollContainer(kind);
    if (!container) return;
    container.scrollBy?.({ top: vertical * GAMEPAD_SCROLL_SPEED, behavior: 'auto' });
  }

  function switchCommentsTabByGamepad(kind, direction) {
    const tabs = getVisibleCommentsTabButtons(kind);
    if (!tabs.length) return;
    const currentIndex = Math.max(0, tabs.findIndex((button) => button.dataset.tab === state[kind]?.activeCommentsTab));
    const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
    tabs[nextIndex]?.click?.();
  }

  function getVisibleCommentsTabButtons(kind) {
    const root = kind === 'pip'
      ? state.pip.win?.document?.querySelector?.(`.${APP}__comments-tabs`)
      : state.home.ui?.commentsTabs;
    return [...(root?.querySelectorAll?.(`.${APP}__comments-tab`) || [])]
      .filter((button) => !button.hidden && button.offsetParent !== null);
  }

  function getGamepadScrollContainer(kind) {
    if (kind === 'pip') return getPipCommentsScrollContainer(state.pip.win);
    return getHomeCommentsScrollContainer();
  }

  function onGamepadControlsChange(value) {
    state.gamepadControlsEnabled = Boolean(value);
    if (!state.gamepadControlsEnabled) {
      stopGamepadControls();
      state.gamepadIgnoreInput = false;
      syncGamepadIndicator();
      return;
    }
    syncGamepadIndicator();
    if (getActiveGamepadKind()) startGamepadControls();
  }

  function isGamepadKeyboardAction(action) {
    return action === 'arrow-left' || action === 'arrow-right' || action === 'toggle-play';
  }

  function dispatchGamepadVideoFullscreenKey(kind) {
    dispatchGamepadKeyboard(kind, 'video-fullscreen-key', 'keydown', false);
    dispatchGamepadKeyboard(kind, 'video-fullscreen-key', 'keyup', false);
  }

  function dispatchGamepadKeyboard(kind, action, type, repeat) {
    const key = action === 'video-fullscreen-key'
      ? 'f'
      : action === 'arrow-left'
      ? 'ArrowLeft'
      : action === 'arrow-right'
        ? 'ArrowRight'
        : ' ';
    const code = action === 'video-fullscreen-key'
      ? 'KeyF'
      : action === 'arrow-left'
      ? 'ArrowLeft'
      : action === 'arrow-right'
        ? 'ArrowRight'
        : 'Space';
    const keyCode = action === 'video-fullscreen-key'
      ? 70
      : action === 'arrow-left'
      ? 37
      : action === 'arrow-right'
        ? 39
        : 32;
    const targetWindow = kind === 'pip' && state.pip.win && !state.pip.win.closed ? state.pip.win : window;
    const targetDocument = targetWindow.document;
    const target = getGamepadKeyboardTarget(kind, targetDocument);
    if (!target) return;
    const event = new targetWindow.KeyboardEvent(type, {
      key,
      code,
      bubbles: true,
      cancelable: true,
      composed: true,
      repeat: type === 'keydown' ? Boolean(repeat) : false,
    });
    try {
      Object.defineProperties(event, {
        keyCode: { get: () => keyCode },
        which: { get: () => keyCode },
      });
    } catch {
      // Some browsers keep legacy key fields readonly.
    }
    target.dispatchEvent(event);
  }

  function getGamepadKeyboardTarget(kind, targetDocument) {
    if (kind === 'home') {
      return state.home.ui?.playerRoot?.querySelector?.('.bpx-player-container') ||
        state.home.ui?.playerRoot ||
        targetDocument.activeElement ||
        targetDocument.body;
    }
    return targetDocument.getElementById('bilibili-player')?.querySelector?.('.bpx-player-container') ||
      targetDocument.getElementById('bilibili-player') ||
      targetDocument.activeElement ||
      targetDocument.body;
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
    stopAutoPlayCountdownMonitor('home');
    stopLivePlayerOnlyControlObserver();
    if (!state.home.player) return;
    unbindHomeScreenChange();
    unbindHomePlayerNavigate();
    unbindHomePlayerHandoff();
    unbindHomePlayerEnded();
    setHomePlayerFeatureBlocked(false);
    try {
      state.home.player.disconnect?.();
    } catch {
      // Ignore player cleanup failures.
    }
    state.home.player = null;
    state.home.featureBlocked = false;
    if (!state.pip.player) stopGamepadControls();
  }

  function disposePipPlayer() {
    if (state.pip.likeBurstTimer) {
      window.clearTimeout(state.pip.likeBurstTimer);
      state.pip.likeBurstTimer = 0;
    }
    state.pip.likeBusy = false;
    stopAutoPlayCountdownMonitor('pip');
    stopPipLivePlayerOnlyControlObserver();
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
    if (!isHomeShellOpen()) stopGamepadControls();
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
    stopGamepadControls();
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
    window.removeEventListener('gamepadconnected', onGamepadConnectionChanged);
    window.removeEventListener('gamepaddisconnected', onGamepadConnectionChanged);
    state.shadowHost?.remove();
    state.overlay?.remove();
    document.getElementById(DOCUMENT_STYLE_ID)?.remove();
    document.documentElement.style.overflow = '';
    delete pageWindow.__biliPopupPlayerNano;
  }

  }
