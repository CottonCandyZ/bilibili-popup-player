import { COMMENT_FALLBACK } from './constants.js';

const CORE_PATH = /^\/bfs\/static\/player\/main\/core(?:\.[\w-]+)?\.js$/;

export function getPlayerCoreUrl(src, baseUrl) {
  if (!src) return '';
  try {
    const url = new URL(src, baseUrl);
    return url.protocol === 'https:' && url.hostname === 's1.hdslb.com' && CORE_PATH.test(url.pathname)
      ? url.href
      : '';
  } catch {
    return '';
  }
}

export function findPlayerCoreUrl(html, href) {
  for (const [, src] of String(html || '').matchAll(/<script\b[^>]*?\ssrc\s*=\s*["']([^"']+)["']/gi)) {
    const url = getPlayerCoreUrl(src, href);
    if (url) return url;
  }
  return '';
}

// Read the native page's JSON without executing any of its player bundles.
export function readPlaybackPageData(html, href) {
  const initialState = readAssignedJson(html, /\bwindow\.__INITIAL_STATE__\s*=\s*([\[{])/);
  if (!initialState?.videoData) throw new Error('原播放页缺少视频信息');
  let playInfo = null;
  try { playInfo = readAssignedJson(html, /\bwindow\.__playinfo__\s*=\s*([\[{])/); } catch { /* Prefetch is optional. */ }
  const commentHash = String(html).match(/"comment_version_hash"\s*:\s*"([\w-]+)"/)?.[1];
  return {
    initialState,
    playInfo,
    coreScript: findPlayerCoreUrl(html, href),
    commentScript: commentHash
      ? `https://s1.hdslb.com/bfs/seed/jinkela/commentpc/bili-comments.${commentHash}.js`
      : COMMENT_FALLBACK,
  };
}

export function readAssignedJson(html, assignment) {
  const text = String(html || '');
  const match = assignment.exec(text);
  if (!match) return null;
  const start = match.index + match[0].length - 1;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '{' || char === '[') depth++;
    else if (char === '}' || char === ']') {
      if (--depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error('原播放页视频信息不完整');
}
