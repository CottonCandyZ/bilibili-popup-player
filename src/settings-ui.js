import { createEffect, createSignal, onCleanup } from 'solid-js';
import { render } from 'solid-js/web';
import {
  APP,
  SETTINGS_CLASS,
  STORAGE_AUTO_PLAY_COUNTDOWN,
  STORAGE_DIRECT_CLICK,
  STORAGE_GAMEPAD_CONTROLS,
  STORAGE_MODE,
} from './constants.js';
import { createSettingsIcon } from './icons.js';
import { setStorageItem } from './storage.js';

export function createSettingsUi({ state, getShadowRoot, syncCardButtons, supportsPip, onAutoPlayCountdownChange, onGamepadControlsChange }) {
  const [modeSignal, setModeSignal] = createSignal(state.mode);
  const [directClickSignal, setDirectClickSignal] = createSignal(state.directClick);
  const [autoPlayCountdownSignal, setAutoPlayCountdownSignal] = createSignal(state.autoPlayCountdown);
  const [gamepadControlsSignal, setGamepadControlsSignal] = createSignal(state.gamepadControlsEnabled);
  const [settingsOpen, setSettingsOpen] = createSignal(false);

  function ensure() {
    if (state.settings?.root?.isConnected) {
      sync();
      return;
    }

    const mount = document.createElement('div');
    getShadowRoot().appendChild(mount);
    const dispose = render(() => createSettingsPanel(), mount);
    state.settings = { root: mount, dispose };
    sync();
  }

  function createSettingsPanel() {
    const root = document.createElement('div');
    root.className = SETTINGS_CLASS;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${SETTINGS_CLASS}__button`;
    button.title = '小窗播放设置';
    button.setAttribute('aria-label', '小窗播放设置');
    button.appendChild(createSettingsIcon());

    const menu = document.createElement('div');
    menu.className = `${SETTINGS_CLASS}__menu`;

    const supportsDocumentPip = supportsPip?.() !== false;
    const items = [
      createSettingsLabel('播放模式'),
      createSettingsOption('mode', 'home', '网页内弹窗'),
    ];
    if (supportsDocumentPip) {
      items.push(
        createSettingsOption('mode', 'pip', 'Document PiP'),
        createPipModeHint(),
      );
    }
    items.push(
      createSettingsLabel('封面点击'),
      createSettingsOption('direct', 'off', '按钮起播'),
      createSettingsOption('direct', 'on', '封面起播'),
      createSettingsLabel('自动联播提示'),
      createSettingsOption('countdown', 'on', '显示倒计时'),
      createSettingsOption('countdown', 'off', '隐藏倒计时'),
      createSettingsLabel('手柄控制'),
      createSettingsOption('gamepad', 'on', '启用手柄'),
      createSettingsOption('gamepad', 'off', '禁用手柄'),
    );
    menu.append(...items);

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setSettingsOpen((open) => !open);
    });

    const closeOnDocumentClick = (event) => {
      const path = event.composedPath?.() || [];
      if (!path.includes(root)) setSettingsOpen(false);
    };
    document.addEventListener('click', closeOnDocumentClick, true);
    onCleanup(() => document.removeEventListener('click', closeOnDocumentClick, true));

    createEffect(() => {
      root.classList.toggle(`${APP}--open`, settingsOpen());
    });

    createEffect(() => {
      const mode = modeSignal();
      const directClick = directClickSignal();
      const autoPlayCountdown = autoPlayCountdownSignal();
      const gamepadControls = gamepadControlsSignal();
      button.title = `小窗播放设置：${mode === 'pip' ? 'Document PiP' : '网页内弹窗'} / ${directClick ? '封面起播' : '按钮起播'} / ${autoPlayCountdown ? '显示倒计时' : '隐藏倒计时'} / ${gamepadControls ? '启用手柄' : '禁用手柄'}`;
    });

    root.append(button, menu);
    return root;
  }

  function createSettingsLabel(text) {
    const label = document.createElement('div');
    label.className = `${SETTINGS_CLASS}__label`;
    label.textContent = text;
    return label;
  }

  function createSettingsOption(type, value, text) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = `${SETTINGS_CLASS}__option`;
    option.dataset.type = type;
    option.dataset.value = value;
    if (type === 'mode' && value === 'pip') {
      option.title = '建议保持 PiP 窗口常开，后续切视频会更快';
      option.setAttribute('aria-describedby', `${APP}-pip-mode-hint`);
    }
    option.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (type === 'mode') setPlaybackMode(value);
      else if (type === 'direct') setDirectCoverClick(value === 'on');
      else if (type === 'countdown') setAutoPlayCountdown(value === 'on');
      else if (type === 'gamepad') setGamepadControls(value === 'on');
    });
    createEffect(() => {
      const active = type === 'mode'
        ? modeSignal() === value
        : type === 'direct'
          ? directClickSignal() === (value === 'on')
          : type === 'countdown'
            ? autoPlayCountdownSignal() === (value === 'on')
            : type === 'gamepad'
              ? gamepadControlsSignal() === (value === 'on')
              : false;
      option.classList.toggle(`${APP}--active`, active);
      option.textContent = active ? `✓ ${text}` : text;
    });
    return option;
  }

  function createPipModeHint() {
    const hint = document.createElement('div');
    hint.id = `${APP}-pip-mode-hint`;
    hint.className = `${SETTINGS_CLASS}__hint`;
    hint.textContent = '建议保持 PiP 窗口常开，后续切视频会直接换源，关闭后再打开会重新初始化。';
    createEffect(() => {
      hint.hidden = modeSignal() !== 'pip';
    });
    return hint;
  }

  function sync() {
    setModeSignal(state.mode);
    setDirectClickSignal(state.directClick);
    setAutoPlayCountdownSignal(state.autoPlayCountdown);
    setGamepadControlsSignal(state.gamepadControlsEnabled);
    syncCardButtons();
  }

  function setPlaybackMode(value) {
    if (value === 'pip' && supportsPip?.() === false) value = 'home';
    state.mode = value;
    setStorageItem(STORAGE_MODE, value);
    setModeSignal(value);
    syncCardButtons();
  }

  function setDirectCoverClick(value) {
    state.directClick = value;
    setStorageItem(STORAGE_DIRECT_CLICK, value ? '1' : '0');
    setDirectClickSignal(value);
    syncCardButtons();
  }

  function setAutoPlayCountdown(value) {
    state.autoPlayCountdown = value;
    setStorageItem(STORAGE_AUTO_PLAY_COUNTDOWN, value ? '1' : '0');
    setAutoPlayCountdownSignal(value);
    onAutoPlayCountdownChange?.(value);
  }

  function setGamepadControls(value) {
    state.gamepadControlsEnabled = value;
    setStorageItem(STORAGE_GAMEPAD_CONTROLS, value ? '1' : '0');
    setGamepadControlsSignal(value);
    onGamepadControlsChange?.(value);
  }

  function destroy() {
    state.settings?.dispose?.();
    state.settings?.root?.remove();
    state.settings = null;
  }

  return { ensure, sync, destroy };
}
