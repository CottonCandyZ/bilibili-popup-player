import { APP } from './constants.js';
import { cssEscape } from './text.js';

export function loadScriptOnce(targetDocument, src, isReady) {
  if (isReady()) return Promise.resolve();

  const attr = `data-${APP}-script`;
  const existing = targetDocument.querySelector(`script[${attr}="${cssEscape(src)}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = targetDocument.createElement('script');
    script.src = src;
    script.crossOrigin = 'anonymous';
    script.setAttribute(attr, src);
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
    targetDocument.head.appendChild(script);
  });
}
