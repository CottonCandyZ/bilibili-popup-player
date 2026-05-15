import { nodeResolve } from '@rollup/plugin-node-resolve';

const userscriptBanner = `// ==UserScript==
// @name         Bilibili Popup Player - Nano
// @namespace    https://www.bilibili.com/
// @version      0.2.0
// @description  B 站小窗播放合并版：支持首页和播放页推荐视频，网页内弹窗/Chrome Document PiP 两种模式可切换。
// @author       Codex
// @match        https://www.bilibili.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==`;

export default {
  input: 'src/main.js',
  plugins: [nodeResolve({ browser: true })],
  output: {
    file: 'bilibili-popup-player-nano.user.js',
    format: 'iife',
    banner: userscriptBanner,
  },
};
