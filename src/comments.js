import { loadScriptOnce } from './script-loader.js';

export async function mountComments(adapter, bootstrap) {
  const { slot, mount, targetDocument, getCtor, beforeLoad, getPlayer, getScrollContainer, isActive } = adapter;
  if (!mount) return;
  const context = getCommentContext(bootstrap);
  if (slot.comments && slot.commentContext && slot.commentContext !== context) {
    disposeMountedComment(slot);
  }
  if (!slot.comments) mount.textContent = '评论加载中...';

  try {
    beforeLoad?.();
    await loadScriptOnce(targetDocument, bootstrap.commentScript, getCtor);
    if (!isActive()) return;

    const CommentCtor = getCtor();
    if (!CommentCtor) throw new Error('BiliComments not available after comment script load');

    const scrollContainer = getScrollContainer?.();
    const props = buildCommentProps(bootstrap, scrollContainer);
    if (reloadCommentInstance(slot.comments, props)) {
      slot.commentContext = context;
      applyCommentScrollContainer(slot.comments, scrollContainer);
      installCompactCommentStyles(slot, mount, targetDocument);
      return;
    }

    mount.textContent = '';
    slot.comments = mountCommentInstance(CommentCtor, props, mount, targetDocument, scrollContainer);
    slot.commentContext = context;
    installCompactCommentStyles(slot, mount, targetDocument);
    slot.comments.addEventListener?.('seek', (event) => {
      try {
        const { time } = event.detail || {};
        getPlayer()?.seek?.({ value: time, autoplay: true });
      } catch {
        // Ignore seek bridge failures.
      }
    });
  } catch (error) {
    if (!isActive()) return;
    mount.textContent = `评论加载失败：${error?.message || 'unknown'}`;
  }
}

function getCommentContext(bootstrap) {
  return bootstrap?.kind === 'ogv' || bootstrap?.playerInfo?.kind === 'ogv' ? 'ogv' : 'ugc';
}

function mountCommentInstance(CommentCtor, props, mount, targetDocument, scrollContainer) {
  const instance = new CommentCtor(props);
  if (!scrollContainer) return instance.mount(mount);

  const originalCreateElement = targetDocument.createElement;
  targetDocument.createElement = function createElementWithScrollContainer(name, options) {
    const element = originalCreateElement.call(this, name, options);
    if (String(name).toLowerCase() === 'bili-comments') element.scrollContainer = scrollContainer;
    return element;
  };

  try {
    return instance.mount(mount);
  } finally {
    targetDocument.createElement = originalCreateElement;
    applyCommentScrollContainer(instance, scrollContainer);
  }
}

function applyCommentScrollContainer(instance, scrollContainer) {
  if (!instance || !scrollContainer) return;
  const element = instance.el?.current;
  if (element) element.scrollContainer = scrollContainer;
}

function installCompactCommentStyles(slot, mount, targetDocument) {
  slot.commentStyleObserver?.disconnect?.();
  slot.commentStyleWindow?.clearInterval?.(slot.commentStyleTimer);
  slot.commentStyleWindow = targetDocument.defaultView;

  const apply = () => {
    const comments = mount.querySelector?.('bili-comments');
    const root = comments?.shadowRoot;
    if (!root) return false;
    if (!root.querySelector(`style[${APP_STYLE_MARKER}]`)) {
      const style = targetDocument.createElement('style');
      style.setAttribute(APP_STYLE_MARKER, '');
      style.textContent = '#spinner-container > #title { display: none !important; }';
      root.appendChild(style);
    }
    const headerRoot = root.querySelector('bili-comments-header-renderer')?.shadowRoot;
    if (!headerRoot) return false;
    if (!headerRoot.querySelector(`style[${APP_STYLE_MARKER}]`)) {
      const style = targetDocument.createElement('style');
      style.setAttribute(APP_STYLE_MARKER, '');
      style.textContent = '#title > h2 { display: none !important; }';
      headerRoot.appendChild(style);
    }
    return true;
  };

  apply();
  slot.commentStyleObserver = new targetDocument.defaultView.MutationObserver(() => {
    if (!apply()) return;
    slot.commentStyleObserver?.disconnect?.();
    slot.commentStyleObserver = null;
    targetDocument.defaultView.clearInterval(slot.commentStyleTimer);
    slot.commentStyleTimer = 0;
  });
  slot.commentStyleObserver.observe(mount, { childList: true, subtree: true });
  const commentsRoot = mount.querySelector?.('bili-comments')?.shadowRoot;
  if (commentsRoot) slot.commentStyleObserver.observe(commentsRoot, { childList: true, subtree: true });
  let attempts = 0;
  slot.commentStyleTimer = targetDocument.defaultView.setInterval(() => {
    attempts += 1;
    if (!apply() && attempts < 40) return;
    targetDocument.defaultView.clearInterval(slot.commentStyleTimer);
    slot.commentStyleTimer = 0;
    slot.commentStyleObserver?.disconnect?.();
    slot.commentStyleObserver = null;
  }, 250);
}

const APP_STYLE_MARKER = 'data-bili-popup-player-nano-compact';

function buildCommentProps(bootstrap, scrollContainer) {
  const props = {
    params: bootstrap.commentInfo.params,
    disableUpActions: true,
    disableVideoTime: false,
    lazyLoad: true,
    cmFromTrackId: bootstrap.commentInfo.cmFromTrackId,
    spmPrefix: bootstrap.commentInfo.spmPrefix,
  };
  if (scrollContainer) props.scrollContainer = scrollContainer;
  return props;
}

export function reloadCommentInstance(instance, props) {
  if (!instance) return false;
  if (instance.methods?.reload) {
    instance.methods.reload(props);
    return true;
  }
  if (instance.dispatchAction) {
    instance.dispatchAction({ type: 'reload', args: [props], callback() {} });
    return true;
  }
  return false;
}

export function disposeCommentInstance(state, kind) {
  disposeMountedComment(state[kind]);
}

function disposeMountedComment(slot) {
  const current = slot.comments;
  if (current) {
    try {
      current.destroy?.();
      current.unmount?.();
    } catch {
      // Ignore comment cleanup failures.
    }
  }
  slot.comments = null;
  slot.commentContext = '';
  slot.commentStyleObserver?.disconnect?.();
  slot.commentStyleObserver = null;
  slot.commentStyleWindow?.clearInterval?.(slot.commentStyleTimer);
  slot.commentStyleWindow = null;
  slot.commentStyleTimer = 0;
}
