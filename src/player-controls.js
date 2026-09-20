import { APP } from './constants.js';

// Nano publishes the same visibility flag used by its control bar. Follow it
// instead of guessing its timeout (which depends on where the pointer rests).
export function installPlayerControls(frame, onVisibilityChange) {
  const win = frame.ownerDocument.defaultView;
  const toolbar = frame.querySelector(`#${APP}-header, .${APP}__pip-tools`);
  let player = null;
  let hoveredControl = null;
  let transitionBar = null;
  let transitionHidden = null;
  let timer = 0;
  let active = true;

  function clearTimer() { win.clearTimeout(timer); timer = 0; }
  function releaseHover() {
    const control = hoveredControl;
    hoveredControl = null;
    // Do not clear a real hover when moving from our toolbar to native controls.
    if (control?.isConnected && !control.matches(':hover')) {
      control.dispatchEvent(new win.MouseEvent('mouseleave'));
    }
  }
  function syncNative() {
    if (!player?.isConnected || !frame.contains(player)) {
      releaseHover();
      player = frame.querySelector('.bpx-player-container:not(.bpx-player-rich-pip-root)');
    }
    const hidden = player?.getAttribute('data-ctrl-hidden');
    if (hidden !== 'true' && hidden !== 'false') return false;
    clearTimer();
    const pinned = toolbar?.matches(':hover') || toolbar?.querySelector(':focus-visible, [data-popup-open]') ||
      player.querySelector('.bpx-player-control-wrap :focus-visible') ||
      player.querySelector(':is(.bpx-player-ctrl-btn-play-icon-mini, .bpx-player-ctrl-volume-icon-mini):is(:hover, :focus-visible)');
    const control = player.querySelector('.bpx-player-control-wrap');
    if (pinned && control) {
      // Treat the added toolbar/menu and standalone mini buttons as native
      // control hover regions (the mini buttons sit outside controlWrap).
      // Let Nano keep ownership of its timers, cursor and progress-bar states.
      if (hoveredControl !== control || hidden === 'true') {
        releaseHover();
        hoveredControl = control;
        control.dispatchEvent(new win.MouseEvent('mouseenter'));
      }
    } else releaseHover();
    const currentHidden = player.getAttribute('data-ctrl-hidden');
    const bar = player.querySelector('.bpx-player-control-bottom');
    if (bar && (bar !== transitionBar || currentHidden !== transitionHidden)) {
      const style = win.getComputedStyle(bar);
      const ready = style.transitionDuration.split(',').some(value => parseFloat(value) > 0);
      // The bar can mount before its lazy-loaded stylesheet is installed.
      if (ready) { transitionBar = bar; transitionHidden = currentHidden; }
      frame.style.setProperty(`--${APP}-controls-transition`, ready ? style.transition : 'opacity .2s ease-in');
    }
    onVisibilityChange(currentHidden === 'false');
    return true;
  }
  function show() {
    if (syncNative()) return;
    // Loading and live players without Nano's visibility flag still need tools.
    clearTimer();
    onVisibilityChange(true);
    timer = win.setTimeout(() => onVisibilityChange(false), 2200);
  }
  function hide() {
    if (syncNative()) return;
    clearTimer();
    onVisibilityChange(false);
  }
  const observer = new win.MutationObserver(records => {
    // Ignore danmaku/comment nodes; only rebind after the player is replaced.
    if (!player?.isConnected || !frame.contains(player) || records.some(record => record.type === 'attributes')) syncNative();
  });
  observer.observe(frame, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-ctrl-hidden', 'data-popup-open'] });
  const listeners = [
    ['pointerenter', show, false], ['pointermove', show, true], ['pointerdown', show, true],
    ['keydown', show, true], ['pointerleave', hide, false], ['focusin', show, true],
    ['focusout', () => win.queueMicrotask(() => { if (active) hide(); }), true],
  ];
  for (const [type, handler, capture] of listeners) frame.addEventListener(type, handler, capture);
  show();
  return () => {
    active = false;
    observer.disconnect();
    clearTimer();
    releaseHover();
    frame.style.removeProperty(`--${APP}-controls-transition`);
    for (const [type, handler, capture] of listeners) frame.removeEventListener(type, handler, capture);
  };
}
