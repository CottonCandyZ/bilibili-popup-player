const ARCHIVE_LIKE_API = 'https://api.bilibili.com/x/web-interface/archive/like';

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

function getCookieValue(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const item = document.cookie
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : '';
}
