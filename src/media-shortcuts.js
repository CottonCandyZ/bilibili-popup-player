import { APP } from './constants.js';
import { hasCommentImagePreview } from './comment-images.js';
import { hasNativeLogin } from './native-login.js';

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

// Nano listens on window. Host pages/extensions can stop horizontal keys on
// document before they get there. Deliver those sequences directly to the same
// window, leaving Nano in charge of seeking, right-key holds and speed resets.
export function bindNativeSeekShortcuts({ root, isActive, onKeyDown }) {
  const win = root?.ownerDocument.defaultView;
  if (!win) return () => {};
  const forwarded = new WeakSet(), pressed = new Map();
  const send = (event, type = event.type) => {
    const keyCode = event.key === 'ArrowLeft' ? 37 : 39;
    const next = new win.KeyboardEvent(type, {
      key: event.key, code: event.code || event.key, location: event.location,
      repeat: type === 'keydown' && event.repeat, cancelable: true,
      keyCode, which: keyCode,
    });
    forwarded.add(next);
    win.dispatchEvent(next);
  };
  const handler = event => {
    if (forwarded.has(event) || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const release = event.type === 'keyup' && pressed.has(event.key);
    if (!release && (event.type !== 'keydown' || event.defaultPrevented ||
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
      isShortcutInput(event) || hasNativeLogin(root.ownerDocument) ||
      hasCommentImagePreview(root.ownerDocument) || !isActive(event))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (release) pressed.delete(event.key);
    else {
      pressed.set(event.key, event);
      onKeyDown?.();
    }
    send(event);
  };
  const blur = () => pressed.clear(); // Nano already resets its holds on blur.
  win.addEventListener('keydown', handler, true);
  win.addEventListener('keyup', handler, true);
  win.addEventListener('blur', blur);
  return () => {
    win.removeEventListener('keydown', handler, true);
    win.removeEventListener('keyup', handler, true);
    win.removeEventListener('blur', blur);
    for (const event of pressed.values()) send(event, 'keyup');
    pressed.clear();
  };
}

// Base UI stops arrow keys at Dialog.Popup; Nano listens on window. Let the
// remaining media keys reach Nano without duplicating its keyboard behavior.
export function onPlayerShellKeyDown(event) {
  if (hasNativeLogin(event.currentTarget.ownerDocument)) {
    event.stopPropagation();
    event.preventBaseUIHandler?.();
    return;
  }
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
