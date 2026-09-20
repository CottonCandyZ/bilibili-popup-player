import { useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Ellipsis, ExternalLink, Gamepad2, Maximize, Monitor, PanelRight, PictureInPicture2, Play, Power, Repeat2, RotateCcw, Settings, X } from 'lucide-react';

// The player adapters consume DOM refs immediately after mounting.
export function mountReact(container, element) {
  const root = createRoot(container);
  let disposed = false;
  flushSync(() => root.render(element));
  return {
    render(next) { if (!disposed) flushSync(() => root.render(next)); },
    dispose() { if (!disposed) { disposed = true; root.unmount(); } },
  };
}

// A small boundary for externally owned DOM (Bilibili player/comments).
export function DomSlot({ element }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const host = ref.current;
    if (element) host.appendChild(element);
    return () => element?.remove();
  }, [element]);
  return <div ref={ref} style={{ display: 'contents' }} />;
}

const icons = { play: Play, window: PictureInPicture2, settings: Settings, close: X, power: Power, check: Check, copy: Copy, monitor: Monitor, pip: PictureInPicture2, more: Ellipsis, arrowUp: ArrowUp, down: ChevronDown, back: ChevronLeft, next: ChevronRight, external: ExternalLink, expand: Maximize, fit: PanelRight, reset: RotateCcw, autoplay: Repeat2, gamepad: Gamepad2 };

export function Icon({ name = 'play', size = 20, className }) {
  const Component = icons[name] || Play;
  return <Component className={className} size={size} strokeWidth={2} aria-hidden="true" />;
}
