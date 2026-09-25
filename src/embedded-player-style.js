import { APP } from './constants.js';

export function getEmbeddedPlayerCss() {
  const embedded = `:is(#${APP}-player, [data-bili-popup-ui="pip"] #bilibili-player) .bpx-player-container:not(.bpx-player-rich-pip-root)`;
  const player = `${embedded}[data-screen="web"]`;
  const frame = `:is(#${APP}-player-wrap, [data-bili-popup-ui="pip"] #stage)`;
  const miniFrame = `:is(#${APP}-overlay.${APP}--minimized #${APP}-player-wrap, ${frame}[data-scroll-floating="true"])`;
  const mini = `${miniFrame} ${embedded}`;
  return `
    #${APP}-player[data-shell-fullscreen="false"] .bpx-player-ctrl-web-enter,
    #${APP}-player[data-shell-fullscreen="true"] .bpx-player-ctrl-web-leave { display: block !important; }
    #${APP}-player[data-shell-fullscreen="false"] .bpx-player-ctrl-web-leave,
    #${APP}-player[data-shell-fullscreen="true"] .bpx-player-ctrl-web-enter { display: none !important; }
    :is(#${APP}-player, [data-bili-popup-ui="pip"] #bilibili-player) .bpx-player-container { box-shadow: none !important; }
    #${APP}-dialog:fullscreen .bpx-player-shadow-progress-area,
    [data-bili-popup-ui="pip"] :fullscreen .bpx-player-shadow-progress-area { display: none !important; }
    /* Chromium can lose fullscreen danmaku when controls fade. A neutral
       backdrop filter keeps the video in page compositing with the native
       danmaku layer, without changing its mask, opacity or running animations. */
    #${APP}-dialog:fullscreen .bpx-player-dm-mask-wrap,
    [data-bili-popup-ui="pip"] :fullscreen .bpx-player-dm-mask-wrap { backdrop-filter: brightness(1); }
    /* Nano mounts the normal-mode sending bar before it sets data-screen. */
    ${embedded} .bpx-player-sending-area { display: none !important; }
    ${embedded} .bpx-player-primary-area { height: 100% !important; }
    /* Native control transitions extend below the viewport. overflow:hidden
       allows focus/scrollIntoView to shift the video and crop the first danmaku
       row; clip keeps the same clipping without an internal scroll container. */
    /* Unlike hidden, clip does not make a flex item a scroll container: reset
       its automatic minimum so the native video perch cannot force extra height. */
    ${embedded} .bpx-player-video-area { overflow: clip !important; min-height: 0 !important; min-width: 0 !important; }
    ${embedded} [data-bpn-linear-chapter] {
      left: var(--bpn-chapter-left) !important; width: var(--bpn-chapter-width) !important; margin-right: 0 !important;
    }
    /* Keep the native hover target above/below the thin track. The separator
       clips only its last two pixels instead of compressing the time axis. */
    ${embedded} [data-bpn-linear-chapter]:not(:last-child) { clip-path: inset(-20px 2px -20px 0); }
    #${APP}-player-wrap, [data-bili-popup-ui="pip"] #stage { container: ${APP}-video / inline-size; }
    ${player} .bpx-player-control-bottom { min-width: 0 !important; gap: 8px; padding-inline: 12px !important; }
    ${player} .bpx-player-control-bottom-left, ${player} .bpx-player-control-bottom-right { min-width: 0 !important; flex: 0 0 auto !important; }
    ${player} .bpx-player-control-bottom-center { flex: 1 1 0 !important; min-width: 0 !important; max-width: 420px; padding: 0 8px !important; }
    ${player} .bpx-player-sending-bar, ${player} .bpx-player-dm-root, ${player} .bpx-player-video-inputbar { min-width: 0 !important; }
    ${player} .bpx-player-video-info { display: none !important; }
    ${player} :is(.bpx-player-ctrl-quality-result, .bpx-player-ctrl-playbackrate-result) { font-size: 16px; }
    @container ${APP}-video (max-width: 1100px) {
      ${player} .bpx-player-control-bottom-center { flex: 1 1 auto !important; max-width: none; padding: 0 !important; }
      ${player} .bpx-player-video-inputbar { display: none !important; }
      ${player} .bpx-player-dm-root { justify-content: flex-start !important; }
      ${player} .bpx-player-dm-switch, ${player} .bpx-player-dm-setting { margin-inline: 0 8px !important; }
    }
    @container ${APP}-video (max-width: 960px) {
      ${player} .bpx-player-control-bottom { gap: 4px; padding-inline: 10px !important; }
      ${player} .bpx-player-control-bottom-right > .bpx-player-ctrl-btn { width: 32px !important; margin-inline: 0 !important; }
      ${player} .bpx-player-control-bottom-right > :is(.bpx-player-ctrl-quality, .bpx-player-ctrl-playbackrate) { width: auto !important; min-width: 42px; padding-inline: 4px; font-size: 12px !important; }
      ${player} :is(.bpx-player-ctrl-quality-result, .bpx-player-ctrl-playbackrate-result) { font-size: 14px !important; }
      ${player} .bpx-player-control-bottom .bpx-player-ctrl-btn-icon { width: 28px !important; }
      ${player} .bpx-player-control-bottom :is(.bpx-player-ctrl-play, .bpx-player-ctrl-prev, .bpx-player-ctrl-next) { width: 32px !important; }
      ${player} .bpx-player-ctrl-time { width: auto !important; min-width: 90px; margin-right: 4px !important; font-size: 12px !important; }
      ${player} .bpx-player-ctrl-time-label { font-size: 12px !important; }
      ${player} .bpx-player-ctrl-pip, ${player} .bpx-player-ctrl-web { display: none !important; }
    }
    @container ${APP}-video (max-width: 560px) {
      ${player} .bpx-player-dm-setting { display: none !important; }
      ${player} .bpx-player-ctrl-time-duration, ${player} .bpx-player-ctrl-time-divide { display: none !important; }
      ${player} .bpx-player-ctrl-time { min-width: 40px; }
    }
    /* Mini controls are siblings of the regular bar. Keep their click handlers
       and give both buttons the same geometry in Web mode. */
    ${embedded} :is(.bpx-player-ctrl-btn-play-icon-mini, .bpx-player-ctrl-volume-icon-mini) {
      position: absolute; inset: auto auto 12px 12px; z-index: 90;
      box-sizing: border-box; width: 32px !important; height: 32px !important;
      min-width: 0; margin: 0; padding: 4px; scale: 1; transform: none;
      border: 0; border-radius: 50%; background: rgba(0, 0, 0, .5);
      color: #fff; fill: #fff; font-size: 0; line-height: 24px; cursor: pointer;
    }
    ${embedded} .bpx-player-ctrl-volume-icon-mini { left: auto; right: 12px; }
    ${embedded} .bpx-player-ctrl-btn-play-icon-mini::after,
    ${embedded} .bpx-player-ctrl-volume-icon-mini::before { display: none; }
    ${embedded} :is(.bpx-player-ctrl-btn-play-icon-mini, .bpx-player-ctrl-volume-icon-mini):is(:hover, :focus-visible) { background: rgba(0, 0, 0, .72); }
    ${embedded} .bpx-player-ctrl-btn-play-icon-mini .bpx-player-ctrl-btn-icon,
    ${embedded} :is(.bpx-player-ctrl-btn-play-icon-mini, .bpx-player-ctrl-volume-icon-mini) .bpx-common-svg-icon {
      display: block; width: 24px !important; height: 24px !important; margin: 0; padding: 0; line-height: 24px; transform: none;
    }
    ${embedded} :is(.bpx-player-ctrl-btn-play-icon-mini, .bpx-player-ctrl-volume-icon-mini) svg { display: block; width: 100%; height: 100%; }
    /* Native TinyView hides play on every resume, and only restores it on
       mouseenter. Use the shell's activity state instead, including movement
       within the player, while leaving native mute/unmute selection intact. */
    ${frame} ${embedded} .bpx-player-ctrl-btn-play-icon-mini {
      display: block !important; opacity: 0; visibility: hidden; pointer-events: none;
      transition: opacity .16s, visibility .16s;
    }
    ${frame}[data-controls-visible="true"] ${embedded} .bpx-player-ctrl-btn-play-icon-mini,
    ${frame} ${embedded} .bpx-player-ctrl-btn-play-icon-mini:is(:hover, :focus-visible) {
      opacity: 1; visibility: visible; pointer-events: auto;
    }
    ${embedded} .bpx-player-ctrl-btn-play-icon-mini.bpx-player-ctrl-play-left .bpx-common-svg-icon {
      width: 20px !important; height: 20px !important; margin: 2px 1px 2px 3px; line-height: 20px;
    }
    /* Some Nano runtimes hide control-entity in TinyView without creating the
       legacy mini buttons. Reuse the regular play/mute controls and their native
       handlers in our floating player, regardless of that optional widget. */
    ${mini} :is(.bpx-player-control-wrap, .bpx-player-control-entity) {
      display: block !important; height: 56px !important; pointer-events: none;
    }
    ${mini} .bpx-player-control-wrap { position: absolute; inset: auto 0 0; width: 100%; z-index: 90; }
    ${mini} :is(.bpx-player-control-top, .bpx-player-control-mask, .bpx-player-control-bottom-center,
      .bpx-player-ctrl-volume-box, .bpx-player-ctrl-btn-play-icon-mini, .bpx-player-ctrl-volume-icon-mini) { display: none !important; }
    ${mini} .bpx-player-control-bottom {
      position: absolute; inset: auto 0 0; display: block !important; width: 100%; height: 56px !important;
      padding: 0 !important; margin: 0; background: none !important; pointer-events: none;
      opacity: 0 !important; visibility: hidden !important;
      transition: var(--${APP}-controls-transition, opacity .2s ease-in);
    }
    ${miniFrame}[data-controls-visible="true"] ${embedded} .bpx-player-control-bottom {
      opacity: 1 !important; visibility: visible !important;
    }
    ${mini} :is(.bpx-player-control-bottom-left, .bpx-player-control-bottom-right) {
      position: absolute; inset: auto auto 12px 12px; display: block !important;
      width: 32px !important; height: 32px !important; min-width: 0; margin: 0; padding: 0; pointer-events: none;
    }
    ${mini} .bpx-player-control-bottom-right { left: auto; right: 12px; }
    ${mini} .bpx-player-control-bottom-left > :not(.bpx-player-ctrl-play),
    ${mini} .bpx-player-control-bottom-right > :not(.bpx-player-ctrl-volume) { display: none !important; }
    ${mini} .bpx-player-control-bottom :is(.bpx-player-ctrl-play, .bpx-player-ctrl-volume) {
      position: relative; inset: auto; display: block !important; box-sizing: border-box;
      width: 32px !important; height: 32px !important; min-width: 0; margin: 0 !important; padding: 4px;
      scale: 1; transform: none; border: 0; border-radius: 50%; background: rgba(0, 0, 0, .5);
      color: #fff; fill: #fff; font-size: 0; line-height: 24px; cursor: pointer; pointer-events: auto;
    }
    ${mini} .bpx-player-control-bottom :is(.bpx-player-ctrl-play, .bpx-player-ctrl-volume):is(:hover, :focus-visible) { background: rgba(0, 0, 0, .72); }
    ${mini} .bpx-player-control-bottom :is(.bpx-player-ctrl-play, .bpx-player-ctrl-volume) .bpx-player-ctrl-btn-icon {
      width: 24px !important; height: 24px !important; margin: 0; padding: 0; line-height: 24px; transform: none;
    }
  `;
}
