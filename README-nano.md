# Bilibili Popup Player - Nano

合并版 userscript，支持首页视频卡片和播放页推荐视频卡片。只保留一个右下角设置入口，dropdown 里切换：

- 播放模式：`网页内弹窗` / `Document PiP`
- 封面点击：`按钮起播` / `封面起播`

## 发布地址

- 入口页：https://bilibili-popup-player-nano.pages.dev/
- Userscript 直链：https://bilibili-popup-player-nano.pages.dev/bilibili-popup-player-nano.user.js

安装方式：先安装 Tampermonkey / Violentmonkey / ScriptCat 这类用户脚本管理器，再打开 Userscript 直链。

如果浏览器没有安装用户脚本管理器，点击 `.user.js` 链接通常只会打开或下载 JS 源码；它不会自动安装，也不会在 B 站页面里运行。

## 架构

- 共用卡片扫描、封面点击拦截、播放页 SSR 解析、主题 CSS、评论组件、调试入口。
- 宿主页上的设置按钮、卡片按钮、状态 badge 都渲染在一个 shadow overlay 里，不改动 B 站卡片 DOM。
- 播放页会跳过当前主视频的 BV，只扫描推荐视频卡片，避免改动播放页 header/主应用 DOM。
- 评论组件保留在我们自己的 modal/PiP 容器内。
- 播放容器通过 renderer adapter 区分：
  - `homeRenderer`：当前网页内 modal。
  - `pipRenderer`：Chrome Document Picture-in-Picture。
- 评论区统一走 `window.BiliComments`，切视频优先 `comment.methods.reload(props)`，否则 fallback 到 `dispatchAction({ type: "reload" })`。

## 入口

```js
window.__biliPopupPlayerNano
window.__biliPopupPlayerNanoDebug
```
