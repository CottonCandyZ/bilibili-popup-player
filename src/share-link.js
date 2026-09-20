export function cleanPlaybackLink(href) {
  try {
    const url = new URL(href, 'https://www.bilibili.com');
    if (!['www.bilibili.com', 'live.bilibili.com'].includes(url.hostname) || !/^https?:$/.test(url.protocol)) return '';
    if (!/^\/(?:video\/(?:BV[\da-z]+|av\d+)|bangumi\/play\/(?:ep|ss)\d+|\d+)\/?$/i.test(url.pathname)) return '';
    url.protocol = 'https:';
    url.search = '';
    url.hash = '';
    return url.href;
  } catch { return ''; }
}

export async function copyPlaybackLink(href, targetDocument) {
  const link = cleanPlaybackLink(href);
  if (!link) throw new Error('当前视频链接不可用');
  try {
    await targetDocument.defaultView.navigator.clipboard.writeText(link);
  } catch {
    // Older userscript/browser permission combinations still allow a copy
    // command during the button's activation. Keep it inside any focus trap.
    const previous = targetDocument.activeElement;
    const input = targetDocument.createElement('textarea');
    input.value = link;
    input.readOnly = true;
    input.style.cssText = 'position:fixed;opacity:0;pointer-events:none;inset:0;width:1px;height:1px;';
    (previous?.closest('[role="dialog"]') || targetDocument.fullscreenElement || targetDocument.body).append(input);
    try {
      input.select();
      if (!targetDocument.execCommand('copy')) throw new Error('复制失败');
    } finally {
      input.remove();
      previous?.focus({ preventScroll: true });
    }
  }
}
