import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dialog } from '@base-ui/react/dialog';
import { Button } from '@base-ui/react/button';
import { Collapsible } from '@base-ui/react/collapsible';
import { APP, SETTINGS_CLASS as S, STORAGE_RESIZE_HINT_SEEN } from './constants.js';
import { getStorageItem, setStorageItem } from './storage.js';
import { DomSlot, Icon, mountReact } from './ui-runtime.jsx';
import { SettingsControl } from './settings-ui.jsx';
import { installOverlayScrollbars } from './overlay-scrollbars.js';
import { copyPlaybackLink } from './share-link.js';
import { onPlayerShellKeyDown } from './media-shortcuts.js';
import { installPlayerControls } from './player-controls.js';

export function mountHomePlayerPage(props) {
  const targetDocument = props.targetDocument || document;
  const mount = targetDocument.createElement('div');
  mount.dataset.biliPopupUi = 'home';
  const refs = {};
  const refCallbacks = new Map();
  const setRef = (key) => {
    if (!refCallbacks.has(key)) refCallbacks.set(key, (element) => { refs[key] = element; });
    return refCallbacks.get(key);
  };
  const commentsTabs = props.createCommentsTabs(targetDocument, 'home');
  // Resolve the portal target before mounting. An initially empty ref lets Base
  // UI fall back outside the dialog, where browser fullscreen covers the menu.
  const menuContainer = targetDocument.createElement('div');
  menuContainer.style.display = 'contents';
  targetDocument.body.appendChild(mount);
  const presentation = { open: false, minimized: false, resetSizeDisabled: true };
  const page = () => <HomePlayerPage {...props} {...presentation} container={mount} menuContainer={menuContainer} commentsTabs={commentsTabs} refs={setRef} />;
  const view = mountReact(mount, page());
  for (const name of ['commentsPanel', 'commentsMount', 'videoIntro', ...['pages', 'playlist', 'live', 'recommend'].flatMap(key => [key + 'Panel', key + 'List', key + 'Empty'])]) {
    refs[name] = targetDocument.getElementById(`${APP}-${name.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())}`);
  }
  return {
    ...refs, commentsTabs, mount,
    setOpen(open) { presentation.open = open; view.render(page()); },
    setMinimized(minimized) { presentation.minimized = minimized; view.render(page()); },
    setResetSizeDisabled(disabled) {
      if (presentation.resetSizeDisabled === disabled) return;
      presentation.resetSizeDisabled = disabled;
      view.render(page());
    },
    dispose() { commentsTabs.dispose?.(); view.dispose(); mount.remove(); },
  };
}

export function mountPipPlayerPage({ targetDocument, createCommentsTabs, settings }) {
  targetDocument.defaultView.__biliPopupReactUi?.dispose();
  const mount = targetDocument.createElement('div');
  mount.dataset.biliPopupUi = 'pip';
  const commentsTabs = createCommentsTabs(targetDocument, 'pip');
  targetDocument.body.appendChild(mount);
  const view = mountReact(mount, <PipPlayerPage commentsTabs={commentsTabs} settings={settings} targetDocument={targetDocument} />);
  const ui = { mount, dispose() { commentsTabs.dispose?.(); view.dispose(); mount.remove(); } };
  targetDocument.defaultView.__biliPopupReactUi = ui;
  settings.sync();
  return ui;
}

function ToolButton({ icon, label, buttonRef, onClick, className = '', ...props }) {
  return <Button className={`${APP}__header-button ${className}`} title={label} aria-label={label} ref={buttonRef} onClick={onClick} {...props}><Icon name={icon} size={19} /></Button>;
}

function CopyLinkButton({ targetDocument }) {
  const [result, setResult] = useState('');
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  return <ToolButton icon={result === '已复制' ? 'check' : 'copy'} label={result || '复制视频链接'} className={`${APP}__copy-link`} onClick={async () => {
    const source = targetDocument.getElementById(`${APP}-title`);
    try { await copyPlaybackLink(source?.dataset.href, targetDocument); setResult('已复制'); }
    catch { setResult('复制失败，请重试'); }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setResult(''), 1800);
  }} />;
}

function HomePlayerPage(props) {
  useOverlayScrollbars(props.container.ownerDocument, `${APP}-dialog`, props.open && !props.minimized);
  const pointerOnBackdrop = useRef(false);
  const scrollPlayer = useScrollMiniPlayer(props.container.ownerDocument, 'home', props.open && !props.minimized, props.onFrameResize);
  const controls = usePlayerControls(props.container.ownerDocument, `${APP}-player-wrap`, props.open, props.minimized || scrollPlayer.floating);
  const sidebarControls = props.commentsTabs.querySelector(`#${APP}-sidebar-window-controls`);
  const [present, setPresent] = useState(props.open);
  const [showResizeHint, setShowResizeHint] = useState(false);
  useEffect(() => {
    if (!props.open || props.minimized) { setShowResizeHint(false); return; }
    if (getStorageItem(STORAGE_RESIZE_HINT_SEEN) === '1') return;
    setStorageItem(STORAGE_RESIZE_HINT_SEEN, '1');
    setShowResizeHint(true);
    const timer = setTimeout(() => setShowResizeHint(false), 4000);
    return () => clearTimeout(timer);
  }, [props.open, props.minimized]);
  useEffect(() => {
    const ownerWindow = props.container.ownerDocument.defaultView;
    // Cancel an interrupted press, without suppressing the next genuine click.
    const onBlur = () => { pointerOnBackdrop.current = false; };
    ownerWindow.addEventListener('blur', onBlur);
    return () => ownerWindow.removeEventListener('blur', onBlur);
  }, [props.container]);
  useEffect(() => {
    if (props.open) { setPresent(true); return; }
    const timer = setTimeout(() => setPresent(false), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220);
    return () => clearTimeout(timer);
  }, [props.open]);
  return <Dialog.Root open={props.open} modal={props.minimized ? false : 'trap-focus'} disablePointerDismissal onOpenChange={(open, details) => {
    // Escape also cancels the playback countdown; the adapter handles it.
    if (details.reason === 'escape-key') return;
    if (!open) props.onClose?.();
  }}>
    {sidebarControls && createPortal(<>
      <ToolButton icon="down" label="收起到右下角" className={`${APP}__minimize-button`} onClick={props.onMinimize} />
      <Dialog.Close className={`${APP}__header-button ${APP}__header-button--close`} title="关闭播放器" aria-label="关闭播放器"><Icon name="close" size={17} /></Dialog.Close>
    </>, sidebarControls)}
    <Dialog.Portal container={props.container} keepMounted>
      <div id={`${APP}-overlay`} ref={props.refs('overlay')} hidden={!props.open && !present} data-open={props.open}
        onPointerDownCapture={(event) => {
          pointerOnBackdrop.current = event.target === event.currentTarget;
        }}
        onPointerUp={(event) => {
          if (pointerOnBackdrop.current && event.target === event.currentTarget) props.onBackdropClose?.();
          pointerOnBackdrop.current = false;
        }}
        onPointerCancel={() => { pointerOnBackdrop.current = false; }}>
        <Dialog.Popup id={`${APP}-dialog`} ref={props.refs('dialog')} initialFocus={false} finalFocus={false} aria-label={props.minimized ? '迷你播放器' : '小窗播放器'} onKeyDown={onPlayerShellKeyDown}>
          <div id={`${APP}-content`} ref={props.refs('content')}>
            <div id={`${APP}-player-slot`} ref={props.refs('playerSlot')}>
            <div id={`${APP}-player-wrap`} ref={props.refs('playerWrap')} data-scroll-floating={scrollPlayer.floating} data-controls-visible={controls.visible}>
              <div id={`${APP}-player`} ref={props.refs('playerRoot')} />
          <header id={`${APP}-header`}>
            <div className={`${APP}__header-history`}>
              <ToolButton icon="back" label="上一次播放" buttonRef={props.refs('historyPrevious')} onClick={props.onHistoryPrevious} />
              <ToolButton icon="next" label="下一次播放" buttonRef={props.refs('historyNext')} onClick={props.onHistoryNext} />
            </div>
            <div className={`${APP}__header-link`}><a id={`${APP}-title`} ref={props.refs('openOriginal')} href="#" target="_blank" rel="noopener noreferrer" title="在新标签页打开原页面">
              <span className={`${APP}__header-title-text`} ref={props.refs('title')} />
              <span className={`${APP}__header-title-external`}><Icon name="external" size={16} /></span>
            </a>
            <CopyLinkButton targetDocument={props.container.ownerDocument} />
            </div>
            <div id={`${APP}-status`} ref={props.refs('status')} role="status" />
            <div className={`${APP}__header-actions`}>
              <span className={`${APP}__auto-play-hint`} ref={props.refs('autoPlayHint')} role="status" aria-live="polite" />
              <ToolButton icon="autoplay" label="自动联播 · J / L 切换视频" buttonRef={props.refs('autoPlayNext')} onClick={props.onToggleAutoPlay} />
              {props.supportsPip && <ToolButton icon="pip" label="切换到独立小窗" buttonRef={props.refs('openPip')} onClick={props.onOpenPip} />}
              <ToolButton icon="expand" label="网页内全屏" buttonRef={props.refs('fullscreen')} onClick={props.onFullscreen} />
              <SettingsControl settings={props.settings} container={props.menuContainer} variant="player">
                <Button className={`${S}__action`} onClick={props.onFitLayout}><span>自动适配布局</span><Icon name="fit" size={17} /></Button>
                <Button className={`${S}__action`} disabled={props.resetSizeDisabled} ref={props.refs('resetSize')} onClick={props.onResetSize}><span>重置窗口尺寸</span><Icon name="reset" size={17} /></Button>
                <Collapsible.Root className={`${S}__shortcuts ${APP}__gamepad-indicator`} ref={props.refs('gamepadIndicator')}>
                  <Collapsible.Trigger className={`${S}__action`}><span>手柄快捷键</span><Icon name="down" size={17} /></Collapsible.Trigger>
                  <Collapsible.Panel className={`${S}__shortcut-panel`}>
                    <div className={`${S}__shortcut-content`}>
                    <p className={`${APP}__gamepad-disabled-hint`}>手柄控制已关闭</p>
                    <p className={`${APP}__gamepad-disconnected-hint`}>连接手柄后按任意键</p>
                    <dl>{[['A', '暂停 / 播放'], ['X / B', '调整进度'], ['Y', '系统全屏'], ['Menu', '网页全屏'], ['LB / RB', '切换分区'], ['LT / RT', '上一集 / 下一集'], ['摇杆', '滚动列表']].map(([key, action]) => <div key={key}><dt>{action}</dt><dd><kbd>{key}</kbd></dd></div>)}</dl>
                    </div>
                  </Collapsible.Panel>
                </Collapsible.Root>
              </SettingsControl>
              <ToolButton icon={props.minimized || scrollPlayer.floating ? 'expand' : 'down'} label={scrollPlayer.floating ? '回到视频' : props.minimized ? '还原播放器' : '收起到右下角'} className={`${APP}__minimize-button`} buttonRef={props.refs('minimize')} onClick={scrollPlayer.floating ? scrollPlayer.restore : props.onMinimize} />
              <Dialog.Close className={`${APP}__header-button ${APP}__header-button--close`} title="关闭播放器" aria-label="关闭播放器" ref={props.refs('close')}><Icon name="close" size={19} /></Dialog.Close>
            </div>
          </header>
            </div>
            </div>
            <div id={`${APP}-comments-resizer`} ref={props.refs('commentsResizer')} tabIndex={0} role="separator" aria-orientation="vertical" aria-label="调整评论区宽度" onPointerDown={props.onResizeStart} />
            <section id={`${APP}-comments`} ref={props.refs('comments')} aria-label="播放队列和评论"><DomSlot element={props.commentsTabs} /></section>
          </div>
          <DomSlot element={props.menuContainer} />
          <Button className={`${APP}__back-to-top`} title="回到顶部" aria-label="回到顶部" ref={props.refs('backToTop')} onClick={props.onBackToTop}><Icon name="arrowUp" /></Button>
          <Button className={`${APP}__modal-resize-handle`} aria-label="调整窗口尺寸" ref={props.refs('modalResizeHandle')} onPointerDown={(event) => { setShowResizeHint(false); props.onModalResizeStart?.(event); }} />
          {showResizeHint && <div className={`${APP}__resize-hint`} role="status">拖动窗口右下角，可调整大小</div>}
        </Dialog.Popup>
      </div>
    </Dialog.Portal>
  </Dialog.Root>;
}

function PipPlayerPage({ commentsTabs, settings, targetDocument }) {
  useOverlayScrollbars(targetDocument, 'shell', true);
  const scrollPlayer = useScrollMiniPlayer(targetDocument, 'pip', true);
  const controls = usePlayerControls(targetDocument, 'stage', true, scrollPlayer.floating);
  return <div id="shell" onKeyDown={onPlayerShellKeyDown}><main id="layout">
    <div id="stage-slot">
    <div id="stage" data-scroll-floating={scrollPlayer.floating} data-controls-visible={controls.visible}>
      <div id="bilibili-player" />
      <div className={`${APP}__pip-tools`}>{scrollPlayer.floating && <ToolButton icon="expand" label="回到视频" onClick={scrollPlayer.restore} />}<SettingsControl settings={settings} container={targetDocument.body} variant="player" /></div>
    </div>
    </div>
    <div id="comments-resizer" tabIndex={0} role="separator" aria-orientation="vertical" aria-label="调整评论区宽度" />
    <section id="comments" aria-label="播放队列和评论"><DomSlot element={commentsTabs} /></section>
  </main><Button id="back-to-top" className={`${APP}__back-to-top`} title="回到顶部" aria-label="回到顶部"><Icon name="arrowUp" /></Button></div>;
}

function useOverlayScrollbars(targetDocument, rootId, enabled) {
  useEffect(() => {
    const root = targetDocument.getElementById(rootId);
    if (enabled && root) return installOverlayScrollbars(root);
  }, [targetDocument, rootId, enabled]);
}

// Keep the same player node mounted; the slot preserves the document height
// while the video floats, so entering/leaving mini mode cannot move comments.
function useScrollMiniPlayer(targetDocument, kind, enabled, onResize) {
  const [floating, setFloating] = useState(false);
  const contentId = kind === 'home' ? `${APP}-content` : 'layout';
  const slotId = kind === 'home' ? `${APP}-player-slot` : 'stage-slot';
  useEffect(() => {
    if (!enabled) { setFloating(false); return; }
    const ownerWindow = targetDocument.defaultView;
    const content = targetDocument.getElementById(contentId);
    const slot = targetDocument.getElementById(slotId);
    const layoutRoot = kind === 'home' ? targetDocument.getElementById(`${APP}-overlay`) : targetDocument.body;
    if (!content || !slot) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const bounds = content.getBoundingClientRect(), video = slot.getBoundingClientRect();
      const bottomLayout = ownerWindow.getComputedStyle(content).display !== 'grid';
      const fullscreen = targetDocument.fullscreenElement;
      const shellFullscreen = kind === 'home' && fullscreen?.id === `${APP}-dialog`;
      setFloating(bottomLayout && (!fullscreen || shellFullscreen) && video.height > 0 && video.bottom <= Math.max(0, bounds.top) + .5);
    };
    const schedule = () => { if (!frame) frame = ownerWindow.requestAnimationFrame(update); };
    const resize = new ownerWindow.ResizeObserver(schedule);
    resize.observe(content); resize.observe(slot);
    const layout = new ownerWindow.MutationObserver(schedule);
    layout.observe(layoutRoot, { attributes: true, attributeFilter: ['class'] });
    content.addEventListener('scroll', schedule, { passive: true });
    targetDocument.addEventListener('fullscreenchange', schedule);
    schedule();
    return () => {
      ownerWindow.cancelAnimationFrame(frame);
      resize.disconnect(); layout.disconnect();
      content.removeEventListener('scroll', schedule);
      targetDocument.removeEventListener('fullscreenchange', schedule);
    };
  }, [targetDocument, kind, enabled, contentId, slotId]);
  useEffect(() => { onResize?.(); }, [floating, onResize]);
  return { floating, restore() { targetDocument.getElementById(contentId)?.scrollTo({ top: 0, behavior: 'instant' }); } };
}

function usePlayerControls(targetDocument, frameId, open, minimized = false) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const frame = targetDocument.getElementById(frameId);
    if (open && frame) return installPlayerControls(frame, setVisible);
    setVisible(false);
  }, [targetDocument, frameId, open, minimized]);
  return { visible };
}
