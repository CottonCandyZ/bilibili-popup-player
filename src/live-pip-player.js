export function installLivePipGlobals(targetWindow, bootstrap) {
  const now = Date.now();
  const rnd = Math.floor(now / 1000);
  targetWindow.BilibiliLive = {
    INIT_TIME: now,
    RND: rnd,
    UID: 0,
    ROOMID: bootstrap.playerInfo?.roomId || 0,
    ANCHOR_UID: bootstrap.playerInfo?.uid || 0,
  };
  targetWindow.DANMU_RND = rnd;
  targetWindow.webPlayerAbTest = {};
  targetWindow.__RoomPlayerReportData__ = {
    startLoadPlayer: targetWindow.performance?.now?.() || 0,
  };
  targetWindow.__NEPTUNE_IS_MY_WAIFU__ = {
    roomInitRes: bootstrap.roomInitData,
    roomInfoRes: {
      code: 0,
      data: {
        new_switch_info: {},
        player_watermark: { url: '' },
        pure_room_info: { function_control: [] },
      },
    },
  };
  targetWindow.addWaifu = () => {};
  targetWindow.roomPlayerLoaded = () => {
    targetWindow.roomPlayerIsLoaded = true;
  };
  targetWindow.roomPlayerError = () => {
    targetWindow.roomPlayerTriggerError = 'loadError';
  };
}

export function buildLivePipPlayerOptions(targetWindow, bootstrap) {
  return {
    fullscreenContainer: targetWindow.document.getElementById('fullscreen-container'),
    cid: bootstrap.playerInfo.roomId,
    initTime: targetWindow.performance?.now?.() || 0,
    roomInitDataV2: bootstrap.roomInitData,
    relayRoomId: bootstrap.roomInitData?.data?.relay_room_id,
    rnd: targetWindow.DANMU_RND,
    fnPromiseMode: true,
    protover: 2,
    mask: {
      shouldOpenMask: true,
    },
    ptype: 16,
    backgroundFilter: true,
    coreType: 2,
    coreProtocol: 0,
    initTrackData: { ...targetWindow.__RoomPlayerReportData__ },
    UI: {
      logo: false,
      logoOptions: { url: '' },
      feedback: false,
      recommend: false,
      showDanmakuSetting: true,
      dmContainerTopOffset: 0,
      danmaku: true,
    },
  };
}

export function createLivePipPlayerAdapter(targetWindow, player, sizeElement = null) {
  return {
    raw: player,
    play: () => player?.play?.(),
    pause: () => player?.pause?.(),
    resize: () => {
      const rect = sizeElement?.getBoundingClientRect?.();
      player?.resize?.();
      player?.setSize?.(Math.round(rect?.width || targetWindow.innerWidth), Math.round(rect?.height || targetWindow.innerHeight));
    },
    disconnect: () => {
      player?.destroy?.();
      player?.dispose?.();
      player?.unload?.();
    },
    on: (...args) => player?.on?.(...args),
    off: (...args) => player?.off?.(...args),
  };
}
