import { APP as A, BUTTON_CLASS as B, BADGE_CLASS as G, SETTINGS_CLASS as S } from './constants.js';
import { getEmbeddedPlayerCss } from './embedded-player-style.js';
import { getAccentThemeVariables } from './accent-theme.js';

export const themeTokens = `
  --${A}-surface: var(--bg1, #fff);
  --${A}-surface-soft: var(--bg2, #f4f4f4);
  --${A}-surface-elevated: var(--bg1_float, var(--bg1, #fff));
  --${A}-text: var(--text1, #202124);
  --${A}-text-subtle: var(--text2, #606060);
  --${A}-text-muted: var(--text3, #909090);
  --${A}-border: var(--line_regular, #e8e8e8);
  --${A}-brand: #e95183;
  --${A}-brand-soft: color-mix(in srgb, var(--${A}-brand) 10%, var(--${A}-surface));
  --${A}-font: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
`;

function getSettingsCss() {
  return `
    .${S} { position: fixed; right: 20px; bottom: 20px; z-index: 3; pointer-events: auto; }
    .${S}[hidden] { display: none !important; }
    .${S}[data-variant="player"] { position: relative; inset: auto; display: inline-flex; }
    .${S}__button { display: grid; place-items: center; width: 40px; height: 40px; padding: 0; border: 1px solid var(--${A}-border); border-radius: 50%; color: var(--${A}-text-subtle); background: var(--${A}-surface); box-shadow: 0 2px 10px #00000014; cursor: pointer; transition: background .16s, color .16s; }
    .${S}__button:hover, .${S}__button[data-popup-open] { color: var(--${A}-text); background: var(--${A}-surface-soft); }
    /* Base UI's transparent modal backdrop includes a cutout for the trigger.
       It must accept pointers above the player, including inside the shadow host. */
    .${S}__portal > [data-base-ui-inert] { z-index: 2147483300; pointer-events: auto; }
    .${S}__portal > [data-base-ui-inert][inert] { pointer-events: none; }
    .${S}__positioner { pointer-events: auto; z-index: 2147483301; max-width: calc(100vw - 24px); }
    .${S}__panel { box-sizing: border-box; width: min(272px, calc(100vw - 24px)); max-height: min(var(--available-height), calc(100dvh - 24px)); overflow-y: auto; padding: 6px 16px 10px; border: 1px solid var(--${A}-border); border-radius: 12px; corner-shape: superellipse(1.5); background: var(--${A}-surface-elevated); color: var(--${A}-text); box-shadow: 0 8px 32px #0003; font: 13px/1.5 var(--${A}-font); transform-origin: var(--transform-origin); transition: opacity .16s, transform .16s; }
    .${S}__panel *, .${S}__panel *::before, .${S}__panel *::after { box-sizing: border-box; }
    .${S}__panel[data-starting-style], .${S}__panel[data-ending-style] { opacity: 0; transform: scale(.97); }
    .${S}__sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
    .${S}__options { min-width: 0; padding: 10px 0 0; margin: 0; border: 0; border-top: 1px solid var(--${A}-border); transition: opacity .15s; }
    .${S}__options:disabled { opacity: .45; }
    .${S}__modes { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; margin-bottom: 6px; padding: 3px; border-radius: 8px; background: var(--${A}-surface-soft); }
    .${S}__mode { display: grid; place-items: center; min-height: 30px; padding: 4px 8px; border: 0; border-radius: 6px; font: 12px/1.5 var(--${A}-font); color: var(--${A}-text-subtle); background: transparent; cursor: pointer; }
    .${S}__mode[data-checked] { background: var(--${A}-accent-soft); color: var(--${A}-accent); box-shadow: 0 1px 4px #00000012; }
    .${S}__mode[data-disabled] { opacity: .45; cursor: default; }
    .${S}__row { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 42px; }
    .${S}__row label { cursor: pointer; }
    .${A}__switch { display: inline-flex; align-items: center; width: 32px; height: 18px; padding: 2px; flex-shrink: 0; border: 0; border-radius: 20px; background: color-mix(in srgb, var(--${A}-text-muted) 44%, var(--${A}-surface)); cursor: pointer; transition: background .15s; }
    .${A}__switch[data-checked] { background: var(--${A}-accent, var(--${A}-text)); }
    .${A}__switch[data-disabled] { cursor: default; }
    .${A}__switch-thumb { display: block; width: 14px; height: 14px; border-radius: 50%; background: var(--${A}-surface); box-shadow: 0 1px 3px #0002; transition: transform .15s; }
    .${A}__switch-thumb[data-checked] { transform: translateX(14px); background: var(--${A}-on-accent, var(--${A}-surface)); }
    .${S}__panel :focus-visible { outline: 2px solid var(--${A}-accent, var(--${A}-text-subtle)); outline-offset: 3px; }
    .${S}__palette { margin-top: 8px; padding-top: 6px; border-top: 1px solid var(--${A}-border); }
    .${S}__palette-summary { display: inline-flex; align-items: center; gap: 6px; color: var(--${A}-text-subtle); font-size: 12px; }
    .${S}__palette-summary i { width: 8px; height: 8px; border-radius: 50%; }
    .${S}__palette-summary svg { margin-left: 2px; transition: transform .16s; }
    .${S}__palette [data-panel-open] .${S}__palette-summary svg { transform: rotate(180deg); }
    .${S}__palette-panel { height: var(--collapsible-panel-height); overflow: hidden; opacity: 1; transition: height .2s ease, opacity .16s ease; }
    .${S}__palette-panel[data-starting-style], .${S}__palette-panel[data-ending-style] { height: 0; opacity: 0; }
    .${S}__palette-content { padding: 6px 0 4px; }
    .${S}__palette-presets { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
    .${S}__palette-preset { display: flex; flex-direction: column; align-items: center; gap: 7px; min-width: 0; padding: 9px 2px 7px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--${A}-text-subtle); font: 11px/1.5 var(--${A}-font); cursor: pointer; }
    .${S}__palette-preset:hover { background: var(--${A}-surface-soft); }
    .${S}__palette-preset[data-checked] { color: var(--${A}-text); background: var(--${A}-accent-soft, var(--${A}-surface-soft)); border-color: var(--${A}-accent, var(--${A}-text-subtle)); }
    .${S}__swatch { width: 22px; height: 22px; border-radius: 50%; box-shadow: inset 0 0 0 1px #80808030; }
    .${S}__custom-color { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 12px; }
    .${S}__custom-color > span { flex: 1; color: var(--${A}-text-subtle); }
    .${S}__custom-color input[type="color"] { appearance: none; width: 26px; height: 26px; padding: 0; overflow: hidden; border: 1px solid var(--${A}-border); border-radius: 6px; background: transparent; cursor: pointer; }
    .${S}__custom-color input[type="color"]::-webkit-color-swatch-wrapper { padding: 2px; }
    .${S}__custom-color input[type="color"]::-webkit-color-swatch { border: 0; border-radius: 3px; }
    .${S}__custom-color input[type="color"]::-moz-color-swatch { border: 0; border-radius: 3px; }
    .${S}__custom-color input[type="text"] { width: 79px; height: 28px; padding: 3px 7px; border: 1px solid var(--${A}-border); border-radius: 6px; color: var(--${A}-text); background: var(--${A}-surface); font: 12px/20px ui-monospace, monospace; }
    .${S}__extra { margin-top: 8px; padding-top: 6px; border-top: 1px solid var(--${A}-border); }
    .${S}__action { display: flex; align-items: center; justify-content: space-between; gap: 16px; width: calc(100% + 20px); min-height: 42px; margin-inline: -10px; padding: 8px 10px; border: 0; border-radius: 8px; color: var(--${A}-text); background: transparent; font: inherit; text-align: left; cursor: pointer; transition: background .15s; }
    .${S}__action > svg { flex: none; width: 17px; height: 17px; margin: 0 7px; color: var(--${A}-text-subtle); transition: transform .16s; }
    .${S}__action:hover, .${S}__action[data-panel-open] { background: color-mix(in srgb, var(--${A}-text) 7%, transparent); }
    .${S}__action:disabled { opacity: .4; cursor: default; background: transparent; }
    .${S}__shortcuts.${A}__gamepad-indicator { display: block; position: static; width: 100%; height: auto; color: inherit; opacity: 1; }
    .${S}__shortcuts.${A}__gamepad-indicator::after { display: none; }
    .${S}__shortcuts .${S}__action[data-panel-open] > svg { transform: rotate(180deg); }
    .${S}__shortcut-panel { height: var(--collapsible-panel-height); overflow: hidden; color: var(--${A}-text-subtle); font-size: 12px; opacity: 1; transition: height .2s ease, opacity .16s ease; }
    .${S}__shortcut-panel[data-starting-style], .${S}__shortcut-panel[data-ending-style] { height: 0; opacity: 0; }
    .${S}__shortcut-content { padding: 8px 0 4px; }
    .${S}__shortcut-panel p { margin: 0 0 6px; color: var(--${A}-text-muted); font-size: 11px; line-height: 18px; }
    .${S}__shortcut-panel dl { margin: 0; }
    .${S}__shortcut-panel dl > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 32px; }
    .${S}__shortcut-panel dl > div + div { border-top: 1px solid color-mix(in srgb, var(--${A}-border) 55%, transparent); }
    .${S}__shortcut-panel dd { margin: 0; }
    .${S}__shortcut-panel kbd { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; min-height: 22px; padding: 1px 6px; border: 1px solid var(--${A}-border); border-radius: 5px; color: var(--${A}-text); background: var(--${A}-surface); font: 500 11px/18px var(--${A}-font); white-space: nowrap; }
    @media (prefers-reduced-motion: reduce) { .${S}__panel, .${S}__panel * { transition: none !important; } }
  `;
}

export function getOverlayCss() {
  return `
    :host { ${themeTokens} ${getAccentThemeVariables()} color: var(--${A}-text); font: 13px/1.5 var(--${A}-font); color-scheme: light dark; }
    :host(.${A}--playback-web-fullscreen) { display: none; }
    *, *::before, *::after { box-sizing: border-box; }
    button { font: inherit; -webkit-tap-highlight-color: transparent; }
    button, label { touch-action: manipulation; }
    svg { flex-shrink: 0; }
    :focus-visible { outline: 2px solid var(--${A}-text-subtle); outline-offset: 3px; }
    .${A}__control-overlay { position: fixed; inset: 0; pointer-events: none; }
    .${B} { position: absolute; display: inline-flex; align-items: center; justify-content: center; gap: 5px; width: 78px; height: 28px; padding: 0 10px; border: 0; border-radius: 999px; color: #fff; background: #18181bc7; backdrop-filter: blur(10px); box-shadow: 0 2px 8px #0002; font: 500 12px/1 var(--${A}-font); white-space: nowrap; cursor: pointer; pointer-events: auto; transition: background .15s, color .15s, opacity .15s; }
    .${B}[data-action="open"] { width: 66px; }
    .${B} svg { width: 14px; height: 14px; }
    .${B}:hover, .${B}:focus-visible { color: var(--${A}-on-accent); background: var(--${A}-accent); }
    .${B}:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
    .${G} { position: absolute; display: none; padding: 4px 7px; color: white; background: #19212dde; border-radius: 6px; font: 500 11px/1.5 var(--${A}-font); pointer-events: none; }
    .${G}.${A}--playing { color: var(--${A}-on-accent); background: var(--${A}-accent); }
    ${getSettingsCss()}
    .${A}__fixed-pip-button { position: fixed; right: 20px; top: auto; bottom: 76px; width: 40px; height: 40px; padding: 8px; border: 1px solid var(--${A}-border); border-radius: 50%; color: var(--${A}-text-subtle); background: var(--${A}-surface); }
    .${A}__fixed-pip-button svg { width: 22px; height: 22px; }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } }
  `;
}

export function getModernPlayerCss() {
  return `
    :root { ${themeTokens} }
    [data-bili-popup-accent] { ${getAccentThemeVariables()} }
    ${getSettingsCss()}
    ${getEmbeddedPlayerCss()}
    .${A}__virtual-scroll { scrollbar-width: none !important; scrollbar-gutter: auto !important; }
    .${A}__virtual-scroll::-webkit-scrollbar { display: none !important; }
    .${A}__scrollbar-layer { position: fixed; inset: 0; z-index: 2147483201; pointer-events: none; }
    .${A}__scrollbar { position: absolute; width: 10px; border: 0; background: transparent; opacity: 0; visibility: hidden; pointer-events: none; touch-action: none; user-select: none; transition: opacity .2s, visibility .2s; }
    .${A}__scrollbar[hidden] { display: none; }
    .${A}__scrollbar[data-visible="true"] { opacity: 1; visibility: visible; pointer-events: auto; }
    .${A}__scrollbar-thumb { position: absolute; left: 3px; top: 0; width: 4px; min-height: 24px; border-radius: 4px; background: color-mix(in srgb, var(--${A}-text-muted) 70%, transparent); }
    .${A}__scrollbar:hover .${A}__scrollbar-thumb { width: 6px; left: 2px; background: var(--${A}-text-subtle); }
    #${A}-overlay { background: #11111100; backdrop-filter: blur(0px); opacity: 0; transition: opacity .2s ease, background-color .2s ease, backdrop-filter .2s ease; }
    #${A}-overlay[data-open="true"] { background: #11111166; backdrop-filter: blur(8px); opacity: 1; }
    #${A}-overlay.${A}--hidden:not([hidden]) { display: grid; pointer-events: none; }
    #${A}-overlay[hidden] { display: none; }
    @starting-style { #${A}-overlay[data-open="true"] { background: #11111100; backdrop-filter: blur(0px); opacity: 0; } }
    /* Native continuous corners also shape the shadow and overflow clip; older
       engines retain border-radius without adding a mask around floating UI. */
    #${A}-dialog { grid-template-rows: minmax(0, 1fr); overflow: visible; border: 0; border-radius: 6px; corner-shape: superellipse(1.5); background: #000; box-shadow: 0 24px 80px #0005; font-family: var(--${A}-font); transition: opacity .2s ease; }
    #${A}-dialog:fullscreen { width: 100vw !important; height: 100dvh !important; max-width: none; max-height: none; margin: 0; border-radius: 0; box-shadow: none; }
    /* Desktop fullscreen resizes the viewport separately from fullscreenchange.
       Override the cached pixel height before paint, without waiting for JS. */
    #${A}-dialog:fullscreen #${A}-player-slot { height: 100dvh !important; }
    #${A}-dialog:fullscreen::backdrop { background: #000; }
    [data-${A}-comment-preview] { z-index: 2147483647 !important; }
    [data-${A}-comment-preview="viewer"] { position: fixed !important; inset: 0 !important; }
    #${A}-dialog:fullscreen :is(.${A}__modal-resize-handle, .${A}__resize-hint, .bpx-player-ctrl-full-enter) { display: none !important; }
    #${A}-dialog:fullscreen .bpx-player-ctrl-full-leave { display: block !important; }
    #${A}-dialog[data-starting-style], #${A}-dialog[data-ending-style] { opacity: 0; }
    #${A}-content { min-height: 0; border-radius: inherit; corner-shape: inherit; overflow-x: hidden; overflow-y: auto; background: #000; }
    #${A}-player-slot, [data-bili-popup-ui="pip"] #stage-slot { grid-column: 1; grid-row: 1; min-width: 0; min-height: 0; height: 100%; background: #000; }
    #${A}-player-wrap { height: 100%; }
    #${A}-overlay.${A}--fullscreen #${A}-player-wrap { height: 100%; }
    #${A}-content, #layout { overflow-anchor: none; }
    /* Keep the video backing black: a light grid background bleeds through the
       composited video's edge at fractional device pixels (for example 125%). */
    #${A}-overlay.${A}--comments-right #${A}-content, body.comments-right #layout { grid-template-rows: minmax(0, 1fr); background: #000; }
    #${A}-overlay.${A}--comments-right #${A}-comments-resizer,
    body.comments-right #comments-resizer { border: 0; box-shadow: -1px 0 0 var(--${A}-surface); background: var(--${A}-surface); }
    #${A}-overlay.${A}--comments-right #${A}-comments-resizer::before,
    body.comments-right #comments-resizer::before { background: transparent; }
    #${A}-overlay.${A}--comments-right #${A}-comments-resizer:is(:hover, :focus-visible)::before,
    #${A}-overlay.${A}--resizing #${A}-comments-resizer::before,
    body.comments-right #comments-resizer:is(:hover, :focus-visible)::before,
    body.resizing-comments #comments-resizer::before { background: var(--${A}-accent, var(--${A}-border)); }
    [data-bili-popup-ui="pip"] #stage-slot { height: 100vh; }
    #${A}-overlay.${A}--minimized #${A}-player-slot { height: 100% !important; }
    #${A}-overlay[data-layout-hide-comments="true"] :is(#${A}-comments, #${A}-comments-resizer, .${A}__back-to-top) { visibility: hidden; pointer-events: none; }
    /* The final-position divider (z-index 2 at home, 4 in PiP) must stay behind the moving video. */
    #${A}-overlay[data-layout-animating="true"] #${A}-player-slot, body[data-layout-animating="true"] #stage-slot { position: relative; z-index: 5; }
    #${A}-player-wrap[data-scroll-floating="true"], [data-bili-popup-ui="pip"] #stage[data-scroll-floating="true"] { position: fixed; inset: auto 16px 16px auto; z-index: 50; width: min(400px, calc(100vw - 32px)); height: auto !important; aspect-ratio: 16 / 9; border-radius: 4px; corner-shape: superellipse(1.5); overflow: hidden; box-shadow: 0 8px 32px #0006; animation: ${A}-scroll-mini-in .2s ease-out; }
    #${A}-player-wrap[data-scroll-floating="true"] #${A}-header { padding: 4px 6px 16px 10px; gap: 4px; grid-template-columns: minmax(0, 1fr) auto; }
    #${A}-player-wrap[data-scroll-floating="true"] #${A}-title { font-size: 12px; }
    #${A}-player-wrap[data-scroll-floating="true"] .${A}__header-history,
    #${A}-player-wrap[data-scroll-floating="true"] .${A}__header-actions > :not(.${A}__minimize-button):not(.${A}__header-button--close):not(.${S}) { display: none !important; }
    #${A}-player-wrap[data-scroll-floating="true"] .${A}__header-button { width: 26px; height: 26px; }
    #${A}-player-wrap[data-scroll-floating="true"] .${A}__header-button svg { width: 16px; height: 16px; }
    @keyframes ${A}-scroll-mini-in { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: none; } }
    #${A}-player, [data-bili-popup-ui="pip"] #bilibili-player { isolation: isolate; z-index: 0; }
    #${A}-player-wrap[data-controls-visible="true"] :is(.bpx-player-video-perch, .bpx-player-video-wrap, video),
    [data-bili-popup-ui="pip"] #stage[data-controls-visible="true"] :is(.bpx-player-video-perch, .bpx-player-video-wrap, video) { cursor: auto !important; }
    #${A}-player .bpx-player-top-wrap { display: none !important; }
    #bilibili-player .bpx-player-top-issue { display: none !important; }
    #${A}-header {
      position: absolute; inset: 0 0 auto; height: auto; min-height: 0; margin: 0; padding: 10px 12px 24px; box-sizing: border-box; gap: 10px; border: 0; color: #fff;
      /* Smoothstep opacity falloff: retain contrast at the top and ease into the video. */
      background: linear-gradient(to bottom,
        rgb(0 0 0 / .667) 0%,
        rgb(0 0 0 / .638) 12.5%,
        rgb(0 0 0 / .563) 25%,
        rgb(0 0 0 / .456) 37.5%,
        rgb(0 0 0 / .334) 50%,
        rgb(0 0 0 / .211) 62.5%,
        rgb(0 0 0 / .104) 75%,
        rgb(0 0 0 / .029) 87.5%,
        rgb(0 0 0 / 0) 100%);
      opacity: 0; pointer-events: none; transition: var(--${A}-controls-transition, opacity .18s);
    }
    #${A}-player-wrap[data-controls-visible="true"] #${A}-header, #${A}-header:has(:focus-visible), #${A}-header:has([data-popup-open]) { opacity: 1; pointer-events: auto; }
    #${A}-title, #${A}-title:hover, #${A}-title:focus-visible { font-size: 13px; font-weight: 500; color: #fff; text-shadow: 0 1px 3px #0008; }
    .${A}__header-title-external { width: 16px; height: 16px; }
    .${A}__header-link { display: flex; align-items: center; gap: 4px; min-width: 0; }
    .${A}__header-link > a { flex: 0 1 auto; min-width: 0; }
    .${A}__header-link svg { width: 16px; height: 16px; stroke-width: 2; }
    .${A}__header-link :is(.${A}__header-title-external, .${A}__copy-link) { color: #ffffffb3; }
    #${A}-title:is(:hover, :focus-visible) .${A}__header-title-external, .${A}__header-link .${A}__copy-link:is(:hover, :focus-visible) { color: #fff; }
    .${A}__copy-link { flex: none; }
    #${A}-overlay.${A}--minimized .${A}__copy-link, #${A}-player-wrap[data-scroll-floating="true"] .${A}__copy-link { display: none; }
    .${A}__header-history { padding: 0; border: 0; }
    .${A}__header-button { display: inline-grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 50%; color: #fff; background: transparent; cursor: pointer; }
    .${A}__header-button:hover, .${A}__header-button:focus-visible, .${A}__header-button[data-popup-open], .${A}__header-button.${A}__header-button--active { color: #fff; border: 0; background: #ffffff26; box-shadow: none; }
    .${A}__header-button[data-popup-open], .${A}__header-button.${A}__header-button--active { color: var(--${A}-player-accent); }
    .${A}__header-button:disabled { color: #fff; opacity: .4; }
    .${A}__header-button:focus-visible, .${A}__comments-tab:focus-visible, .${A}__playlist-card:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
    .${A}__menu-positioner { z-index: 2147483100; }
    .${A}__header-menu { position: static; width: 236px; padding: 6px; border-radius: 12px; border: 1px solid var(--${A}-border); color: var(--${A}-text); background: var(--${A}-surface-elevated); box-shadow: 0 8px 32px #0003; font-family: var(--${A}-font); }
    .${A}__header-menu-item[data-highlighted] { outline: none; background: var(--${A}-surface-soft); color: var(--${A}-text); }
    .${A}__header-menu-item[data-disabled] { opacity: .4; cursor: default; }
    #${A}-overlay.${A}--comments-right #${A}-comments, body.comments-right #comments { display: block; padding: 0; overflow: hidden; }
    .${A}__sidebar { display: flex; flex-direction: column; min-height: 0; color: var(--${A}-text); background: var(--${A}-surface); font: 13px/1.5 var(--${A}-font); }
    .${A}__sidebar-lists { display: contents; }
    .${A}__list-heading { display: none; }
    #${A}-overlay.${A}--comments-right .${A}__sidebar, body.comments-right .${A}__sidebar { height: 100%; }
    .${A}__sidebar-heading { display: flex; flex: 0 0 auto; align-items: center; min-width: 0; border-bottom: 1px solid var(--${A}-border); }
    .${A}__comments-tabs { display: flex; flex: 1 1 auto; align-items: stretch; gap: 12px; min-width: 0; min-height: 34px; padding: 0 12px; border: 0; overflow-x: auto; scrollbar-width: none; }
    .${A}__sidebar-window-controls { display: none; flex: 0 0 auto; align-items: center; padding-right: 6px; }
    #${A}-overlay.${A}--comments-right:not(.${A}--minimized) .${A}__sidebar-window-controls { display: flex; }
    #${A}-overlay.${A}--comments-right:not(.${A}--minimized) #${A}-header :is(.${A}__minimize-button, .${A}__header-button--close) { display: none; }
    .${A}__sidebar-window-controls .${A}__header-button { width: 26px; height: 28px; color: var(--${A}-text-subtle); border-radius: 4px; }
    .${A}__sidebar-window-controls .${A}__header-button:hover, .${A}__sidebar-window-controls .${A}__header-button:focus-visible { color: var(--${A}-text); background: var(--${A}-surface-soft); }
    .${A}__sidebar-window-controls .${A}__header-button svg { width: 16px; height: 16px; }
    .${A}__comments-tab { flex-shrink: 0; display: inline-flex; align-items: center; min-height: 34px; padding: 0 1px; border: 0; border-bottom: 2px solid transparent; color: var(--${A}-text-subtle); background: transparent; font: 500 12px/1.5 var(--${A}-font); white-space: nowrap; cursor: pointer; }
    .${A}__comments-tab:hover { color: var(--${A}-text); }
    .${A}__comments-tab[data-active] { color: var(--${A}-accent); border-bottom-color: var(--${A}-accent); }
    .${A}__comments-panel { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; min-height: 0; padding: 12px 16px 16px; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
    .${A}__comments-panel--list { padding: 0; overflow: hidden; }
    .${A}__comments-panel[hidden], .${A}__comments-panel[data-active-panel="false"] { display: none !important; }
    #${A}-overlay:not(.${A}--comments-right) .${A}__comments-panel, body.comments-bottom .${A}__comments-panel { flex: none; overflow: visible; overscroll-behavior: auto; }
    #${A}-overlay:not(.${A}--comments-right) .${A}__playlist, body.comments-bottom .${A}__playlist { overscroll-behavior: auto; }
    #${A}-overlay:not(.${A}--comments-right) #${A}-comments, body.comments-bottom #comments { min-height: 100%; }
    #${A}-overlay:not(.${A}--comments-right) #${A}-comments, body.comments-bottom #comments { container: bili-watch-content / inline-size; }
    .${A}__playlist { flex: 1 1 auto; min-height: 0; padding: 12px 16px 0; gap: 4px; align-content: start; grid-auto-rows: min-content; max-height: min(65dvh, 640px); overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; scrollbar-width: thin; }
    #${A}-overlay.${A}--comments-right .${A}__playlist, body.comments-right .${A}__playlist { max-height: none; }
    .${A}__playlist-card { border-radius: 8px; padding: 8px; transition: background .15s; }
    .${A}__playlist-card.${A}__playlist-card--compact { grid-template-columns: minmax(0, 1fr) auto; gap: 10px; min-height: 40px; }
    .${A}__playlist-inline-duration { color: var(--${A}-text-muted); font-size: 11px; }
    button.${A}__playlist-card { width: 100%; text-align: left; font: inherit; color: inherit; border: 0; background: transparent; cursor: pointer; }
    button.${A}__playlist-card:hover, .${A}__playlist-card.${A}--selected { background: var(--${A}-accent-soft, var(--${A}-surface-soft)); }
    .${A}__playlist-info, .${A}__playlist-title, .${A}__playlist-subtitle { display: block; }
    .${A}__playing-bars { display: inline-block; width: 14px; height: 14px; margin-right: 6px; vertical-align: -2px; color: var(--${A}-accent, var(--${A}-text-subtle)); }
    .${A}__playing-bars rect { transform-box: fill-box; transform-origin: center bottom; animation: ${A}-playing-bar .65s ease-in-out infinite alternate; }
    .${A}__playing-bars rect:nth-child(2) { animation-delay: -.35s; animation-duration: .85s; }
    .${A}__playing-bars rect:nth-child(3) { animation-delay: -.2s; animation-duration: .55s; }
    @keyframes ${A}-playing-bar { from { transform: scaleY(.3); } to { transform: scaleY(1); } }
    @media (prefers-reduced-motion: reduce) { .${A}__playing-bars rect { animation: none !important; } }
    .${A}__playlist-cover { border-radius: 6px; }
    .${A}__playlist-last-played { position: absolute; top: 4px; left: 4px; padding: 0 5px; border-radius: 3px; color: #fff; background: rgba(0, 0, 0, .72); font: 500 11px/18px var(--${A}-font); white-space: nowrap; pointer-events: none; }
    .${A}__playlist-card.${A}--selected .${A}__playlist-title { color: var(--${A}-accent); font-weight: 600; }
    .${A}__playlist-empty { color: var(--${A}-text-muted); padding: 12px 16px; font-size: 12px; }
    .${A}__playlist-section-title { padding: 8px; font-size: 11px; color: var(--${A}-text-muted); }
    .${A}__sidebar[data-watch-layout="true"] { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 32%); align-items: start; gap: 28px; width: 100%; max-width: 1440px; margin: 0 auto; padding: 24px 28px; box-sizing: border-box; }
    .${A}__sidebar[data-watch-layout="true"] > .${A}__sidebar-heading { display: none; }
    .${A}__sidebar[data-watch-layout="true"] > .${A}__comments-panel { grid-column: 1; grid-row: 1; padding: 0; overflow: visible; }
    .${A}__sidebar[data-watch-layout="true"] > .${A}__sidebar-lists { display: flex; flex-direction: column; grid-column: 2; grid-row: 1; gap: 24px; min-width: 0; }
    .${A}__sidebar[data-watch-layout="true"][data-has-comments="false"] > .${A}__sidebar-lists { grid-column: 1 / -1; }
    .${A}__sidebar[data-watch-layout="true"] .${A}__comments-panel--list { flex: none; padding: 0; overflow: visible; }
    .${A}__sidebar[data-watch-layout="true"] .${A}__list-heading { display: block; margin: 0 0 10px; color: var(--${A}-text); font: 600 14px/22px var(--${A}-font); }
    .${A}__sidebar[data-watch-layout="true"] .${A}__playlist { flex: none; grid-template-columns: minmax(0, 1fr); max-height: min(65dvh, 640px); padding: 0; }
    .${A}__sidebar[data-watch-layout="true"] :is(#${A}-recommend-list, #recommend-list) { max-height: none; overflow: visible; }
    .${A}__sidebar[data-watch-layout="true"] .${A}__playlist-card { padding-inline: 4px; }
    .${A}__sidebar[data-watch-layout="true"] .${A}__playlist-empty { padding: 0; }
    .${A}__sidebar[data-watch-layout="true"] :is(#${A}-comments-mount, #comments-mount) { padding: 18px 0 0; }
    @container bili-watch-content (max-width: 850px) {
      .${A}__sidebar[data-watch-layout="true"] { grid-template-columns: minmax(0, 1fr); gap: 24px; padding: 20px 16px; }
      .${A}__sidebar[data-watch-layout="true"] > .${A}__comments-panel:not([hidden]) { display: contents; }
      .${A}__sidebar[data-watch-layout="true"] :is(#${A}-video-intro, #video-intro) { grid-column: 1; grid-row: 1; }
      .${A}__sidebar[data-watch-layout="true"] > .${A}__sidebar-lists { grid-column: 1; grid-row: 2; }
      .${A}__sidebar[data-watch-layout="true"] :is(#${A}-comments-mount, #comments-mount) { grid-column: 1; grid-row: 3; padding-top: 0; }
    }
    .${A}__intro, .${A}__video-intro { font-family: var(--${A}-font); }
    #${A}-overlay .${A}__sidebar .${A}__video-intro, #shell .${A}__sidebar .${A}__video-intro { margin: 0; padding: 4px 0 14px; }
    .${A}__sidebar .${A}__video-intro-up { grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; gap: 8px; }
    .${A}__sidebar .${A}__video-intro-up:not(:has(img)) { grid-template-columns: minmax(0, 1fr) auto; }
    .${A}__sidebar .${A}__video-intro-avatar { display: block; width: 32px; height: 32px; }
    .${A}__video-intro-avatar-link { display: block; width: fit-content; border-radius: 50%; }
    .${A}__video-intro-avatar-link:focus-visible { outline: 2px solid var(--${A}-text); outline-offset: 3px; }
    .${A}__sidebar .${A}__video-intro-name { font-size: 13px; }
    .${A}__sidebar .${A}__video-intro-body { margin: 10px 0 0; }
    .${A}__sidebar[data-watch-layout="true"] .${A}__video-intro-up { grid-template-columns: 40px minmax(0, 1fr) auto; gap: 12px; }
    .${A}__sidebar[data-watch-layout="true"] .${A}__video-intro-up:not(:has(img)) { grid-template-columns: minmax(0, 1fr) auto; }
    .${A}__sidebar[data-watch-layout="true"] .${A}__video-intro-avatar { width: 40px; height: 40px; }
    .${A}__sidebar[data-watch-layout="true"] .${A}__video-intro-name { font-size: 14px; }
    .${A}__sidebar[data-watch-layout="true"] .${A}__video-actions { margin-left: 0; }
    .${A}__sidebar[data-watch-layout="true"] .${A}__video-actions-row { justify-content: flex-start; gap: 24px; }
    .${A}__sidebar .${A}__video-intro-follow { border-radius: 16px; color: var(--${A}-on-accent, var(--${A}-surface)); background: var(--${A}-accent, var(--${A}-text)); }
    .${A}__sidebar .${A}__video-intro-follow:is(:hover, :focus-visible) { background: var(--${A}-accent-hover); }
    .${A}__sidebar .${A}__video-intro-follow--active { color: var(--${A}-accent); background: var(--${A}-accent-soft); }
    .${A}__sidebar .${A}__video-intro-follow--active:is(:hover, :focus-visible) { color: var(--${A}-accent); background: var(--${A}-accent-soft); box-shadow: inset 0 0 0 1px currentColor; }
    .${A}__sidebar .${A}__video-intro-follow:disabled { opacity: .55; cursor: wait; }
    .${A}__coin-choice:is(:hover, :focus-visible, .${A}--selected) { border-color: var(--${A}-accent); }
    .${A}__coin-submit { border-color: var(--${A}-accent); color: var(--${A}-on-accent); background: var(--${A}-accent); }
    .${A}__coin-submit:hover:not(:disabled) { border-color: var(--${A}-accent-hover); background: var(--${A}-accent-hover); }
    .${A}__favorite-footer .${A}__favorite-save:not(:disabled) { color: var(--${A}-on-accent); background: var(--${A}-accent); }
    .${A}__favorite-create button:not(.${A}__favorite-create-start) { color: var(--${A}-accent); background: var(--${A}-accent-soft); }
    .${A}__favorite-item > i { position: relative; box-sizing: border-box; width: 16px; height: 16px; border: 1px solid var(--${A}-text-muted); border-radius: 3px; background: var(--${A}-surface); }
    .${A}__favorite-item input:checked + i { border-color: var(--${A}-accent); background: var(--${A}-accent); }
    .${A}__favorite-item input:checked + i::after { content: ""; position: absolute; left: 4px; top: 1px; width: 4px; height: 8px; border: solid var(--${A}-on-accent); border-width: 0 2px 2px 0; transform: rotate(45deg); }
    .${A}__favorite-item input:focus-visible + i { outline: 2px solid var(--${A}-accent); outline-offset: 3px; }
    .${A}__favorite-item input { display: block; position: absolute; opacity: 0; width: 1px; height: 1px; }
    #${A}-overlay.${A}--comments-right #${A}-comments-mount, body.comments-right #comments-mount { padding: 12px 0 0; }
    #${A}-overlay.${A}--minimized { display: block; padding: 0; pointer-events: none; background: #11111100; backdrop-filter: blur(0px); }
    #${A}-overlay.${A}--minimized #${A}-dialog { position: fixed; right: 16px; bottom: 16px; width: min(400px, calc(100vw - 32px)) !important; height: auto !important; max-height: calc(100dvh - 32px); grid-template-rows: minmax(0, 1fr); border-radius: 4px; pointer-events: auto; box-shadow: 0 8px 32px #0004; }
    #${A}-overlay.${A}--minimized #${A}-header { grid-template-columns: minmax(0, 1fr) auto; padding: 4px 6px 16px 10px; gap: 4px; }
    #${A}-overlay.${A}--minimized #${A}-title { font-size: 12px; }
    #${A}-overlay.${A}--minimized .${A}__header-actions { gap: 2px; }
    #${A}-overlay.${A}--minimized .${A}__header-button { width: 26px; height: 26px; }
    #${A}-overlay.${A}--minimized .${A}__header-button svg { width: 16px; height: 16px; }
    #${A}-overlay.${A}--minimized .${A}__header-history,
    #${A}-overlay.${A}--minimized .${A}__header-actions > :not(.${A}__minimize-button):not(.${A}__header-button--close):not(.${S}),
    #${A}-overlay.${A}--minimized #${A}-comments,
    #${A}-overlay.${A}--minimized #${A}-comments-resizer,
    #${A}-overlay.${A}--minimized .${A}__back-to-top,
    #${A}-overlay.${A}--minimized .${A}__resize-hint,
    #${A}-overlay.${A}--minimized .${A}__modal-resize-handle { display: none !important; }
    #${A}-overlay.${A}--minimized #${A}-content { display: block !important; height: auto !important; aspect-ratio: 16 / 9; overflow: hidden; }
    #${A}-overlay.${A}--minimized #${A}-player-wrap { width: 100% !important; height: 100% !important; }
    #${A}-overlay.${A}--hidden #${A}-dialog { pointer-events: none; }
    #${A}-overlay.${A}--minimized .bpx-player-sending-area { display: none !important; }
    #${A}-overlay.${A}--minimized .bpx-player-primary-area { height: 100% !important; }
    #shell { font-family: var(--${A}-font); }
    .${A}__pip-tools { position: absolute; top: 8px; right: 8px; z-index: 40; opacity: 0; pointer-events: none; transition: var(--${A}-controls-transition, opacity .18s); }
    #stage[data-controls-visible="true"] .${A}__pip-tools, .${A}__pip-tools:has(:focus-visible), .${A}__pip-tools:has([data-popup-open]) { opacity: 1; pointer-events: auto; }
    .${A}__pip-tools .${A}__header-button { background: #0007; }
    #${A}-overlay.${A}--comments-right .bpx-player-ctrl-wide-enter, body.comments-right #bilibili-player .bpx-player-ctrl-wide-enter,
    #${A}-overlay:not(.${A}--comments-right) .bpx-player-ctrl-wide-leave, body.comments-bottom #bilibili-player .bpx-player-ctrl-wide-leave { display: block !important; }
    #${A}-overlay.${A}--comments-right .bpx-player-ctrl-wide-leave, body.comments-right #bilibili-player .bpx-player-ctrl-wide-leave,
    #${A}-overlay:not(.${A}--comments-right) .bpx-player-ctrl-wide-enter, body.comments-bottom #bilibili-player .bpx-player-ctrl-wide-enter { display: none !important; }
    @media (max-width: 900px) { #${A}-overlay.${A}--comments-right .${A}__sidebar { height: auto; } #${A}-overlay.${A}--comments-right .${A}__playlist { max-height: 65dvh; } }
    @media (max-width: 700px) { #${A}-overlay { padding: 8px; } #${A}-header { gap: 6px; padding-inline: 8px; grid-template-columns: minmax(0, 1fr) auto; } .${A}__header-history { display: none; } .${A}__header-actions { gap: 1px; } }
    @media (hover: none) { #${A}-header, .${A}__pip-tools { opacity: 1; pointer-events: auto; } }
    @media (prefers-reduced-motion: reduce) { #${A}-overlay, #${A}-overlay *, #shell * { animation-duration: .01ms !important; transition-duration: 0s !important; scroll-behavior: auto !important; } }
  `;
}
