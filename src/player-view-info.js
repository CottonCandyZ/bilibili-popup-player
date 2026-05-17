function getTidInfo(channel, tid) {
  if (!channel || !tid) return null;
  for (const item of channel) {
    if (!item?.sub) continue;
    for (const sub of item.sub) {
      if (tid === sub.tid) {
        return {
          name: item.name,
          route: item.route,
          tid: item.tid,
          url: item.url,
          subName: sub.name,
          subRoute: sub.route,
          subUrl: sub.url,
          subTid: sub.tid,
        };
      }
    }
  }
  return null;
}

function getUpStaffs(staffData) {
  if (!Array.isArray(staffData) || !staffData.length) return null;
  return staffData.map((staff) => ({
    face: staff.face,
    mid: staff.mid,
    name: staff.name,
  }));
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function getStats(stat) {
  return compactObject({
    aid: stat?.aid,
    coin: stat?.coin,
    danmaku: stat?.danmaku,
    dislike: stat?.dislike,
    favorite: stat?.favorite,
    hisRank: stat?.his_rank,
    like: stat?.like,
    nowRank: stat?.now_rank,
    reply: stat?.reply,
    share: stat?.share,
    view: stat?.view,
    vt: stat?.vt,
  });
}

function isPositiveState(value) {
  return value === true || value === 1 || value === '1';
}

// TODO: Re-enable native player action controls after the nano action channel is understood.
const PLAYER_NATIVE_ACTIONS_ENABLED = false;

function getStoryType(videoData) {
  if (videoData?.ugc_season?.sections?.length) return 2;
  if ((videoData?.pages?.length || 0) > 1) return 1;
  return 0;
}

function getPageList(videoData) {
  if (!Array.isArray(videoData?.pages) || !videoData.pages.length) return null;
  return videoData.pages.map((page, index) => ({
    aid: videoData.aid,
    bvid: videoData.bvid,
    cid: page.cid,
    duration: page.duration,
    from: page.from,
    hasNext: index < videoData.pages.length - 1,
    hasPrev: index > 0,
    page: page.page,
    p: page.page || index + 1,
    part: page.part,
    title: page.part,
  }));
}

function getUpInfo(initialState) {
  const vd = initialState?.videoData || {};
  const upData = initialState?.upData || vd.owner || {};
  if (!upData?.mid) return null;
  const followed = isPositiveState(vd.req_user?.attention ?? upData.followed);
  return {
    attention: upData.attention,
    face: upData.face,
    fans: upData.fans,
    follow: followed,
    followed,
    isFollowed: followed,
    mid: upData.mid,
    name: upData.name,
    officialVerify: upData.official_verify || upData.officialVerify,
    pendant: upData.pendant,
    sign: upData.sign,
    staffs: getUpStaffs(initialState?.staffData || vd.staff),
    vip: upData.vip,
  };
}

function getManuscriptInfo(initialState) {
  const vd = initialState?.videoData || {};
  return {
    coinDisable: !PLAYER_NATIVE_ACTIONS_ENABLED,
    coinStatus: Number(vd.req_user?.coin) > 0,
    collectDisable: !PLAYER_NATIVE_ACTIONS_ENABLED,
    collectStatus: isPositiveState(vd.req_user?.favorite),
    cover: vd.pic,
    electricStatus: initialState?.elecFullInfo?.show_info?.state,
    likeDisable: !PLAYER_NATIVE_ACTIONS_ENABLED,
    likeIcon: vd.like_icon,
    likeStatus: isPositiveState(vd.req_user?.like),
    list: getPageList(vd),
    related: initialState?.related,
    relatedAutoplay: false,
    stat: vd.stat,
    title: vd.title,
    type: getStoryType(vd),
  };
}

function getManuscriptActionState(initialState) {
  const vd = initialState?.videoData || {};
  return {
    coinDisable: !PLAYER_NATIVE_ACTIONS_ENABLED,
    coinStatus: Number(vd.req_user?.coin) > 0,
    collectDisable: !PLAYER_NATIVE_ACTIONS_ENABLED,
    collectStatus: isPositiveState(vd.req_user?.favorite),
    likeDisable: !PLAYER_NATIVE_ACTIONS_ENABLED,
    likeIcon: vd.like_icon,
    likeStatus: isPositiveState(vd.req_user?.like),
  };
}

export function getPlayerViewInfo(initialState) {
  const vd = initialState?.videoData || {};
  const upInfo = getUpInfo(initialState);
  const manuscriptInfo = getManuscriptInfo(initialState);
  const currentPage = Array.isArray(vd.pages)
    ? vd.pages.find((page) => Number(page.page) === Number(initialState?.p)) || vd.pages[0]
    : null;
  const tidInfo = getTidInfo(initialState?.channelKv || initialState?.channel, vd.tid_v2) ||
    getTidInfo(initialState?.channelKv || initialState?.channel, vd.tid) ||
    { subTid: vd.tid_v2 || vd.tid };
  return {
    upInfo,
    storyInfo: {
      aid: vd.aid,
      bvid: vd.bvid,
      cid: currentPage?.cid || vd.cid || initialState?.cid,
      copyright: vd.copyright,
      cover: vd.pic,
      ctime: vd.ctime,
      desc: vd.desc,
      dimension: vd.dimension,
      duration: vd.duration,
      owner: vd.owner,
      pages: vd.pages,
      pic: vd.pic,
      pubdate: vd.pubdate,
      reqUser: vd.req_user,
      req_user: vd.req_user,
      rights: vd.rights,
      state: vd.state,
      stat: vd.stat,
      title: vd.title,
      type: getStoryType(vd),
      tid: tidInfo.tid,
      tidV2: vd.tid_v2,
      tname: vd.tname,
      tnameV2: vd.tname_v2,
      subTid: tidInfo.subTid,
      stats: getStats(vd.stat),
      ...manuscriptInfo,
    },
  };
}

export function getPlayerExternalState(initialState, internalKind = {}) {
  const upInfo = getUpInfo(initialState);
  const manuscriptInfo = getManuscriptActionState(initialState);
  const followKey = internalKind.Follow ?? 3;
  const upInfoKey = internalKind.UpInfo ?? 6;
  const manuscriptKey = internalKind.Manuscript ?? 7;
  const state = {
    [manuscriptKey]: manuscriptInfo,
  };
  if (upInfo) {
    state[followKey] = upInfo.follow;
    state[upInfoKey] = upInfo;
  }
  return state;
}
