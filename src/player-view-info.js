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

export function getPlayerViewInfo(initialState) {
  const vd = initialState?.videoData || {};
  const upData = initialState?.upData || vd.owner || {};
  const tidInfo = getTidInfo(initialState?.channelKv || initialState?.channel, vd.tid_v2) ||
    getTidInfo(initialState?.channelKv || initialState?.channel, vd.tid) ||
    { subTid: vd.tid_v2 || vd.tid };
  return {
    upInfo: upData?.mid ? {
      mid: upData.mid,
      name: upData.name,
      face: upData.face,
      fans: upData.fans,
      staffs: getUpStaffs(initialState?.staffData || vd.staff),
    } : null,
    storyInfo: {
      title: vd.title,
      tid: tidInfo.tid,
      subTid: tidInfo.subTid,
      likeIcon: vd.like_icon,
      electricStatus: initialState?.elecFullInfo?.show_info?.state,
      stats: {
        like: vd.stat?.like,
        share: vd.stat?.share,
        reply: vd.stat?.reply,
        coin: vd.stat?.coin,
      },
    },
  };
}
