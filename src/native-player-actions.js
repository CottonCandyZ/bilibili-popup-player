// Nano delegates in-video follow/like/coin/favorite widgets to its host page.
// Keep the native widgets and complete their actions through the same handlers
// as our video intro, then let setState update both surfaces.
export function bindNativePlayerActions({ player, runtime, isCurrent, onAction, onFollow }) {
  const eventType = runtime?.EventType?.Player_Virtual_Action;
  if (!player?.on || !eventType) return () => {};
  const kinds = { Like: 0, Coin: 1, Triple: 2, Follow: 3, Collect: 4, ...runtime.InternalKind };
  let disposed = false, tripleTimer = null;
  const active = () => !disposed && isCurrent();
  const cancelTriple = () => { clearTimeout(tripleTimer); tripleTimer = null; };
  const complete = async (run, data) => {
    if (!active()) return;
    let result;
    try { result = await run(); }
    catch (error) { result = { ok: false, message: error?.message || '操作失败' }; }
    if (!active() || !result) return;
    // Native shortcut tooltips use these callbacks. Panel opening alone is not
    // a completed coin/favorite operation and must not report success here.
    const callback = result.ok ? data.success : data.fail;
    if (typeof callback === 'function') callback(result);
  };
  const handler = event => {
    if (!active()) return;
    const { kind, data = {} } = event?.detail || {};
    const payload = data || {};
    if (kind === kinds.Follow) {
      const mid = Number(payload.fid), act = Number(payload.act);
      if (Number.isSafeInteger(mid) && mid > 0 && (act === 1 || act === 2)) {
        void complete(() => onFollow(mid, act === 1), payload);
      }
    } else if (kind === kinds.Triple) {
      if (payload.action === 'cancel') { cancelTriple(); return; }
      if (payload.action === 'start') {
        // Native keydown starts a hold, keyup cancels it. Never spend coins
        // just because a start or cancel notification was received.
        if (!tripleTimer) tripleTimer = setTimeout(() => {
          tripleTimer = null;
          void complete(() => onAction('triple'), payload);
        }, 700);
      } else if (!payload.action || payload.action === 'none') {
        cancelTriple();
        void complete(() => onAction('triple'), payload);
      }
    } else {
      const action = kind === kinds.Like ? 'like' : kind === kinds.Coin ? 'coin' : kind === kinds.Collect ? 'favorite' : null;
      if (action) void complete(() => onAction(action), payload);
    }
  };
  player.on(eventType, handler);
  return () => {
    disposed = true;
    cancelTriple();
    player.off?.(eventType, handler);
  };
}
