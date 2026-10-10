import { BV_RE, COMMENT_FALLBACK, UGC_CORE_SCRIPT } from './constants.js';
import {
  normalizeResourceUrl,
  normalizeVideoHref,
} from './video-meta.js';
import { getPlayerNanoTheme } from './player-theme.js';
import { isOgvMeta, resolveOgvPlaybackBootstrap } from './ogv-playback-bootstrap.js';
import { readPlaybackPageData } from './playback-page-data.js';

const REQUEST_TIMEOUT_MS = 8000;

export async function resolvePlaybackBootstrap(meta) {
  if (isOgvMeta(meta)) return resolveOgvPlaybackBootstrap(meta);

  const bvid = meta.bvid || meta.href?.match(BV_RE)?.[1];
  if (!bvid) throw new Error('视频链接缺少 BV 号');
  const errors = [];
  const pageWindow = typeof unsafeWindow === 'object' && unsafeWindow ? unsafeWindow : globalThis.window;
  let currentState;
  try { currentState = pageWindow?.__INITIAL_STATE__; } catch { /* Other scripts can wrap page globals. */ }
  const sources = [];
  if (currentState?.videoData?.bvid === bvid) {
    sources.push(['当前播放页', () => ({ initialState: currentState, playInfo: pageWindow.__playinfo__ })]);
  }
  sources.push(
    ['视频详情接口', async () => {
      const payload = await fetchPlaybackJson(`https://api.bilibili.com/x/web-interface/wbi/view/detail?bvid=${encodeURIComponent(bvid)}&need_view=1&platform=web`);
      return { videoData: payload.data?.View, related: payload.data?.Related, card: payload.data?.Card };
    }],
    ['基本视频信息接口', async () => {
      const payload = await fetchPlaybackJson(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`);
      return { videoData: payload.data };
    }],
    ['原播放页', () => fetchPlaybackPage(meta, bvid)],
  );
  for (const [source, resolve] of sources) {
    try {
      const data = await resolve();
      const vd = normalizeVideoData(data.videoData || data.initialState?.videoData);
      if (!vd?.aid || vd.bvid !== bvid) throw new Error('返回的视频信息缺失或与 BV 号不一致');
      if (!vd.pages.length && (Number(vd.videos) > 1 || !vd.cid || Number(meta.p || meta.page || 1) > 1)) {
        const pages = await fetchPlaybackJson(`https://api.bilibili.com/x/player/pagelist?bvid=${encodeURIComponent(bvid)}`).catch(() => null);
        vd.pages = mergeVideoPages(vd.pages, pages?.data);
      }
      const bootstrap = buildPlaybackBootstrap(meta, vd, data);
      bootstrap.diagnostics = { source, failures: errors.map(describeFailure) };
      if (errors.length) console.warn('[bili-popup-player] video info fallback', bootstrap.diagnostics);
      return bootstrap;
    } catch (error) {
      const failure = new Error(`${source}：${error?.message || String(error)}`, { cause: error });
      Object.assign(failure, { source, status: error?.status, code: error?.code, url: error?.url });
      errors.push(failure);
    }
  }
  const error = new AggregateError(errors, '视频信息加载失败，请重试或打开原视频');
  error.diagnostics = errors.map(describeFailure);
  throw error;
}

function buildPlaybackBootstrap(meta, vd, data) {
  applyDetailCard(vd, data.card);

  const pageP = resolveCurrentPage(meta, { p: data.initialState?.p || 1, videoData: vd });
  const page = getVideoPage(vd, pageP);
  if (!(Number(page.cid || vd.cid) > 0)) throw new Error('视频信息缺少可播放的分 P');
  const sequence = resolvePlaybackSequence(vd, pageP, page);
  const relatedItems = Array.isArray(data.related || data.initialState?.related)
    ? data.related || data.initialState.related
    : [];
  const initialState = { ...data.initialState, ...buildInitialStateFromApis({ meta, p: sequence.p, relatedItems, videoData: vd }) };
  const recommendationCards = extractPlaylistCardsFromRelatedItems(relatedItems, meta.href, vd.bvid);

  return {
    title: vd.title || meta.title,
    coreScript: data.coreScript || UGC_CORE_SCRIPT,
    commentScript: data.commentScript || COMMENT_FALLBACK,
    stylesheets: [],
    initialState,
    playInfo: Number(data.initialState?.p || 1) === pageP ? data.playInfo || null : null,
    recommendationCards,
    playerInfo: {
      aid: vd.aid,
      bvid: vd.bvid,
      cid: page.cid || vd.cid || initialState.cid,
      p: sequence.p,
      t: 0,
      hasPrev: sequence.hasPrev,
      hasNext: sequence.hasNext,
      seasonId: sequence.seasonId,
    },
    href: meta.href,
    commentInfo: {
      params: `1,${vd.aid}`,
      spmPrefix: '333.788',
      cmFromTrackId: new URL(meta.href, location.href).searchParams.get('track_id') || '',
    },
  };
}

async function fetchPlaybackJson(url) {
  return fetchPlaybackResource(url, 'application/json, text/plain, */*', async response => {
    const payload = await response.json();
    if (payload?.code !== 0) {
      throw Object.assign(new Error(`${payload?.message || '接口返回错误'}（code=${payload?.code}）`), { code: payload?.code, status: response.status });
    }
    return payload;
  });
}

async function fetchPlaybackPage(meta, bvid) {
  const href = normalizeVideoHref(meta.href) || `https://www.bilibili.com/video/${bvid}/`;
  return fetchPlaybackResource(href, 'text/html', async response => readPlaybackPageData(await response.text(), href));
}

async function fetchPlaybackResource(url, accept, read) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('请求超时'));
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([timeout, (async () => {
      const response = await fetch(url, { credentials: 'include', headers: { accept }, signal: controller.signal });
      if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
      return await read(response);
    })()]);
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause), { cause });
    error.url = url;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function describeFailure(error) {
  return { source: error.source, message: error.message, status: error.status, code: error.code, url: error.url };
}

function normalizeVideoData(videoData, pageList) {
  if (!videoData) return null;
  const pages = mergeVideoPages(videoData.pages, pageList);
  return {
    ...videoData,
    pages,
    videos: videoData.videos || pages.length,
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
    vip: card.vip || owner.vip,
  };
  if (cardInfo && Object.hasOwn(cardInfo, 'following')) {
    videoData.req_user = {
      ...(videoData.req_user || {}),
      attention: cardInfo.following ? 1 : 0,
    };
  }
}

function mergeVideoPages(primaryPages, pageList) {
  const byPage = new Map();
  const addPage = (page) => {
    if (!page) return;
    const pageNo = Number(page.page || byPage.size + 1);
    byPage.set(pageNo, {
      ...byPage.get(pageNo),
      ...page,
      page: pageNo,
    });
  };
  (Array.isArray(primaryPages) ? primaryPages : []).forEach(addPage);
  (Array.isArray(pageList) ? pageList : []).forEach(addPage);
  return [...byPage.values()].sort((a, b) => Number(a.page || 0) - Number(b.page || 0));
}

function buildInitialStateFromApis({ meta, p, relatedItems, videoData }) {
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
      vip: owner.vip,
    },
    staffData: videoData.staff || [],
    nanoTheme: getPlayerNanoTheme(),
  };
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function resolveCurrentPage(meta, initialState) {
  const href = typeof meta === 'string' ? meta : meta?.href;
  const metaPage = Number(typeof meta === 'object' ? meta?.p || meta?.page || 0 : 0);
  const metaCid = Number(typeof meta === 'object' ? meta?.cid || 0 : 0);
  const cidPage = metaCid && Array.isArray(initialState?.videoData?.pages)
    ? initialState.videoData.pages.find((page) => Number(page?.cid) === metaCid)
    : null;
  if (cidPage?.page) return Number(cidPage.page);

  const parsed = new URL(href, location.href);
  const urlPage = Number(parsed.searchParams.get('p') || parsed.searchParams.get('page') || 0);
  const statePage = Number(initialState?.p || 0);
  const page = metaPage || urlPage || statePage || 1;
  const pageCount = initialState?.videoData?.pages?.length || 0;
  if (!Number.isFinite(page) || page < 1) return 1;
  return pageCount ? Math.min(page, pageCount) : page;
}

function getVideoPage(videoData, p) {
  return videoData?.pages?.find((page) => Number(page.page) === Number(p)) ||
    videoData?.pages?.[Number(p) - 1] ||
    videoData?.pages?.[0] ||
    {};
}

function resolvePlaybackSequence(videoData, pageP, currentPage = null) {
  const episodes = getUgcSeasonEpisodes(videoData);
  const currentAid = Number(videoData?.aid || 0);
  const currentCid = Number(currentPage?.cid || videoData?.cid || 0);
  const bvidEpisodeCount = videoData?.bvid
    ? episodes.filter((episode) => episode?.bvid === videoData.bvid).length
    : 0;
  const currentEpisodeIndex = episodes.findIndex((episode) => {
    const episodeAid = Number(episode?.aid || episode?.arc?.aid || 0);
    if (currentAid && episodeAid && episodeAid === currentAid) return true;
    const episodeCid = Number(episode?.cid || episode?.page?.cid || 0);
    if (currentCid && episodeCid && episodeCid === currentCid) return true;
    return Boolean(episode?.bvid && videoData?.bvid && episode.bvid === videoData.bvid && bvidEpisodeCount <= 1);
  });
  const pageCount = videoData?.pages?.length || 0;
  if (currentEpisodeIndex >= 0 && episodes.length > 1) {
    return {
      p: pageP,
      hasPrev: pageP > 1 || currentEpisodeIndex > 0,
      hasNext: (pageCount > 0 && pageP < pageCount) || currentEpisodeIndex < episodes.length - 1,
      seasonId: videoData?.ugc_season?.id || episodes[currentEpisodeIndex]?.season_id,
    };
  }

  return {
    p: pageP,
    hasPrev: pageP > 1,
    hasNext: pageCount > 0 && pageP < pageCount,
    seasonId: videoData?.season_id,
  };
}

function getUgcSeasonEpisodes(videoData) {
  return (Array.isArray(videoData?.ugc_season?.sections) ? videoData.ugc_season.sections : [])
    .flatMap((section) => Array.isArray(section?.episodes) ? section.episodes : []);
}

function extractPlaylistCardsFromRelatedItems(items, baseUrl, currentBvid) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const bvid = item?.bvid;
      if (!bvid || bvid === currentBvid) return null;
      return {
        bvid,
        href: normalizeVideoHref(item.uri, baseUrl) || normalizeVideoHref(`/video/${bvid}`, baseUrl),
        title: String(item.title || 'Bilibili 视频').replace(/\s+/g, ' ').trim(),
        cover: normalizeResourceUrl(item.pic, baseUrl),
        subtitle: String(item.owner?.name || item.author || '').replace(/\s+/g, ' ').trim(),
        duration: formatDuration(item.duration),
        stats: formatRelatedStats(item),
      };
    })
    .filter((card) => card?.href);
}

function formatRelatedStats(item) {
  const view = formatCount(item?.stat?.view ?? item?.play);
  const danmaku = formatCount(item?.stat?.danmaku ?? item?.video_review);
  return view || danmaku ? { view, danmaku } : '';
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
