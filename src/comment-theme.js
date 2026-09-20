import { APP } from './constants.js';

const STYLE_MARKER = 'data-bili-popup-player-nano-compact';

// The comment SDK uses nested shadow roots. Keep these overrides inside our
// mounted instance so the original page and SDK interactions stay independent.
const styles = {
  'bili-comments': `
    :host {
      --bili-comments-font-size-content: 13px !important;
      --bili-comments-line-height-content: 21px !important;
      --bili-comments-font-size-name: 12px !important;
      --bili-comments-font-size-count: 12px !important;
      --bili-comments-font-size-sort: 12px !important;
      font-size: 13px;
      line-height: 21px;
    }
    #spinner-container > #title { display: none !important; }
    #contents { padding-top: 4px !important; }
    #limit-mask-tip { margin-left: 40px !important; width: calc(100% - 40px) !important; height: 40px !important; font-size: 12px !important; }
    #reply-commentbox bili-comment-box { padding: 12px 0 8px 40px !important; }
    #end .bottombar { padding-bottom: 24px !important; font-size: 12px !important; }
  `,
  'bili-comments-header-renderer': `
    #title > h2 { display: none !important; }
    #navbar { margin-bottom: 12px !important; }
    #title #count { margin: 0 14px 0 0 !important; }
    #disabled-commentbox { height: 42px !important; }
    #disabled-commentbox #user-avatar { width: 40px !important; height: 42px !important; justify-content: flex-start !important; }
    #disabled-commentbox #user-avatar img { width: 32px !important; height: 32px !important; }
    #disabled-commentbox #edit { flex-wrap: wrap; align-content: center; font-size: 12px !important; }
    #disabled-commentbox #edit button { color: var(--${APP}-on-accent) !important; }
  `,
  'bili-comment-thread-renderer': `
    #div { margin-left: 40px !important; padding-bottom: 12px !important; }
  `,
  'bili-comment-renderer': `
    #body { padding-left: 40px !important; padding-top: 14px !important; }
    #user-avatar { left: 0 !important; top: 14px !important; width: 32px !important; height: 32px !important; transform: none !important; overflow: hidden; border-radius: 50%; }
    #user-avatar bili-avatar { --avatar-width: 48px !important; --avatar-height: 48px !important; transform: scale(.6666667); transform-origin: top left; }
    #header { margin-bottom: 2px !important; }
    #ornament { display: none !important; }
  `,
  'bili-comment-user-info': `
    #info { min-width: 0; max-width: 100%; }
    #user-name { min-width: 0; overflow-wrap: anywhere; }
    #user-level { width: 24px !important; height: 24px !important; margin-left: 4px !important; flex-shrink: 0; }
    #user-level img { width: 24px !important; height: 24px !important; }
  `,
  'bili-rich-text': `
    :host { --bili-rich-text-font-size: 13px !important; --bili-rich-text-line-height: 21px !important; }
  `,
  'bili-comment-replies-renderer': `
    #expander { padding-left: 40px !important; }
    #view-more, #pagination { font-size: 12px !important; }
    #pagination { flex-wrap: wrap; row-gap: 4px; }
    #expander-footer bili-text-button { --_label-text-size: 12px; }
  `,
  'bili-comment-reply-renderer': `
    #body { padding: 6px 0 6px 30px !important; }
    #user-avatar, #user-avatar img { width: 22px !important; height: 22px !important; }
    #footer { padding-right: 0 !important; }
  `,
  'bili-comment-action-buttons-renderer': `
    :host { flex-wrap: wrap; gap: 0 10px; font-size: 11px !important; line-height: 16px !important; }
    :host > :not(:first-child) { margin-left: 0 !important; }
    #pubdate { flex: 0 0 100%; }
    button { font-size: 11px !important; }
    #more { margin-left: auto !important; margin-right: 0 !important; }
  `,
  'bili-comment-box': `
    #user-avatar { width: 40px !important; height: 42px !important; justify-content: flex-start !important; }
    #user-avatar bili-avatar { --avatar-width: 48px !important; --avatar-height: 48px !important; transform: scale(.6666667); transform-origin: top left; }
    #comment-area { width: calc(100% - 40px) !important; min-width: 0; }
    #editor { padding: 6px 0 !important; }
    #footer { flex-wrap: wrap; gap: 6px 0; margin-top: 6px !important; }
    #pub { width: 56px !important; height: 28px !important; }
    #pub button { font-size: 12px !important; color: var(--${APP}-on-accent) !important; background-color: color-mix(in srgb, var(--${APP}-accent) 50%, transparent) !important; }
    #pub button:hover, #pub button.active { background-color: var(--${APP}-accent) !important; }
  `,
  'bili-comment-rich-textarea': `
    #input, .brt-root, .brt-placeholder { font-size: 13px !important; line-height: 24px !important; }
  `,
};

export function installCommentTheme(mount, targetDocument) {
  const ownerWindow = targetDocument.defaultView;
  const observed = new WeakSet();
  const awaitingDefinition = new WeakSet();
  let disposed = false;
  const observer = new ownerWindow.MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) visit(node);
  });

  function observe(root) {
    if (observed.has(root)) return;
    observed.add(root);
    observer.observe(root, { childList: true, subtree: true });
  }

  function visit(node) {
    if (disposed || node.nodeType !== 1) return;
    const root = node.shadowRoot;
    if (root) {
      const css = styles[node.localName];
      if (css) {
        let style = root.querySelector(`style[${STYLE_MARKER}]`);
        if (!style) {
          style = targetDocument.createElement('style');
          style.setAttribute(STYLE_MARKER, '');
          root.appendChild(style);
        }
        if (style.textContent !== css) style.textContent = css;
      }
      observe(root);
      for (const child of root.children) visit(child);
    } else if (node.localName.startsWith('bili-') && !ownerWindow.customElements.get(node.localName) && !awaitingDefinition.has(node)) {
      awaitingDefinition.add(node);
      ownerWindow.customElements.whenDefined(node.localName).then(() => {
        if (!disposed && node.isConnected) visit(node);
      });
    }
    for (const child of node.children) visit(child);
  }

  observe(mount);
  visit(mount);
  // Some SDK elements attach their shadow root after their initial render.
  let attempts = 0;
  const timer = ownerWindow.setInterval(() => {
    visit(mount);
    if (++attempts >= 20) ownerWindow.clearInterval(timer);
  }, 250);
  return () => {
    disposed = true;
    observer.disconnect();
    ownerWindow.clearInterval(timer);
  };
}
