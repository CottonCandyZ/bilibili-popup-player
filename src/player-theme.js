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
        --bpx-primary-color: var(--brand_blue, #00aeec);
      }
`;
}
