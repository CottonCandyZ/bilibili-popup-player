# 小电视空降助手兼容性

关联 [issue #12](https://github.com/CottonCandyZ/bilibili-popup-player/issues/12)。

## 适配依据

对照小电视空降助手 [0.17.1](https://github.com/hanydd/BilibiliSponsorBlock/tree/0.17.1) 的实现：

- [`PlayerSurface.ts`](https://github.com/hanydd/BilibiliSponsorBlock/blob/0.17.1/src/player/PlayerSurface.ts) 在网页中通过 `#bilibili-player video` 查找媒体；Document PiP 中使用 `.bpx-player-video-area video`。
- [`document.ts`](https://github.com/hanydd/BilibiliSponsorBlock/blob/0.17.1/src/document/document.ts) 通过 `biliSponsorBlock` 消息读取原页面的 `__INITIAL_STATE__` / `window.player`。它们不一定属于当前小窗的视频。
- [`skipSeek.ts`](https://github.com/hanydd/BilibiliSponsorBlock/blob/0.17.1/src/content/skipSeek.ts) 直接修改所选视频的 `currentTime`。媒体元素和 BVID/CID 必须指向同一段播放。

本脚本在检测到空降助手的有效查询后，为网页小窗提供唯一的原生容器 ID。原页面暂停播放器的同名 ID 在此期间暂时移除，切到独立小窗、关闭、停用或销毁时恢复；原页面自行改过的新 ID 不覆盖。复用现有 UI 挂载节点，不增加布局容器。

播放期间仅接管已知的视频信息查询，提供当前 BVID、CID、分 P、UP 主与简介；其他视频的 CID 查询仍交给原处理器。不会替换或修改原页面的 `window.player`、`__INITIAL_STATE__`，也不自行请求片段服务。切视频、播放器内部换源及窗口切换后通知空降助手刷新视频身份。

## 自动回归

```sh
pnpm build
PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium pnpm exec playwright test test/browser/sponsorblock-compat.spec.js
```

测试使用播放接口与空降助手消息协议的替身，覆盖：

- 未检测到空降助手时保留原容器 ID 和播放器全局对象。
- 打开前、打开后检测空降助手；媒体元素、视频信息和分 P 一致。
- 跳转只改变小窗视频的进度，不改变原页面视频；每个查询仅响应一次。
- 网页小窗、独立小窗、原生播放页入口、分 P reload、播放器内部换源。
- 独立小窗关闭后交还仍打开的网页小窗；关闭、停用、销毁及重新开启时清理状态。
- 原页面后续创建播放器容器或自行更改 ID 后，恢复行为正确。

验证结果：构建、脚本语法检查、27 个单元测试和 254 个浏览器全量回归通过；收尾的关闭状态检查另经 26 个空降、PiP 和关闭场景复测通过。迟到的原生换源回调不能重新启用已关闭小窗的识别或改写原页面 URL。

## 实机验收（待完成）

自动回归不代表完整扩展与 B 站真实媒体已经验证。本次 Linux Chromium 151 环境尝试加载官方 ChromeExtension.zip 0.17.1，但浏览器未加载扩展 service worker；CDP `Extensions.loadUnpacked` 返回 `Method not available`。因此不能确认完整扩展的自动跳过、提示和进度条显示。

在支持加载该扩展的浏览器中，仅启用本次测试脚本与小电视空降助手，并记录浏览器、脚本管理器和扩展版本：

1. 从首页及普通视频页打开已知有空降片段的视频，确认自动跳过正确，原页面暂停视频的进度不受影响，原页面布局和控件正常。
2. 切换 BVID 和分 P，确认片段属于当前 CID；通过原生播放器的下一集、自动连播切换后再确认一次。
3. 分别从卡片直接打开独立小窗、从网页小窗切换到独立小窗。检查自动空降、撤销空降、倍速、手动拖动进度及提示，不出现反复跳转。
4. 关闭独立小窗后，在仍打开的网页小窗继续播放；再关闭网页小窗，确认原页面播放器恢复正常。
5. 重复最小化、还原、关闭、重新开启及停用脚本，检查没有重复提示或残留的视频身份。

独立小窗使用的完整原生控制栏与空降助手为 B 站原生 rich-PiP 提供的进度轨道结构不同，片段色条、提示交互仍需单独实测。搜索、空间、动态等非 `www.bilibili.com` 页面还受空降助手自身的 URL 识别规则限制，本轮不宣称完整支持；番剧亦需实机确认。
