const LUCIDE_STROKE_WIDTH = '2';

function createIconFromMarkup(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup;
  return template.content.firstElementChild;
}

function lucideIconMarkup(paths) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${LUCIDE_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths.map((d) => `<path d="${d}"></path>`).join('')}</svg>`;
}

export function createSettingsIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', LUCIDE_STROKE_WIDTH);
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  [
    ['path', { d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915' }],
    ['circle', { cx: '12', cy: '12', r: '3' }],
  ].forEach(([name, attrs]) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    svg.appendChild(node);
  });
  return svg;
}

export function createExternalLinkIcon() {
  return createIconFromMarkup(externalLinkIconMarkup());
}

export function createHistoryBackIcon() {
  return createIconFromMarkup(lucideIconMarkup([
    'm15 18-6-6 6-6',
  ]));
}

export function createHistoryForwardIcon() {
  return createIconFromMarkup(lucideIconMarkup([
    'm9 18 6-6-6-6',
  ]));
}

export function createMaximizeIcon() {
  return createIconFromMarkup(lucideIconMarkup([
    'M8 3H5a2 2 0 0 0-2 2v3',
    'M21 8V5a2 2 0 0 0-2-2h-3',
    'M3 16v3a2 2 0 0 0 2 2h3',
    'M16 21h3a2 2 0 0 0 2-2v-3',
  ]));
}

export function createMinimizeIcon() {
  return createIconFromMarkup(lucideIconMarkup([
    'M8 3v3a2 2 0 0 1-2 2H3',
    'M21 8h-3a2 2 0 0 1-2-2V3',
    'M3 16h3a2 2 0 0 1 2 2v3',
    'M16 21v-3a2 2 0 0 1 2-2h3',
  ]));
}

export function createPictureInPictureIcon() {
  return createIconFromMarkup(lucideIconMarkup([
    'M21 9V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4',
    'M21 13v5a2 2 0 0 1-2 2h-5',
    'M15 15h6v5h-6z',
  ]));
}

export function createAutoPlayIcon() {
  return createIconFromMarkup(lucideIconMarkup([
    'm17 2 4 4-4 4',
    'M3 11v-1a4 4 0 0 1 4-4h14',
    'm7 22-4-4 4-4',
    'M21 13v1a4 4 0 0 1-4 4H3',
  ]));
}

export function createResetSizeIcon() {
  return createIconFromMarkup(lucideIconMarkup([
    'M3 12a9 9 0 1 0 3-6.7',
    'M3 3v6h6',
  ]));
}

export function createFitLayoutIcon() {
  return createIconFromMarkup(lucideIconMarkup([
    'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1',
    'M14 5v14',
    'M7 9h4',
    'M7 15h4',
    'M17 12h1',
  ]));
}

export function createGamepadIcon() {
  return createIconFromMarkup(lucideIconMarkup([
    'M6 11h4',
    'M8 9v4',
    'M15 12h.01',
    'M18 10h.01',
    'M17.32 5H6.68a4 4 0 0 0-3.98 3.59c-.01.05-.01.1-.02.15C2.6 9.42 2 14.46 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.41-1.41A2 2 0 0 1 9.83 16h4.34a2 2 0 0 1 1.42.59L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.54-.6-6.58-.68-7.26l-.02-.15A4 4 0 0 0 17.32 5Z',
  ]));
}

export function createCloseIcon() {
  return createIconFromMarkup(lucideIconMarkup([
    'M18 6 6 18',
    'm6 6 12 12',
  ]));
}

export function externalLinkIconMarkup() {
  return lucideIconMarkup([
    'M15 3h6v6',
    'M10 14 21 3',
    'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  ]);
}

export function arrowUpIconMarkup() {
  return lucideIconMarkup(['m18 15-6-6-6 6']);
}
