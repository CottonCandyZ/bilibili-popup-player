import { createEffect, createSignal, onCleanup } from 'solid-js';
import { render } from 'solid-js/web';
import { APP, SETTINGS_CLASS, STORAGE_DIRECT_CLICK, STORAGE_MODE } from './constants.js';
import { createSettingsIcon } from './icons.js';

export function createSettingsUi({ state, getShadowRoot, syncCardButtons }) {
  const [modeSignal, setModeSignal] = createSignal(state.mode);
  const [directClickSignal, setDirectClickSignal] = createSignal(state.directClick);
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

    menu.append(
      createSettingsLabel('播放模式'),
      createSettingsOption('mode', 'home', '网页内弹窗'),
      createSettingsOption('mode', 'pip', 'Document PiP'),
      createSettingsLabel('封面点击'),
      createSettingsOption('direct', 'off', '按钮起播'),
      createSettingsOption('direct', 'on', '封面起播'),
    );

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
      button.title = `小窗播放设置：${mode === 'pip' ? 'Document PiP' : '网页内弹窗'} / ${directClick ? '封面起播' : '按钮起播'}`;
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
    option.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (type === 'mode') setPlaybackMode(value);
      else if (type === 'direct') setDirectCoverClick(value === 'on');
    });
    createEffect(() => {
      const active = type === 'mode'
        ? modeSignal() === value
        : type === 'direct'
          ? directClickSignal() === (value === 'on')
          : false;
      option.classList.toggle(`${APP}--active`, active);
      option.textContent = active ? `✓ ${text}` : text;
    });
    return option;
  }

  function sync() {
    setModeSignal(state.mode);
    setDirectClickSignal(state.directClick);
    syncCardButtons();
  }

  function setPlaybackMode(value) {
    state.mode = value;
    localStorage.setItem(STORAGE_MODE, value);
    setModeSignal(value);
    syncCardButtons();
  }

  function setDirectCoverClick(value) {
    state.directClick = value;
    localStorage.setItem(STORAGE_DIRECT_CLICK, value ? '1' : '0');
    setDirectClickSignal(value);
    syncCardButtons();
  }

  function destroy() {
    state.settings?.dispose?.();
    state.settings?.root?.remove();
    state.settings = null;
  }

  return { ensure, sync, destroy };
}
