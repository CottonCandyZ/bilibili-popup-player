import { APP } from './constants.js';

// Keep a tiny paint in the letterbox instead of filtering the entire video.
// Placement is event-driven: no playback-time or animation-frame polling.
export function installFullscreenMarker(frame) {
  const doc = frame.ownerDocument, win = doc.defaultView;
  const marker = doc.createElement('span');
  marker.className = `${APP}__fullscreen-marker`;
  marker.setAttribute('aria-hidden', 'true');
  marker.hidden = true;
  let active = false, pending = 0, video = null, area = null;
  const resize = new win.ResizeObserver(schedule);
  const mutation = new win.MutationObserver(records => {
    // Ignore routine danmaku/progress changes once the media nodes are bound.
    if (!video?.isConnected || !area?.isConnected || !frame.contains(area) || !area.contains(video) ||
      records.some(record => record.type === 'attributes')) schedule();
  });

  function schedule() {
    if (active && !pending) pending = win.requestAnimationFrame(update);
  }

  function update() {
    pending = 0;
    const nextArea = frame.querySelector('.bpx-player-video-area');
    const nextVideo = nextArea?.querySelector('video');
    if (area !== nextArea || video !== nextVideo) {
      resize.disconnect();
      mutation.disconnect();
      mutation.observe(frame, { childList: true, subtree: true });
      area = nextArea; video = nextVideo;
      if (area) resize.observe(area);
      if (video) {
        resize.observe(video);
        mutation.observe(video, { attributes: true, attributeFilter: ['style', 'class'] });
      }
    }
    marker.hidden = true;
    if (!area || !video?.videoWidth || !video.videoHeight) return;
    const bounds = area.getBoundingClientRect(), box = video.getBoundingClientRect();
    if (!bounds.width || !bounds.height || !box.width || !box.height) return;
    const style = win.getComputedStyle(video);
    // Unusual video transforms or decorated boxes need native geometry; do not
    // guess a black border and risk placing the marker over the picture.
    if (style.transform !== 'none' || ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom',
      'borderLeftWidth', 'borderRightWidth', 'borderTopWidth', 'borderBottomWidth'].some(key => parseFloat(style[key]))) return;
    let picture = box;
    if (style.objectFit === 'contain' || style.objectFit === 'scale-down') {
      const scale = Math.min(box.width / video.videoWidth, box.height / video.videoHeight,
        style.objectFit === 'scale-down' ? 1 : Infinity);
      const width = video.videoWidth * scale, height = video.videoHeight * scale;
      const offset = (value, free) => value.endsWith('%') ? parseFloat(value) / 100 * free
        : value.endsWith('px') ? parseFloat(value) : NaN;
      const [x, y] = style.objectPosition.split(' ');
      const left = box.left + offset(x, box.width - width), top = box.top + offset(y || '', box.height - height);
      if (!Number.isFinite(left) || !Number.isFinite(top)) return;
      picture = { left, top, right: left + width, bottom: top + height };
    } else if (style.objectFit !== 'fill' && style.objectFit !== 'cover') return;

    // Leave a pixel of clearance on either side. If the picture fills the area,
    // skip the workaround instead of adding a dot to the actual video content.
    const gaps = [
      [bounds.left, bounds.top, bounds.right, Math.min(bounds.bottom, picture.top)],
      [bounds.left, Math.max(bounds.top, picture.bottom), bounds.right, bounds.bottom],
      [bounds.left, bounds.top, Math.min(bounds.right, picture.left), bounds.bottom],
      [Math.max(bounds.left, picture.right), bounds.top, bounds.right, bounds.bottom],
    ];
    const gap = gaps.find(([left, top, right, bottom]) => right - left >= 3 && bottom - top >= 3);
    if (!gap) return;
    if (marker.parentElement !== area) area.append(marker);
    const sx = bounds.width / area.offsetWidth, sy = bounds.height / area.offsetHeight;
    marker.style.left = `${((gap[0] + gap[2]) / 2 - bounds.left) / sx - area.clientLeft - .5}px`;
    marker.style.top = `${((gap[1] + gap[3]) / 2 - bounds.top) / sy - area.clientTop - .5}px`;
    marker.hidden = false;
  }

  function onFullscreen() {
    active = Boolean(doc.fullscreenElement?.contains(frame));
    if (active) {
      mutation.observe(frame, { childList: true, subtree: true });
      schedule();
    } else {
      mutation.disconnect(); resize.disconnect();
      win.cancelAnimationFrame(pending); pending = 0;
      marker.remove(); marker.hidden = true;
      area = video = null;
    }
  }
  doc.addEventListener('fullscreenchange', onFullscreen);
  // These media events do not bubble, so capture replacements and metadata too.
  for (const type of ['loadedmetadata', 'resize', 'emptied']) frame.addEventListener(type, schedule, true);
  onFullscreen();
  return () => {
    active = false;
    doc.removeEventListener('fullscreenchange', onFullscreen);
    for (const type of ['loadedmetadata', 'resize', 'emptied']) frame.removeEventListener(type, schedule, true);
    mutation.disconnect(); resize.disconnect(); win.cancelAnimationFrame(pending);
    marker.remove();
  };
}
