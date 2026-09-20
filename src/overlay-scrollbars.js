import { APP } from './constants.js';

// Measure the browser's actual gutter in an isolated tree, independent of the
// host page's CSS. Overlay scrollbars consume no layout width.
export function hasClassicScrollbars(doc) {
  const host = doc.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none';
  const probe = doc.createElement('div');
  probe.dataset.scrollbarProbe = APP;
  probe.style.cssText = 'width:100px;height:100px;overflow:scroll;scrollbar-width:auto;border:0;padding:0';
  host.attachShadow({ mode: 'closed' }).append(probe);
  doc.body.append(host);
  const classic = probe.offsetWidth > probe.clientWidth;
  host.remove();
  return classic;
}

export function installOverlayScrollbars(root) {
  const doc = root.ownerDocument, win = doc.defaultView;
  if (!hasClassicScrollbars(doc)) {
    root.dataset.scrollbars = 'native';
    return () => { delete root.dataset.scrollbars; };
  }
  root.dataset.scrollbars = 'overlay';
  const layer = doc.createElement('div');
  layer.className = `${APP}__scrollbar-layer`;
  root.append(layer);
  const records = new Map(), controller = new win.AbortController();
  const signal = controller.signal;
  let frame = 0, drag = null;
  const selectors = `#${APP}-content, #layout, .${APP}__comments-panel, .${APP}__playlist, .${APP}__settings__panel`;

  function schedule() { if (!frame) frame = win.requestAnimationFrame(render); }
  const resize = new win.ResizeObserver(schedule);
  const mutation = new win.MutationObserver(changes => {
    if (changes.some(change => !layer.contains(change.target))) { discover(); schedule(); }
  });

  function armHide(record) {
    win.clearTimeout(record.timer);
    if (record.hovered || drag?.record === record) return;
    record.timer = win.setTimeout(() => { record.visible = false; schedule(); }, 1000);
  }

  function show(record) { record.visible = true; armHide(record); schedule(); }

  function discover() {
    for (const [element, record] of records) if (!root.contains(element)) {
      element.classList.remove(`${APP}__virtual-scroll`);
      resize.unobserve(element); win.clearTimeout(record.timer); record.bar.remove(); records.delete(element);
    }
    for (const element of root.querySelectorAll(selectors)) {
      if (records.has(element)) continue;
      element.classList.add(`${APP}__virtual-scroll`);
      const bar = doc.createElement('div'), thumb = doc.createElement('div');
      bar.className = `${APP}__scrollbar`; thumb.className = `${APP}__scrollbar-thumb`;
      bar.setAttribute('role', 'scrollbar'); bar.setAttribute('aria-orientation', 'vertical');
      bar.setAttribute('aria-label', '滚动内容'); bar.setAttribute('aria-valuemin', '0');
      if (element.id) bar.setAttribute('aria-controls', element.id);
      bar.tabIndex = -1; bar.append(thumb); layer.append(bar);
      const record = { element, bar, thumb, timer: 0, visible: false, hovered: false, range: 0, travel: 0 };
      records.set(element, record); resize.observe(element);
      bar.addEventListener('pointerenter', () => { record.hovered = true; win.clearTimeout(record.timer); });
      bar.addEventListener('pointerleave', () => { record.hovered = false; armHide(record); });
      bar.addEventListener('pointerdown', event => {
        if (event.button !== 0 || !record.travel) return;
        event.preventDefault(); event.stopPropagation();
        if (event.target !== thumb) {
          const rect = bar.getBoundingClientRect();
          element.scrollTop = (event.clientY - rect.top - thumb.getBoundingClientRect().height / 2) / record.travel * record.range;
        }
        drag = { record, pointer: event.pointerId, y: event.clientY, scroll: element.scrollTop };
        bar.setPointerCapture(event.pointerId); show(record);
      });
      bar.addEventListener('pointermove', event => {
        if (drag?.record !== record || event.pointerId !== drag.pointer) return;
        element.scrollTop = drag.scroll + (event.clientY - drag.y) / record.travel * record.range;
      });
      const stopDrag = () => { if (drag?.record === record) { drag = null; armHide(record); } };
      bar.addEventListener('pointerup', stopDrag);
      bar.addEventListener('pointercancel', stopDrag);
      bar.addEventListener('lostpointercapture', stopDrag);
      bar.addEventListener('keydown', event => {
        const movement = { ArrowUp: -40, ArrowDown: 40, PageUp: -element.clientHeight * .9, PageDown: element.clientHeight * .9, Home: -element.scrollHeight, End: element.scrollHeight }[event.key];
        if (movement === undefined) return;
        event.preventDefault(); event.stopPropagation(); element.scrollTop += movement; show(record);
      });
    }
  }

  function render() {
    frame = 0;
    const animating = root.closest('[data-layout-animating="true"]');
    for (const record of records.values()) {
      const { element, bar, thumb } = record;
      const style = win.getComputedStyle(element), rect = element.getBoundingClientRect();
      record.range = element.scrollHeight - element.clientHeight;
      let top = Math.max(0, rect.top), bottom = Math.min(win.innerHeight, rect.bottom);
      let right = Math.min(win.innerWidth, rect.right), left = Math.max(0, rect.left);
      for (let ancestor = element.parentElement; ancestor && ancestor !== doc.body; ancestor = ancestor.parentElement) {
        const css = win.getComputedStyle(ancestor), bounds = ancestor.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(css.overflowY)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
        if (/(auto|scroll|hidden|clip)/.test(css.overflowX)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
      }
      const height = bottom - top - 4;
      const scrollable = record.range > 1 && height > 16 && right - left > 16 && /auto|scroll/.test(style.overflowY) && element.getClientRects().length && !animating;
      bar.hidden = !scrollable;
      const visible = Boolean(scrollable && record.visible);
      bar.dataset.visible = String(visible); bar.tabIndex = visible ? 0 : -1;
      if (!scrollable) continue;
      const thumbHeight = Math.min(height, Math.max(24, height * element.clientHeight / element.scrollHeight));
      record.travel = height - thumbHeight;
      bar.style.cssText = `top:${top + 2}px;left:${right - 10}px;height:${height}px`;
      thumb.style.height = `${thumbHeight}px`;
      thumb.style.transform = `translateY(${Math.max(0, Math.min(record.range, element.scrollTop)) / record.range * record.travel}px)`;
      bar.setAttribute('aria-valuemax', String(Math.round(record.range)));
      bar.setAttribute('aria-valuenow', String(Math.round(element.scrollTop)));
    }
    // Transforms do not trigger ResizeObserver. A scroll during a resize must
    // reveal its bar as soon as the animation ends, before the idle timer fires.
    if (animating) schedule();
  }

  root.addEventListener('scroll', event => {
    const record = records.get(event.target);
    if (record) show(record);
    schedule();
  }, { capture: true, passive: true, signal });
  win.addEventListener('resize', schedule, { passive: true, signal });
  doc.addEventListener('fullscreenchange', schedule, { signal });
  discover(); schedule(); mutation.observe(root, { childList: true, subtree: true });
  return () => {
    controller.abort(); mutation.disconnect(); resize.disconnect(); win.cancelAnimationFrame(frame);
    for (const record of records.values()) { win.clearTimeout(record.timer); record.element.classList.remove(`${APP}__virtual-scroll`); }
    layer.remove(); delete root.dataset.scrollbars;
  };
}
