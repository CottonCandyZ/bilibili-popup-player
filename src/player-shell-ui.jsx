import { render } from 'solid-js/web';
import { APP } from './constants.js';
import {
  arrowUpIconMarkup,
  createAutoPlayIcon,
  createCloseIcon,
  createExternalLinkIcon,
  createHistoryBackIcon,
  createHistoryForwardIcon,
  createMaximizeIcon,
  createPictureInPictureIcon,
  createResetSizeIcon,
} from './icons.js';

export function mountHomePlayerPage({
  targetDocument = document,
  createCommentsTabs,
  onBackToTop,
  onBackdropClose,
  onClose,
  onFullscreen,
  onHistoryNext,
  onHistoryPrevious,
  onOpenOriginal,
  onOpenPip,
  onPlayerControlClick,
  supportsPip = true,
  onResetSize,
  onToggleAutoPlay,
  onModalResizeStart,
  onResizeStart,
}) {
  const mount = targetDocument.createElement('div');
  const refs = {};
  const setRef = (key) => (element) => {
    refs[key] = element;
  };
  const commentsTabs = createCommentsTabs(targetDocument, 'home');

  targetDocument.body.appendChild(mount);
  const disposeSolid = render(() => (
    <HomePlayerPage
      commentsTabs={commentsTabs}
      refs={setRef}
      onBackToTop={onBackToTop}
      onBackdropClose={onBackdropClose}
      onClose={onClose}
      onFullscreen={onFullscreen}
      onHistoryNext={onHistoryNext}
      onHistoryPrevious={onHistoryPrevious}
      onOpenOriginal={onOpenOriginal}
      onOpenPip={onOpenPip}
      onPlayerControlClick={onPlayerControlClick}
      supportsPip={supportsPip}
      onResetSize={onResetSize}
      onToggleAutoPlay={onToggleAutoPlay}
      onModalResizeStart={onModalResizeStart}
      onResizeStart={onResizeStart}
      targetDocument={targetDocument}
    />
  ), mount);

  return {
    ...refs,
    commentsTabs,
    mount,
    dispose: () => {
      disposeSolid();
      mount.remove();
    },
  };
}

export function mountPipPlayerPage({
  targetDocument,
  createCommentsTabs,
}) {
  const mount = targetDocument.createElement('div');
  const commentsTabs = createCommentsTabs(targetDocument, 'pip');

  targetDocument.body.appendChild(mount);
  const disposeSolid = render(() => (
    <PipPlayerPage
      commentsTabs={commentsTabs}
      targetDocument={targetDocument}
    />
  ), mount);

  return {
    mount,
    dispose: () => {
      disposeSolid();
      mount.remove();
    },
  };
}

function HomePlayerPage(props) {
  let backdropPointer = '0';
  const backToTopIcon = props.targetDocument.createElement('template');
  backToTopIcon.innerHTML = arrowUpIconMarkup();

  return (
    <div
      id={`${APP}-overlay`}
      ref={props.refs('overlay')}
      role="dialog"
      aria-modal="true"
      data-backdrop-pointer="0"
      onPointerDown={(event) => {
        backdropPointer = event.target === event.currentTarget ? '1' : '0';
        event.currentTarget.dataset.backdropPointer = backdropPointer;
      }}
      onPointerUp={(event) => {
        const startedOnBackdrop = backdropPointer === '1';
        backdropPointer = '0';
        event.currentTarget.dataset.backdropPointer = '0';
        if (startedOnBackdrop && event.target === event.currentTarget) props.onBackdropClose?.();
      }}
      onPointerCancel={(event) => {
        backdropPointer = '0';
        event.currentTarget.dataset.backdropPointer = '0';
      }}
    >
      <section id={`${APP}-dialog`} ref={props.refs('dialog')}>
        <header id={`${APP}-header`}>
          <div class={`${APP}__header-history`}>
            <button
              type="button"
              class={`${APP}__header-button`}
              title="上一次播放"
              aria-label="上一次播放"
              ref={props.refs('historyPrevious')}
              onClick={() => props.onHistoryPrevious?.()}
            >
              {createHistoryBackIcon()}
            </button>
            <button
              type="button"
              class={`${APP}__header-button`}
              title="下一次播放"
              aria-label="下一次播放"
              ref={props.refs('historyNext')}
              onClick={() => props.onHistoryNext?.()}
            >
              {createHistoryForwardIcon()}
            </button>
          </div>
          <div id={`${APP}-title`} ref={props.refs('title')} />
          <div id={`${APP}-status`} ref={props.refs('status')} />
          <div class={`${APP}__header-actions`}>
            <span
              class={`${APP}__auto-play-hint`}
              ref={props.refs('autoPlayHint')}
              role="status"
              aria-live="polite"
            />
            <button
              type="button"
              class={`${APP}__header-button`}
              title="自动联播。按 J / L 手动切换"
              aria-label="自动联播。按 J / L 手动切换"
              ref={props.refs('autoPlayNext')}
              onClick={() => props.onToggleAutoPlay?.()}
            >
              {createAutoPlayIcon()}
            </button>
            {props.supportsPip && (
              <button
                type="button"
                class={`${APP}__header-button`}
                title="在 Document PiP 打开。建议保持 PiP 窗口常开，后续切视频会更快；关闭后再打开会重新初始化。"
                aria-label="在 Document PiP 打开。建议保持 PiP 窗口常开，后续切视频会更快；关闭后再打开会重新初始化。"
                ref={props.refs('openPip')}
                onClick={() => props.onOpenPip?.()}
              >
                {createPictureInPictureIcon()}
              </button>
            )}
            <button
              type="button"
              class={`${APP}__header-button`}
              title="打开原播放页"
              aria-label="打开原播放页"
              ref={props.refs('openOriginal')}
              onClick={(event) => props.onOpenOriginal?.(event.currentTarget.dataset.href)}
            >
              {createExternalLinkIcon()}
            </button>
            <button
              type="button"
              class={`${APP}__header-button`}
              title="网页内全屏"
              aria-label="网页内全屏"
              ref={props.refs('fullscreen')}
              onClick={() => props.onFullscreen?.()}
            >
              {createMaximizeIcon()}
            </button>
            <button
              type="button"
              class={`${APP}__header-button`}
              title="重置窗口尺寸"
              aria-label="重置窗口尺寸"
              ref={props.refs('resetSize')}
              onClick={() => props.onResetSize?.()}
            >
              {createResetSizeIcon()}
            </button>
            <button
              type="button"
              class={`${APP}__header-button ${APP}__header-button--close`}
              title="关闭"
              aria-label="关闭首页播放器"
              ref={props.refs('close')}
              onClick={() => props.onClose?.()}
            >
              {createCloseIcon()}
            </button>
          </div>
        </header>
        <div id={`${APP}-content`} ref={props.refs('content')}>
          <div id={`${APP}-player-wrap`} ref={props.refs('playerWrap')}>
            <div
              id={`${APP}-player`}
              ref={props.refs('playerRoot')}
              onClickCapture={(event) => props.onPlayerControlClick?.(event)}
            />
          </div>
          <div
            id={`${APP}-comments-resizer`}
            ref={props.refs('commentsResizer')}
            tabIndex={0}
            role="separator"
            aria-orientation="vertical"
            aria-label="调整评论区宽度"
            onPointerDown={(event) => props.onResizeStart?.(event)}
          />
          <section id={`${APP}-comments`} ref={props.refs('comments')}>
            {props.commentsTabs}
            <div id={`${APP}-comments-panel`} class={`${APP}__comments-panel`} ref={props.refs('commentsPanel')}>
              <div id={`${APP}-video-intro`} ref={props.refs('videoIntro')} />
              <div id={`${APP}-comments-mount`} ref={props.refs('commentsMount')} />
            </div>
            <div id={`${APP}-pages-panel`} class={`${APP}__comments-panel`} ref={props.refs('pagesPanel')}>
              <div id={`${APP}-pages-list`} class={`${APP}__playlist`} ref={props.refs('pagesList')} />
              <div id={`${APP}-pages-empty`} class={`${APP}__playlist-empty`} ref={props.refs('pagesEmpty')}>
                合集加载中...
              </div>
            </div>
            <div id={`${APP}-playlist-panel`} class={`${APP}__comments-panel`} ref={props.refs('playlistPanel')}>
              <div id={`${APP}-playlist-list`} class={`${APP}__playlist`} ref={props.refs('playlistList')} />
              <div id={`${APP}-playlist-empty`} class={`${APP}__playlist-empty`} ref={props.refs('playlistEmpty')}>
                播放列表加载中...
              </div>
            </div>
            <div id={`${APP}-live-panel`} class={`${APP}__comments-panel`} ref={props.refs('livePanel')}>
              <div id={`${APP}-live-list`} class={`${APP}__playlist`} ref={props.refs('liveList')} />
              <div id={`${APP}-live-empty`} class={`${APP}__playlist-empty`} ref={props.refs('liveEmpty')}>
                直播列表加载中...
              </div>
            </div>
            <div id={`${APP}-recommend-panel`} class={`${APP}__comments-panel`} ref={props.refs('recommendPanel')}>
              <div id={`${APP}-recommend-list`} class={`${APP}__playlist`} ref={props.refs('recommendList')} />
              <div id={`${APP}-recommend-empty`} class={`${APP}__playlist-empty`} ref={props.refs('recommendEmpty')}>
                相关推荐加载中...
              </div>
            </div>
          </section>
        </div>
        <button
          type="button"
          class={`${APP}__back-to-top`}
          title="回到顶部"
          aria-label="回到顶部"
          ref={props.refs('backToTop')}
          onClick={() => props.onBackToTop?.()}
        >
          {backToTopIcon.content.firstElementChild}
        </button>
        <button
          type="button"
          class={`${APP}__modal-resize-handle`}
          title="调整窗口尺寸"
          aria-label="调整窗口尺寸"
          ref={props.refs('modalResizeHandle')}
          onPointerDown={(event) => props.onModalResizeStart?.(event)}
        />
      </section>
    </div>
  );
}

function PipPlayerPage(props) {
  const backToTopIcon = props.targetDocument.createElement('template');
  backToTopIcon.innerHTML = arrowUpIconMarkup();

  return (
    <div id="shell">
      <main id="layout">
        <div id="stage">
          <div id="bilibili-player" />
        </div>
        <div
          id="comments-resizer"
          tabIndex={0}
          role="separator"
          aria-orientation="vertical"
          aria-label="调整评论区宽度"
        />
        <section id="comments">
          {props.commentsTabs}
          <div id="comments-panel" class={`${APP}__comments-panel`}>
            <div id="video-intro" />
            <div id="comments-mount">评论加载中...</div>
          </div>
          <div id="pages-panel" class={`${APP}__comments-panel`}>
            <div id="pages-list" class={`${APP}__playlist`} />
            <div id="pages-empty" class={`${APP}__playlist-empty`}>合集加载中...</div>
          </div>
          <div id="playlist-panel" class={`${APP}__comments-panel`}>
            <div id="playlist-list" class={`${APP}__playlist`} />
            <div id="playlist-empty" class={`${APP}__playlist-empty`}>播放列表加载中...</div>
          </div>
          <div id="live-panel" class={`${APP}__comments-panel`}>
            <div id="live-list" class={`${APP}__playlist`} />
            <div id="live-empty" class={`${APP}__playlist-empty`}>直播列表加载中...</div>
          </div>
          <div id="recommend-panel" class={`${APP}__comments-panel`}>
            <div id="recommend-list" class={`${APP}__playlist`} />
            <div id="recommend-empty" class={`${APP}__playlist-empty`}>相关推荐加载中...</div>
          </div>
        </section>
      </main>
      <button
        type="button"
        id="back-to-top"
        class={`${APP}__back-to-top`}
        title="回到顶部"
        aria-label="回到顶部"
      >
        {backToTopIcon.content.firstElementChild}
      </button>
    </div>
  );
}
