import { APP } from './constants.js';
import { getThemeStyle } from './theme.js';

export const ACCENT_PRESETS = [
  { id: 'pink', label: '哔哩粉', color: '#fb7299' },
  { id: 'blue', label: '哔哩蓝', color: '#00aeec' },
  { id: 'default', label: '黑白', color: '' },
  { id: 'custom', label: '自定义', color: '' },
];

export function normalizeHexColor(value) {
  const color = String(value || '').trim().toLowerCase();
  if (/^#[\da-f]{6}$/.test(color)) return color;
  if (/^#[\da-f]{3}$/.test(color)) return '#' + [...color.slice(1)].map(char => char + char).join('');
  return '';
}

export function normalizeAccentTheme(value) {
  try { if (typeof value === 'string') value = JSON.parse(value); } catch { value = null; }
  return {
    preset: ACCENT_PRESETS.some(item => item.id === value?.preset) ? value.preset : 'pink',
    custom: normalizeHexColor(value?.custom) || '#fb7299',
    darkOverride: value?.darkOverride === true,
    darkCustom: normalizeHexColor(value?.darkCustom) || '#d76384',
  };
}

export function getAccentColor(theme, scheme = 'light') {
  if (scheme === 'dark' && theme.darkOverride) return theme.darkCustom;
  const color = theme.preset === 'custom' ? theme.custom : ACCENT_PRESETS.find(item => item.id === theme.preset)?.color || '';
  // Soften bright fills at night without further darkening an already muted
  // custom color. An explicit dark override is always used as selected.
  if (scheme !== 'dark' || !color || luminance(color) < .2) return color;
  const background = [23, 24, 26];
  return '#' + color.slice(1).match(/../g).map((value, index) =>
    Math.round(parseInt(value, 16) * .84 + background[index] * .16).toString(16).padStart(2, '0')).join('');
}

function luminance(color) {
  const linear = color.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}

export function applyAccentTheme(root, theme, scheme = getThemeStyle()) {
  if (!root) return;
  root.dataset.biliPopupAccent = theme.preset;
  root.dataset.biliPopupScheme = scheme;
  const color = getAccentColor(theme, scheme);
  // Brand presets use white labels in both schemes. Keep automatic contrast for
  // custom colors, including a separately configured dark palette.
  const customFill = theme.preset === 'custom' || (scheme === 'dark' && theme.darkOverride);
  const foreground = color && (customFill && luminance(color) > .193 ? '#111111' : '#ffffff');
  const values = {
    [`--${APP}-accent`]: color,
    [`--${APP}-on-accent`]: foreground,
    [`--${APP}-player-accent`]: color,
    [`--${APP}-on-player-accent`]: foreground,
  };
  for (const [name, value] of Object.entries(values)) {
    if (value) root.style.setProperty(name, value);
    else root.style.removeProperty(name);
  }
}

// Define derived colors at each owned theme root: inherited aliases from the
// site's :root have already resolved to the site's original blue/pink.
export function getBiliAccentVariables(accent, hover, soft, active = accent) {
  return ['blue', 'pink'].map(name => `
    --brand_${name}: ${accent};
    --brand_${name}_hover: ${hover};
    --brand_${name}_active: ${active};
    --brand_${name}_thin: ${soft};
    --brand_${name}_disabled: color-mix(in srgb, ${accent} 40%, transparent);
    ${['', '_hover', '_active', '_thin', '_disabled'].map(suffix => `--v_brand_${name}${suffix}: var(--brand_${name}${suffix});`).join('\n')}
  `).join('\n');
}

export function getAccentThemeVariables() {
  return `
    --${APP}-accent: var(--${APP}-text);
    --${APP}-on-accent: var(--${APP}-surface);
    --${APP}-accent-hover: color-mix(in srgb, var(--${APP}-accent) 85%, var(--${APP}-surface));
    --${APP}-accent-soft: color-mix(in srgb, var(--${APP}-accent) 12%, var(--${APP}-surface));
    --${APP}-player-accent: #fff;
    --${APP}-on-player-accent: #111;
    --${APP}-player-accent-hover: color-mix(in srgb, var(--${APP}-player-accent) 85%, #fff);
    --${APP}-brand: var(--${APP}-accent);
    --${APP}-brand-soft: var(--${APP}-accent-soft);
    --text_link: var(--${APP}-accent);
    --v_text_link: var(--text_link);
    ${getBiliAccentVariables(`var(--${APP}-accent)`, `var(--${APP}-accent-hover)`, `var(--${APP}-accent-soft)`)}
  `;
}
