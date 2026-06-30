import { nodeResolve } from '@rollup/plugin-node-resolve';
import { babel } from '@rollup/plugin-babel';

const userscriptBanner = `// ==UserScript==
// @name         Bilibili Popup Player
// @namespace    https://www.bilibili.com/
// @version      4.0.22
// @description  B 站小窗播放合并版：支持首页、动态和播放页推荐视频，网页内弹窗/Chrome Document PiP 两种模式可切换。
// @author       Codex & Cotton
// @downloadURL  https://pop-player.nanachi.moe/bilibili-popup-player-nano.user.js
// @updateURL    https://pop-player.nanachi.moe/bilibili-popup-player-nano.user.js
// @match        https://www.bilibili.com/*
// @match        https://space.bilibili.com/*
// @match        https://search.bilibili.com/*
// @match        https://live.bilibili.com/*
// @match        https://t.bilibili.com/*
// @run-at       document-idle
// @grant        GM_deleteValue
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// ==/UserScript==`;

export default {
  input: 'src/main.js',
  plugins: [
    babel({
      babelHelpers: 'bundled',
      extensions: ['.js', '.jsx'],
      presets: [['solid', { generate: 'dom' }]],
    }),
    nodeResolve({ browser: true, extensions: ['.mjs', '.js', '.jsx', '.json'] }),
  ],
  output: {
    file: 'bilibili-popup-player-nano.user.js',
    format: 'iife',
    banner: userscriptBanner,
  },
};
