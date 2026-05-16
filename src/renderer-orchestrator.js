export function createRendererOrchestrator({
  getActiveRenderer,
  nextToken,
  isCurrentToken,
  resolveBootstrap,
  saveLastPlayed,
  recordPlaybackHistory,
}) {
  async function openByMode(meta) {
    return openWithRenderer(getActiveRenderer(), meta);
  }

  async function openWithRenderer(renderer, meta) {
    const reusable = renderer.getReusable?.(meta);
    if (reusable) {
      const token = nextToken();
      renderer.reuse(reusable, meta, token);
      return;
    }

    const token = nextToken();
    const context = await renderer.prepare(meta, token);
    if (!context || !isCurrentToken(token)) return;

    try {
      const bootstrap = await resolveBootstrap(meta);
      if (!isCurrentToken(token) || renderer.isClosed(context)) return;
      saveLastPlayed(meta, bootstrap);
      await renderer.play(context, bootstrap, token);
      if (!isCurrentToken(token) || renderer.isClosed(context)) return;
      recordPlaybackHistory(meta, bootstrap);
      renderer.done?.(context, bootstrap);
    } catch (error) {
      if (!isCurrentToken(token) || renderer.isClosed(context)) return;
      renderer.fail(context, error);
    }
  }

  return {
    openByMode,
    openWithRenderer,
  };
}
