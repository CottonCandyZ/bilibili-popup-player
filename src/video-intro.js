import { APP } from './constants.js';
import { normalizeResourceUrl } from './video-meta.js';

const RELATION_MODIFY_API = 'https://api.bilibili.com/x/relation/modify';
const OWNER_CARD_API = 'https://api.bilibili.com/x/web-interface/card';

export function renderVideoIntro({
  targetDocument = document,
  mount,
  bootstrap,
  followBusy = false,
  onFollow,
}) {
  if (!mount) return;

  const info = getVideoIntroInfo(bootstrap);
  mount.textContent = '';
  mount.hidden = !info.owner.mid && !info.description;
  if (mount.hidden) return;

  mount.className = `${APP}__video-intro`;

  const up = targetDocument.createElement('div');
  up.className = `${APP}__video-intro-up`;

  if (info.owner.face) {
    const avatar = targetDocument.createElement('img');
    avatar.className = `${APP}__video-intro-avatar`;
    avatar.src = info.owner.face;
    avatar.alt = '';
    avatar.loading = 'lazy';
    up.appendChild(avatar);
  }

  const main = targetDocument.createElement('div');
  main.className = `${APP}__video-intro-main`;
  const name = targetDocument.createElement(info.owner.href ? 'a' : 'span');
  name.className = `${APP}__video-intro-name`;
  name.textContent = info.owner.name || 'UP 主';
  if (info.owner.href) {
    name.href = info.owner.href;
    name.target = '_blank';
    name.rel = 'noreferrer';
  }
  main.appendChild(name);

  const meta = targetDocument.createElement('div');
  meta.className = `${APP}__video-intro-meta`;
  meta.textContent = info.meta.join(' · ');
  main.appendChild(meta);

  if (info.owner.sign) {
    const sign = targetDocument.createElement('div');
    sign.className = `${APP}__video-intro-owner-desc`;
    sign.textContent = info.owner.sign;
    main.appendChild(sign);
  }
  up.appendChild(main);

  if (info.owner.mid) {
    const follow = targetDocument.createElement('button');
    follow.type = 'button';
    follow.className = `${APP}__video-intro-follow`;
    follow.classList.toggle(`${APP}__video-intro-follow--active`, info.followed);
    const label = followBusy ? '处理中' : (info.followed ? '已关注' : '关注');
    follow.dataset.label = label;
    follow.dataset.hoverLabel = info.followed && !followBusy ? '取消关注' : label;
    follow.setAttribute('aria-label', info.followed ? '取消关注 UP 主' : '关注 UP 主');
    follow.disabled = followBusy;
    follow.title = info.followed ? '取消关注 UP 主' : '关注 UP 主';
    follow.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onFollow?.(info.owner.mid, !info.followed);
    });
    up.appendChild(follow);
  }

  mount.appendChild(up);

  if (info.description) {
    const description = targetDocument.createElement('div');
    description.className = `${APP}__video-intro-desc`;
    const title = targetDocument.createElement('div');
    title.className = `${APP}__video-intro-desc-title`;
    title.textContent = '视频简介';
    const text = targetDocument.createElement('div');
    text.className = `${APP}__video-intro-desc-text`;
    text.textContent = info.description;
    description.append(title, text);
    mount.appendChild(description);
  }
}

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
    face: String(card.face || ''),
    fans: payload.data?.follower ?? card.fans ?? card.follower,
    followed: Boolean(payload.data?.following),
    mid: normalizedMid,
    name: String(card.name || ''),
    sign: String(card.sign || '').trim(),
  };
}

export async function requestFollowUp(mid, follow = true) {
  const normalizedMid = Number(mid);
  if (!Number.isFinite(normalizedMid) || normalizedMid <= 0) throw new Error('缺少 UP 主 mid');

  const csrf = getCookieValue('bili_jct');
  if (!csrf) throw new Error(follow ? '需要登录后才能关注' : '需要登录后才能取消关注');

  const response = await fetch(RELATION_MODIFY_API, {
    method: 'POST',
    credentials: 'include',
    headers: {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body: new URLSearchParams({
      fid: String(Math.trunc(normalizedMid)),
      act: follow ? '1' : '2',
      re_src: '11',
      csrf,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`请求失败：${response.status}`);
  if (!payload || payload.code !== 0) throw new Error(payload?.message || (follow ? '关注失败' : '取消关注失败'));
  return payload;
}

function getVideoIntroInfo(bootstrap) {
  const videoData = bootstrap?.initialState?.videoData || {};
  const owner = videoData.owner || {};
  const mid = Number(owner.mid);
  const description = getDescriptionText(videoData);
  const meta = [];
  const publishedAt = formatDate(videoData.pubdate || videoData.ctime);
  if (publishedAt) meta.push(publishedAt);
  const fans = formatCount(owner.fans);
  if (fans) meta.push(`${fans} 粉丝`);

  return {
    description,
    followed: videoData.req_user?.attention === true ||
      videoData.req_user?.attention === 1 ||
      videoData.req_user?.attention === '1',
    meta,
    owner: {
      mid: Number.isFinite(mid) && mid > 0 ? mid : 0,
      name: String(owner.name || '').trim(),
      face: normalizeResourceUrl(owner.face, bootstrap?.href || location.href),
      href: Number.isFinite(mid) && mid > 0 ? `https://space.bilibili.com/${Math.trunc(mid)}` : '',
      sign: String(owner.sign || '').trim(),
    },
  };
}

function getDescriptionText(videoData) {
  const desc = String(videoData?.desc || '').trim();
  if (desc) return desc;
  if (!Array.isArray(videoData?.desc_v2)) return '';
  return videoData.desc_v2
    .map((item) => String(item?.raw_text || item?.text || '').trim())
    .filter(Boolean)
    .join('\n');
}

function formatDate(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const date = new Date(seconds * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

function getCookieValue(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const item = document.cookie
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : '';
}
