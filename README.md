# Bilibili Popup Player - Nano

## 预览

### 网页小窗

![网页小窗：视频独立展示，背景页面虚化](assets/screenshots/popup-player-modal.webp)

### 评论侧栏

![评论侧栏：边看视频边查看视频信息与评论](assets/screenshots/popup-player-sidebar.webp)

## 安装

访问 [pop-player.nanachi.moe](https://pop-player.nanachi.moe/)，按页面提示安装即可。

安装本地构建时，在 ScriptCat（脚本猫）或 Tampermonkey（油猴）中导入根目录的 `bilibili-popup-player-nano.user.js`，`dist` 中的同名文件也可使用。文件开头应为 `// ==UserScript==`；构建过程会验证这个元数据头，缺失时终止构建。

许可正文保存在独立文件中，脚本头仅保留 `@license` 标识。

独立小窗按 `documentPictureInPicture.requestWindow` 是否可用来启用，不按浏览器名称或版本屏蔽。Firefox 桌面版自 [151](https://www.firefox.com/en-US/firefox/151.0/releasenotes/) 起支持 Document PiP；接口不可用时仍可使用网页小窗。

## 自动更新

正式版使用 [Tampermonkey（油猴）](https://www.tampermonkey.net/documentation.php?locale=en&q=update_url) 和 [ScriptCat（脚本猫）](https://docs.scriptcat.org/docs/dev/meta/#updateurl) 的原生更新机制：

- `@updateURL`：`https://pop-player.nanachi.moe/bilibili-popup-player-nano.meta.js`，仅包含元数据，用于检查版本。
- `@downloadURL`：`https://pop-player.nanachi.moe/bilibili-popup-player-nano.user.js`，发现新版后下载完整脚本。
- `@version`：发布时递增；仅修改代码、没有提高版本号，不会触发版本升级。

安装后，在管理器中开启此脚本的更新检查，并设置检查间隔。管理器会定期检查新版，再按你的更新设置安装或提示确认；也可以在脚本列表中手动检查更新。更新完成后刷新 B 站页面生效。

旧版已使用同一域名的 `.user.js` 检查更新，发布新版后仍可通过原地址升级，升级后使用轻量的 `.meta.js`。脚本名称和命名空间保持不变。若此前粘贴安装、关闭过更新或手动覆盖过更新地址，请从安装页重新安装一次并检查管理器中的更新设置。本地 dev loader 不参与正式版更新。

构建会从最终脚本头生成根目录和 `dist` 中的 `.meta.js`，确保版本、名称、命名空间与下载文件一致；Cloudflare Pages 的 `dist/_headers` 为两个更新地址设置重新验证缓存的响应头。部署后需能通过上述两个公网地址直接取得脚本，不能返回安装页 HTML。

## 本地调试

```sh
pnpm install
pnpm run dev
```

然后在用户脚本管理器里安装根目录的 `bilibili-popup-player-nano.dev.user.js`。这个 dev loader 会从 `http://127.0.0.1:8715/bilibili-popup-player-nano.user.js` 拉取本地 bundle；改动源码后 Rollup 会自动重建，已打开的 B 站页面会自动刷新。

## 验证

```sh
pnpm build
pnpm check
pnpm test
pnpm test:browser
```

浏览器回归使用本机 Chrome，也可通过 `PLAYWRIGHT_CHANNEL=msedge` 选择 Edge。测试覆盖 OGV 与历史浮层挂载、遮挡和裁剪、SPA 与卡片复用、总开关、键盘操作、光标与播放标记、切回窗口防误关、播放器比例、迷你窗口与独立小窗的生命周期。播放接口和媒体实例使用测试替身；真实媒体加载、账号权限及 Document PiP 行为仍需在 B 站页面验证。

## 发布

```sh
pnpm run release
```

先按 `.env.example` 配置 Cloudflare 凭据。默认自动递增 patch 版本，构建并通过语法检查、单元测试后发布到 Cloudflare Pages，再校验线上更新元数据及完整下载内容与本地构建一致。指定版本（应高于已发布版本）：

```sh
pnpm run release -- 4.1.0
```

指定版本低于当前源码版本时会拒绝发布；允许指定相同版本重试失败的部署。若已经手动修改了 `rollup.config.mjs` 中的 `@version`，可用 `pnpm run publish:pages` 直接发布当前版本。请在 Pages 项目配置的生产分支上发布；[预览分支部署](https://developers.cloudflare.com/pages/configuration/preview-deployments/)不会更新上述正式域名。脚本管理器读取的是 Pages 上的文件，本地构建或 GitHub 提交后仍需确保生产部署完成。

发布后也可以单独复查线上文件：

```sh
pnpm run check:published
```

遇到缓存尚未刷新、网络失败、元数据与下载版本不一致或下载内容不完整时，校验会报错。检查部署和缓存状态后可重新执行该命令；它不会重新发布。

## 架构

- 共用卡片扫描、封面点击拦截、播放页 SSR 解析、主题 CSS、评论组件、调试入口。
- 设置入口和普通卡片按钮渲染在页面级 shadow overlay 中；历史记录等悬停浮层的按钮挂载到卡片内部的独立 shadow root，以保留浮层的悬停状态，销毁时清理挂载点和定位样式。
- `card-targets.js` 负责真实封面识别、可见区域与遮挡检测；播放页排除当前视频，OGV 选集不挂入口。
- `settings-ui.jsx`、`player-shell-ui.jsx` 和 `content-ui.jsx` 使用 Base UI 的 Popover、Switch、Radio、Dialog、Tabs 与 Button；`ui-theme.js` 统一样式。
- 评论组件保留在我们自己的 modal/PiP 容器内。
- 播放容器通过 renderer adapter 区分：
  - `homeRenderer`：当前网页内 modal / 右下角迷你播放器。
  - `pipRenderer`：支持 Document Picture-in-Picture 的浏览器独立小窗。
- 评论区统一走 `window.BiliComments`，切视频优先 `comment.methods.reload(props)`，否则 fallback 到 `dispatchAction({ type: "reload" })`。

## 入口

```js
window.__biliPopupPlayerNano
window.__biliPopupPlayerNanoDebug
```

## 许可

本项目采用 [GNU Affero General Public License v3.0](LICENSE)（`AGPL-3.0-only`）。第三方依赖保留各自许可，见 [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt)。B 站播放器、评论组件及预览中的视频内容属于其各自权利人，不在本项目许可范围内。
