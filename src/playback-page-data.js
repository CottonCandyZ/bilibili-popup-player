import { COMMENT_FALLBACK } from './constants.js';
import { normalizeResourceUrl } from './video-meta.js';

// Read the native page's JSON without executing any of its player bundles.
export function readPlaybackPageData(html, href) {
  const initialState = readAssignment(html, 'window.__INITIAL_STATE__');
  if (!initialState?.videoData) throw new Error('原播放页缺少视频信息');
  let playInfo = null;
  try { playInfo = readAssignment(html, 'window.__playinfo__'); } catch { /* Prefetch is optional. */ }
  const coreSrc = String(html).match(/<script\b[^>]*\bsrc=["']([^"']*\/player\/main\/core\.[^"']+\.js(?:\?[^"']*)?)["']/i)?.[1];
  const commentHash = String(html).match(/"comment_version_hash"\s*:\s*"([^"/]+)"/)?.[1];
  return {
    initialState,
    playInfo,
    coreScript: normalizeResourceUrl(coreSrc || '', href),
    commentScript: commentHash
      ? `https://s1.hdslb.com/bfs/seed/jinkela/commentpc/bili-comments.${commentHash}.js`
      : COMMENT_FALLBACK,
  };
}

function readAssignment(html, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escapedName}\\s*=\\s*([\\[{])`).exec(String(html));
  if (!match) return null;
  const start = match.index + match[0].length - 1;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < html.length; i++) {
    const char = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '{' || char === '[') depth++;
    else if (char === '}' || char === ']') {
      if (--depth === 0) return JSON.parse(html.slice(start, i + 1));
    }
  }
  throw new Error('原播放页视频信息不完整');
}
