import { nodeResolve } from '@rollup/plugin-node-resolve';
import { babel } from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import { getUserscriptHeader, validateUserscript } from './scripts/validate-userscript.mjs';
import { fileURLToPath } from 'node:url';
import { readThirdPartyNotices } from './scripts/third-party-notices.mjs';

const thirdPartyNotices = readThirdPartyNotices(fileURLToPath(new URL('./package.json', import.meta.url)));

const userscriptBanner = `// ==UserScript==
// @name         Bilibili Popup Player
// @namespace    https://www.bilibili.com/
// @version      4.0.47
// @description  B 站小窗播放：支持网页小窗和 Document PiP，提供评论、播放列表、主题配色与迷你播放。
// @author       Codex & Cotton
// @license      AGPL-3.0-only
// @homepageURL  https://github.com/CottonCandyZ/bilibili-popup-player
// @downloadURL  https://pop-player.nanachi.moe/bilibili-popup-player-nano.user.js
// @updateURL    https://pop-player.nanachi.moe/bilibili-popup-player-nano.meta.js
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
  onwarn(warning, warn) {
    // This is a browser userscript bundle; React server boundaries do not apply.
    if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client')) return;
    warn(warning);
  },
  plugins: [
    replace({ preventAssignment: true, 'process.env.NODE_ENV': JSON.stringify('production') }),
    babel({
      babelHelpers: 'bundled',
      extensions: ['.js', '.jsx'],
      exclude: 'node_modules/**',
      presets: [['@babel/preset-react', { runtime: 'automatic' }]],
    }),
    nodeResolve({ browser: true, extensions: ['.mjs', '.js', '.jsx', '.json'] }),
    commonjs(),
    // Keep installable metadata first and license texts in separate files.
    terser({ format: { comments: false, preamble: userscriptBanner } }),
    {
      name: 'validate-userscript-artifact',
      generateBundle(_options, bundle) {
        this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_NOTICES.txt', source: thirdPartyNotices });
        for (const artifact of Object.values(bundle)) {
          if (artifact.type !== 'chunk') continue;
          validateUserscript(artifact.code, artifact.fileName);
          this.emitFile({
            type: 'asset',
            fileName: artifact.fileName.replace(/\.user\.js$/, '.meta.js'),
            source: `${getUserscriptHeader(artifact.code, artifact.fileName)}\n`,
          });
        }
      },
    },
  ],
  output: {
    file: 'bilibili-popup-player-nano.user.js',
    format: 'iife',
  },
};
