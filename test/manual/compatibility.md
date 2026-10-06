# 兼容性验证

## 浏览器回归

- 原生 Document PiP：卡片按钮、封面点击、播放页入口、网页小窗切换；暂停回调消耗手势、申请失败回退、禁用后取消回退。
- BewlyBewly：Shadow DOM 中的横向/纵向封面、预览层和卡片操作。
- B 站原生稍后再看：列表与导航浮层的视频链接解析、列表保留、内部滚动、卡片复用和移除。

BewlyBewly 场景依据 [d421435](https://github.com/BewlyBewly/BewlyBewly/tree/d42143547bf4e9cc6864f227fcbcbd396bbff25b) 的 VideoCard 和 Picture 组件构建。B 站原生列表链接与卡片结构依据稍后再看页面的 `index.b6f87aaf.js` / `374.afee6aad.js`；导航浮层使用较小封面的测试布局，仍需登录后实测。

```sh
pnpm exec playwright test test/browser/pip-activation.spec.js test/browser/watch-later.spec.js test/browser/shadow-cards.spec.js
```

验证环境为 Linux Chromium 151。PiP 使用真实浏览器 API；卡片页面、媒体与播放接口使用测试替身。暂停回调中调用 `window.open()` 可使旧版申请 PiP 时触发 `NotAllowedError`，提前申请窗口后通过。该场景验证调用顺序，尚未确认 issue #1 的 Windows / Tampermonkey 登录态触发原因。登录后的真实稍后再看列表及完整 BewlyBewly 扩展运行仍需实测。

PiP 申请失败详情：`window.__biliPopupPlayerNano.getState().pip.lastError`。

## 既有实测

[BewlyCat 4.0.54 实测记录](bewlycat-4.0.54.md)：Windows Chrome、BewlyCat 1.8.0，B 站未登录。
