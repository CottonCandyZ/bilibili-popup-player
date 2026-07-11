const ARCHIVE_LIKE_API = 'https://api.bilibili.com/x/web-interface/archive/like';
const ARCHIVE_COIN_API = 'https://api.bilibili.com/x/web-interface/coin/add';
const ARCHIVE_TRIPLE_API = 'https://api.bilibili.com/x/web-interface/archive/like/triple';
const ARCHIVE_RELATION_API = 'https://api.bilibili.com/x/web-interface/archive/relation';
const COIN_TODAY_EXP_API = 'https://api.bilibili.com/x/web-interface/coin/today/exp';
const FAVORITE_FOLDERS_API = 'https://api.bilibili.com/x/v3/fav/folder/created/list-all';
const FAVORITE_FOLDER_ADD_API = 'https://api.bilibili.com/x/v3/fav/folder/add';
const FAVORITE_DEAL_API = 'https://api.bilibili.com/x/v3/fav/resource/deal';
const OGV_TRIPLE_API = 'https://api.bilibili.com/pgc/season/episode/like/triple';
const OGV_COIN_INFO_API = 'https://api.bilibili.com/pgc/season/episode/coin/user/number';

export async function requestArchiveLike(aid, like = true) {
  const normalizedAid = Number(aid);
  if (!Number.isFinite(normalizedAid) || normalizedAid <= 0) throw new Error('缺少 aid');

  const csrf = getCookieValue('bili_jct');
  if (!csrf) throw new Error('需要登录后才能点赞');

  const response = await fetch(ARCHIVE_LIKE_API, {
    method: 'POST',
    credentials: 'include',
    headers: {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body: new URLSearchParams({
      aid: String(Math.trunc(normalizedAid)),
      like: like ? '1' : '2',
      csrf,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`请求失败：${response.status}`);
  if (!payload || payload.code !== 0) throw new Error(payload?.message || '点赞失败');
  return payload;
}

export async function fetchArchiveRelation(aid) {
  const normalizedAid = normalizePositiveId(aid, 'aid');
  return requestJson(`${ARCHIVE_RELATION_API}?aid=${normalizedAid}`);
}

export async function requestArchiveCoin(aid, multiply = 1, alsoLike = false) {
  const normalizedAid = normalizePositiveId(aid, 'aid');
  return requestForm(ARCHIVE_COIN_API, {
    aid: normalizedAid,
    multiply: Math.max(1, Math.min(2, Math.trunc(Number(multiply) || 1))),
    select_like: alsoLike ? 1 : 0,
  });
}

export async function fetchCoinTodayExp() {
  const payload = await requestJson(COIN_TODAY_EXP_API);
  return Math.max(0, Number(payload?.data || 0));
}

export async function fetchOgvCoinInfo(epId) {
  const normalizedEpId = normalizePositiveId(epId, 'ep_id');
  const payload = await requestJson(`${OGV_COIN_INFO_API}?ep_id=${normalizedEpId}`);
  return payload?.result || payload?.data || {};
}

export async function requestArchiveTriple(aid, bvid = '') {
  const normalizedAid = normalizePositiveId(aid, 'aid');
  return requestForm(ARCHIVE_TRIPLE_API, {
    aid: normalizedAid,
    bvid: String(bvid || ''),
  });
}

export async function fetchFavoriteFolders(aid, type = 2) {
  const normalizedAid = normalizePositiveId(aid, 'aid');
  const normalizedType = normalizeFavoriteType(type);
  const params = new URLSearchParams({ type: String(normalizedType), rid: normalizedAid });
  const userMid = getCookieValue('DedeUserID');
  if (userMid) params.set('up_mid', userMid);
  const payload = await requestJson(`${FAVORITE_FOLDERS_API}?${params}`);
  return Array.isArray(payload?.data?.list) ? payload.data.list : [];
}

export async function requestFavoriteFolders(aid, addIds = [], removeIds = [], type = 2) {
  const normalizedAid = normalizePositiveId(aid, 'aid');
  return requestForm(FAVORITE_DEAL_API, {
    rid: normalizedAid,
    type: normalizeFavoriteType(type),
    add_media_ids: normalizeIdList(addIds).join(','),
    del_media_ids: normalizeIdList(removeIds).join(','),
    platform: 'web',
  });
}

export async function requestCreateFavoriteFolder(title) {
  const normalizedTitle = String(title || '').trim();
  if (!normalizedTitle) throw new Error('请输入收藏夹名称');
  if (normalizedTitle.length > 20) throw new Error('收藏夹名称不能超过 20 个字');
  return requestForm(FAVORITE_FOLDER_ADD_API, {
    title: normalizedTitle,
    intro: '',
    privacy: 0,
    cover: '',
  });
}

export async function requestOgvTriple(epId) {
  const normalizedEpId = normalizePositiveId(epId, 'ep_id');
  return requestForm(OGV_TRIPLE_API, {
    ep_id: normalizedEpId,
    is_follow: 0,
  });
}

async function requestJson(url) {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { accept: 'application/json, text/plain, */*' },
  });
  const payload = await response.json().catch(() => null);
  assertPayload(response, payload);
  return payload;
}

async function requestForm(url, values) {
  const csrf = getCookieValue('bili_jct');
  if (!csrf) throw new Error('需要登录后才能操作');
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body: new URLSearchParams({
      ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)])),
      csrf,
    }),
  });
  const payload = await response.json().catch(() => null);
  assertPayload(response, payload);
  return payload;
}

function assertPayload(response, payload) {
  if (!response.ok) throw new Error(`请求失败：${response.status}`);
  if (!payload || payload.code !== 0) throw new Error(payload?.message || `操作失败：${payload?.code ?? 'unknown'}`);
}

function normalizePositiveId(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`缺少 ${name}`);
  return String(Math.trunc(number));
}

function normalizeIdList(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.trunc(value)))];
}

function normalizeFavoriteType(type) {
  return Number(type) === 42 ? 42 : 2;
}

function getCookieValue(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const item = document.cookie
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : '';
}
