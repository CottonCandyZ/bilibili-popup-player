import { APP } from './constants.js';
import { externalLinkIconMarkup } from './icons.js';
import { getPlayerThemeVariableCss } from './player-theme.js';
import { escapeHtml } from './text.js';

export function renderPipPlayerDocument({ title, stylesheets, themeClassMarkup, commentLayoutClass }) {
  return `<!doctype html>
<html${themeClassMarkup}>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title || 'Bilibili 小窗播放')}</title>
    ${renderStylesheetLinks(stylesheets)}
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background: #000;
      }
      body {
        overflow: hidden;
        color: var(--text1, #18191c);
      }
      #shell {
        width: 100vw;
        height: 100vh;
        background: #000;
      }
      #layout {
        position: relative;
        min-width: 0;
        min-height: 0;
        height: 100vh;
      }
      body.comments-bottom #layout {
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      body.comments-right #layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 8px var(--${APP}-comments-width, 420px);
        overflow: hidden;
      }
      body.comments-right #stage {
        grid-column: 1;
        grid-row: 1;
        overflow: hidden;
      }
      #comments-resizer {
        display: none;
      }
      body.comments-right #comments-resizer {
        display: block;
        position: relative;
        grid-column: 2;
        grid-row: 1;
        z-index: 4;
        width: 8px;
        min-width: 8px;
        height: 100vh;
        cursor: col-resize;
        background: var(--bg1, #fff);
      }
      body.comments-right #comments-resizer::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 0;
        width: 1px;
        background: var(--line_regular, rgba(148, 153, 160, 0.36));
      }
      body.comments-right #comments-resizer:hover::before,
      body.comments-right #comments-resizer:focus-visible::before,
      body.resizing-comments #comments-resizer::before {
        background: var(--brand_pink, #fb7299);
      }
      body.comments-right #comments-resizer:focus-visible {
        outline: none;
      }
      #stage {
        position: relative;
        min-width: 0;
        min-height: 0;
        width: 100%;
        height: 100vh;
        background: #000;
      }
      #bilibili-player {
        position: relative;
        width: 100% !important;
        height: 100% !important;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        background: #000;
      }
      #bilibili-player,
      #bilibili-player > *,
      #bilibili-player .bpx-player-container {
        width: 100% !important;
        height: 100% !important;
      }
      #bilibili-player .bpx-player-video-wrap {
        position: relative !important;
      }
      #stage .${APP}__live-player-controls-layer {
        overflow: visible !important;
      }
      #stage .${APP}__live-player-only-control {
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
      #stage .${APP}__live-player-only-control:hover,
      #stage .${APP}__live-player-only-control:focus-visible {
        color: #fff;
        border-color: var(--${APP}-brand);
        background: var(--${APP}-brand);
        outline: none;
      }
      #stage .${APP}__live-player-only-control svg {
        width: 17px;
        height: 17px;
        display: block;
        stroke: currentColor;
      }
${getPlayerThemeVariableCss('#bilibili-player')}
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
      .${APP}__auto-play-countdown {
        position: absolute;
        top: 14px;
        right: 14px;
        z-index: 10040;
        box-sizing: border-box;
        min-width: 240px;
        max-width: min(360px, calc(100% - 28px));
        padding: 10px 12px;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 12px;
        color: rgba(255, 255, 255, 0.94);
        background: rgba(23, 25, 31, 0.92);
        box-shadow: 0 14px 42px rgba(0, 0, 0, 0.34);
        pointer-events: none;
        animation: ${APP}-auto-play-countdown-in 0.18s ease-out both;
      }
      .${APP}__auto-play-countdown-ring {
        width: 28px;
        height: 28px;
        flex: 0 0 auto;
        display: block;
        transform: rotate(-90deg);
      }
      .${APP}__auto-play-countdown-track,
      .${APP}__auto-play-countdown-progress {
        fill: none;
        stroke-width: 2.4;
      }
      .${APP}__auto-play-countdown-track {
        stroke: rgba(255, 255, 255, 0.22);
      }
      .${APP}__auto-play-countdown-progress {
        stroke: var(--${APP}-brand);
        stroke-linecap: round;
        stroke-dasharray: 62.83;
        stroke-dashoffset: var(--${APP}-countdown-start-offset, 0);
        animation: ${APP}-auto-play-countdown-ring var(--${APP}-countdown-duration, 5s) linear forwards;
      }
      .${APP}__auto-play-countdown-text {
        min-width: 0;
        display: grid;
        gap: 3px;
      }
      .${APP}__auto-play-countdown-title {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        font: 700 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .${APP}__auto-play-countdown-next {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        color: rgba(255, 255, 255, 0.84);
        font: 600 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .${APP}__auto-play-countdown-hint {
        color: rgba(255, 255, 255, 0.62);
        font: 500 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      @keyframes ${APP}-auto-play-countdown-in {
        from {
          opacity: 0;
          transform: translateY(-6px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      @keyframes ${APP}-auto-play-countdown-ring {
        to {
          stroke-dashoffset: 62.83;
        }
      }
      #comments {
        display: flex;
        flex-direction: column;
        min-height: 520px;
        padding: 0;
        color: var(--text1, #18191c);
        background: var(--bg1, #fff);
      }
      body.comments-right #comments {
        display: grid;
        grid-template-rows: 42px minmax(0, 1fr);
        grid-column: 3;
        grid-row: 1;
        min-width: 0;
        min-height: 0;
        height: 100vh;
        padding: 0 0 0 8px;
        overflow: hidden;
        border-left: 0;
      }
      .${APP}__back-to-top {
        position: fixed;
        right: 28px;
        bottom: 26px;
        z-index: 12;
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
      body.comments-right .${APP}__back-to-top {
        right: 22px;
        bottom: 22px;
      }
      .${APP}__back-to-top.${APP}--visible {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0);
      }
      .${APP}__back-to-top:hover,
      .${APP}__back-to-top:focus-visible {
        color: var(--brand_pink, #fb7299);
        border-color: var(--brand_pink, #fb7299);
        outline: none;
      }
      .${APP}__back-to-top svg {
        width: 18px;
        height: 18px;
        display: block;
        stroke: currentColor;
      }
      #${APP}-pip-controls {
        position: static !important;
        z-index: auto !important;
        transform: none !important;
        display: inline-flex !important;
        align-items: center !important;
        height: 100% !important;
        margin: 0 14px 0 0 !important;
        padding: 0 !important;
        vertical-align: middle !important;
        pointer-events: auto !important;
        flex: 0 0 auto !important;
      }
      #${APP}-pip-controls a {
        all: unset;
        box-sizing: border-box !important;
        position: relative !important;
        top: -8px !important;
        width: auto !important;
        height: 100% !important;
        min-width: auto !important;
        max-width: none !important;
        padding: 0 !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        flex: 0 0 auto !important;
        border: 0 !important;
        color: #fff !important;
        background: transparent !important;
        box-shadow: none !important;
        text-decoration: none !important;
        white-space: nowrap !important;
        font: 600 14px/20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        letter-spacing: 0 !important;
        cursor: pointer !important;
        opacity: 0.92 !important;
        text-shadow: 0 0 2px rgba(0, 0, 0, 0.6) !important;
      }
      #${APP}-pip-controls a:hover,
      #${APP}-pip-controls a:focus-visible {
        color: #fff !important;
        background: transparent !important;
        outline: none !important;
        opacity: 1 !important;
      }
      .${APP}__comments-tabs {
        flex: 0 0 auto;
        display: flex;
        align-items: flex-end;
        gap: 4px;
        box-sizing: border-box;
        min-height: 42px;
        margin: 0;
        padding: 6px 18px 0;
        border-bottom: 1px solid var(--line_regular, #e3e5e7);
        background: var(--bg1, #fff);
        overflow: visible;
      }
      body.comments-right .${APP}__comments-tabs {
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
      body.comments-right .${APP}__comments-panel:not([hidden]) {
        grid-row: 2;
        height: 100%;
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      #comments-mount {
        box-sizing: border-box;
        min-height: 360px;
        padding: 8px 18px 0;
        color: var(--text1, #18191c);
        background: var(--bg1, #fff);
      }
      body.comments-right #comments-mount {
        padding: 8px 16px 0 0;
      }
      .${APP}__video-intro {
        box-sizing: border-box;
        margin: 0 18px;
        padding: 14px 0 16px;
        color: var(--text1, #18191c);
        border-bottom: 1px solid var(--line_regular, #e3e5e7);
        background: var(--bg1, #fff);
      }
      body.comments-right .${APP}__video-intro {
        margin: 0 16px 0 0;
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
      body.comments-right .${APP}__playlist {
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
        padding: 12px 14px;
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
      .${APP}__playlist-card.${APP}--contains-selected {
        color: var(--brand_blue, #00aeec);
      }
      .${APP}__playlist-section-title {
        grid-column: 1 / -1;
        box-sizing: border-box;
        padding: 14px 14px 6px;
        color: var(--text3, #9499a0);
        border-bottom: 1px solid var(--line_regular, #e3e5e7);
        font: 600 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .${APP}__playlist-card--part {
        grid-template-columns: clamp(96px, 26%, 132px) minmax(0, 1fr);
      }
      body.comments-right .${APP}__playlist-card--part {
        padding-left: 26px;
      }
      .${APP}__playlist-card--collapsible {
        grid-template-columns: clamp(112px, 30%, 156px) minmax(0, 1fr) 28px;
      }
      .${APP}__playlist-card--child {
        grid-column: 1 / -1;
        grid-template-columns: minmax(0, 1fr) auto;
        column-gap: 12px;
        align-items: center;
        padding: 10px 14px 10px 40px;
      }
      body.comments-right .${APP}__playlist-card--child {
        padding-left: 40px;
      }
      .${APP}__playlist-card--child .${APP}__playlist-info {
        padding: 0;
      }
      .${APP}__playlist-card--child .${APP}__playlist-title {
        font: 600 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .${APP}__playlist-card--child .${APP}__playlist-title-text {
        display: block;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .${APP}__playlist-inline-duration {
        color: var(--text3, #9499a0);
        font: 500 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .${APP}__playlist-toggle {
        appearance: none;
        width: 28px;
        height: 28px;
        display: inline-grid;
        place-items: center;
        align-self: center;
        border: 0;
        border-radius: 6px;
        color: var(--text3, #9499a0);
        background: transparent;
        cursor: pointer;
      }
      .${APP}__playlist-toggle:hover,
      .${APP}__playlist-toggle:focus-visible {
        color: var(--brand_blue, #00aeec);
        background: var(--graph_bg_thin, #f6f7f8);
        outline: none;
      }
      .${APP}__playlist-toggle-icon {
        width: 9px;
        height: 9px;
        border-right: 2px solid currentColor;
        border-bottom: 2px solid currentColor;
        transform: rotate(45deg) translateY(-2px);
        transition: transform 0.16s ease;
      }
      .${APP}__playlist-card--collapsible.${APP}--expanded .${APP}__playlist-toggle-icon {
        transform: rotate(-135deg) translate(-1px, -1px);
      }
      .${APP}__playlist-card:hover .${APP}__playlist-title,
      .${APP}__playlist-card:focus-visible .${APP}__playlist-title,
      .${APP}__playlist-card.${APP}--selected .${APP}__playlist-title,
      .${APP}__playlist-card.${APP}--contains-selected .${APP}__playlist-title {
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
        overflow: hidden;
        overflow-wrap: anywhere;
        word-break: break-word;
        color: var(--text1, #18191c);
        font: 500 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .${APP}__playlist-title-text {
        min-width: 0;
        overflow: hidden;
        overflow-wrap: anywhere;
        word-break: break-word;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
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
      .${APP}__bottom-fixed-hidden {
        display: none !important;
      }
    </style>
  </head>
  <body class="${commentLayoutClass}"></body>
</html>`;
}

export function renderLivePipDocument({ title, href, themeClassMarkup }) {
  return `<!doctype html>
<html${themeClassMarkup}>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title || 'Bilibili 直播小窗')}</title>
    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #000;
      }
      #shell,
      #stage,
      #fullscreen-container,
      #live-player {
        position: relative;
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        background: #000;
      }
      #${APP}-live-original {
        all: unset;
        box-sizing: border-box;
        position: fixed;
        top: 12px;
        right: 12px;
        z-index: 2147482999;
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        border-radius: 8px;
        color: rgba(255, 255, 255, 0.92);
        background: rgba(0, 0, 0, 0.36);
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.16s ease, background 0.16s ease;
      }
      body:hover #${APP}-live-original,
      #${APP}-live-original:focus-visible {
        opacity: 1;
      }
      #${APP}-live-original:hover,
      #${APP}-live-original:focus-visible {
        background: rgba(0, 0, 0, 0.62);
        outline: none;
      }
      #${APP}-live-original svg {
        width: 18px;
        height: 18px;
        display: block;
        stroke: currentColor;
      }
    </style>
  </head>
  <body>
    <div id="shell">
      <div id="stage">
        <div id="fullscreen-container">
          <div id="live-player">
            <div id="fullscreen-danmaku-vm"><fullscreen-danmaku></fullscreen-danmaku></div>
          </div>
        </div>
      </div>
    </div>
    <a id="${APP}-live-original" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" title="打开原直播间" aria-label="打开原直播间">${externalLinkIconMarkup()}</a>
  </body>
</html>`;
}

export function renderPipLoadingDocument({ title, href, stylesheets, themeClassMarkup }) {
  return `<!doctype html>
<html${themeClassMarkup}>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title || 'Bilibili 小窗播放')}</title>
    ${renderStylesheetLinks(stylesheets)}
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        color: var(--text1, #18191c);
        background: var(--bg1, #fff);
        font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      a {
        position: fixed;
        top: 10px;
        right: 10px;
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        border: 1px solid var(--line_regular, #e3e5e7);
        border-radius: 8px;
        color: var(--text1, #18191c);
        background: var(--bg2, #f6f7f8);
      }
      a svg {
        width: 17px;
        height: 17px;
        display: block;
        stroke: currentColor;
      }
    </style>
  </head>
  <body>${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" title="打开原播放页" aria-label="打开原播放页">${externalLinkIconMarkup()}</a>` : ''}加载中...</body>
</html>`;
}

export function renderPipErrorDocument({ error, href, stylesheets, themeClassMarkup }) {
  return `<!doctype html>
<html${themeClassMarkup}>
  <head>
    <meta charset="utf-8">
    <title>初始化失败</title>
    ${renderStylesheetLinks(stylesheets)}
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        color: var(--text1, #18191c);
        background: var(--bg1, #fff);
        font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      pre {
        max-width: calc(100vw - 32px);
        white-space: pre-wrap;
      }
      a {
        position: fixed;
        top: 10px;
        right: 10px;
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        border: 1px solid var(--line_regular, #e3e5e7);
        border-radius: 8px;
        color: var(--text1, #18191c);
        background: var(--bg2, #f6f7f8);
      }
      a svg {
        width: 17px;
        height: 17px;
        display: block;
        stroke: currentColor;
      }
    </style>
  </head>
  <body>${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" title="打开原播放页" aria-label="打开原播放页">${externalLinkIconMarkup()}</a>` : ''}<pre>${escapeHtml(error?.message || String(error))}</pre></body>
</html>`;
}

function renderStylesheetLinks(stylesheets) {
  return [...new Set(stylesheets || [])]
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
    .join('\n');
}
