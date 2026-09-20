export function capturePlayerLayout(shell, slot) {
  return { shell: shell.getBoundingClientRect(), slot: slot.getBoundingClientRect() };
}

export function animatePlayerLayout(shell, slot, from, { opacity = 1 } = {}) {
  if (!from || shell.ownerDocument.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  const to = capturePlayerLayout(shell, slot);
  if ([from.shell, from.slot, to.shell, to.slot].some(rect => !rect.width || !rect.height)) return null;
  const animations = [];
  const animate = (element, x, y, sx, sy, startOpacity = 1) => {
    if (Math.abs(x) < .5 && Math.abs(y) < .5 && Math.abs(sx - 1) < .0005 && Math.abs(sy - 1) < .0005) return;
    animations.push(element.animate([
      { transformOrigin: 'top left', transform: `translate(${x}px, ${y}px) scale(${sx}, ${sy})`, opacity: startOpacity },
      { transformOrigin: 'top left', transform: 'none', opacity: 1 },
    ], { duration: 300, easing: 'cubic-bezier(.22, 1, .36, 1)' }));
  };
  const sx = from.shell.width / to.shell.width, sy = from.shell.height / to.shell.height;
  // The slot's first frame is expressed in its animated parent's coordinates.
  // This also keeps reversals continuous when both animations are interrupted.
  animate(slot,
    (from.slot.left - from.shell.left) / sx - (to.slot.left - to.shell.left),
    (from.slot.top - from.shell.top) / sy - (to.slot.top - to.shell.top),
    from.slot.width / sx / to.slot.width, from.slot.height / sy / to.slot.height);
  animate(shell, from.shell.left - to.shell.left, from.shell.top - to.shell.top, sx, sy, opacity);
  if (!animations.length) return null;
  return { cancel: () => animations.forEach(animation => animation.cancel()), finished: Promise.all(animations.map(animation => animation.finished)) };
}
