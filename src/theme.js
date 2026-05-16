import { THEME_BASE } from './constants.js';

export function ensureStylesheetsInWindow(targetWindow, stylesheets) {
  const doc = targetWindow.document;
  const existing = new Set([...doc.querySelectorAll('link[rel~="stylesheet"][href]')].map((link) => link.href));
  [...new Set([...stylesheets, ...getBiliThemeStylesheets()])].forEach((href) => {
    if (existing.has(href)) return;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    doc.head.appendChild(link);
  });
}

export function ensureBiliThemeStylesheets(targetDocument) {
  const existing = new Set([...targetDocument.querySelectorAll('link[rel~="stylesheet"][href]')].map((link) => link.href));
  getBiliThemeStylesheets().forEach((href) => {
    if (existing.has(href)) return;
    const link = targetDocument.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    targetDocument.head.appendChild(link);
  });
}

export function getBiliThemeStylesheets() {
  const themeStyle = getThemeStyle();
  if (themeStyle === 'dark') return [`${THEME_BASE}/map.css`, `${THEME_BASE}/light_u.css`, `${THEME_BASE}/dark.css`];
  return [`${THEME_BASE}/map.css`, `${THEME_BASE}/light_u.css`, `${THEME_BASE}/light.css`];
}

export function getThemeStyle() {
  const value = getCookieValue('theme_style');
  if (value === 'dark' || value === 'light') return value;
  const hasDarkTheme = [...document.querySelectorAll('link[rel~="stylesheet"][href]')]
    .some((link) => String(link.getAttribute('href')).includes('/bili-theme/dark.css'));
  return hasDarkTheme ? 'dark' : 'light';
}

function getCookieValue(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}
