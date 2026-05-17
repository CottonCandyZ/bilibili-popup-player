import { FONT_BASE, THEME_BASE } from './constants.js';

export function ensureStylesheetsInWindow(targetWindow, stylesheets) {
  const doc = targetWindow.document;
  ensureStylesheets(doc, [...stylesheets, ...getBiliThemeStylesheets()]);
}

export function ensureBiliThemeStylesheets(targetDocument) {
  ensureStylesheets(targetDocument, getBiliThemeStylesheets());
}

export function getBiliThemeStylesheets() {
  const themeStyle = getThemeStyle();
  const theme = themeStyle === 'dark'
    ? [`${THEME_BASE}/map.css`, `${THEME_BASE}/light_u.css`, `${THEME_BASE}/dark.css`]
    : [`${THEME_BASE}/map.css`, `${THEME_BASE}/light_u.css`, `${THEME_BASE}/light.css`];
  return [...getBiliFontStylesheets(), ...theme];
}

export function getThemeStyle() {
  const value = getCookieValue('theme_style');
  if (value === 'dark' || value === 'light') return value;
  const hasDarkTheme = [...document.querySelectorAll('link[rel~="stylesheet"][href]')]
    .some((link) => String(link.getAttribute('href')).includes('/bili-theme/dark.css'));
  return hasDarkTheme ? 'dark' : 'light';
}

function getBiliFontStylesheets() {
  return [`${FONT_BASE}/regular.css`, `${FONT_BASE}/medium.css`];
}

function ensureStylesheets(targetDocument, stylesheets) {
  return [...new Set(stylesheets)].map((href) => ensureStylesheet(targetDocument, href));
}

function ensureStylesheet(targetDocument, href) {
  const existing = findStylesheet(targetDocument, href);
  if (existing) return existing;
  const link = targetDocument.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  targetDocument.head.appendChild(link);
  return link;
}

function findStylesheet(targetDocument, href) {
  const absoluteHref = resolveHref(targetDocument, href);
  return [...targetDocument.querySelectorAll('link[rel~="stylesheet"][href]')]
    .find((link) => link.href === absoluteHref || link.getAttribute('href') === href) || null;
}

function resolveHref(targetDocument, href) {
  const anchor = targetDocument.createElement('a');
  anchor.href = href;
  return anchor.href;
}

function getCookieValue(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}
