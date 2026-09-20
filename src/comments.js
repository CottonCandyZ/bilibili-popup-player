import { loadScriptOnce } from './script-loader.js';
import { installCommentTheme } from './comment-theme.js';
import { installCommentImages } from './comment-images.js';

export async function mountComments(adapter, bootstrap) {
  const { slot, mount, targetDocument, getCtor, beforeLoad, getPlayer, getScrollContainer, getLayout, isActive } = adapter;
  if (!mount) return;
  const context = getCommentContext(bootstrap);
  if (slot.comments && slot.commentContext && slot.commentContext !== context) {
    disposeMountedComment(slot);
  }
  if (!slot.comments) mount.textContent = '评论加载中...';

  try {
    await beforeLoad?.();
    if (!isActive()) return;
    await loadScriptOnce(targetDocument, bootstrap.commentScript, getCtor);
    if (!isActive()) return;

    const CommentCtor = getCtor();
    if (!CommentCtor) throw new Error('BiliComments not available after comment script load');

    const scrollContainer = getScrollContainer?.();
    // A sidebar is already open: load even when the video intro places the
    // first comment below its fold. Only the bottom layout waits for scrolling.
    const props = buildCommentProps(bootstrap, scrollContainer, getLayout?.() !== 'right');
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
  slot.commentStyleCleanup?.();
  slot.commentStyleCleanup = installCommentTheme(mount, targetDocument);
  slot.commentImagesCleanup ??= installCommentImages(mount, targetDocument);
}

function buildCommentProps(bootstrap, scrollContainer, lazyLoad) {
  const props = {
    params: bootstrap.commentInfo.params,
    disableUpActions: true,
    disableVideoTime: false,
    lazyLoad,
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
  slot.commentImagesCleanup?.();
  slot.commentImagesCleanup = null;
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
  slot.commentStyleCleanup?.();
  slot.commentStyleCleanup = null;
}
