const WRAP = '.bpx-player-progress-schedule-wrap, .bpx-player-shadow-progress-schedule-wrap';
const SEGMENT = '.bpx-player-progress-schedule-segment';
const MARK = 'data-bpn-linear-chapter';

// Native chapters reserve a percentage for every gap, compressing the timeline.
// Heatmap positions, previews and seeking still use the full time axis. Undo
// that spacing only when the native inline geometry matches this layout; CSS
// paints the separators without shifting timestamps or replacing player events.
export function bindNativeProgress(root) {
  const targetWindow = root?.ownerDocument.defaultView;
  if (!targetWindow?.MutationObserver) return () => {};
  const percentage = value => value.endsWith('%') ? Number.parseFloat(value) / 100 : NaN;
  const clear = element => {
    element.removeAttribute(MARK);
    element.style.removeProperty('--bpn-chapter-left');
    element.style.removeProperty('--bpn-chapter-width');
  };
  const sync = wrap => {
    const segments = [...wrap.children];
    for (const segment of segments) if (segment.hasAttribute(MARK)) clear(segment);
    if (segments.length < 2 || !segments.every(element => element.matches(SEGMENT))) return;
    const gap = percentage(segments[0].style.marginRight);
    const scale = 1 - gap * (segments.length - 1);
    if (!(gap > 0 && scale > 0)) return;
    let offset = 0;
    const geometry = segments.map((element, index) => {
      const left = percentage(element.style.left), width = percentage(element.style.width);
      const valid = width > 0 && Math.abs(left - offset) < 0.00002 &&
        Math.abs(percentage(element.style.marginRight) - gap) < 0.00002;
      offset += width + gap;
      return { element, valid, left: (left - index * gap) / scale, width: width / scale };
    });
    if (geometry.some(item => !item.valid || item.left + item.width > 1.00002)) return;
    for (const { element, left, width } of geometry) {
      element.style.setProperty('--bpn-chapter-left', `${left * 100}%`);
      element.style.setProperty('--bpn-chapter-width', `${width * 100}%`);
      element.setAttribute(MARK, '');
    }
  };
  const scan = element => {
    if (element.nodeType !== 1) return;
    if (element.matches(WRAP)) sync(element);
    element.querySelectorAll(WRAP).forEach(sync);
  };
  const observer = new targetWindow.MutationObserver(records => {
    const wraps = new Set();
    for (const record of records) {
      if (record.target.matches?.(WRAP)) wraps.add(record.target);
      else for (const node of record.addedNodes) scan(node);
    }
    wraps.forEach(sync);
  });
  // Only track construction/replacement changes geometry, not frame transforms.
  observer.observe(root, { childList: true, subtree: true });
  scan(root);
  return () => {
    observer.disconnect();
    root.querySelectorAll(`[${MARK}]`).forEach(clear);
  };
}
