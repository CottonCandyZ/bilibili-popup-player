import { COMMENT_FALLBACK, CORE_FALLBACK, OGV_RE } from './constants.js';
import { getPlayerNanoTheme } from './player-theme.js';
import { normalizeOgvHref, normalizeResourceUrl } from './video-meta.js';

const OGV_SEASON_API = 'https://api.bilibili.com/pgc/view/web/simple/season';
const OGV_SEASON_FALLBACK_API = 'https://api.bilibili.com/pgc/view/web/season';
const OGV_EP_LIST_API = 'https://api.bilibili.com/pgc/view/web/ep/list';
const OGV_RECOMMEND_API = 'https://api.bilibili.com/pgc/season/web/related/recommend';
const OGV_PLAYVIEW_API = 'https://api.bilibili.com/ogv/player/playview';

const DEFAULT_QN = 127;
const DEFAULT_FNVAL = 4048;
const DEFAULT_FNVER = 0;

export function isOgvMeta(meta) {
  return meta?.kind === 'ogv' || Boolean(String(meta?.href || '').match(OGV_RE));
}

export async function resolveOgvPlaybackBootstrap(meta) {
  const request = parseOgvMeta(meta);
  if (!request.seasonId && !request.epId) throw new Error('OGV id not found');

  const ssr = await fetchOgvSsrPlayback(request.href).catch(() => null);
  if (!request.epId && ssr?.epId) request.epId = String(ssr.epId);

  const season = await fetchOgvSeason(request);
  const seasonId = request.seasonId || season?.season_id || season?.id || '';
  const epList = await fetchOgvEpList({ seasonId, epId: request.epId }).catch(() => null);
  const episodes = mergeOgvEpisodeSources(season, epList);
  const selectedEpisode = selectOgvEpisode({ request, ssr, season, episodes });
  if (!season?.season_id && !season?.id) throw new Error('OGV season not found');
  if (!selectedEpisode) throw new Error('OGV episode not found');

  const playViewResponse = isPlayViewResponseForEpisode(ssr?.playViewResponse, selectedEpisode)
    ? ssr.playViewResponse
    : await requestOgvPlayView(buildPlayViewRequest({
      episode: selectedEpisode,
      season,
    }));
  const playResult = playViewResponse?.data?.result || {};
  const episode = mergeEpisodeWithPlayView(selectedEpisode, playResult);
  const normalizedSeason = buildNormalizedSeason(season, epList, episodes);
  const normalizedEpisodes = mergeOgvEpisodeSources(normalizedSeason, epList);
  const playerInfo = buildOgvPlayerInfo({ episode, episodes: normalizedEpisodes, playResult, season: normalizedSeason });
  const initialState = buildOgvInitialState({ episode, epList, meta, playResult, playerInfo, season: normalizedSeason });
  const recommendationCards = await fetchOgvRecommendationCards(playerInfo.seasonId, meta.href).catch(() => []);

  return {
    kind: 'ogv',
    title: buildOgvTitle(normalizedSeason, episode),
    coreScript: ssr?.coreScript || getCurrentCoreScript() || CORE_FALLBACK,
    commentScript: COMMENT_FALLBACK,
    stylesheets: [],
    initialState,
    playInfo: playViewResponse.data,
    playViewResponse,
    recommendationCards,
    playerInfo,
    href: buildOgvEpisodeHref(episode, playerInfo, meta.href),
    requestPlayUrlInfo: (input = {}) => requestOgvPlayView(buildPlayViewRequest({
      input,
      fallbackPlayerInfo: playerInfo,
    })),
    commentInfo: {
      params: `1,${playerInfo.aid}`,
      spmPrefix: '666.25',
      cmFromTrackId: '',
    },
  };
}

function parseOgvMeta(meta) {
  const href = normalizeOgvHref(meta?.href || '');
  const match = href.match(OGV_RE);
  return {
    href,
    seasonId: meta?.seasonId || (match?.[1] === 'ss' ? match[2] : ''),
    epId: meta?.epId || (match?.[1] === 'ep' ? match[2] : ''),
  };
}

async function fetchOgvSeason({ seasonId, epId }) {
  const params = new URLSearchParams();
  if (seasonId) params.set('season_id', String(seasonId));
  else if (epId) params.set('ep_id', String(epId));
  else return null;

  try {
    const payload = await fetchApiJson(`${OGV_SEASON_API}?${params}`);
    return payload.result || payload.data || null;
  } catch (error) {
    const payload = await fetchApiJson(`${OGV_SEASON_FALLBACK_API}?${params}`);
    return payload.result || payload.data || null;
  }
}

async function fetchOgvEpList({ seasonId, epId }) {
  const params = new URLSearchParams();
  if (seasonId) params.set('season_id', String(seasonId));
  else if (epId) params.set('ep_id', String(epId));
  else return null;
  const payload = await fetchApiJson(`${OGV_EP_LIST_API}?${params}`);
  return payload.result || payload.data || null;
}

async function fetchOgvSsrPlayback(href) {
  const url = normalizeOgvHref(href) || href;
  if (!url) return null;
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!response.ok) throw new Error(`OGV SSR request failed: ${response.status}`);
  const html = await response.text();
  const playurlSSRData = extractAssignedJson(html, 'playurlSSRData');
  const playViewResponse = normalizePlayViewResponse(playurlSSRData, 200);
  const result = playViewResponse?.data?.result || null;
  return {
    coreScript: extractCoreScript(html, url),
    epId: getEpisodeIdFromPlayResult(result) || extractOgvEpIdFromHtml(html),
    playViewResponse,
  };
}

async function requestOgvPlayView(request) {
  const response = await fetch(buildPlayViewUrl(), {
    method: 'POST',
    credentials: 'include',
    headers: {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.code !== 0 || !payload?.data) {
    throw new Error(payload?.message || `OGV playview failed: ${response.status}`);
  }
  return normalizePlayViewResponse(payload, response.status);
}

function buildPlayViewUrl() {
  const url = new URL(OGV_PLAYVIEW_API);
  url.searchParams.set('csrf', getCookieValue('bili_jct'));
  return url.href;
}

function buildPlayViewRequest({ episode = null, season = null, input = {}, fallbackPlayerInfo = {} }) {
  const videoIndex = input.video_index || {};
  const videoParam = input.video_param || {};
  const playerParam = input.player_param || {};
  const aid = pickDefined(input.aid, videoIndex.aid, episode?.aid, fallbackPlayerInfo.aid);
  const bvid = pickDefined(input.bvid, videoIndex.bvid, episode?.bvid, fallbackPlayerInfo.bvid);
  const cid = pickDefined(input.cid, videoIndex.cid, episode?.cid, fallbackPlayerInfo.cid);
  const seasonId = pickDefined(
    input.season_id,
    input.seasonId,
    videoIndex.ogv_season_id,
    episode?.season_id,
    season?.season_id,
    fallbackPlayerInfo.seasonId,
  );
  const epId = pickDefined(
    input.ep_id,
    input.epId,
    input.episodeId,
    input.episode_id,
    videoIndex.ogv_episode_id,
    episode?.ep_id,
    episode?.id,
    fallbackPlayerInfo.epId,
  );
  const qn = toPositiveNumber(pickDefined(input.qn, videoParam.qn, getInitialOgvQuality()), DEFAULT_QN);
  const fnval = toPositiveNumber(pickDefined(input.fnval, playerParam.fnval, getNumericCookieValue('CURRENT_FNVAL')), DEFAULT_FNVAL);
  const fnver = toNonNegativeNumber(pickDefined(input.fnver, playerParam.fnver), DEFAULT_FNVER);
  const drmTechType = pickDefined(input.drm_tech_type, input.drmTechType, playerParam.drm_tech_type);

  return {
    scene: input.scene || 'normal',
    video_index: {
      ...videoIndex,
      aid: toPositiveNumber(aid, undefined),
      bvid,
      cid: toPositiveNumber(cid, undefined),
      ogv_season_id: toPositiveNumber(seasonId, undefined),
      ogv_episode_id: toPositiveNumber(epId, undefined),
    },
    video_param: {
      ...videoParam,
      qn,
    },
    player_param: {
      ...playerParam,
      fnver,
      fnval,
      drm_tech_type: drmTechType,
    },
    exp_info: {
      ...(input.exp_info || {}),
      ...(input.expInfo || {}),
      ogv_half_pay: true,
    },
  };
}

function normalizePlayViewResponse(payload, fallbackStatus = 200) {
  const data = payload?.data || payload;
  const rawResult = data?.result || null;
  if (!rawResult) return null;
  return {
    status: payload?.status || fallbackStatus,
    data: {
      code: data?.code ?? payload?.code ?? 0,
      message: data?.message || payload?.message || '',
      result: parsePlayViewResult(rawResult),
    },
  };
}

function parsePlayViewResult(raw) {
  if (!raw) return {};
  const viewInfo = parseViewInfo(raw);
  const qualityTrial = Boolean(viewInfo?.qn_trial_info?.trial_able || viewInfo?.ai_repair_qn_trial_info?.trial_able);
  const result = undefinedToNull({
    ...raw,
    fragment_videos: parseFragmentVideos(raw),
    play_check: parsePlayCheck(raw),
    play_view_business_info: parsePlayViewBusinessInfo(raw, qualityTrial),
    video_info: parseVideoInfo(raw),
    view_info: viewInfo,
  });
  delete result.fragments;
  delete result.watch_progress;
  Object.keys(result).forEach((key) => {
    if (result[key] === undefined || result[key] === null) delete result[key];
  });
  return result;
}

function parsePlayCheck(raw) {
  const map = {
    whole: 'PLAY_WHOLE',
    preview: 'PLAY_PREVIEW',
    none: 'PLAY_NONE',
  };
  return raw.play_check || {
    play_detail: map[raw.play_video_type] || 'PLAY_WHOLE',
  };
}

function parsePlayViewBusinessInfo(raw, qualityTrial) {
  if (raw.play_view_business_info) return raw.play_view_business_info;
  const arc = raw.arc || {};
  const episode = raw.supplement?.ogv_episode_info || {};
  const season = raw.supplement?.ogv_season_info || {};
  const progress = raw.supplement?.ogv_season_watch_progress || {};
  return {
    user_status: {
      ...(raw.user_status || {}),
      pay_info: {
        pay_check: getPayCheckStatus(raw, qualityTrial),
      },
      watch_progress: {
        last_ep_id: progress.last_ep_id || 0,
        last_ep_index: progress.last_ep_index_title || '',
        last_time: progress.last_ep_progress || 0,
        current_watch_progress: raw.watch_progress?.current_progress || 0,
      },
    },
    episode_info: {
      aid: arc.aid,
      bvid: arc.bvid,
      cid: arc.cid,
      ep_id: episode.episode_id,
      ep_status: episode.episode_status,
      long_title: episode.long_title,
      title: episode.index_title,
    },
    season_info: {
      season_id: season.season_id,
      season_type: season.season_type,
    },
  };
}

function getPayCheckStatus(raw, qualityTrial) {
  if (raw.play_video_type !== 'whole' || qualityTrial) return false;
  return Boolean(raw.video_info?.dash?.video?.some((item) => Number(item?.id) >= 112));
}

function parseVideoInfo(raw) {
  const videoInfo = raw.video_info || {};
  return {
    ...videoInfo,
    clip_info_list: parseClipInfoList(raw.video_extra?.clip_info) || videoInfo.clip_info_list,
    is_drm: raw.arc?.is_drm ?? videoInfo.is_drm,
    is_preview: raw.play_video_type === 'preview',
    record_info: raw.supplement?.record_number
      ? {
        record: raw.supplement.record_number.text || '',
        record_icon: raw.supplement.record_number.icon || '',
      }
      : videoInfo.record_info,
  };
}

function parseClipInfoList(clipInfos = []) {
  if (!Array.isArray(clipInfos)) return null;
  return clipInfos
    .map((item) => ({
      clipType: item.clip_type === 1 ? 'CLIP_TYPE_OP' : item.clip_type === 2 ? 'CLIP_TYPE_ED' : 'NT_UNKNOWN',
      start: item.start,
      end: item.end,
    }))
    .filter((item) => item.clipType !== 'NT_UNKNOWN');
}

function parseFragmentVideos(raw) {
  if (raw.fragment_videos) return raw.fragment_videos;
  if (!Array.isArray(raw.fragments) || !raw.fragments.length) return null;
  return raw.fragments.map((fragment) => ({
    ...fragment,
    playable_status: fragment.playable,
  }));
}

function parseViewInfo(raw) {
  if (raw.view_info) return raw.view_info;
  const plugins = Array.isArray(raw.plugins) ? raw.plugins : [];
  const result = {};
  const qnTrial = parsePluginConfig(plugins.find((item) => item.name === 'VipQualityTrialPlugin'));
  const aiRepairTrial = parsePluginConfig(plugins.find((item) => item.name === 'AIRepairQnTrialPlugin'));
  if (qnTrial?.trial_able) result.qn_trial_info = qnTrial;
  if (aiRepairTrial?.trial_able) result.ai_repair_qn_trial_info = aiRepairTrial;
  return Object.keys(result).length ? result : null;
}

function parsePluginConfig(plugin) {
  try {
    return plugin?.config?.data ? JSON.parse(plugin.config.data) : null;
  } catch {
    return null;
  }
}

function isPlayViewResponseForEpisode(response, episode) {
  const result = response?.data?.result;
  if (!result || !episode) return false;
  const responseEpId = Number(getEpisodeIdFromPlayResult(result) || 0);
  const episodeEpId = Number(episode.ep_id || episode.id || episode.episode_id || 0);
  if (responseEpId && episodeEpId) return responseEpId === episodeEpId;
  const responseCid = Number(result.play_view_business_info?.episode_info?.cid || result.arc?.cid || 0);
  return Boolean(responseCid && Number(episode.cid || 0) === responseCid);
}

function getEpisodeIdFromPlayResult(result) {
  return Number(
    result?.play_view_business_info?.episode_info?.ep_id ||
    result?.supplement?.ogv_episode_info?.episode_id ||
    result?.episode_info?.ep_id ||
    0,
  ) || 0;
}

function mergeEpisodeWithPlayView(episode, playResult) {
  const episodeInfo = playResult.play_view_business_info?.episode_info || {};
  const seasonInfo = playResult.play_view_business_info?.season_info || {};
  const supplementEpisode = playResult.supplement?.ogv_episode_info || {};
  const arc = playResult.arc || {};
  return {
    ...episode,
    aid: episode.aid || episodeInfo.aid || arc.aid,
    bvid: episode.bvid || episodeInfo.bvid || arc.bvid,
    cid: episode.cid || episodeInfo.cid || arc.cid,
    ep_id: episode.ep_id || episode.id || episodeInfo.ep_id || supplementEpisode.episode_id,
    season_id: episode.season_id || seasonInfo.season_id,
    long_title: episode.long_title || episodeInfo.long_title || supplementEpisode.long_title,
    title: episode.title || episodeInfo.title || supplementEpisode.index_title,
  };
}

function buildOgvPlayerInfo({ episode, episodes, playResult, season }) {
  const business = playResult.play_view_business_info || {};
  const episodeInfo = business.episode_info || {};
  const seasonInfo = business.season_info || {};
  const epId = Number(episodeInfo.ep_id || episode.ep_id || episode.id || 0);
  const currentIndex = episodes.findIndex((item) => Number(item?.ep_id || item?.id || 0) === epId);
  return {
    kind: 'ogv',
    aid: Number(episodeInfo.aid || episode.aid || playResult.arc?.aid || 0),
    bvid: episodeInfo.bvid || episode.bvid || playResult.arc?.bvid || '',
    cid: Number(episodeInfo.cid || episode.cid || playResult.arc?.cid || 0),
    p: 1,
    t: 0,
    hasPrev: currentIndex > 0,
    hasNext: currentIndex >= 0 && currentIndex < episodes.length - 1,
    seasonId: Number(seasonInfo.season_id || episode.season_id || season.season_id || 0),
    seasonType: Number(seasonInfo.season_type || season.season_type || 0),
    epId,
  };
}

function buildOgvInitialState({ episode, epList, meta, playResult, playerInfo, season }) {
  const videoData = buildOgvVideoData({ episode, epList, playResult, playerInfo, season });
  return {
    aid: playerInfo.aid,
    bvid: playerInfo.bvid,
    cid: playerInfo.cid,
    p: 1,
    videoData,
    related: [],
    sectionsInfo: season,
    sectionsFavState: false,
    ogvSeason: season,
    ogvEpList: epList,
    ogvCurrentEpisode: episode,
    spmidPrefix: '666.25',
    upData: videoData.owner,
    staffData: [],
    nanoTheme: getPlayerNanoTheme(),
    href: buildOgvEpisodeHref(episode, playerInfo, meta.href),
  };
}

function buildOgvVideoData({ episode, epList, playResult, playerInfo, season }) {
  const title = cleanText(season.title || season.season_title) || 'Bilibili 番剧';
  const episodeTitle = cleanText(episode.show_title || buildOgvEpisodeTitle(episode)) || title;
  const duration = normalizeOgvDurationSeconds(episode.duration || playResult.video_info?.timelength);
  const stat = normalizeOgvStat(season, episode);
  return {
    aid: playerInfo.aid,
    bvid: playerInfo.bvid,
    cid: playerInfo.cid,
    copyright: 2,
    ctime: episode.pub_time || 0,
    desc: cleanText(season.evaluate || season.share_sub_title || season.subtitle || ''),
    duration,
    ogv_episode: episode,
    ogv_ep_list: epList,
    ogv_season: season,
    owner: {
      mid: 0,
      name: title,
      face: season.square_cover || season.cover || episode.cover,
      sign: cleanText(season.subtitle || season.share_sub_title || ''),
    },
    pages: [{
      cid: playerInfo.cid,
      duration,
      from: 'bangumi',
      page: 1,
      part: episodeTitle,
    }],
    pic: episode.cover || season.cover || season.square_cover || '',
    pubdate: episode.pub_time || 0,
    req_user: {
      attention: season.user_status?.follow || season.user_status?.follow_status || 0,
    },
    rights: episode.rights || season.rights || {},
    season_id: playerInfo.seasonId,
    stat,
    title,
    tname: cleanText((Array.isArray(season.styles) ? season.styles : []).map((item) => item?.name || item).filter(Boolean).join(' / ')),
    videos: mergeOgvEpisodeSources(season, epList).length || 1,
  };
}

function buildNormalizedSeason(season, epList, episodes) {
  const mergedEpisodes = mergeOgvEpisodeSources(season, epList);
  return {
    ...season,
    season_id: season.season_id || season.id,
    episodes: mergedEpisodes.length ? mergedEpisodes : episodes,
    sections: normalizeOgvSections(season, epList),
  };
}

function mergeOgvEpisodeSources(season, epList) {
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
  [
    ...(Array.isArray(season?.episodes) ? season.episodes : []),
    ...(Array.isArray(epList?.episodes) ? epList.episodes : []),
    ...extractSectionEpisodes(season),
    ...extractSectionEpisodes(epList),
  ].forEach(add);
  return [...merged.values()];
}

function extractSectionEpisodes(source) {
  return [
    ...(Array.isArray(source?.section) ? source.section : []),
    ...(Array.isArray(source?.sections) ? source.sections : []),
  ].flatMap((section) => Array.isArray(section?.episodes) ? section.episodes : []);
}

function normalizeOgvSections(season, epList) {
  const seen = new Set();
  return [
    ...(Array.isArray(season?.section) ? season.section : []),
    ...(Array.isArray(season?.sections) ? season.sections : []),
    ...(Array.isArray(epList?.section) ? epList.section : []),
    ...(Array.isArray(epList?.sections) ? epList.sections : []),
  ].filter((section) => {
    const key = section?.id || section?.title || section?.section_title || section?.name || JSON.stringify(section?.episodes?.[0] || {});
    if (!key || seen.has(key) || !Array.isArray(section?.episodes) || !section.episodes.length) return false;
    seen.add(key);
    return true;
  });
}

function selectOgvEpisode({ request, ssr, season, episodes }) {
  const targetEpId = Number(request.epId || ssr?.epId || getEpisodeIdFromPlayResult(ssr?.playViewResponse?.data?.result) || 0);
  if (targetEpId) {
    const matched = episodes.find((episode) => Number(episode?.ep_id || episode?.id || episode?.episode_id || 0) === targetEpId);
    if (matched) return matched;
  }
  const newEpId = Number(season?.new_ep?.id || 0);
  if (newEpId) {
    const matched = episodes.find((episode) => Number(episode?.ep_id || episode?.id || episode?.episode_id || 0) === newEpId);
    if (matched) return matched;
  }
  return episodes.find((episode) => Number(episode?.status || episode?.episode_status || 2) > 0) || episodes[0] || null;
}

async function fetchOgvRecommendationCards(seasonId, baseUrl) {
  if (!seasonId) return [];
  const payload = await fetchApiJson(`${OGV_RECOMMEND_API}?season_id=${encodeURIComponent(seasonId)}`);
  const result = payload.data || payload.result || {};
  return (Array.isArray(result.season) ? result.season : [])
    .map((item) => {
      const itemSeasonId = item?.season_id;
      const href = normalizeOgvHref(item.url || item.link || (itemSeasonId ? `/bangumi/play/ss${itemSeasonId}` : ''), baseUrl);
      if (!itemSeasonId || !href) return null;
      return {
        kind: 'ogv',
        seasonId: String(itemSeasonId),
        href,
        title: cleanText(item.title || item.season_title || 'Bilibili 番剧'),
        cover: normalizeResourceUrl(item.cover || item.new_ep?.cover, baseUrl),
        subtitle: cleanText(item.subtitle || item.rcmd_reason || item.new_ep?.index_show || ''),
        stats: {
          view: formatCount(item.stat?.view ?? item.stat?.views),
          danmaku: formatCount(item.stat?.danmaku ?? item.stat?.danmakus),
        },
      };
    })
    .filter((card) => card?.href);
}

function buildOgvEpisodeHref(episode, playerInfo, baseUrl) {
  return normalizeOgvHref(episode.link || episode.share_url || episode.url || '', baseUrl) ||
    normalizeOgvHref(playerInfo.epId ? `/bangumi/play/ep${playerInfo.epId}` : `/bangumi/play/ss${playerInfo.seasonId}`, baseUrl) ||
    baseUrl;
}

function normalizeOgvStat(season, episode) {
  const stat = season.stat || {};
  const epStat = episode.stat || {};
  return {
    aid: episode.aid,
    coin: epStat.coin || stat.coins,
    danmaku: epStat.danmaku || epStat.danmakus || stat.danmaku || stat.danmakus,
    favorite: epStat.favorite || stat.favorite || stat.favorites,
    like: epStat.like || epStat.likes || stat.likes,
    reply: epStat.reply || stat.reply,
    share: epStat.share || stat.share,
    view: epStat.play || epStat.view || stat.view || stat.views,
    vt: epStat.vt || stat.vt,
  };
}

function buildOgvTitle(season, episode) {
  const seasonTitle = cleanText(season.title || season.season_title);
  const episodeTitle = cleanText(episode.show_title || buildOgvEpisodeTitle(episode));
  if (seasonTitle && episodeTitle) return `${seasonTitle} ${episodeTitle}`;
  return seasonTitle || episodeTitle || 'Bilibili 番剧';
}

function buildOgvEpisodeTitle(episode) {
  const title = cleanText(episode.title || episode.index_title);
  const longTitle = cleanText(episode.long_title);
  if (title && longTitle) return `第${title}话 ${longTitle}`;
  if (title) return `第${title}话`;
  return longTitle;
}

async function fetchApiJson(url) {
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      accept: 'application/json, text/plain, */*',
    },
  });
  if (!response.ok) throw new Error(`OGV API request failed: ${response.status}`);
  const payload = await response.json();
  if (payload?.code !== 0) throw new Error(payload?.message || `OGV API error: ${payload?.code}`);
  return payload;
}

function extractAssignedJson(html, name) {
  const text = String(html || '');
  const pattern = new RegExp(`(?:const|let|var)\\s+${name}\\s*=`);
  const match = pattern.exec(text);
  if (!match) return null;
  const start = text.indexOf('{', match.index + match[0].length);
  if (start < 0) return null;
  const json = readJsonObjectAt(text, start);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function readJsonObjectAt(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return '';
}

function extractCoreScript(html, baseUrl) {
  return normalizeResourceUrl(
    String(html || '').match(/<script[^>]+src=["']([^"']*\/player\/main\/core\.[^"']+\.js)["']/)?.[1] || '',
    baseUrl,
  );
}

function extractOgvEpIdFromHtml(html) {
  return Number(
    String(html || '').match(/\/bangumi\/play\/ep(\d+)/)?.[1] ||
    String(html || '').match(/"ep_id"\s*:\s*(\d+)/)?.[1] ||
    0,
  ) || 0;
}

function getCurrentCoreScript() {
  if (typeof document === 'undefined') return '';
  return [...(document.querySelectorAll?.('script[src*="/player/main/core."]') || [])]
    .map((script) => normalizeResourceUrl(script.getAttribute('src')))
    .find(Boolean) || '';
}

function getInitialOgvQuality() {
  const memoryQuality = getOgvMemoryQuality();
  if (memoryQuality) return memoryQuality;
  return getNumericCookieValue('CURRENT_QUALITY') || DEFAULT_QN;
}

function getOgvMemoryQuality() {
  if (typeof localStorage === 'undefined') return 0;
  const quality = String(localStorage.getItem('OGV_MEMORY_QUALITY') || '').split(';')
    .map((item) => item.split('='))
    .find(([key]) => key === 'quality')?.[1];
  return toPositiveNumber(quality, 0);
}

function getNumericCookieValue(name) {
  return toPositiveNumber(getCookieValue(name), 0);
}

function getCookieValue(name) {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

function normalizeOgvDurationSeconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return number > 100000 ? Math.round(number / 1000) : Math.round(number);
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

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function pickDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function toPositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function toNonNegativeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function undefinedToNull(value) {
  if (Array.isArray(value)) return value.map(undefinedToNull);
  if (!value || typeof value !== 'object') return value === undefined ? null : value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    item === undefined ? null : undefinedToNull(item),
  ]));
}
