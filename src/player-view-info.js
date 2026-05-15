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
  if (!Array.isArray(staffData)) return [];
  return staffData.map((staff) => ({
    face: staff.face,
    follower: staff.follower,
    label: staff.label,
    mid: staff.mid,
    name: staff.name,
    official: staff.official,
    title: staff.title,
    vip: staff.vip,
  }));
}

export function getPlayerViewInfo(initialState) {
  const vd = initialState.videoData || {};
  const upData = initialState.upData || {};
  const page = vd.pages?.[(Number(initialState.p || 1) - 1)] || vd.pages?.[0] || {};
  return {
    aid: vd.aid,
    bvid: vd.bvid,
    cid: page.cid || initialState.cid,
    copyright: vd.copyright,
    ctime: vd.ctime,
    desc: vd.desc,
    dimension: page.dimension || vd.dimension,
    duration: vd.duration,
    enable_vt: vd.enable_vt,
    honor_reply: vd.honor_reply,
    is_360: vd.is_360,
    is_owner: vd.is_owner,
    is_upower_exclusive: vd.is_upower_exclusive,
    is_upower_play: vd.is_upower_play,
    is_upower_preview: vd.is_upower_preview,
    mission_id: vd.mission_id,
    no_cache: vd.no_cache,
    owner: vd.owner || {
      mid: upData.mid,
      name: upData.name,
      face: upData.face,
    },
    pages: vd.pages,
    pic: vd.pic,
    premiere: vd.premiere,
    pubdate: vd.pubdate,
    rights: vd.rights,
    staff: getUpStaffs(vd.staff),
    stat: vd.stat,
    teenage_mode: vd.teenage_mode,
    tid: vd.tid,
    tid_info: getTidInfo(initialState.channel, vd.tid),
    title: vd.title,
    tname: vd.tname,
    videos: vd.videos,
  };
}
