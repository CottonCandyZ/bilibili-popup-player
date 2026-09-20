import { useEffect, useState, useSyncExternalStore } from 'react';
import { Popover } from '@base-ui/react/popover';
import { Switch } from '@base-ui/react/switch';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { Field } from '@base-ui/react/field';
import { Collapsible } from '@base-ui/react/collapsible';
import { APP, SETTINGS_CLASS as C, STORAGE_ACCENT_THEME, STORAGE_AUTO_PLAY_COUNTDOWN, STORAGE_DIRECT_CLICK, STORAGE_GAMEPAD_CONTROLS, STORAGE_MODE } from './constants.js';
import { ACCENT_PRESETS, getAccentColor, normalizeAccentTheme, normalizeHexColor } from './accent-theme.js';
import { setStorageItem } from './storage.js';
import { Icon, mountReact } from './ui-runtime.jsx';

export function createSettingsUi({ state, getShadowRoot, syncCardButtons, supportsPip, onEnabledChange, onAutoPlayCountdownChange, onGamepadControlsChange, onAccentThemeChange }) {
  let view;
  const listeners = new Set();
  const snapshot = () => ({
    enabled: state.enabled, mode: state.mode, directClick: state.directClick,
    autoPlayCountdown: state.autoPlayCountdown, gamepadControlsEnabled: state.gamepadControlsEnabled,
    accentTheme: state.accentTheme,
    themeStyle: state.themeStyle,
    supportsPip: supportsPip?.() !== false,
    playerOpen: Boolean(state.home.overlay && !state.home.overlay.hidden && !state.home.overlay.classList.contains(`${APP}--hidden`)) ||
      Boolean(state.pip.win && !state.pip.win.closed && state.pip.win.__biliPopupReactUi?.mount?.isConnected),
  });
  let current = snapshot();

  function update(key, value, storageKey, callback) {
    state[key] = value;
    setStorageItem(storageKey, typeof value === 'boolean' ? (value ? '1' : '0') : value);
    callback?.(value);
    sync();
    syncCardButtons();
  }

  function ensure() {
    if (state.settings?.root?.isConnected) return sync();
    destroy();
    const root = document.createElement('div');
    getShadowRoot().appendChild(root);
    state.settings = { root };
    current = snapshot();
    view = mountReact(root, <SettingsControl settings={api} container={root} />);
  }

  function sync() {
    const next = snapshot();
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    current = next;
    listeners.forEach(listener => listener());
  }

  function destroy() {
    view?.dispose();
    view = null;
    state.settings?.root?.remove();
    state.settings = null;
  }

  const api = {
    ensure, sync, destroy,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => current,
    onEnabledChange,
    onModeChange: value => update('mode', value, STORAGE_MODE),
    onDirectChange: value => update('directClick', value, STORAGE_DIRECT_CLICK),
    onCountdownChange: value => update('autoPlayCountdown', value, STORAGE_AUTO_PLAY_COUNTDOWN, onAutoPlayCountdownChange),
    onGamepadChange: value => update('gamepadControlsEnabled', value, STORAGE_GAMEPAD_CONTROLS, onGamepadControlsChange),
    onAccentChange: value => {
      state.accentTheme = normalizeAccentTheme(value);
      setStorageItem(STORAGE_ACCENT_THEME, JSON.stringify(state.accentTheme));
      onAccentThemeChange?.();
      sync();
    },
  };
  return api;
}

export function SettingsControl({ settings, container, variant = 'floating', children }) {
  const state = useSyncExternalStore(settings.subscribe, settings.getSnapshot);
  const player = variant === 'player';
  return <div className={C} data-variant={variant} hidden={!player && state.playerOpen}>
    <Popover.Root modal>
      <Popover.Trigger className={player ? `${APP}__header-button ${APP}__settings-button` : `${C}__button`} aria-label="小窗播放设置" title="小窗播放设置">
        <Icon name="settings" size={player ? 19 : 21} />
      </Popover.Trigger>
      <Popover.Portal container={container} keepMounted={Boolean(children)} className={`${C}__portal`}>
        <Popover.Positioner side={player ? 'bottom' : 'top'} align="end" sideOffset={8} collisionPadding={12} className={`${C}__positioner`}>
          <Popover.Popup className={`${C}__panel`}>
            <Popover.Title className={`${C}__sr-only`}>小窗播放设置</Popover.Title>
            <Setting checked={state.enabled} onChange={settings.onEnabledChange} label="小窗播放" />
            <fieldset className={`${C}__options`} disabled={!state.enabled}>
              <legend className={`${C}__sr-only`}>播放偏好</legend>
              <RadioGroup className={`${C}__modes`} value={state.mode} onValueChange={settings.onModeChange} disabled={!state.enabled} aria-label="播放方式">
                <Radio.Root value="home" className={`${C}__mode`}>网页小窗</Radio.Root>
                <Radio.Root value="pip" className={`${C}__mode`} disabled={!state.supportsPip} title={state.supportsPip ? '独立小窗' : '当前浏览器不支持'}>独立小窗</Radio.Root>
              </RadioGroup>
              <Setting checked={state.directClick} onChange={settings.onDirectChange} disabled={!state.enabled} label="点击封面播放" />
              <Setting checked={state.autoPlayCountdown} onChange={settings.onCountdownChange} disabled={!state.enabled} label="联播倒计时" />
              <Setting checked={state.gamepadControlsEnabled} onChange={settings.onGamepadChange} disabled={!state.enabled} label="手柄控制" />
            </fieldset>
            <AccentPicker theme={state.accentTheme} scheme={state.themeStyle} onChange={settings.onAccentChange} />
            {children && <div className={`${C}__extra`}>{children}</div>}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  </div>;
}

function AccentPicker({ theme, scheme, onChange }) {
  const color = getAccentColor(theme, scheme);
  const preset = ACCENT_PRESETS.find(item => item.id === theme.preset);
  return <Collapsible.Root className={`${C}__palette`}>
    <Collapsible.Trigger className={`${C}__action`}>
      <span>主题配色</span>
      <span className={`${C}__palette-summary`}><i style={{ background: color || 'var(--bili-popup-player-nano-text)' }} />{scheme === 'dark' && theme.darkOverride ? '深色自定义' : preset.label}<Icon name="down" size={15} /></span>
    </Collapsible.Trigger>
    <Collapsible.Panel className={`${C}__palette-panel`}>
      <div className={`${C}__palette-content`}>
        <RadioGroup value={theme.preset} onValueChange={value => onChange({ ...theme, preset: value })} aria-label="主题配色" className={`${C}__palette-presets`}>
          {ACCENT_PRESETS.map(item => <Radio.Root key={item.id} value={item.id} className={`${C}__palette-preset`}>
            <span className={`${C}__swatch`} style={{ background: item.id === 'default' ? 'linear-gradient(135deg, #242424 50%, #f5f5f5 50%)' : item.id === 'custom' ? theme.custom : item.color }} />
            <span>{item.label}</span>
          </Radio.Root>)}
        </RadioGroup>
        <ColorInput label="自定义颜色" name="主题色" value={theme.custom} onChange={custom => onChange({ ...theme, preset: 'custom', custom })} />
        <Setting label="深色单独配色" checked={theme.darkOverride} onChange={darkOverride => onChange({ ...theme, darkOverride })} />
        {theme.darkOverride && <ColorInput label="深色颜色" name="深色主题色" value={theme.darkCustom} onChange={darkCustom => onChange({ ...theme, darkCustom })} />}
      </div>
    </Collapsible.Panel>
  </Collapsible.Root>;
}

function ColorInput({ label, name, value, onChange }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <div className={`${C}__custom-color`}>
    <span>{label}</span>
    <input type="color" value={value} onChange={event => onChange(event.target.value)} aria-label={`选择自定义${name}`} />
    <input type="text" aria-label={`${name}十六进制值`} value={draft} maxLength={7} spellCheck={false}
      onChange={event => { setDraft(event.target.value); if (/^#[\da-f]{6}$/i.test(event.target.value)) onChange(normalizeHexColor(event.target.value)); }}
      onBlur={() => { if (draft === value) return; if (normalizeHexColor(draft)) onChange(normalizeHexColor(draft)); else setDraft(value); }}
      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />
  </div>;
}

function Setting({ checked, onChange, label, disabled }) {
  return <Field.Root className={`${C}__row`} disabled={disabled}>
    <Field.Label>{label}</Field.Label>
    <Switch.Root checked={checked} onCheckedChange={onChange} disabled={disabled} className={`${APP}__switch`}>
      <Switch.Thumb className={`${APP}__switch-thumb`} />
    </Switch.Root>
  </Field.Root>;
}
