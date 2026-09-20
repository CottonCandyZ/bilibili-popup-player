import { APP } from './constants.js';
import { hasCommentImagePreview } from './comment-images.js';

export function isShortcutInput(event) {
  return getEventPath(event).some(node => node?.matches?.(
    `input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="slider"], [role="tablist"], [role="menu"], .${APP}__settings__panel`,
  ));
}

function getEventPath(event) {
  return (event.nativeEvent || event).composedPath?.() || [event.target];
}

export function isMediaShortcut(event) {
  return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(event.key);
}

// Base UI stops arrow keys at Dialog.Popup; Nano listens on window. Let the
// original event reach Nano so it owns short presses, repeats, held speed and
// release/blur restoration. Do not duplicate the player's keyboard behavior.
export function onPlayerShellKeyDown(event) {
  if (hasCommentImagePreview(event.currentTarget.ownerDocument)) {
    event.preventBaseUIHandler?.();
    return;
  }
  const target = getEventPath(event)[0] || event.target;
  const activateControl = event.key === ' ' && target?.closest?.('button, a, [role="button"], [role="switch"]');
  if (isShortcutInput(event) || activateControl) {
    // Widget handlers and browser defaults still run. Only keep their presses
    // away from the player's global listener, including shadow-root editors.
    event.stopPropagation();
    return;
  }
  if (isMediaShortcut(event)) event.preventBaseUIHandler?.();
}
