import { nodeResolve } from '@rollup/plugin-node-resolve';
import { babel } from '@rollup/plugin-babel';

const userscriptBanner = `// ==UserScript==
// @name         Bilibili Popup Player - Nano
// @namespace    https://www.bilibili.com/
// @version      3.2.1
// @description  B 站小窗播放合并版：支持首页和播放页推荐视频，网页内弹窗/Chrome Document PiP 两种模式可切换。
// @author       Codex & Cotton
// @match        https://www.bilibili.com/*
// @match        https://space.bilibili.com/*
// @match        https://search.bilibili.com/*
// @run-at       document-idle
// @grant        none
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
