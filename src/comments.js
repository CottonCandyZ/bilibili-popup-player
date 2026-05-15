import { loadScriptOnce } from './script-loader.js';

export async function mountComments(adapter, bootstrap) {
  const { slot, mount, targetDocument, getCtor, beforeLoad, getPlayer, getScrollContainer, isActive } = adapter;
  if (!mount) return;
  if (!slot.comments) mount.textContent = '评论加载中...';

  try {
    beforeLoad?.();
    await loadScriptOnce(targetDocument, bootstrap.commentScript, getCtor);
    if (!isActive()) return;

    const CommentCtor = getCtor();
    if (!CommentCtor) throw new Error('BiliComments not available after comment script load');

    const props = buildCommentProps(bootstrap);
    const scrollContainer = getScrollContainer?.();
    if (reloadCommentInstance(slot.comments, props)) {
      applyCommentScrollContainer(slot.comments, scrollContainer);
      return;
    }

    mount.textContent = '';
    slot.comments = mountCommentInstance(CommentCtor, props, mount, targetDocument, scrollContainer);
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

function buildCommentProps(bootstrap) {
  return {
    params: bootstrap.commentInfo.params,
    disableUpActions: true,
    disableVideoTime: false,
    lazyLoad: true,
    cmFromTrackId: bootstrap.commentInfo.cmFromTrackId,
    spmPrefix: bootstrap.commentInfo.spmPrefix,
  };
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
  const current = state[kind].comments;
  if (!current) return;
  try {
    current.destroy?.();
    current.unmount?.();
  } catch {
    // Ignore comment cleanup failures.
  }
  state[kind].comments = null;
}
