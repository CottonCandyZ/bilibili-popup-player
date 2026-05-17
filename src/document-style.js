import {
  APP,
  BADGE_CLASS,
  BUTTON_CLASS,
  DOCUMENT_STYLE_ID,
  SETTINGS_CLASS,
} from './constants.js';
import { getPlayerThemeVariableCss } from './player-theme.js';

export function installDocumentStyle(targetDocument = document) {
  if (targetDocument.getElementById(DOCUMENT_STYLE_ID)) return;

  const style = targetDocument.createElement('style');
  style.id = DOCUMENT_STYLE_ID;
  style.textContent = `
      :root {
        --${APP}-surface: var(--bg1, #fff);
        --${APP}-surface-soft: var(--bg2, #f6f7f8);
        --${APP}-surface-elevated: var(--bg1_float, var(--bg1, #fff));
        --${APP}-text: var(--text1, #18191c);
        --${APP}-text-subtle: var(--text2, #61666d);
        --${APP}-text-muted: var(--text3, #9499a0);
        --${APP}-border: var(--line_regular, #e3e5e7);
        --${APP}-brand: var(--brand_pink, #fb7299);
        --${APP}-brand-soft: var(--Pi5, rgba(251, 114, 153, 0.14));
      }

      .${BUTTON_CLASS} {
        position: absolute !important;
        z-index: 20;
        right: 8px;
        bottom: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 72px;
        height: 28px;
        padding: 0 10px;
        border: 1px solid var(--${APP}-border);
        border-radius: 6px;
        color: var(--${APP}-text);
        background: var(--${APP}-surface-soft);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
        font: 500 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: pointer;
        opacity: 0.96;
        pointer-events: auto;
        transition: border-color 0.16s ease, color 0.16s ease, background 0.16s ease, opacity 0.16s ease;
      }

      .${BUTTON_CLASS}:disabled {
        color: var(--${APP}-text-muted);
        background: var(--${APP}-surface-soft);
        box-shadow: none;
        cursor: default;
      }

      .${BUTTON_CLASS}:hover,
      .${BUTTON_CLASS}:focus-visible {
        color: #fff;
        border-color: var(--${APP}-brand);
        background: var(--${APP}-brand);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
        opacity: 1;
        outline: none;
      }

      .${BADGE_CLASS} {
        position: absolute !important;
        z-index: 21;
        top: 8px;
        left: 8px;
        display: none;
        align-items: center;
        height: 24px;
        padding: 0 8px;
        border-radius: 6px;
        color: var(--${APP}-text-subtle);
        border: 1px solid var(--${APP}-border);
        background: var(--${APP}-surface-elevated);
        backdrop-filter: blur(8px);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
        font: 500 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: none;
      }

      .${BADGE_CLASS}.${APP}--active {
        display: inline-flex;
      }

      .${BADGE_CLASS}.${APP}--playing {
        color: #fff;
        border-color: var(--${APP}-brand);
        background: var(--${APP}-brand);
      }

      .${APP}__control-overlay.${APP}--playback-web-fullscreen {
        display: none;
      }

      .${APP}__fixed-pip-button {
        position: fixed !important;
        right: 16px !important;
        bottom: 160px !important;
        left: auto !important;
        top: auto !important;
        z-index: 2147481000;
        width: 52px !important;
        height: 52px !important;
        min-width: 0 !important;
        padding: 0 !important;
        display: grid !important;
        place-items: center !important;
        border-radius: 10px !important;
        font-size: 0 !important;
      }

      .${APP}__fixed-pip-button svg {
        width: 22px;
        height: 22px;
        display: block;
        stroke: currentColor;
      }

      #${APP}-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        display: grid;
        place-items: center;
        padding: 16px;
        background: rgba(15, 18, 24, 0.68);
      }

      body.${APP}--modal-open > bili-photoswipe,
      body.${APP}--modal-open > bili-modal,
      body.${APP}--modal-open > .pswp,
      body.${APP}--modal-open > .bili-modal,
      body.${APP}--modal-open > .bili-photoswipe,
      body.${APP}--modal-open > [class*="pswp"],
      body.${APP}--modal-open > [class*="photoswipe"],
      body.${APP}--modal-open > [class*="photo-swipe"],
      body.${APP}--modal-open > [class*="image-preview"],
      body.${APP}--modal-open > [class*="picture-preview"],
      body.${APP}--modal-open > [class*="preview"][class*="modal"],
      body.${APP}--modal-open > [class*="preview"][class*="popup"],
      #${APP}-overlay bili-photoswipe,
      #${APP}-overlay bili-modal,
      #${APP}-overlay .pswp,
      #${APP}-overlay .bili-modal,
      #${APP}-overlay .bili-photoswipe,
      #${APP}-overlay [class*="pswp"],
      #${APP}-overlay [class*="photoswipe"],
      #${APP}-overlay [class*="photo-swipe"],
      #${APP}-overlay [class*="image-preview"],
      #${APP}-overlay [class*="picture-preview"],
      #${APP}-overlay [class*="preview"][class*="modal"],
      #${APP}-overlay [class*="preview"][class*="popup"] {
        position: fixed !important;
        inset: 0 !important;
        z-index: 2147483647 !important;
      }

      #${APP}-overlay.${APP}--hidden {
        display: none;
      }

      #${APP}-dialog {
        position: relative;
        width: calc(100vw - clamp(128px, 16vw, 440px));
        height: min(960px, calc(100vh - clamp(96px, 12vh, 220px)));
        display: grid;
        grid-template-rows: 46px 1fr;
        overflow: hidden;
        border-radius: 8px;
        background: var(--${APP}-surface);
        box-shadow: 0 20px 70px rgba(0, 0, 0, 0.42);
      }

      #${APP}-overlay.${APP}--fullscreen {
        padding: 0;
        background: #000;
      }

      #${APP}-overlay.${APP}--fullscreen #${APP}-dialog {
        width: 100vw;
        height: 100vh;
        border-radius: 0;
        box-shadow: none;
      }

      #${APP}-overlay.${APP}--fullscreen .${APP}__modal-resize-handle {
        display: none;
      }

      #${APP}-header {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        min-width: 0;
        padding: 0 10px 0 16px;
        color: var(--${APP}-text);
        background: var(--${APP}-surface-elevated);
        border-bottom: 1px solid var(--${APP}-border);
      }

      .${APP}__header-history {
        display: inline-grid;
        grid-template-columns: repeat(2, 32px);
        gap: 2px;
        align-items: center;
      }

      .${APP}__header-actions {
        display: inline-grid;
        grid-auto-flow: column;
        grid-auto-columns: 32px;
        gap: 4px;
        align-items: center;
        justify-content: end;
        min-width: 0;
      }

      .${APP}__auto-play-hint {
        justify-self: end;
        grid-column: auto / span 1;
        max-width: 0;
        overflow: hidden;
        white-space: nowrap;
        color: var(--${APP}-text-subtle);
        opacity: 0;
        font: 500 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        transition: max-width 0.18s ease, opacity 0.18s ease, margin-right 0.18s ease;
      }

      .${APP}__auto-play-hint.${APP}--visible {
        max-width: 180px;
        margin-right: 4px;
        opacity: 1;
      }

      #${APP}-title {
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        font: 500 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      #${APP}-status {
        display: none;
      }

      .${APP}__header-button {
        width: 32px;
        height: 32px;
        box-sizing: border-box;
        padding: 0;
        display: inline-grid;
        place-items: center;
        line-height: 1;
        font: inherit;
        appearance: none;
        -moz-appearance: none;
        border: 1px solid transparent;
        border-radius: 6px;
        color: var(--${APP}-text-subtle);
        background: transparent;
        cursor: pointer;
        transition: color 0.16s ease, background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
      }

      .${APP}__header-button:disabled {
        color: var(--${APP}-text-muted);
        cursor: default;
        opacity: 0.45;
      }

      .${APP}__header-button svg {
        width: 17px;
        height: 17px;
        display: block;
        margin: 0;
        flex: none;
        stroke: currentColor;
        transition: stroke 0.16s ease;
      }

      .${APP}__header-button svg * {
        stroke: currentColor;
      }

      .${APP}__header-button--text {
        width: auto;
        min-width: 72px;
        padding: 0 10px;
        font-size: 12px;
      }

      .${APP}__header-button:hover,
      .${APP}__header-button:focus-visible,
      .${APP}__header-button.${APP}__header-button--active {
        color: var(--${APP}-brand);
        border-color: rgba(251, 114, 153, 0.32);
        background: var(--${APP}-surface-soft);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
        outline: none;
      }

      .${APP}__header-button:disabled:hover,
      .${APP}__header-button:disabled:focus-visible {
        color: var(--${APP}-text-muted);
        border-color: transparent;
        background: transparent;
        box-shadow: none;
      }

      .${APP}__modal-resize-handle {
        position: absolute;
        right: 0;
        bottom: 0;
        z-index: 20;
        width: 28px;
        height: 28px;
        padding: 0;
        border: 0;
        border-radius: 0 0 8px 0;
        color: var(--${APP}-text-muted);
        background:
          linear-gradient(135deg, transparent 0 52%, currentColor 52% 57%, transparent 57%),
          linear-gradient(135deg, transparent 0 68%, currentColor 68% 73%, transparent 73%);
        cursor: nwse-resize;
        opacity: 0.72;
      }

      .${APP}__modal-resize-handle:hover,
      .${APP}__modal-resize-handle:focus-visible,
      #${APP}-overlay.${APP}--modal-resizing .${APP}__modal-resize-handle {
        color: var(--${APP}-brand);
        opacity: 1;
        outline: none;
      }

      #${APP}-content {
        position: relative;
        min-width: 0;
        min-height: 0;
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
        background: var(--${APP}-surface);
      }

      #${APP}-overlay.${APP}--comments-right #${APP}-content {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 8px var(--${APP}-comments-width, 420px);
        overflow: hidden;
      }

      .${APP}__back-to-top {
        position: absolute;
        right: 34px;
        bottom: 30px;
        z-index: 6;
        width: 38px;
        height: 38px;
        display: grid;
        place-items: center;
        border: 1px solid var(--line_regular, #e3e5e7);
        border-radius: 999px;
        color: var(--text2, #61666d);
        background: var(--bg1, #fff);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
        cursor: pointer;
        opacity: 0;
        pointer-events: none;
        transform: translateY(6px);
        transition: opacity 0.16s ease, transform 0.16s ease, color 0.16s ease, border-color 0.16s ease;
      }

      #${APP}-overlay.${APP}--comments-right .${APP}__back-to-top {
        right: 24px;
        bottom: 24px;
      }

      .${APP}__back-to-top.${APP}--visible {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0);
      }

      .${APP}__back-to-top:hover,
      .${APP}__back-to-top:focus-visible {
        color: var(--${APP}-brand);
        border-color: var(--${APP}-brand);
        outline: none;
      }

      .${APP}__back-to-top svg {
        width: 18px;
        height: 18px;
        display: block;
        stroke: currentColor;
      }

      #${APP}-comments-resizer {
        display: none;
      }

      #${APP}-overlay.${APP}--comments-right #${APP}-comments-resizer {
        display: block;
        position: relative;
        z-index: 2;
        width: 8px;
        min-width: 8px;
        height: 100%;
        cursor: col-resize;
        background: var(--bg1, #fff);
      }

      #${APP}-overlay.${APP}--comments-right #${APP}-comments-resizer::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 0;
        width: 1px;
        background: rgba(148, 153, 160, 0.36);
      }

      #${APP}-overlay.${APP}--comments-right #${APP}-comments-resizer:hover::before,
      #${APP}-overlay.${APP}--comments-right #${APP}-comments-resizer:focus-visible::before,
      #${APP}-overlay.${APP}--resizing #${APP}-comments-resizer::before {
        background: var(--${APP}-brand);
      }

      #${APP}-overlay.${APP}--comments-right #${APP}-comments-resizer:focus-visible {
        outline: none;
      }

      #${APP}-player-wrap {
        position: relative;
        height: calc(min(960px, calc(100vh - clamp(96px, 12vh, 220px))) - 46px);
        min-width: 0;
        min-height: 0;
        background: #000;
      }

      #${APP}-overlay.${APP}--fullscreen #${APP}-player-wrap {
        height: calc(100vh - 46px);
      }

      #${APP}-overlay.${APP}--comments-right #${APP}-player-wrap,
      #${APP}-overlay.${APP}--fullscreen.${APP}--comments-right #${APP}-player-wrap {
        height: 100%;
      }

      #${APP}-player,
      #${APP}-player .bpx-player-container {
        width: 100% !important;
        height: 100% !important;
      }

${getPlayerThemeVariableCss(`#${APP}-player`)}

      .${APP}__like-burst {
        position: absolute;
        left: 50%;
        top: 50%;
        z-index: 80;
        box-sizing: border-box;
        min-width: 112px;
        height: 46px;
        padding: 0 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 999px;
        color: #fff;
        background: rgba(0, 0, 0, 0.62);
        box-shadow: 0 12px 34px rgba(0, 0, 0, 0.32);
        font: 700 16px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
        pointer-events: none;
        transform: translate(-50%, -50%) scale(0.86);
        animation: ${APP}-like-burst 0.9s ease forwards;
      }

      .${APP}__like-burst--success {
        background: rgba(251, 114, 153, 0.92);
      }

      .${APP}__like-burst--neutral {
        background: rgba(77, 84, 96, 0.9);
      }

      .${APP}__like-burst--error {
        background: rgba(174, 45, 45, 0.92);
      }

      .${APP}__like-burst svg {
        width: 22px;
        height: 22px;
        flex: 0 0 auto;
      }

      @keyframes ${APP}-like-burst {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.72);
        }
        18% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1.06);
        }
        62% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, calc(-50% - 24px)) scale(0.98);
        }
      }

      #${APP}-player .bpx-player-ctrl-web,
      #${APP}-player .bpx-player-ctrl-web-enter,
      #${APP}-player .bpx-player-ctrl-web-leave,
      #${APP}-player .bilibili-player-video-btn-web-fullscreen {
        display: none !important;
      }

      #${APP}-player.bpx-player-web-full,
      #${APP}-player .bpx-player-web-full,
      #${APP}-player.bilibili-player-video-web-fullscreen,
      #${APP}-player .bilibili-player-video-web-fullscreen {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        min-width: 0 !important;
        min-height: 0 !important;
        z-index: 1 !important;
      }

      #${APP}-player.${APP}__live-player-root,
      #${APP}-player #fullscreen-container,
      #${APP}-player #live-player {
        position: relative;
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        background: #000;
      }

      #${APP}-player .${APP}__live-player-controls-layer {
        overflow: visible !important;
      }

      #${APP}-player .${APP}__live-player-only-control {
        position: absolute !important;
        right: 14px;
        bottom: calc(100% + 10px);
        z-index: 60;
        width: 34px;
        height: 34px;
        box-sizing: border-box;
        padding: 0;
        display: inline-grid;
        place-items: center;
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 6px;
        color: rgba(255, 255, 255, 0.92);
        background: rgba(0, 0, 0, 0.56);
        backdrop-filter: blur(8px);
        cursor: pointer;
      }

      #${APP}-player .${APP}__live-player-only-control:hover,
      #${APP}-player .${APP}__live-player-only-control:focus-visible {
        color: #fff;
        border-color: var(--${APP}-brand);
        background: var(--${APP}-brand);
        outline: none;
      }

      #${APP}-player .${APP}__live-player-only-control svg {
        width: 17px;
        height: 17px;
        display: block;
        stroke: currentColor;
      }

      #${APP}-comments {
        display: flex;
        flex-direction: column;
        min-height: 520px;
        padding: 0;
        color: var(--text1, #18191c);
        background: var(--bg1, #fff);
      }

      #${APP}-overlay.${APP}--comments-right #${APP}-comments {
        display: grid;
        grid-template-rows: 42px minmax(0, 1fr);
        min-width: 0;
        min-height: 0;
        height: 100%;
        padding: 0;
        overflow: hidden;
        border-left: 0;
      }

      .${APP}__comments-tabs {
        flex: 0 0 auto;
        display: flex;
        align-items: flex-end;
        gap: 4px;
        box-sizing: border-box;
        min-height: 42px;
        margin: 0;
        padding: 6px 0 0;
        border-bottom: 1px solid var(--line_regular, #e3e5e7);
        background: var(--bg1, #fff);
        overflow: visible;
      }

      #${APP}-overlay.${APP}--comments-right .${APP}__comments-tabs {
        grid-row: 1;
        margin: 0;
        padding: 6px 0 0;
      }

      .${APP}__comments-tab {
        box-sizing: border-box;
        height: 36px;
        padding: 0 4px;
        display: inline-flex;
        align-items: center;
        border: 0;
        border-bottom: 2px solid transparent;
        color: var(--text2, #61666d);
        background: transparent;
        font: 600 16px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: pointer;
      }

      .${APP}__comments-tab[hidden] {
        display: none !important;
      }

      .${APP}__comments-tab:hover,
      .${APP}__comments-tab:focus-visible,
      .${APP}__comments-tab.${APP}--active {
        color: var(--brand_pink, #fb7299);
        outline: none;
      }

      .${APP}__comments-tab.${APP}--active {
        border-bottom-color: var(--brand_pink, #fb7299);
      }

      .${APP}__comments-panel[hidden] {
        display: none !important;
      }

      .${APP}__comments-panel:not([hidden]) {
        min-width: 0;
        min-height: 0;
        flex: 1 1 auto;
        overflow: visible;
      }

      #${APP}-overlay.${APP}--comments-right .${APP}__comments-panel:not([hidden]) {
        grid-row: 2;
        height: 100%;
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
      }

      #${APP}-comments-mount {
        box-sizing: border-box;
        min-height: 360px;
        padding: 8px 18px 0 0;
        color: var(--text1, #18191c);
        background: var(--bg1, #fff);
      }

      #${APP}-overlay.${APP}--comments-right #${APP}-comments-mount {
        padding: 8px 16px 0 0;
      }

      .${APP}__video-intro {
        box-sizing: border-box;
        margin: 0 18px 0 0;
        padding: 14px 0 16px;
        color: var(--text1, #18191c);
        border-bottom: 1px solid var(--line_regular, #e3e5e7);
        background: var(--bg1, #fff);
      }

      #${APP}-overlay.${APP}--comments-right .${APP}__video-intro {
        margin-right: 16px;
      }

      .${APP}__video-intro-up {
        display: grid;
        grid-template-columns: 40px minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
        min-width: 0;
      }

      .${APP}__video-intro-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        object-fit: cover;
        background: var(--graph_bg_thin, #f1f2f3);
      }

      .${APP}__video-intro-main {
        min-width: 0;
      }

      .${APP}__video-intro-name {
        display: block;
        overflow: hidden;
        color: var(--text1, #18191c);
        font: 600 14px/20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        text-decoration: none;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .${APP}__video-intro-name:hover,
      .${APP}__video-intro-name:focus-visible {
        color: var(--brand_pink, #fb7299);
        outline: none;
      }

      .${APP}__video-intro-meta {
        overflow: hidden;
        color: var(--text3, #9499a0);
        font: 400 12px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .${APP}__video-intro-owner-desc {
        display: -webkit-box;
        margin-top: 3px;
        overflow: hidden;
        color: var(--text2, #61666d);
        font: 400 12px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        overflow-wrap: anywhere;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }

      .${APP}__video-intro-follow {
        position: relative;
        height: 30px;
        min-width: 58px;
        padding: 0 14px;
        border: 0;
        border-radius: 4px;
        color: #fff;
        background: var(--brand_pink, #fb7299);
        font: 600 13px/30px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease;
      }

      .${APP}__video-intro-follow::after {
        content: attr(data-label);
      }

      .${APP}__video-intro-follow:hover,
      .${APP}__video-intro-follow:focus-visible {
        background: #ff85ad;
        outline: none;
      }

      .${APP}__video-intro-follow--active {
        color: var(--text2, #61666d);
        background: var(--graph_bg_thick, #e3e5e7);
      }

      .${APP}__video-intro-follow--active:hover,
      .${APP}__video-intro-follow--active:focus-visible {
        color: #fff;
        background: #9499a0;
      }

      .${APP}__video-intro-follow--active:hover::after,
      .${APP}__video-intro-follow--active:focus-visible::after {
        content: attr(data-hover-label);
      }

      .${APP}__video-intro-follow:disabled {
        color: var(--text3, #9499a0);
        background: var(--graph_bg_thick, #e3e5e7);
        cursor: default;
      }

      .${APP}__video-intro-desc {
        margin-top: 12px;
      }

      .${APP}__video-intro-desc-title {
        margin-bottom: 5px;
        color: var(--text2, #61666d);
        font: 600 13px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .${APP}__video-intro-desc-text {
        max-height: 144px;
        overflow: auto;
        color: var(--text2, #61666d);
        font: 400 13px/20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }

      .${APP}__playlist {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 0 28px;
        padding: 12px 0 24px;
      }

      #${APP}-overlay.${APP}--comments-right .${APP}__playlist {
        grid-template-columns: 1fr;
      }

      .${APP}__playlist-card {
        appearance: none;
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        display: grid;
        grid-template-columns: clamp(112px, 30%, 156px) minmax(0, 1fr);
        column-gap: 12px;
        align-items: start;
        padding: 12px 16px;
        border: 0;
        border-bottom: 1px solid var(--line_regular, #e3e5e7);
        border-radius: 0;
        color: var(--text1, #18191c);
        background: transparent;
        text-align: left;
        text-indent: 0;
        font: inherit;
        cursor: pointer;
      }

      .${APP}__playlist-card:hover,
      .${APP}__playlist-card:focus-visible,
      .${APP}__playlist-card.${APP}--selected {
        outline: none;
      }

      .${APP}__playlist-card:last-child {
        border-bottom: 0;
      }

      .${APP}__playlist-card.${APP}--selected {
        color: var(--brand_blue, #00aeec);
        background: transparent;
      }

      .${APP}__playlist-card:hover .${APP}__playlist-title,
      .${APP}__playlist-card:focus-visible .${APP}__playlist-title,
      .${APP}__playlist-card.${APP}--selected .${APP}__playlist-title {
        color: var(--brand_blue, #00aeec);
      }

      .${APP}__playlist-card.${APP}--selected .${APP}__playlist-subtitle,
      .${APP}__playlist-card.${APP}--selected .${APP}__playlist-stats {
        color: var(--text2, #61666d);
      }

      .${APP}__playlist-playing {
        width: 16px;
        height: 16px;
        display: inline-block;
        margin: 0 4px 0 0;
        vertical-align: -3px;
      }

      .${APP}__playlist-cover {
        position: relative;
        z-index: 0;
        min-width: 0;
        width: 100%;
        aspect-ratio: 16 / 9;
        overflow: hidden;
        border-radius: 6px;
        background: var(--bg2, #f6f7f8);
      }

      .${APP}__playlist-cover img {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
      }

      .${APP}__playlist-duration {
        position: absolute;
        right: 4px;
        bottom: 4px;
        height: 18px;
        padding: 0 5px;
        border-radius: 3px;
        color: #fff;
        background: rgba(0, 0, 0, 0.72);
        font: 500 12px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .${APP}__playlist-info {
        position: relative;
        z-index: 1;
        width: 100%;
        min-width: 0;
        max-width: 100%;
        overflow: visible;
        padding: 1px 2px 0 1px;
        display: grid;
        align-content: start;
        gap: 6px;
      }

      .${APP}__playlist-title {
        width: 100%;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 6px;
        overflow: hidden;
        overflow-wrap: anywhere;
        word-break: break-word;
        color: var(--text1, #18191c);
        font: 500 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .${APP}__playlist-title-text {
        min-width: 0;
        flex: 1 1 auto;
        overflow: hidden;
        overflow-wrap: anywhere;
        word-break: break-word;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }

      .${APP}__playlist-last-played {
        flex: 0 0 auto;
        height: 18px;
        display: inline-flex;
        align-items: center;
        padding: 0 5px;
        border-radius: 3px;
        color: var(--brand_blue, #00aeec);
        background: color-mix(in srgb, var(--brand_blue, #00aeec) 12%, transparent);
        font: 500 11px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .${APP}__playlist-subtitle,
      .${APP}__playlist-stats,
      .${APP}__playlist-empty {
        color: var(--text3, #9499a0);
        font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .${APP}__playlist-subtitle,
      .${APP}__playlist-stats {
        max-width: 100%;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .${APP}__playlist-stats {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .${APP}__playlist-stat {
        min-width: 0;
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }

      .${APP}__playlist-stat-icon {
        width: 16px;
        height: 16px;
        flex: 0 0 auto;
        color: currentColor;
      }

      .${APP}__playlist-card--skeleton {
        cursor: default;
        pointer-events: none;
      }

      .${APP}__playlist-skeleton-cover,
      .${APP}__playlist-skeleton-line {
        position: relative;
        overflow: hidden;
        border-radius: 6px;
        background: var(--graph_bg_regular, var(--bg2, #f1f2f3));
      }

      .${APP}__playlist-skeleton-cover {
        width: 100%;
        aspect-ratio: 16 / 9;
      }

      .${APP}__playlist-skeleton-info {
        min-width: 0;
        display: grid;
        align-content: start;
        gap: 9px;
        padding-top: 2px;
      }

      .${APP}__playlist-skeleton-line {
        height: 12px;
      }

      .${APP}__playlist-skeleton-line--title {
        height: 16px;
      }

      .${APP}__playlist-skeleton-cover::after,
      .${APP}__playlist-skeleton-line::after {
        content: "";
        position: absolute;
        inset: 0;
        transform: translateX(-100%);
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.34), transparent);
        animation: ${APP}-skeleton-shimmer 1.25s ease-in-out infinite;
      }

      @keyframes ${APP}-skeleton-shimmer {
        100% {
          transform: translateX(100%);
        }
      }

      body.${APP}--modal-open .bili-comments-bottom-fixed-wrapper,
      body.${APP}--modal-open [class*="bottom-fixed"],
      body.${APP}--modal-open [class*="fixed-wrapper"],
      #${APP}-overlay .bili-comments-bottom-fixed-wrapper,
      #${APP}-overlay [class*="bottom-fixed"],
      #${APP}-overlay [class*="fixed-wrapper"],
      .${APP}__bottom-fixed-hidden {
        display: none !important;
      }

      @media (max-width: 900px) {
        #${APP}-overlay.${APP}--comments-right #${APP}-content {
          display: block;
          overflow-x: hidden;
          overflow-y: auto;
        }

        #${APP}-overlay.${APP}--comments-right #${APP}-comments-resizer {
          display: none;
        }

        #${APP}-overlay.${APP}--comments-right #${APP}-player-wrap {
          height: calc(min(960px, calc(100vh - clamp(96px, 12vh, 220px))) - 46px);
        }

        #${APP}-overlay.${APP}--comments-right #${APP}-comments {
          height: auto;
          overflow: visible;
          border-left: 0;
        }
      }
`;
  targetDocument.head.appendChild(style);
}
