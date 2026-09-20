# Bilibili Popup Player - Nano

## 预览

### 网页小窗

![网页小窗：视频独立展示，背景页面虚化](assets/screenshots/popup-player-modal.webp)

### 评论侧栏

![评论侧栏：边看视频边查看视频信息与评论](assets/screenshots/popup-player-sidebar.webp)

## 安装

访问 [pop-player.nanachi.moe](https://pop-player.nanachi.moe/)，按页面提示安装即可。

## 本地调试

```sh
pnpm run dev
```

然后在用户脚本管理器里安装根目录的 `bilibili-popup-player-nano.dev.user.js`。这个 dev loader 会从 `http://127.0.0.1:8715/bilibili-popup-player-nano.user.js` 拉取本地 bundle；改动源码后 Rollup 会自动重建，已打开的 B 站页面会自动刷新。

## 发布

```sh
pnpm run release
```

默认自动 bump patch 版本并发布到 Cloudflare Pages。指定版本：

```sh
pnpm run release -- 0.3.0
```

## 架构

- 共用卡片扫描、封面点击拦截、播放页 SSR 解析、主题 CSS、评论组件、调试入口。
- 宿主页上的设置按钮、卡片按钮、状态 badge 都渲染在一个 shadow overlay 里，不改动 B 站卡片 DOM。
- 播放页会跳过当前主视频的 BV，只扫描推荐视频卡片；首页、动态页、空间页、历史记录和搜索页会扫描页面内视频卡片。
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
