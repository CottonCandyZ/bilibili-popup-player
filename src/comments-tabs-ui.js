import { APP } from './constants.js';
import { getPlayableKey } from './live-cards.js';
import {
  getVideoMetaFromLink,
  isCoverLink,
  normalizeOgvHref,
  normalizeResourceUrl,
  normalizeVideoHref,
} from './video-meta.js';
import { createEffect, createRoot, createSignal } from 'solid-js';

const TAB_KEYS = ['comments', 'pages', 'playlist', 'live', 'recommend'];
const PLAYING_ICON_URL = 'https://i0.hdslb.com/bfs/static/jinkela/playlist-video/asserts/playing.gif';

export function createCommentsTabsUi({
  state,
  getHomeRenderer,
  getPipRenderer,
  getCommentLayout,
  onTabChange,
  onListChange,
  openWithRenderer,
  syncHomeSize,
  schedulePipLayoutSync,
}) {
  const activeSignals = new Map();
  const expandedPageCards = new Map();
  const selectedPageSignals = new Map();
  const selectedLiveSignals = new Map();
  const selectedSignals = new Map();
  const listViews = new Map();
  const [lastPlayedKey, setLastPlayedKey] = createSignal(getLastPlayedKey());
  const [pageTreeRevision, setPageTreeRevision] = createSignal(0);

  function createTabs(targetDocument, kind) {
    const tabs = targetDocument.createElement('div');
    tabs.className = `${APP}__comments-tabs`;
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', '评论区内容');

    tabs.append(
      createTab(targetDocument, kind, 'comments', '评论'),
      createTab(targetDocument, kind, 'pages', '合集'),
      createTab(targetDocument, kind, 'playlist', '播放列表'),
      createTab(targetDocument, kind, 'live', '直播列表'),
      createTab(targetDocument, kind, 'recommend', '相关推荐'),
    );
    const [, setActive] = getActiveSignal(kind);
    setActive(state[kind].activeCommentsTab || 'comments');
    tabs.__biliPopupPlayerNanoDisposeSolidTabs?.();
    tabs.__biliPopupPlayerNanoDisposeSolidTabs = createRoot((dispose) => {
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
    button.addEventListener('click', () => setTab(kind, tab, { forceLocate: true }));
    if (tab === 'pages') button.hidden = !state[kind].ogvListMode && !state[kind].pageCards?.length;
    if (tab === 'playlist') button.hidden = Boolean(state[kind].ogvListMode || state[kind].liveListMode);
    if (tab === 'live') button.hidden = !state[kind].liveListMode || Boolean(state[kind].ogvListMode);
    return button;
  }

  function setTab(kind, tab, { forceLocate = false } = {}) {
    const previousTab = state[kind].activeCommentsTab;
    state[kind].activeCommentsTab = TAB_KEYS.includes(tab) ? tab : 'comments';
    getActiveSignal(kind)[1](state[kind].activeCommentsTab);
    syncTabs(kind);
    if (state[kind].activeCommentsTab === 'playlist') scrollSelectedPlaylistIntoView(kind, {
      force: forceLocate && previousTab === state[kind].activeCommentsTab,
    });
    if (state[kind].activeCommentsTab === 'live') scrollSelectedLiveIntoView(kind, {
      force: forceLocate && previousTab === state[kind].activeCommentsTab,
    });
    if (state[kind].activeCommentsTab === 'pages') scrollSelectedPageIntoView(kind, {
      force: forceLocate && previousTab === state[kind].activeCommentsTab,
    });
    onTabChange?.(kind, state[kind].activeCommentsTab);
    if (kind === 'home') syncHomeSize();
    else if (state.pip.win && !state.pip.win.closed) schedulePipLayoutSync(state.pip.win);
  }

  function syncTabs(kind) {
    const ui = getUi(kind);
    if (!ui) return;
    syncModeTabVisibility(kind, ui);
    let activeTab = TAB_KEYS.includes(state[kind].activeCommentsTab) ? state[kind].activeCommentsTab : 'comments';
    if (isTabHidden(ui, activeTab)) {
      activeTab = getFallbackActiveTab(kind, ui);
      state[kind].activeCommentsTab = activeTab;
    }
    getActiveSignal(kind)[1](activeTab);
    syncTabButtonSet([ui.commentsTab, ui.pagesTab, ui.playlistTab, ui.liveTab, ui.recommendTab], activeTab);

    ui.commentsPanel.hidden = activeTab !== 'comments';
    ui.pagesPanel.hidden = activeTab !== 'pages';
    ui.playlistPanel.hidden = activeTab !== 'playlist';
    ui.livePanel.hidden = activeTab !== 'live';
    ui.recommendPanel.hidden = activeTab !== 'recommend';
  }

  function syncModeTabVisibility(kind, ui) {
    const scope = state[kind] || {};
    if (scope.liveListMode) {
      [ui.commentsTab, ui.pagesTab, ui.playlistTab, ui.recommendTab].forEach((button) => {
        if (button) button.hidden = true;
      });
      if (ui.liveTab) ui.liveTab.hidden = false;
      return;
    }

    if (ui.commentsTab) ui.commentsTab.hidden = false;
    if (ui.pagesTab) {
      ui.pagesTab.hidden = !scope.ogvListMode && !scope.pageCards?.length;
      if (scope.ogvListMode) ui.pagesTab.textContent = '选集';
    }
    if (ui.playlistTab) ui.playlistTab.hidden = Boolean(scope.ogvListMode);
    if (ui.liveTab) ui.liveTab.hidden = true;
    if (ui.recommendTab) ui.recommendTab.textContent = scope.ogvListMode ? '推荐' : '相关推荐';
  }

  function isTabHidden(ui, tab) {
    return Boolean(getTabButton(ui, tab)?.hidden);
  }

  function getTabButton(ui, tab) {
    if (tab === 'comments') return ui.commentsTab;
    if (tab === 'pages') return ui.pagesTab;
    if (tab === 'playlist') return ui.playlistTab;
    if (tab === 'live') return ui.liveTab;
    if (tab === 'recommend') return ui.recommendTab;
    return null;
  }

  function getFallbackActiveTab(kind, ui) {
    const preferred = state[kind]?.ogvListMode
      ? ['pages', 'comments', 'recommend']
      : state[kind]?.liveListMode
        ? ['live']
        : ['comments', 'pages', 'playlist', 'recommend'];
    return preferred.find((tab) => !isTabHidden(ui, tab)) || 'comments';
  }

  function syncTabButtons(tabs, activeTab) {
    syncTabButtonSet(tabs.querySelectorAll?.(`.${APP}__comments-tab`) || [], activeTab);
  }

  function syncTabButtonSet(buttons, activeTab) {
    buttons.forEach?.((button) => {
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
        recommendEmpty: ui.recommendEmpty,
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
      recommendEmpty: doc.getElementById('recommend-empty'),
    };
  }

  function capturePagePlaylist(kind, selectedBvid, options = {}) {
    state[kind].playlistCards = getScannedPlaylistCards()
      .filter((card) => (card.kind || 'video') === 'video' && (!options.kind || (card.kind || 'video') === options.kind));
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
    setSelectedPageKey(kind, bootstrap ? getSelectedPageKey(bootstrap, cards) : '');
    syncPageTabVisibility(kind, Boolean(cards.length));
    syncPageTabLabel(kind, getPageTabLabel(cards));
    const ui = getUi(kind);
    if (!ui?.pagesList || !ui.pagesEmpty) return;
    renderCardList({
      list: ui.pagesList,
      empty: ui.pagesEmpty,
      cards,
      emptyText: bootstrap ? '当前视频没有合集或分P' : statusText,
      kind,
      source: 'pages',
      loading: !bootstrap,
    });
    onListChange?.(kind, 'pages');
  }

  function syncPageTabVisibility(kind, visible) {
    const ui = getUi(kind);
    if (!ui?.pagesTab) return;
    ui.pagesTab.hidden = !state[kind].ogvListMode && !visible;
    if (!visible && !state[kind].ogvListMode && state[kind].activeCommentsTab === 'pages') setTab(kind, 'comments');
  }

  function syncPageTabLabel(kind, label) {
    const ui = getUi(kind);
    if (!ui?.pagesTab) return;
    ui.pagesTab.textContent = state[kind].ogvListMode ? '选集' : (label || '合集/分P');
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
    return state.cardEntries
      .filter((entry) => entry.card?.isConnected && entry.link?.isConnected)
      .map((entry) => getPlaylistCardFromEntry(entry))
      .filter((card) => {
        const key = getPlayableKey(card);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function getScannedLiveCards() {
    const seen = new Set();
    return state.cardEntries
      .filter((entry) => entry.card?.isConnected && entry.link?.isConnected)
      .map((entry) => getPlaylistCardFromEntry(entry))
      .filter((card) => {
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
      stats: getEntryCardStats(root),
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
      ...options,
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
      ...options,
    });
    onListChange?.(kind, 'live');
  }

  function renderRecommendations(kind, bootstrap, statusText = '相关推荐加载中...') {
    if (bootstrap) state[kind].recommendationCards = bootstrap.recommendationCards || bootstrap.playlistCards || [];
    else state[kind].recommendationCards = [];
    const ui = getUi(kind);
    if (!ui?.recommendList || !ui.recommendEmpty) return;
    renderCardList({
      list: ui.recommendList,
      empty: ui.recommendEmpty,
      cards: state[kind].recommendationCards,
      emptyText: bootstrap ? (state[kind].ogvListMode ? '没有相关推荐' : '没有扫到可播放的推荐卡片') : statusText,
      kind,
      source: 'recommend',
      loading: !bootstrap,
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
    autoScrollSelected = true,
  }) {
    const view = ensureListView({ list, empty, kind, source });
    view.setAutoScrollSelected(Boolean(autoScrollSelected));
    view.setAppendLoading(Boolean(appendLoading));
    view.setLoading(Boolean(loading));
    view.setEmptyText(emptyText);
    view.setCards(cards || []);
  }

  function ensureListView({ list, empty, kind, source }) {
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
    const dispose = createRoot((disposeRoot) => {
      createEffect(() => {
        const currentCards = cards();
        const currentLoading = loading();
        const currentAppendLoading = appendLoading();
        if (source === 'pages') pageTreeRevision();
        const selected = source === 'playlist'
          ? getSelectedSignal(kind)[0]()
          : source === 'live'
            ? getSelectedLiveSignal(kind)[0]()
          : source === 'recommend'
            ? getSelectedSignal(kind)[0]()
            : source === 'pages'
              ? getSelectedPageSignal(kind)[0]()
              : '';
        const lastPlayed = lastPlayedKey();
        list.textContent = '';
        empty.hidden = Boolean(currentLoading || currentAppendLoading || currentCards.length);
        empty.textContent = currentLoading || currentAppendLoading || currentCards.length ? '' : emptyText();
        if (currentLoading) {
          appendSkeletonCards(list.ownerDocument, list, 6);
          return;
        }
        let currentSection = '';
        currentCards.forEach((card) => {
          if (source === 'pages' && card.sectionTitle && card.sectionTitle !== currentSection) {
            currentSection = card.sectionTitle;
            list.appendChild(createPageSectionHeader(list.ownerDocument, currentSection));
          }
          if (source !== 'pages') {
            list.appendChild(createCardButton(list.ownerDocument, kind, card, source, selected, lastPlayed));
            return;
          }

          const children = getPageCardChildren(card);
          const containsSelected = children.some((child) => child.pageKey === selected);
          const expanded = children.length ? isPageCardExpanded(kind, card, selected) : false;
          list.appendChild(createCardButton(list.ownerDocument, kind, card, source, selected, lastPlayed, {
            containsSelected: containsSelected && !expanded,
            expanded,
            hasChildren: Boolean(children.length),
            onToggle: () => togglePageCardExpanded(kind, card, selected),
          }));
          if (!expanded) return;
          children.forEach((child) => {
            list.appendChild(createCardButton(list.ownerDocument, kind, child, source, selected, lastPlayed, {
              depth: 1,
            }));
          });
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
      setLoading,
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

  function createPageSectionHeader(targetDocument, label) {
    const header = targetDocument.createElement('div');
    header.className = `${APP}__playlist-section-title`;
    header.textContent = label;
    return header;
  }

  function getPageCardChildren(card) {
    return Array.isArray(card?.children) ? card.children.filter(Boolean) : [];
  }

  function getExpandedPageCardKey(kind, card) {
    return `${kind}:${card.pageKey || card.bvid || card.cid || card.title}`;
  }

  function isPageCardExpanded(kind, card, selectedKey) {
    const children = getPageCardChildren(card);
    if (!children.length) return false;
    const key = getExpandedPageCardKey(kind, card);
    if (expandedPageCards.has(key)) return expandedPageCards.get(key);
    return children.some((child) => child.pageKey === selectedKey);
  }

  function togglePageCardExpanded(kind, card, selectedKey) {
    const key = getExpandedPageCardKey(kind, card);
    expandedPageCards.set(key, !isPageCardExpanded(kind, card, selectedKey));
    setPageTreeRevision((value) => value + 1);
  }

  function createCardButton(targetDocument, kind, card, source = 'playlist', selectedBvid = '', lastPlayedBvid = '', options = {}) {
    const cardKey = source === 'pages' ? card.pageKey : getPlayableKey(card);
    const containsSelected = Boolean(options.containsSelected);
    const selected = source === 'playlist' || source === 'live' || source === 'recommend'
      ? selectedBvid === cardKey
      : source === 'pages' && selectedBvid === card.pageKey;
    const isLastPlayed = source === 'playlist' && !selected && lastPlayedBvid && lastPlayedBvid === cardKey;
    const button = targetDocument.createElement('div');
    button.className = `${APP}__playlist-card`;
    if (source === 'pages' && card.pageType) button.classList.add(`${APP}__playlist-card--${card.pageType}`);
    if (source === 'pages' && options.depth) button.classList.add(`${APP}__playlist-card--child`);
    if (source === 'pages' && options.hasChildren) button.classList.add(`${APP}__playlist-card--collapsible`);
    if (source === 'pages' && containsSelected) button.classList.add(`${APP}--contains-selected`);
    if (source === 'pages' && options.expanded) button.classList.add(`${APP}--expanded`);
    button.dataset.bvid = card.bvid || '';
    button.dataset.aid = card.aid || '';
    button.dataset.cid = card.cid || '';
    button.dataset.seasonId = card.seasonId || '';
    button.dataset.epId = card.epId || '';
    button.dataset.page = card.page || '';
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
      if (source === 'pages' && options.hasChildren && !options.depth) {
        options.onToggle?.();
        return;
      }
      state.lastButton = null;
      if (source === 'playlist') setSelectedPlaylistBvid(kind, cardKey);
      if (source === 'live') setSelectedLiveKey(kind, cardKey);
      if (source === 'pages') setSelectedPageKey(kind, card.pageKey);
      const renderer = kind === 'pip' ? getPipRenderer() : getHomeRenderer();
      openWithRenderer(renderer, source === 'playlist'
        ? { ...card, fromPlaylist: true }
        : source === 'live'
          ? { ...card, fromLiveList: true }
        : source === 'pages'
          ? { ...card, fromPagePart: true }
          : card);
    });
    button.addEventListener('keydown', (event) => {
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
    if (selected || containsSelected) {
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

    if (source === 'pages' && options.depth) {
      button.appendChild(info);
      if (card.duration) {
        const inlineDuration = targetDocument.createElement('span');
        inlineDuration.className = `${APP}__playlist-inline-duration`;
        inlineDuration.textContent = card.duration;
        button.appendChild(inlineDuration);
      }
      return button;
    }

    button.append(cover, info);
    if (source === 'pages' && options.hasChildren) {
      const toggle = targetDocument.createElement('button');
      toggle.type = 'button';
      toggle.className = `${APP}__playlist-toggle`;
      toggle.title = options.expanded ? '收起分P' : '展开分P';
      toggle.setAttribute('aria-label', toggle.title);
      toggle.setAttribute('aria-expanded', options.expanded ? 'true' : 'false');
      toggle.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        options.onToggle?.();
      });
      const toggleIcon = targetDocument.createElement('span');
      toggleIcon.className = `${APP}__playlist-toggle-icon`;
      toggle.appendChild(toggleIcon);
      button.appendChild(toggle);
    }
    return button;
  }

  function attachPipTabs(targetWindow) {
    if (!targetWindow || targetWindow.closed) return;
    const doc = targetWindow.document;
    const tabs = [...(doc?.querySelectorAll?.(`.${APP}__comments-tab`) || [])];
    if (!tabs.length || tabs[0].__biliPopupPlayerNanoTabsBound) return;
    tabs.forEach((tab) => {
      tab.__biliPopupPlayerNanoTabsBound = true;
      tab.addEventListener('click', () => setTab('pip', tab.dataset.tab, { forceLocate: true }));
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
    return getPlayableKey(state.playlistLastPlayed) || getPlayableKey(state.lastPlayed) || '';
  }

  function syncLastPlayed() {
    setLastPlayedKey(getLastPlayedKey());
  }

  function scrollSelectedPlaylistIntoView(kind, { force = false } = {}) {
    if (!force && getCommentLayout?.(kind) !== 'right') return;
    const bvid = state[kind].selectedPlaylistBvid;
    if (!bvid) return;
    const ui = getUi(kind);
    const list = ui?.playlistList;
    if (!list || ui.playlistPanel?.hidden) return;
    const item = [...(list.querySelectorAll?.(`.${APP}__playlist-card`) || [])]
      .find((card) => card.dataset.key === bvid || card.dataset.bvid === bvid);
    scrollItemWithinPanel(ui.playlistPanel, item);
  }

  function scrollSelectedLiveIntoView(kind, { force = false } = {}) {
    if (!force && getCommentLayout?.(kind) !== 'right') return;
    const key = state[kind].selectedLiveKey;
    if (!key) return;
    const ui = getUi(kind);
    const list = ui?.liveList;
    if (!list || ui.livePanel?.hidden) return;
    const item = [...(list.querySelectorAll?.(`.${APP}__playlist-card`) || [])]
      .find((card) => card.dataset.key === key);
    scrollItemWithinPanel(ui.livePanel, item);
  }

  function scrollSelectedPageIntoView(kind, { force = false } = {}) {
    if (!force && getCommentLayout?.(kind) !== 'right') return;
    const pageKey = state[kind].selectedPageKey;
    if (!pageKey) return;
    const ui = getUi(kind);
    const list = ui?.pagesList;
    if (!list || ui.pagesPanel?.hidden) return;
    const item = [...(list.querySelectorAll?.(`.${APP}__playlist-card`) || [])]
      .find((card) => card.dataset.pageKey === pageKey);
    scrollItemWithinPanel(ui.pagesPanel, item);
  }

  function scrollItemWithinPanel(panel, item) {
    if (!panel || !item) return;
    const panelRect = panel.getBoundingClientRect?.();
    const itemRect = item.getBoundingClientRect?.();
    if (!panelRect || !itemRect) return;

    const targetTop = panel.scrollTop +
      (itemRect.top - panelRect.top) -
      Math.max(0, (panel.clientHeight - itemRect.height) / 2);
    const maxTop = Math.max(0, panel.scrollHeight - panel.clientHeight);
    const top = Math.min(maxTop, Math.max(0, targetTop));
    panel.scrollTo?.({ top, behavior: 'smooth' });
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
    syncTabs,
  };
}

function getPagePartCards(bootstrap) {
  if (isOgvBootstrap(bootstrap)) return getOgvSelectionCards(bootstrap);

  const vd = bootstrap?.initialState?.videoData || {};
  const aid = vd.aid || bootstrap?.playerInfo?.aid;
  const bvid = bootstrap?.playerInfo?.bvid || vd.bvid;
  const href = bootstrap?.href || (bvid ? `https://www.bilibili.com/video/${bvid}` : '');
  const pageCards = (Array.isArray(vd.pages) ? vd.pages : [])
    .map((page, index) => buildPagePartCard({ aid, bvid, href, index, page, title: vd.title, cover: vd.pic }))
    .filter(Boolean);

  const season = getSeasonData(bootstrap);
  const seasonCards = season.episodes.length > 1 ? season.episodes
    .map((episode, index) => {
      const card = buildSeasonEpisodeCard({
        episode,
        fallbackBvid: bvid,
        fallbackHref: href,
        index,
        sectionTitle: season.title,
      });
      if (!card) return null;
      const children = buildSeasonEpisodePageCards({
        episode,
        parentCard: card,
        currentAid: aid,
        currentBvid: bvid,
        currentPageCards: pageCards,
      });
      return children.length > 1 ? { ...card, children } : card;
    })
    .filter(Boolean) : [];

  if (isSameCidList(seasonCards, pageCards)) return pageCards;
  if (seasonCards.length && pageCards.length > 1) {
    return seasonCards.map((card) => isSameArchiveCard(card, { aid, bvid })
      ? { ...card, children: pageCards }
      : card);
  }
  if (seasonCards.length) return seasonCards;
  return pageCards.length > 1 ? pageCards : [];
}

function buildPagePartCard({ aid, bvid, href, index, page, title, cover }) {
  if (!bvid || !page?.cid) return null;
  const pageNo = Number(page.page || index + 1);
  const pageHref = setVideoPageParam(href || `/video/${bvid}`, pageNo);
  return {
    aid,
    bvid,
    cid: page.cid,
    cover: normalizeResourceUrl(page.first_frame || cover),
    duration: formatDuration(page.duration),
    href: pageHref,
    page: pageNo,
    p: pageNo,
    pageKey: buildPageKey('part', { bvid, cid: page.cid, page: pageNo }),
    pageType: 'part',
    sectionTitle: '分P',
    subtitle: title || '',
    title: `${pageNo}. ${cleanText(page.part) || '未命名片段'}`,
  };
}

function buildSeasonEpisodeCard({ episode, fallbackBvid, fallbackHref, index, sectionTitle }) {
  const bvid = episode?.bvid || fallbackBvid;
  const aid = episode?.aid || episode?.arc?.aid;
  const cid = episode?.cid || episode?.page?.cid;
  const pageNo = Number(episode?.page?.page || 1);
  const href = normalizeVideoHref(episode?.link || episode?.uri || `/video/${bvid}`, fallbackHref) ||
    setVideoPageParam(`/video/${bvid}`, pageNo);
  if (!bvid || !href) return null;
  return {
    aid,
    bvid,
    cid,
    cover: normalizeResourceUrl(episode?.arc?.pic || episode?.cover),
    duration: formatDuration(episode?.duration || episode?.page?.duration || episode?.arc?.duration),
    href,
    page: pageNo,
    p: pageNo,
    pageKey: buildPageKey('season', { aid, bvid, cid, page: pageNo }),
    pageType: 'season',
    sectionTitle: sectionTitle || '合集',
    subtitle: episode?.arc?.title || '',
    stats: episode?.arc?.stat,
    title: `${index + 1}. ${cleanText(episode?.title || episode?.part || episode?.page?.part) || '未命名片段'}`,
  };
}

function buildSeasonEpisodePageCards({ episode, parentCard, currentAid, currentBvid, currentPageCards }) {
  if (!parentCard?.bvid) return [];
  if (isSameArchiveCard(parentCard, { aid: currentAid, bvid: currentBvid }) && currentPageCards.length > 1) {
    return currentPageCards;
  }

  const episodePages = getSeasonEpisodePages(episode);
  if (episodePages.length <= 1) return [];
  const episodeAid = episode?.aid || episode?.arc?.aid || parentCard.aid;
  const episodeBvid = episode?.bvid || parentCard.bvid;
  const episodeTitle = cleanText(episode?.arc?.title || episode?.title || parentCard.title);
  return episodePages
    .map((page, index) => buildPagePartCard({
      aid: episodeAid,
      bvid: episodeBvid,
      href: parentCard.href,
      index,
      page,
      title: episodeTitle,
      cover: parentCard.cover,
    }))
    .filter(Boolean);
}

function getSeasonEpisodePages(episode) {
  const pages = Array.isArray(episode?.pages)
    ? episode.pages
    : Array.isArray(episode?.arc?.pages)
      ? episode.arc.pages
      : [];
  if (pages.length) return pages;
  return episode?.page ? [episode.page] : [];
}

function getSeasonData(bootstrap) {
  const vd = bootstrap?.initialState?.videoData || {};
  const candidates = [
    vd.ugc_season,
    bootstrap?.initialState?.sectionsInfo,
    bootstrap?.initialState?.ugcSeason,
  ];
  for (const season of candidates) {
    const episodes = extractSeasonEpisodes(season);
    if (episodes.length > 1) {
      return {
        episodes,
        title: cleanText(season?.title || season?.season_title || season?.name) || '合集',
      };
    }
  }
  return { episodes: [], title: '合集' };
}

function extractSeasonEpisodes(season) {
  if (!season) return [];
  if (Array.isArray(season.episodes)) return season.episodes;
  return (Array.isArray(season.sections) ? season.sections : [])
    .flatMap((section) => Array.isArray(section?.episodes) ? section.episodes : []);
}

function getPageTabLabel(cards) {
  if (cards.some((card) => card.pageType === 'ogv')) return '选集';
  const hasSeason = cards.some((card) => card.pageType === 'season');
  const hasPart = cards.some((card) => card.pageType === 'part');
  if (hasSeason && hasPart) return '合集/分P';
  if (hasSeason) return '合集';
  if (hasPart) return '分P';
  return '合集/分P';
}

function isSameCidList(leftCards, rightCards) {
  if (!leftCards.length || leftCards.length !== rightCards.length) return false;
  const left = leftCards.map((card) => Number(card.cid || 0)).filter(Boolean).sort((a, b) => a - b);
  const right = rightCards.map((card) => Number(card.cid || 0)).filter(Boolean).sort((a, b) => a - b);
  return left.length === leftCards.length &&
    right.length === rightCards.length &&
    left.every((cid, index) => cid === right[index]);
}

function buildPageKey(type, { aid, bvid, cid, page }) {
  const identity = aid || bvid || '';
  const unit = cid || page || 1;
  return [type, identity, unit].filter(Boolean).join(':');
}

function isSameArchiveCard(card, current) {
  const aid = Number(current?.aid || 0);
  if (aid && Number(card?.aid || 0) === aid) return true;
  return Boolean(current?.bvid && card?.bvid && card.bvid === current.bvid);
}

function getSelectedPageKey(bootstrap, cards = []) {
  const info = bootstrap?.playerInfo;
  if (isOgvBootstrap(bootstrap)) {
    const epId = Number(info?.epId || 0);
    const cid = Number(info?.cid || 0);
    const searchableCards = flattenPageCards(cards);
    const matched = searchableCards.find((card) => (
      (epId && Number(card.epId || 0) === epId) ||
      (cid && Number(card.cid || 0) === cid)
    ));
    if (matched?.pageKey) return matched.pageKey;
    return buildOgvPageKey(info?.seasonId, epId || cid || '');
  }
  if (!info?.bvid) return '';
  const aid = Number(info.aid || 0);
  const cid = Number(info.cid || 0);
  const page = Number(info.p || 1);
  const bvid = info.bvid;
  const searchableCards = flattenPageCards(cards);
  const matchers = [
    (card) => card.pageType === 'part' && cid && Number(card.cid) === cid,
    (card) => card.pageType === 'part' && card.bvid === bvid && Number(card.page || 1) === page,
    (card) => card.pageType === 'season' && aid && Number(card.aid) === aid,
    (card) => card.pageType === 'season' && cid && Number(card.cid) === cid,
    (card) => card.bvid === bvid && Number(card.page || 1) === page,
  ];
  for (const matcher of matchers) {
    const card = searchableCards.find(matcher);
    if (card?.pageKey) return card.pageKey;
  }
  return buildPageKey('part', { bvid, cid, page });
}

function isOgvBootstrap(bootstrap) {
  return bootstrap?.kind === 'ogv' || bootstrap?.playerInfo?.kind === 'ogv';
}

function getOgvSelectionCards(bootstrap) {
  const vd = bootstrap?.initialState?.videoData || {};
  const season = bootstrap?.initialState?.ogvSeason || vd.ogv_season || {};
  const epList = bootstrap?.initialState?.ogvEpList || vd.ogv_ep_list || {};
  const seasonId = bootstrap?.playerInfo?.seasonId || season.season_id;
  const mainSectionTitle = cleanText(season?.positive?.title || epList?.positive?.title || '正片');
  const cards = [
    ...mergeOgvEpisodes(season?.episodes, epList?.episodes)
      .map((episode, index) => buildOgvEpisodeCard({
        episode,
        fallbackSeasonId: seasonId,
        index,
        sectionTitle: mainSectionTitle,
        season,
      })),
    ...getOgvSections(season, epList).flatMap((section) => {
      const title = cleanText(section?.title || section?.section_title || section?.name || '选集');
      return mergeOgvEpisodes(section?.episodes, [])
        .map((episode, index) => buildOgvEpisodeCard({
          episode,
          fallbackSeasonId: seasonId,
          index,
          sectionTitle: title,
          season,
        }));
    }),
  ].filter(Boolean);

  const seen = new Set();
  return cards.filter((card) => {
    const key = card.pageKey || getPlayableKey(card);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getOgvSections(season, epList) {
  const sections = [
    ...(Array.isArray(season?.section) ? season.section : []),
    ...(Array.isArray(season?.sections) ? season.sections : []),
    ...(Array.isArray(epList?.section) ? epList.section : []),
    ...(Array.isArray(epList?.sections) ? epList.sections : []),
  ];
  const seen = new Set();
  return sections.filter((section) => {
    const key = section?.id || section?.title || section?.section_title || section?.name || JSON.stringify(section?.episodes?.[0] || {});
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return Array.isArray(section?.episodes) && section.episodes.length;
  });
}

function mergeOgvEpisodes(primary, secondary) {
  const merged = new Map();
  const add = (episode) => {
    const epId = Number(episode?.ep_id || episode?.id || episode?.episode_id || 0);
    if (!epId) return;
    merged.set(epId, {
      ...merged.get(epId),
      ...episode,
      ep_id: episode.ep_id || episode.id || episode.episode_id,
    });
  };
  (Array.isArray(primary) ? primary : []).forEach(add);
  (Array.isArray(secondary) ? secondary : []).forEach(add);
  return [...merged.values()];
}

function buildOgvEpisodeCard({ episode, fallbackSeasonId, index, sectionTitle, season }) {
  const epId = episode?.ep_id || episode?.id || episode?.episode_id;
  if (!epId) return null;
  const seasonId = episode?.season_id || fallbackSeasonId || season?.season_id || '';
  const href = normalizeOgvHref(
    episode?.link || episode?.share_url || episode?.url || `/bangumi/play/ep${epId}`,
    `https://www.bilibili.com/bangumi/play/ss${seasonId || ''}`,
  );
  if (!href) return null;
  const title = cleanText(episode?.show_title || buildOgvEpisodeTitle(episode)) || `第${index + 1}话`;
  const longTitle = cleanText(episode?.long_title);
  return {
    kind: 'ogv',
    pageType: 'ogv',
    aid: episode?.aid,
    bvid: episode?.bvid,
    cid: episode?.cid,
    seasonId: seasonId ? String(seasonId) : '',
    epId: String(epId),
    cover: normalizeResourceUrl(episode?.cover || season?.cover || season?.square_cover, href),
    duration: formatDuration(normalizeOgvDurationSeconds(episode?.duration)),
    href,
    pageKey: buildOgvPageKey(seasonId, epId),
    sectionTitle: sectionTitle || '选集',
    stats: normalizeOgvCardStats(episode?.stat),
    subtitle: longTitle && longTitle !== title ? longTitle : cleanText(season?.title || season?.season_title || ''),
    title,
  };
}

function buildOgvEpisodeTitle(episode) {
  const title = cleanText(episode?.title || episode?.index_title);
  const longTitle = cleanText(episode?.long_title);
  if (title && longTitle) return `第${title}话 ${longTitle}`;
  if (title) return `第${title}话`;
  return longTitle;
}

function normalizeOgvDurationSeconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return number > 100000 ? Math.round(number / 1000) : Math.round(number);
}

function normalizeOgvCardStats(stat) {
  const view = formatCount(stat?.play ?? stat?.view ?? stat?.views);
  const danmaku = formatCount(stat?.danmaku ?? stat?.danmakus);
  return view || danmaku ? { view, danmaku } : '';
}

function buildOgvPageKey(seasonId, epId) {
  return ['ogv', seasonId || '', epId || ''].filter(Boolean).join(':');
}

function flattenPageCards(cards) {
  return (Array.isArray(cards) ? cards : []).flatMap((card) => [
    card,
    ...(Array.isArray(card?.children) ? card.children : []),
  ]).filter(Boolean);
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
  if (!stats) return { view: '', danmaku: '' };
  if (typeof stats === 'object') {
    return {
      view: formatStatValue(stats.view ?? stats.play ?? stats.views),
      danmaku: formatStatValue(stats.danmaku ?? stats.danmakus),
    };
  }
  const parts = cleanText(stats).split(/\s+/).filter(Boolean);
  return {
    view: parts[0] || '',
    danmaku: parts[1] || '',
  };
}

function formatStatValue(value) {
  if (typeof value === 'number' || /^\d+(?:\.\d+)?$/.test(String(value || '').trim())) {
    return formatCount(value);
  }
  return cleanText(value);
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
  const m = Math.floor((total % 3600) / 60);
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
  const candidate = textLink?.textContent ||
    getSafeTitleElementText(root, [
      '.bili-video-card__info--tit',
      '.video-page-card-small-title',
      '.title',
      '.bili-dyn-live-users__item__title',
      '.info-title',
    ].join(',')) ||
    link?.getAttribute?.('title') ||
    link?.getAttribute?.('aria-label') ||
    root?.querySelector?.('img')?.getAttribute('alt') ||
    fallback;
  return cleanTitle(candidate || fallback || 'Bilibili 视频');
}

function getEntryTextLink(root, bvid) {
  if (!root || !bvid) return null;
  return [...(root.querySelectorAll?.('a[href*="/video/BV"]') || [])]
    .find((candidate) => {
      const meta = getVideoMetaFromLink(candidate);
      return meta?.bvid === bvid && !isCoverLink(candidate) && isUsefulTitle(candidate.textContent);
    }) || null;
}

function getSafeTitleElementText(root, selector) {
  return [...(root?.querySelectorAll?.(selector) || [])]
    .map((element) => element.textContent || element.getAttribute?.('title') || '')
    .find(isUsefulTitle) || '';
}

function getEntryCardCover(root, link) {
  const img = root?.querySelector?.('img[src], img[data-src], img[data-lazy-src], img[data-original], img[data-url]') ||
    link?.querySelector?.('img[src], img[data-src], img[data-lazy-src], img[data-original], img[data-url]');
  const source = root?.querySelector?.('source[srcset], source[data-srcset]') ||
    link?.querySelector?.('source[srcset], source[data-srcset]');
  const raw = img?.getAttribute('data-src') ||
    img?.getAttribute('data-lazy-src') ||
    img?.getAttribute('data-original') ||
    img?.getAttribute('data-url') ||
    img?.getAttribute('src') ||
    getFirstSrcsetUrl(source?.getAttribute('data-srcset') || source?.getAttribute('srcset')) ||
    '';
  return normalizeResourceUrl(raw);
}

function getEntryCardSubtitle(root) {
  return cleanText(root?.querySelector?.([
    '.upname',
    '.name',
    '.bili-dyn-live-users__item__uname',
    '.bili-video-card__info--author',
    '.video-page-card-small-author',
    '[class*="author"]',
  ].join(','))?.textContent);
}

function getEntryCardDuration(root) {
  return cleanText(root?.querySelector?.([
    '.duration',
    '.bili-video-card__stats__duration',
    '[class*="duration"]',
  ].join(','))?.textContent);
}

function getEntryCardStats(root) {
  const playInfo = root?.querySelector?.('.playinfo')?.textContent;
  if (playInfo) return cleanText(playInfo);
  const items = uniqueList([...(root?.querySelectorAll?.([
    '.bili-video-card__stats--text',
    '.bili-video-card__stats--item',
    '[class*="stats"] [class*="text"]',
  ].join(',')) || [])]
    .map((element) => cleanText(element.textContent))
    .filter(Boolean));
  return items.slice(0, 2).join(' ');
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanTitle(value) {
  const title = cleanText(value);
  return isUsefulTitle(title) ? title : 'Bilibili 视频';
}

function isUsefulTitle(value) {
  const title = cleanText(value);
  return Boolean(title && title !== '不感兴趣' && title !== '撤销' && !title.includes('将减少此类内容推荐'));
}

function uniqueList(values) {
  return [...new Set(values)];
}

function getFirstSrcsetUrl(srcset) {
  return String(srcset || '').split(',')[0]?.trim().split(/\s+/)[0] || '';
}
