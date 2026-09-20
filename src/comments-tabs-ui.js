import { APP } from './constants.js';
import { getPlayableKey } from './live-cards.js';
import {
  getCardTitle,
  getVideoMetaFromLink,
  normalizeOgvHref,
  normalizeResourceUrl,
  normalizeVideoHref,
} from './video-meta.js';
import { createElement } from 'react';
import { mountReact } from './ui-runtime.jsx';
import { ContentSidebar, Playlist } from './content-ui.jsx';

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
  const expandedPageCards = new Map();
  const listViews = new Map();
  const tabViews = new Map();

  function createTabs(targetDocument, kind) {
    const mount = targetDocument.createElement('div');
    mount.style.display = 'contents';
    const element = () => createElement(ContentSidebar, {
      kind, sections: getTabDescriptors(kind), active: state[kind].activeCommentsTab, layout: getCommentLayout(kind),
      onActivate: section => {
        const changed = state[kind].activeCommentsTab !== section;
        if (changed) {
          state[kind].activeCommentsTab = section;
          syncTabs(kind);
        }
        onTabChange?.(kind, section);
        if (section === 'pages') scrollSelectedPageIntoView(kind, { force: true });
        if (section === 'playlist') scrollSelectedPlaylistIntoView(kind, { force: true });
        if (section === 'live') scrollSelectedLiveIntoView(kind, { force: true });
        if (kind === 'home') syncHomeSize();
        else if (state.pip.win && !state.pip.win.closed) schedulePipLayoutSync(state.pip.win);
      },
    });
    tabViews.get(kind)?.dispose();
    const root = mountReact(mount, element());
    const view = { render: () => root.render(element()), dispose: () => root.dispose() };
    tabViews.set(kind, view);
    mount.dispose = () => { if (tabViews.get(kind) === view) { view.dispose(); tabViews.delete(kind); } };
    return mount;
  }

  function getTabDescriptors(kind) {
    const scope = state[kind];
    const live = scope.liveListMode;
    const ogv = scope.ogvListMode;
    return [
      { key: 'comments', label: '评论', hidden: live },
      { key: 'pages', label: ogv ? '选集' : getPageTabLabel(scope.pageCards || []), hidden: live || (!ogv && !scope.pageCards?.length) },
      { key: 'playlist', label: '播放列表', hidden: live || ogv },
      { key: 'live', label: '直播列表', hidden: !live },
      { key: 'recommend', label: ogv ? '推荐' : '相关推荐', hidden: live },
    ];
  }

  function syncTabs(kind) {
    const sections = getTabDescriptors(kind);
    if (!sections.some(section => section.key === state[kind].activeCommentsTab && !section.hidden)) {
      state[kind].activeCommentsTab = sections.find(section => !section.hidden)?.key || 'comments';
    }
    const view = tabViews.get(kind);
    const signature = JSON.stringify([sections, state[kind].activeCommentsTab, getCommentLayout(kind)]);
    if (view && view.signature !== signature) {
      view.signature = signature;
      view.render();
    }
  }

  function getUi(kind) {
    if (kind === 'home') {
      const ui = state.home.ui;
      if (!ui?.commentsPanel || !ui.playlistPanel || !ui.livePanel || !ui.recommendPanel) return null;
      return {
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

  function syncPageTabVisibility(kind) { syncTabs(kind); }
  function syncPageTabLabel(kind) { syncTabs(kind); }
  function syncLiveTabVisibility(kind) { syncTabs(kind); }

  function setSelectedPlaylistBvid(kind, bvid) {
    state[kind].selectedPlaylistBvid = bvid || '';
    refreshLists(kind, ['playlist', 'recommend']);
    scrollSelectedPlaylistIntoView(kind);
  }

  function setSelectedLiveKey(kind, key) {
    state[kind].selectedLiveKey = key || '';
    refreshLists(kind, ['live']);
    scrollSelectedLiveIntoView(kind);
  }

  function setSelectedPageKey(kind, key) {
    state[kind].selectedPageKey = key || '';
    refreshLists(kind, ['pages']);
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
      title: getCardTitle(root, entry.link, meta.title),
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
    const key = kind + ':' + source;
    let view = listViews.get(key);
    if (view?.list !== list) {
      view?.root?.dispose();
      view = { list, empty, kind, source, root: null };
      listViews.set(key, view);
    }
    Object.assign(view, { cards: cards || [], emptyText, loading, appendLoading, autoScrollSelected });
    syncTabs(kind);
    renderList(view);
  }

  function refreshLists(kind, sources = ['playlist', 'recommend', 'pages', 'live']) {
    for (const source of sources) {
      const view = listViews.get(kind + ':' + source);
      if (view?.list.isConnected) renderList(view);
    }
  }

  function renderList(view) {
    const { list, empty, kind, source, cards, loading, appendLoading, autoScrollSelected } = view;
    const scope = state[kind];
    const selected = source === 'pages' ? scope.selectedPageKey : source === 'live' ? scope.selectedLiveKey : scope.selectedPlaylistBvid;
    const lastPlayed = getLastPlayedKey();
    const rows = [];
    let section = '';
    const add = (card, depth = 0) => {
      const key = source === 'pages' ? card.pageKey : getPlayableKey(card);
      const children = source === 'pages' ? getPageCardChildren(card) : [];
      const expanded = children.length > 0 && isPageCardExpanded(kind, card, selected);
      rows.push({ key: key + ':' + rows.length, card: { ...card, playableKey: key }, source, depth, stats: normalizeStats(card.stats), selected: key === selected,
        lastPlayed: source === 'playlist' && key !== selected && key === lastPlayed,
        expanded, hasChildren: children.length > 0, containsSelected: !expanded && children.some(child => child.pageKey === selected) });
      if (expanded) children.forEach(child => add(child, 1));
    };
    cards.forEach(card => {
      if (source === 'pages' && card.sectionTitle && card.sectionTitle !== section && card.sectionTitle !== getPageTabLabel(cards)) {
        section = card.sectionTitle;
        rows.push({ key: 'section:' + rows.length, section });
      }
      add(card);
    });
    empty.hidden = Boolean(loading || appendLoading || cards.length);
    empty.textContent = empty.hidden ? '' : view.emptyText;
    const element = createElement(Playlist, { rows, loading, appendLoading,
      onToggle: card => togglePageCardExpanded(kind, card, selected),
      onPlay: card => {
        state.lastButton = null;
        state[kind].activeCommentsTab = source;
        syncTabs(kind);
        if (source === 'playlist') setSelectedPlaylistBvid(kind, getPlayableKey(card));
        if (source === 'live') setSelectedLiveKey(kind, getPlayableKey(card));
        if (source === 'pages') setSelectedPageKey(kind, card.pageKey);
        const renderer = kind === 'pip' ? getPipRenderer() : getHomeRenderer();
        openWithRenderer(renderer, { ...card, fromPlaylist: source === 'playlist', fromLiveList: source === 'live', fromPagePart: source === 'pages' });
      },
    });
    if (view.root) view.root.render(element);
    else view.root = mountReact(list, element);
    if (autoScrollSelected && !loading) {
      if (source === 'playlist') scrollSelectedPlaylistIntoView(kind);
      if (source === 'live') scrollSelectedLiveIntoView(kind);
      if (source === 'pages') scrollSelectedPageIntoView(kind);
    }
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
    refreshLists(kind, ['pages']);
  }

  function attachPipTabs() { syncTabs('pip'); }

  function dispose(kind) {
    for (const [key, view] of listViews) {
      if (kind && view.kind !== kind) continue;
      view.root?.dispose();
      listViews.delete(key);
    }
    for (const [key, view] of tabViews) {
      if (kind && key !== kind) continue;
      view.dispose();
      tabViews.delete(key);
    }
  }

  function getLastPlayedKey() {
    return getPlayableKey(state.playlistLastPlayed) || getPlayableKey(state.lastPlayed) || '';
  }

  function syncLastPlayed() {
    refreshLists('home');
    refreshLists('pip');
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
    if (!panel || !item || !item.getClientRects().length) return;
    panel = panel.querySelector(`.${APP}__playlist`) || panel;
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
    dispose,
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
  return Boolean(title && !/^(?:不感兴趣|撤销|添加至稍后再看|稍后再看|已加稍后再看)$/.test(title) && !title.includes('将减少此类内容推荐'));
}

function uniqueList(values) {
  return [...new Set(values)];
}

function getFirstSrcsetUrl(srcset) {
  return String(srcset || '').split(',')[0]?.trim().split(/\s+/)[0] || '';
}
