# 小电视空降助手兼容性

关联 [issue #12](https://github.com/CottonCandyZ/bilibili-popup-player/issues/12)。

## 适配依据

对照小电视空降助手 [0.17.1](https://github.com/hanydd/BilibiliSponsorBlock/tree/0.17.1) 的实现：

- [`PlayerSurface.ts`](https://github.com/hanydd/BilibiliSponsorBlock/blob/0.17.1/src/player/PlayerSurface.ts) 在网页中通过 `#bilibili-player video` 查找媒体；Document PiP 中使用 `.bpx-player-video-area video`。
- [`document.ts`](https://github.com/hanydd/BilibiliSponsorBlock/blob/0.17.1/src/document/document.ts) 通过 `biliSponsorBlock` 消息读取原页面的 `__INITIAL_STATE__` / `window.player`。它们不一定属于当前小窗的视频。
- [`skipSeek.ts`](https://github.com/hanydd/BilibiliSponsorBlock/blob/0.17.1/src/content/skipSeek.ts) 直接修改所选视频的 `currentTime`。媒体元素和 BVID/CID 必须指向同一段播放。

检测到空降助手后，网页小窗复用现有挂载节点作为唯一的原生播放器 ID。切到独立小窗、关闭、停用或销毁时恢复原页面的 ID。

播放期间通过扩展的消息协议提供当前 BVID、CID、分 P、UP 主和简介。搜索页和个人空间在同域 URL 的 `bpn_video` 参数中提供当前播放页地址，供扩展在执行跳过前核对。关闭小窗时还原原地址。独立小窗将扩展渲染的片段色条显示在当前播放器的进度轨道上，保留原生拖动、预览和高能曲线。

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
- 搜索页的识别参数在站内路由更新后仍可用。独立小窗的控制栏保持原生布局，片段标记与原生进度轨道对齐，外链图标与相邻控件等宽并保留当前播放时间。

## 实机复测

在 macOS 的隔离 Chromium 配置中加载空降助手 0.17.1，使用 `BV1cSec6tEux` 验证了播放页和个人空间的独立小窗，以及搜索页的网页小窗。个人空间的独立小窗显示盾牌、片段色条和原生高能曲线，启用片头自动跳过后从 1:26 跳到 1:58。番剧和其他扩展组合仍待实机验证。

在支持加载该扩展的浏览器中，仅启用本次测试脚本与小电视空降助手，并记录浏览器、脚本管理器和扩展版本：

1. 从首页及普通视频页打开已知有空降片段的视频，确认自动跳过正确，原页面暂停视频的进度不受影响，原页面布局和控件正常。
2. 切换 BVID 和分 P，确认片段属于当前 CID；通过原生播放器的下一集、自动连播切换后再确认一次。
3. 分别从卡片直接打开独立小窗、从网页小窗切换到独立小窗。检查自动空降、撤销空降、倍速、手动拖动进度及提示，不出现反复跳转。
4. 关闭独立小窗后，在仍打开的网页小窗继续播放；再关闭网页小窗，确认原页面播放器恢复正常。
5. 重复最小化、还原、关闭、重新开启及停用脚本，检查没有重复提示或残留的视频身份。
