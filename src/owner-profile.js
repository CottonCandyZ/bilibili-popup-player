const OWNER_CARD_API = 'https://api.bilibili.com/x/web-interface/card';

export async function fetchOwnerProfile(mid) {
  const normalizedMid = Number(mid);
  if (!Number.isFinite(normalizedMid) || normalizedMid <= 0) throw new Error('缺少 UP 主 mid');

  const url = new URL(OWNER_CARD_API);
  url.searchParams.set('mid', String(Math.trunc(normalizedMid)));
  url.searchParams.set('photo', 'true');

  const response = await fetch(url.href, {
    credentials: 'include',
    headers: {
      accept: 'application/json, text/plain, */*',
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`请求失败：${response.status}`);
  if (!payload || payload.code !== 0) throw new Error(payload?.message || 'UP 主资料加载失败');

  const card = payload.data?.card || {};
  return {
    attention: card.attention,
    face: String(card.face || ''),
    fans: payload.data?.follower ?? card.fans ?? card.follower,
    followed: Boolean(payload.data?.following),
    mid: normalizedMid,
    name: String(card.name || ''),
    officialVerify: card.official_verify || null,
    pendant: card.pendant || null,
    sign: String(card.sign || '').trim(),
    vip: card.vip || null,
  };
}
