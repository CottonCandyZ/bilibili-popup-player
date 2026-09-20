const SURFACE = 'video, .bpx-player-video-wrap, .bpx-player-video-perch, .bpx-player-video-area, .bpx-player-dm-wrap, .bpx-player-dm-mask-wrap, .bilibili-player-video-wrap';
const INTERACTIVE = 'button, a, input, textarea, select, [role="button"], [role="slider"], [role="menu"], [contenteditable="true"], .bpx-player-ctrl-btn, .bpx-player-ctrl-volume-icon-mini, .bpx-player-control-wrap, .bpx-player-control-top, .bpx-player-sending-area, .bpx-player-toast-wrap, .bpx-player-dialog-wrap, .bpx-player-ending-panel, .bpx-player-popup, .bpx-player-cmd-dm-wrap, .bpx-player-follow';

// Capture above the native player: its delayed single-click handler otherwise
// pauses the video after our fullscreen handler has already handled a double click.
export function installVideoGestures(frame, { getPlayback, onDoubleClick }) {
  const win = frame.ownerDocument.defaultView;
  let pending = null, pressedAt = 0, handledDoubleClick = false;
  const isSurface = event => {
    const target = event.composedPath?.()[0] || event.target;
    return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
      target?.closest?.(SURFACE) && !target.closest(INTERACTIVE);
  };
  const snapshot = () => {
    const playback = getPlayback();
    if (!playback?.player) return null;
    const video = playback.root?.querySelector('video');
    const paused = video?.paused ?? playback.player.isPaused?.();
    return typeof paused === 'boolean' ? { ...playback, video, paused } : null;
  };
  const current = record => {
    const playback = getPlayback();
    return playback?.player === record.player && playback.key === record.key;
  };
  const setPaused = (record, paused) => {
    if (!current(record)) return;
    if ((record.video?.paused ?? record.player.isPaused?.()) === paused) return;
    const owner = typeof record.player[paused ? 'pause' : 'play'] === 'function' ? record.player : record.video;
    owner?.[paused ? 'pause' : 'play']()?.catch?.(() => {});
  };
  const cancel = (restore = false) => {
    if (!pending) return;
    win.clearTimeout(pending.timer);
    if (restore) setPaused(pending, pending.paused);
    pending = null;
  };
  const stop = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  const onPointerDown = event => {
    pressedAt = isSurface(event) ? win.performance.now() : 0;
    handledDoubleClick = false;
  };
  const onClick = event => {
    if (!isSurface(event) || event.detail === 0) return;
    // Preserve the native long-press speed gesture.
    if (pressedAt && win.performance.now() - pressedAt > 500) return;
    const record = snapshot();
    if (!record) return;
    stop(event);
    const now = win.performance.now();
    const nearbySecondClick = pending && current(pending) && now - pending.clickedAt <= 320 &&
      Math.hypot(event.clientX - pending.x, event.clientY - pending.y) <= 6;
    if (event.detail % 2 === 0 || nearbySecondClick) {
      // A slower system-recognized double click can arrive after the single
      // click delay. Restore the state captured before that first click.
      cancel(true);
      handledDoubleClick = true;
      onDoubleClick();
      return;
    }
    cancel();
    pending = record;
    Object.assign(record, { clickedAt: now, x: event.clientX, y: event.clientY });
    record.timer = win.setTimeout(() => setPaused(record, !record.paused), 260);
  };
  const onDblClick = event => {
    if (!isSurface(event)) return;
    stop(event);
    cancel(true);
    if (!handledDoubleClick) onDoubleClick();
    handledDoubleClick = false;
  };
  frame.addEventListener('pointerdown', onPointerDown, true);
  frame.addEventListener('click', onClick, true);
  frame.addEventListener('dblclick', onDblClick, true);
  return {
    cancel,
    dispose() {
      cancel();
      frame.removeEventListener('pointerdown', onPointerDown, true);
      frame.removeEventListener('click', onClick, true);
      frame.removeEventListener('dblclick', onDblClick, true);
    },
  };
}
