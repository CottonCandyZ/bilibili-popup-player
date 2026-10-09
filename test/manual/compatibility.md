# 兼容性验证

## 浏览器回归

- 原生 Document PiP：卡片按钮、封面点击、播放页入口、网页小窗切换；暂停回调消耗手势、申请失败回退、禁用后取消回退。
- BewlyBewly：Shadow DOM 中的横向/纵向封面、预览层和卡片操作；小窗局部隔离全局滚动条样式，继续使用系统原生滚动条，播放器宽度保持完整，评论和列表滚动正常。仅系统本身使用占位滚动条时启用自绘兜底。
- 侧栏：评论、播放列表和相关推荐的左侧内容对齐；1px 分隔线保留 9px 拖拽命中范围，网页小窗和独立小窗的切换及比例计算正常。
- 原生滚动条主题：网页小窗和独立小窗的 `color-scheme` 跟随小窗明暗主题，包括打开后切换；不继承宿主不一致的深色设置，颜色继续由浏览器决定。
- B 站原生稍后再看：列表与导航浮层的视频链接解析、列表保留、内部滚动、卡片复用和移除。

BewlyBewly 场景依据 [d421435](https://github.com/BewlyBewly/BewlyBewly/tree/d42143547bf4e9cc6864f227fcbcbd396bbff25b) 的 VideoCard 和 Picture 组件构建。B 站原生列表链接与卡片结构依据稍后再看页面的 `index.b6f87aaf.js` / `374.afee6aad.js`；导航浮层使用较小封面的测试布局，仍需登录后实测。

```sh
pnpm exec playwright test test/browser/pip-activation.spec.js test/browser/watch-later.spec.js test/browser/shadow-cards.spec.js
pnpm exec playwright test test/browser/watch-layout.spec.js test/browser/layout-transitions.spec.js test/browser/sidebar-content.spec.js
```

验证环境为 Linux Chromium 151。PiP 使用真实浏览器 API；卡片页面、媒体与播放接口使用测试替身。暂停回调中调用 `window.open()` 可使旧版申请 PiP 时触发 `NotAllowedError`，提前申请窗口后通过。该场景验证调用顺序，尚未确认 issue #1 的 Windows / Tampermonkey 登录态触发原因。登录后的真实稍后再看列表及完整 BewlyBewly 扩展运行仍需实测。

PiP 申请失败详情：`window.__biliPopupPlayerNano.getState().pip.lastError`。

2026-10-07 补充 Windows Chrome 回归：滚动条场景取自 BewlyBewly 同一提交的 `src/styles/main.scss`，并额外覆盖宿主设置 `scrollbar-gutter: stable` 的情况。验证原生模式下不创建自绘滚动条、实际容器尺寸与视频边界正常、宿主页面样式不受影响；不代表完整扩展或真实媒体已经实测。

## 性能与全屏弹幕

- 非全屏小窗：固定同一视频、时间段、清晰度、帧率、播放速度和弹幕密度，等待启动扫描结束（至少 15 秒）后各录制 30 秒 Performance。对比原播放页与小窗的脚本、布局、绘制开销，另外在浏览器任务管理器中区分页面进程与 GPU 进程。
- 背景模糊默认开启；设置 → 显示效果默认折叠，可关闭模糊以减轻性能开销。确认开关立即生效且不重建播放器，刷新、最小化和还原后保持选择，关闭模糊仍保留深色遮罩。
- 自绘滚动条：系统使用占位滚动条时，播放中的弹幕增删、进度文本更新不应触发侧栏扫描；评论加载、侧栏切换、拖动滚动条仍须更新滚动范围。
- 手柄：首次使用默认关闭，没有探测；主动开启后，无设备时每秒探测一次，连接后按帧处理输入。断连、重新连接、关闭播放器，以及开启时按住按钮的情况均需覆盖。
- 系统全屏：横屏和竖屏视频有黑边时，黑边中放置一个 1 CSS px、在 `#010101` / `#020202` 间每秒变化的像素，不再给弹幕层设置 `backdrop-filter`。无黑边、未知画面几何时隐藏标记，不覆盖视频。验证控件自动隐藏后弹幕仍可见，开关弹幕、透明度、智能遮罩、切视频及退出全屏均正常。

全屏像素的自动测试只验证位置、颜色变化、事件穿透和清理。Windows Chrome 的节能/硬件合成行为必须在真实 GPU、未录屏的显示器上验证；录屏可能改变视频合成路径。若页面脚本开销已低而 CPU 仍高，用 `chrome://media-internals` 比较实际 codec、分辨率及帧率、解码器名称和硬件解码标记；同一视频不保证两种入口选择同一媒体轨道。

### 本地受限播放采样

`profile-playback.mjs` 使用本地 H.264 1080p60 视频、180 条持续运动的模拟弹幕及 100 条评论。网络请求全部由测试夹具接管，不加载真实 B 站接口或播放器。弹幕节点数量固定，避免 CPU 限速使弹幕变少而干扰比较；DOM 替换和进度更新仍持续触发。脚本依次采样普通 video 页面、可选的旧版小窗、当前小窗及关闭模糊的小窗。

```sh
pnpm build
mkdir -p .cache/perf
ffmpeg -f lavfi -i 'testsrc2=size=1920x1080:rate=60' -t 8 -an -c:v libx264 -preset ultrafast -crf 24 -pix_fmt yuv420p .cache/perf/sample-1080p60.mp4
# Linux：整个浏览器固定到一个可用 CPU；运行时不要并发其他基准或测试。
taskset -c 0 env PERF_CHROMIUM=/usr/bin/chromium node test/manual/profile-playback.mjs
```

默认关闭 GPU 加速，使用 CDP 的 1×、4×、6× CPU 限速；这模拟软件渲染压力，不等于对真实 GPU 限频。`PERF_DISABLE_GPU=0` 可使用浏览器正常加速配置，仍应核对结果中的 GPU 功能状态。`PERF_BASELINE` 可指定旧版构建文件，`PERF_CURRENT` 指定当前构建，`PERF_MEDIA` 指定本地素材，`PERF_CPU_RATES` / `PERF_OUTPUT` 指定限速倍率和输出目录。

输出 `results.json`、DevTools 可打开的 `.cpuprofile` / `.trace.json` 和截图。每档先稳定 4 秒，再采样约 8 秒，并记录实际耗时、视频帧数和掉帧数、脚本/布局耗时及进程 CPU。`GPU` 字段是 GPU **进程的 CPU 时间**，不是 GPU 利用率。默认高压场景可能一直占满一核，应同时比较脚本热点、掉帧和合成开销，不能把它换算成用户机器的 CPU 降幅。

## 既有实测

[BewlyCat 4.0.54 实测记录](bewlycat-4.0.54.md)：Windows Chrome、BewlyCat 1.8.0，B 站未登录。
