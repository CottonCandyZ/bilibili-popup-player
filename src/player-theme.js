import { APP } from './constants.js';
import { getBiliAccentVariables } from './accent-theme.js';

const NANO_THEME = {
  'bpx-primary-color': 'var(--brand_blue)',
  'bpx-fn-color': 'var(--brand_blue)',
  'bpx-fn-hover-color': 'var(--brand_blue)',
  'bpx-box-shadow': 'var(--bg3)',
  'bpx-dmsend-switch-icon': 'var(--text2)',
  'bpx-dmsend-hint-icon': 'var(--graph_medium)',
  'bpx-aux-header-icon': 'var(--graph_icon)',
  'bpx-aux-float-icon': 'var(--graph_icon)',
  'bpx-aux-block-icon': 'var(--text3)',
  'bpx-dmsend-info-font': 'var(--text2)',
  'bpx-dmsend-input-font': 'var(--text1)',
  'bpx-dmsend-hint-font': 'var(--text3)',
  'bpx-aux-header-font': 'var(--text1)',
  'bpx-aux-footer-font': 'var(--text2)',
  'bpx-aux-footer-font-hover': 'var(--text1)',
  'bpx-aux-content-font1': 'var(--text1)',
  'bpx-aux-content-font2': 'var(--text2)',
  'bpx-aux-content-font3': 'var(--text2)',
  'bpx-aux-content-font4': 'var(--text3)',
  'bpx-aux-content-font5': 'var(--text3)',
  'bpx-dmsend-main-bg': 'var(--bg1)',
  'bpx-dmsend-input-bg': 'var(--bg3)',
  'bpx-aux-header-bg': 'var(--graph_bg_regular)',
  'bpx-aux-footer-bg': 'var(--graph_bg_regular)',
  'bpx-aux-content-bg': 'var(--bg1)',
  'bpx-aux-button-bg': 'var(--bg3)',
  'bpx-aux-button-disabled-bg': 'var(--graph_bg_thin)',
  'bpx-aux-float-bg': 'var(--bg1_float)',
  'bpx-aux-float-hover-bg': 'var(--graph_medium)',
  'bpx-aux-cover-bg': 'var(--graph_weak)',
  'bpx-dmsend-border': 'var(--bg3)',
  'bpx-aux-float-border': 'var(--line_light)',
  'bpx-aux-line-border': 'var(--line_regular)',
  'bpx-aux-input-border': 'var(--line_regular)',
  'bpx-dmsend-disable-button-bg': 'var(--graph_bg_thick)',
  'bpx-dmsend-disable-button-text': 'var(--text3)',
};

export function getPlayerNanoTheme() {
  return { ...NANO_THEME };
}

export function getPlayerThemeVariableCss(selector) {
  return `
      ${selector} .bpx-player-container {
        --bpx-dmsend-main-bg: var(--bg1, #fff);
        --bpx-dmsend-input-bg: var(--bg3, var(--bg2, #f4f4f4));
        --bpx-dmsend-border: var(--bg3, var(--line_regular, #e7e7e7));
        --bpx-dmsend-info-font: var(--text2, #505050);
        --bpx-dmsend-input-font: var(--text1, #212121);
        --bpx-dmsend-switch-icon: var(--text2, #757575);
        --bpx-dmsend-hint-font: var(--text3, #757a81);
        --bpx-dmsend-hint-icon: var(--text3, #757a81);
        --bpx-dmsend-disable-button-bg: var(--graph_bg_thick, #e3e5e7);
        --bpx-dmsend-disable-button-text: var(--text3, #9499a0);
        --bpx-primary-color: var(--${APP}-player-accent, #fff);
        --bpx-fn-color: var(--${APP}-player-accent, #fff);
        --bpx-fn-hover-color: var(--${APP}-player-accent-hover, #eee);
        --bpx-toast-fn-color: var(--${APP}-player-accent, #fff);
        --bpx-toast-fn-hover-color: var(--${APP}-player-accent-hover, #eee);
        ${getBiliAccentVariables(`var(--${APP}-player-accent, #fff)`, `var(--${APP}-player-accent-hover, #eee)`, `color-mix(in srgb, var(--${APP}-player-accent, #fff) 12%, #18191c)`)}
      }

      ${selector} :is(.bpx-player-toast-confirm-login, .bpx-player-ctrl-subtitle-language-unlogin-content, .bpx-player-ctrl-translation-unlogin-content, .bpx-player-error-sign-retry-btn) {
        background-color: var(--${APP}-player-accent);
        color: var(--${APP}-on-player-accent);
      }
      ${selector} :is(.bpx-player-toast-confirm-login, .bpx-player-ctrl-subtitle-language-unlogin-content, .bpx-player-ctrl-translation-unlogin-content, .bpx-player-error-sign-retry-btn):hover {
        background-color: var(--${APP}-player-accent-hover);
      }
      ${selector} .bui-button:not(.bui-disabled):not(.bui-button-disabled) .bui-area.bui-button-blue,
      ${selector} .bui-radio .bui-radio-button .bui-radio-input:checked + .bui-radio-label,
      ${selector} .bpx-player-ctrl-playbackrate-unlogin-content,
      ${selector} .bpx-player-ending-functions-follow:not(.bpx-state-disabled),
      ${selector} .bpx-player-popup-follow:not(.bpx-player-popup-followed) {
        color: var(--${APP}-on-player-accent);
      }
      ${selector} .bpx-player-popup-follow:not(.bpx-player-popup-followed) svg { fill: currentColor; }
      ${selector} .bui-switch-input:checked + .bui-switch-label .bui-switch-dot {
        background: var(--${APP}-on-player-accent);
      }
      ${selector} .bpx-player-follow :is(.bpx-player-follow-name, .bpx-player-follow-text):hover,
      ${selector} :is(.bpx-player-relation-button, .bpx-player-enter-button, .bpx-player-ending-enter-button):hover {
        color: var(--${APP}-player-accent);
        fill: var(--${APP}-player-accent);
      }
      ${selector} .bpx-player-follow .bpx-player-follow-text:hover svg { fill: var(--${APP}-player-accent) !important; }
      ${selector} :is(.bpx-player-dm-setting, .bpx-player-video-btn-dm):hover { fill: var(--${APP}-player-accent) !important; }
      /* Older player builds hard-code #00AEEC on the checkmark path. Keep the
         monochrome TV outline and disabled icon separate from the accent. */
      ${selector} .bui-danmaku-switch [data-danmu-color="accent"],
      ${selector} .bui-danmaku-switch-on svg [data-danmu-status],
      ${selector} .bui-danmaku-switch:not(.bui-danmaku-switch-new) .bui-danmaku-switch-on svg:not([data-danmu-intl]) path:last-child {
        fill: var(--${APP}-player-accent);
      }

      ${selector} .bpx-player-ctrl-quality,
      ${selector} .bpx-player-ctrl-quality-result,
      ${selector} .bpx-player-ctrl-quality-menu-wrap,
      ${selector} .bpx-player-ctrl-quality-menu,
      ${selector} .bpx-player-ctrl-quality-menu-item,
      ${selector} .bpx-player-ctrl-quality-text {
        box-sizing: content-box;
      }

      ${selector} .bpx-player-ctrl-quality-menu-wrap,
      ${selector} .bpx-player-ctrl-quality-menu,
      ${selector} .bpx-player-ctrl-quality-menu-item,
      ${selector} .bpx-player-ctrl-quality-text,
      ${selector} .bpx-player-ctrl-quality-badge {
        font-size: 12px;
      }
`;
}
