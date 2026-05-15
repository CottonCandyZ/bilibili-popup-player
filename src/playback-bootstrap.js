import { COMMENT_FALLBACK, CORE_FALLBACK } from './constants.js';
import { normalizeResourceUrl } from './video-meta.js';

export async function resolvePlaybackBootstrap(meta) {
  const html = await fetch(meta.href, { credentials: 'include' }).then((res) => res.text());
  const initialState = JSON.parse(extractAssignedJson(html, 'window.__INITIAL_STATE__'));
  const playInfoJson = extractAssignedJson(html, 'window.__playinfo__');
  const playInfo = playInfoJson ? JSON.parse(playInfoJson) : null;
  const vd = initialState.videoData;
  const p = Number(initialState.p || 1);
  const page = vd.pages?.[p - 1] || vd.pages?.[0] || {};

  return {
    title: vd.title || meta.title,
    coreScript: extractCoreScriptUrl(html) || CORE_FALLBACK,
    commentScript: extractCommentScriptUrl(html) || COMMENT_FALLBACK,
    stylesheets: extractStylesheetUrls(html),
    initialState,
    playInfo,
    playerInfo: {
      aid: vd.aid || initialState.aid,
      bvid: vd.bvid || meta.bvid,
      cid: page.cid || initialState.cid,
      p,
      t: 0,
    },
    href: meta.href,
    commentInfo: {
      params: `1,${vd.aid || initialState.aid}`,
      spmPrefix: initialState.spmidPrefix || '333.788',
      cmFromTrackId: new URL(meta.href, location.href).searchParams.get('track_id') || '',
    },
  };
}

function extractAssignedJson(html, marker) {
  const start = html.indexOf(`${marker}=`);
  if (start < 0) {
    if (marker === 'window.__playinfo__') return null;
    throw new Error(`${marker} not found`);
  }

  const jsonStart = start + marker.length + 1;
  const first = html[jsonStart];
  if (first !== '{' && first !== '[') throw new Error(`${marker} assignment is not JSON`);

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = jsonStart; i < html.length; i += 1) {
    const char = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) return html.slice(jsonStart, i + 1);
    }
  }
  throw new Error(`${marker} JSON is not closed`);
}

function extractCoreScriptUrl(html) {
  const candidates = [...html.matchAll(/<script[^>]+src="([^"]*\/player\/main\/core\.[^"]+\.js[^"]*)"[^>]*>/g)]
    .map((match) => normalizeResourceUrl(match[1]))
    .filter(Boolean);
  return candidates[0] || '';
}

function extractCommentScriptUrl(html) {
  const hash = html.match(/"comment_version_hash":"([^"]+)"/)?.[1];
  if (hash) return `https://s1.hdslb.com/bfs/seed/jinkela/commentpc/bili-comments.${hash}.js`;
  const src = html.match(/<script[^>]+src="([^"]*bili-comments[^"]+\.js[^"]*)"[^>]*>/)?.[1];
  return normalizeResourceUrl(src);
}

function extractStylesheetUrls(html) {
  const urls = [];
  const patterns = [
    /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/g,
    /<link[^>]+href="([^"]+)"[^>]+rel="stylesheet"[^>]*>/g,
  ];
  patterns.forEach((pattern) => {
    for (const match of html.matchAll(pattern)) {
      const href = normalizeResourceUrl(match[1]);
      if (href && !urls.includes(href)) urls.push(href);
    }
  });
  return urls;
}
