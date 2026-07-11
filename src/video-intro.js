import { APP } from './constants.js';
import { createCloseIcon } from './icons.js';
import { fetchOwnerProfile } from './owner-profile.js';
import { normalizeResourceUrl } from './video-meta.js';

const RELATION_MODIFY_API = 'https://api.bilibili.com/x/relation/modify';

export function renderVideoIntro({
  targetDocument = document,
  mount,
  bootstrap,
  followBusy = false,
  onFollow,
  actions = null,
  onAction,
}) {
  if (!mount) return;

  cleanupFavoriteDialog(targetDocument);
  const info = getVideoIntroInfo(bootstrap);
  mount.textContent = '';
  mount.hidden = !info.owner.mid && !info.description;
  if (mount.hidden) return;

  mount.className = `${APP}__video-intro`;

  const up = targetDocument.createElement('div');
  up.className = `${APP}__video-intro-up`;

  if (info.owner.face) {
    const avatar = targetDocument.createElement('img');
    avatar.className = `${APP}__video-intro-avatar`;
    avatar.src = info.owner.face;
    avatar.alt = '';
    avatar.loading = 'lazy';
    up.appendChild(avatar);
  }

  const main = targetDocument.createElement('div');
  main.className = `${APP}__video-intro-main`;
  const name = targetDocument.createElement(info.owner.href ? 'a' : 'span');
  name.className = `${APP}__video-intro-name`;
  name.textContent = info.owner.name || 'UP 主';
  if (info.owner.href) {
    name.href = info.owner.href;
    name.target = '_blank';
    name.rel = 'noreferrer';
  }
  main.appendChild(name);

  const meta = targetDocument.createElement('div');
  meta.className = `${APP}__video-intro-meta`;
  meta.textContent = info.meta.join(' · ');
  main.appendChild(meta);

  const body = targetDocument.createElement('div');
  body.className = `${APP}__video-intro-body`;

  if (info.details.length) {
    const details = targetDocument.createElement('div');
    details.className = `${APP}__video-intro-details`;
    info.details.forEach((item) => {
      const detail = targetDocument.createElement('span');
      detail.className = `${APP}__video-intro-detail`;
      detail.title = item.label;
      detail.textContent = item.value;
      details.appendChild(detail);
    });
    body.appendChild(details);
  }

  if (info.owner.sign) {
    const ownerDescription = targetDocument.createElement('div');
    ownerDescription.className = `${APP}__video-intro-owner-description`;
    const sign = targetDocument.createElement('div');
    sign.className = `${APP}__video-intro-owner-desc`;
    sign.textContent = info.owner.sign;
    const toggle = targetDocument.createElement('button');
    toggle.type = 'button';
    toggle.className = `${APP}__video-intro-owner-toggle`;
    toggle.textContent = '展开';
    toggle.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
      const expanded = ownerDescription.classList.toggle(`${APP}--expanded`);
      toggle.textContent = expanded ? '收起' : '展开';
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    });
    ownerDescription.append(sign, toggle);
    body.appendChild(ownerDescription);
    targetDocument.defaultView?.requestAnimationFrame?.(() => {
      toggle.hidden = sign.scrollHeight <= sign.clientHeight + 1;
    });
  }

  if (actions) body.appendChild(renderPlaybackActions(targetDocument, actions, onAction));
  up.appendChild(main);

  if (info.owner.mid) {
    const follow = targetDocument.createElement('button');
    follow.type = 'button';
    follow.className = `${APP}__video-intro-follow`;
    follow.classList.toggle(`${APP}__video-intro-follow--active`, info.followed);
    const label = followBusy ? '处理中' : (info.followed ? '已关注' : '关注');
    follow.dataset.label = label;
    follow.dataset.hoverLabel = info.followed && !followBusy ? '取消关注' : label;
    follow.setAttribute('aria-label', info.followed ? '取消关注 UP 主' : '关注 UP 主');
    follow.disabled = followBusy;
    follow.title = info.followed ? '取消关注 UP 主' : '关注 UP 主';
    follow.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onFollow?.(info.owner.mid, !info.followed);
    });
    up.appendChild(follow);
  }

  mount.appendChild(up);
  if (body.childNodes.length) mount.appendChild(body);

  if (info.description) {
    const description = targetDocument.createElement('div');
    description.className = `${APP}__video-intro-desc`;
    const title = targetDocument.createElement('div');
    title.className = `${APP}__video-intro-desc-title`;
    title.textContent = '视频简介';
    const text = targetDocument.createElement('div');
    text.className = `${APP}__video-intro-desc-text`;
    text.textContent = info.description;
    const toggle = targetDocument.createElement('button');
    toggle.type = 'button';
    toggle.className = `${APP}__video-intro-desc-toggle`;
    toggle.textContent = '展开';
    toggle.hidden = true;
    toggle.addEventListener('click', () => {
      const expanded = description.classList.toggle(`${APP}--expanded`);
      toggle.textContent = expanded ? '收起' : '展开';
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    });
    description.append(title, text, toggle);
    mount.appendChild(description);
    const checkOverflow = () => {
      toggle.hidden = text.scrollHeight <= text.clientHeight + 1;
      toggle.setAttribute('aria-expanded', 'false');
    };
    targetDocument.defaultView?.requestAnimationFrame?.(checkOverflow);
  }
}

function renderPlaybackActions(targetDocument, actions, onAction) {
  const section = targetDocument.createElement('div');
  section.className = `${APP}__video-actions`;

  const row = targetDocument.createElement('div');
  row.className = `${APP}__video-actions-row`;
  const like = createActionButton(targetDocument, {
    active: actions.liked,
    disabled: actions.busy,
    icon: 'like',
    label: actions.liked ? '已点赞' : '点赞',
  });
  like.title = `${like.title}（长按三连）`;
  like.setAttribute('aria-label', `${like.getAttribute('aria-label')}，长按三连`);
  bindLongPress(like, row, () => onAction?.('like'), () => onAction?.('triple'));

  const coin = createActionButton(targetDocument, {
    active: Number(actions.coin) > 0,
    disabled: actions.busy,
    icon: 'coin',
    label: Number(actions.coin) > 0 ? `已投 ${actions.coin} 币` : '投币',
    onClick: () => onAction?.('coin'),
  });
  coin.appendChild(createLongPressRing(targetDocument));

  const favorite = createActionButton(targetDocument, {
    active: actions.favorite,
    disabled: actions.busy,
    icon: 'favorite',
    label: actions.favorite ? '已收藏' : '收藏',
    onClick: () => onAction?.('favorite'),
  });
  favorite.appendChild(createLongPressRing(targetDocument));
  row.append(like, coin, favorite);
  section.appendChild(row);

  if (actions.coinOpen) mountCoinDialog(targetDocument, actions, onAction);
  else if (actions.folderOpen) mountFavoriteDialog(targetDocument, actions, onAction);

  return section;
}

function mountCoinDialog(targetDocument, actions, onAction) {
  const mask = createDialogMask(targetDocument, `${APP}__coin-dialog`, 'close-coin', actions, onAction);
  const panel = targetDocument.createElement('div');
  panel.className = `${APP}__coin-panel`;
  setDialogAttributes(panel, '投币');

  panel.appendChild(createDialogClose(targetDocument, actions.busy, () => onAction?.('close-coin')));
  const title = targetDocument.createElement('div');
  title.className = `${APP}__coin-title`;
  title.append('给UP主投上 ');
  const count = targetDocument.createElement('span');
  count.textContent = String(actions.coinSelected || 1);
  title.append(count, ' 枚硬币');
  panel.appendChild(title);

  const choices = targetDocument.createElement('div');
  choices.className = `${APP}__coin-choices`;
  choices.appendChild(createCoinChoice(targetDocument, 1, actions.coinSelected === 1, onAction));
  if (Number(actions.coinRemaining) > 1) {
    choices.appendChild(createCoinChoice(targetDocument, 2, actions.coinSelected === 2, onAction));
  }
  panel.appendChild(choices);

  const likeLabel = targetDocument.createElement('label');
  likeLabel.className = `${APP}__coin-like`;
  likeLabel.classList.toggle(`${APP}--single`, !actions.coinOriginal);
  const likeCheckbox = targetDocument.createElement('input');
  likeCheckbox.type = 'checkbox';
  likeCheckbox.checked = Boolean(actions.coinAlsoLike);
  likeCheckbox.disabled = actions.busy;
  likeCheckbox.addEventListener('change', () => onAction?.('toggle-coin-like', { checked: likeCheckbox.checked }));
  const likeMark = targetDocument.createElement('i');
  likeLabel.append(likeCheckbox, likeMark, '同时点赞内容');
  panel.appendChild(likeLabel);

  const bottom = targetDocument.createElement('div');
  bottom.className = `${APP}__coin-bottom`;
  const submit = targetDocument.createElement('button');
  submit.type = 'button';
  submit.className = `${APP}__coin-submit`;
  submit.disabled = actions.busy;
  submit.textContent = actions.busy ? '处理中…' : '确定';
  submit.addEventListener('click', () => onAction?.('confirm-coin'));
  const tips = targetDocument.createElement('p');
  tips.className = `${APP}__coin-tips`;
  const exp = Math.max(0, Number(actions.coinExp || 0));
  tips.textContent = exp < 50
    ? `经验值+${10 * Number(actions.coinSelected || 1)}（今日${exp}/50）`
    : '今日投币+50经验成就 get√ 赞！';
  bottom.append(submit, tips);
  panel.appendChild(bottom);
  finishDialogMount(targetDocument, mask, panel, 'close-coin', actions, onAction);
}

function createCoinChoice(targetDocument, value, selected, onAction) {
  const choice = targetDocument.createElement('button');
  choice.type = 'button';
  choice.className = `${APP}__coin-choice ${APP}__coin-choice--${value}`;
  choice.classList.toggle(`${APP}--selected`, selected);
  choice.setAttribute('aria-pressed', selected ? 'true' : 'false');
  choice.addEventListener('click', () => onAction?.('set-coin-count', { value }));
  const animation = targetDocument.createElement('span');
  animation.className = `${APP}__coin-animation`;
  const image = targetDocument.createElement('img');
  image.alt = '';
  image.src = value === 2
    ? 'https://i0.hdslb.com/bfs/static/jinkela/video/asserts/33-coin-ani.png'
    : 'https://i0.hdslb.com/bfs/static/jinkela/video/asserts/22-coin-ani.png';
  animation.appendChild(image);
  const label = targetDocument.createElement('span');
  label.className = `${APP}__coin-choice-label`;
  label.textContent = `${value}硬币`;
  choice.append(animation, label);
  return choice;
}

function mountFavoriteDialog(targetDocument, actions, onAction) {
  const mask = createDialogMask(targetDocument, `${APP}__favorite-dialog`, 'close-favorite', actions, onAction);
  const panel = targetDocument.createElement('div');
  panel.className = `${APP}__favorite-panel`;
  setDialogAttributes(panel, '添加到收藏夹');

  const header = targetDocument.createElement('div');
  header.className = `${APP}__favorite-header`;
  header.textContent = '添加到收藏夹';
  header.appendChild(createDialogClose(targetDocument, actions.busy, () => onAction?.('close-favorite')));
  panel.appendChild(header);

  const content = targetDocument.createElement('div');
  content.className = `${APP}__favorite-content`;
  const list = targetDocument.createElement('div');
  list.className = `${APP}__favorite-list`;
  const selected = new Set((actions.folderDraftIds || []).map(Number));
  const original = new Set((actions.folderOriginalIds || []).map(Number));

  if (actions.folderLoading) {
    list.appendChild(createDialogMessage(targetDocument, '收藏夹加载中…'));
  } else if (!actions.folders?.length) {
    list.appendChild(createDialogMessage(targetDocument, actions.folderError || '暂无可用收藏夹'));
  } else {
    actions.folders.forEach((folder) => {
      const id = Number(folder.id);
      const attr = Number(folder.attr || 0);
      const isPrivate = Boolean(attr & 1);
      const isDefault = ((attr >> 1) & 1) === 0;
      const mediaCount = Number(folder.media_count ?? folder.mediaCount ?? 0);
      const maxCount = Number(folder.max_count || (isDefault ? 50000 : 1000));
      const full = mediaCount >= maxCount && !original.has(id);
      const item = targetDocument.createElement('label');
      item.className = `${APP}__favorite-item`;
      item.classList.toggle(`${APP}--disabled`, full);
      const checkbox = targetDocument.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selected.has(id);
      checkbox.disabled = actions.busy || full || actions.folderAdding;
      checkbox.addEventListener('change', () => onAction?.('toggle-folder', { checked: checkbox.checked, id }));
      const mark = targetDocument.createElement('i');
      const name = targetDocument.createElement('span');
      name.className = `${APP}__favorite-name`;
      name.title = folder.title || '';
      name.textContent = folder.title || '未命名收藏夹';
      item.append(checkbox, mark, name);
      if (isPrivate) {
        const privacy = targetDocument.createElement('span');
        privacy.className = `${APP}__favorite-private`;
        privacy.textContent = '[私密]';
        item.appendChild(privacy);
      }
      const count = targetDocument.createElement('span');
      count.className = `${APP}__favorite-count`;
      const pendingCount = mediaCount + (selected.has(id) ? 1 : 0) - (original.has(id) ? 1 : 0);
      count.textContent = isDefault ? String(pendingCount) : `${pendingCount}/1000`;
      item.appendChild(count);
      list.appendChild(item);
    });
  }

  if (actions.folderAdding) {
    const listMask = targetDocument.createElement('div');
    listMask.className = `${APP}__favorite-list-mask`;
    list.appendChild(listMask);
  }
  content.appendChild(list);
  content.appendChild(createFavoriteNewFolder(targetDocument, actions, onAction));
  if (actions.folderError && actions.folders?.length) {
    content.appendChild(createDialogMessage(targetDocument, actions.folderError, true));
  }
  panel.appendChild(content);

  const footer = targetDocument.createElement('div');
  footer.className = `${APP}__favorite-footer`;
  const submit = targetDocument.createElement('button');
  submit.type = 'button';
  submit.className = `${APP}__favorite-save`;
  submit.textContent = actions.busy ? '保存中…' : '确定';
  submit.disabled = actions.busy || actions.folderLoading || actions.folderAdding || !actions.folderDirty;
  submit.addEventListener('click', () => onAction?.('save-favorite'));
  footer.appendChild(submit);
  panel.appendChild(footer);
  finishDialogMount(targetDocument, mask, panel, 'close-favorite', actions, onAction);
}

function createFavoriteNewFolder(targetDocument, actions, onAction) {
  const wrap = targetDocument.createElement('div');
  wrap.className = `${APP}__favorite-create`;
  if (!actions.folderAdding) {
    const start = targetDocument.createElement('button');
    start.type = 'button';
    start.className = `${APP}__favorite-create-start`;
    start.textContent = '新建收藏夹';
    start.disabled = actions.busy;
    start.addEventListener('click', () => onAction?.('start-create-folder'));
    wrap.appendChild(start);
    return wrap;
  }

  const input = targetDocument.createElement('input');
  input.type = 'text';
  input.autofocus = true;
  input.maxLength = 20;
  input.placeholder = '最多可输入20个字';
  input.value = actions.folderNewTitle || '';
  input.disabled = actions.busy;
  const submit = targetDocument.createElement('button');
  submit.type = 'button';
  submit.textContent = '新建';
  submit.disabled = actions.busy || !input.value.trim();
  input.addEventListener('input', () => {
    submit.disabled = actions.busy || !input.value.trim();
    onAction?.('set-folder-title', { value: input.value });
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onAction?.('cancel-create-folder');
    } else if (event.key === 'Enter' && input.value.trim()) {
      event.preventDefault();
      onAction?.('create-folder');
    }
  });
  input.addEventListener('blur', (event) => {
    if (!wrap.contains(event.relatedTarget)) onAction?.('cancel-create-folder');
  });
  submit.addEventListener('mousedown', (event) => event.preventDefault());
  submit.addEventListener('click', () => onAction?.('create-folder'));
  wrap.append(input, submit);
  return wrap;
}

function createDialogMask(targetDocument, className, closeAction, actions, onAction) {
  const mask = targetDocument.createElement('div');
  mask.className = `${APP}__action-dialog ${className}`;
  mask.addEventListener('mousedown', (event) => {
    if (event.target === mask && !actions.busy) onAction?.(closeAction);
  });
  return mask;
}

function setDialogAttributes(panel, label) {
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', label);
  panel.tabIndex = -1;
}

function createDialogClose(targetDocument, disabled, onClick) {
  const close = targetDocument.createElement('button');
  close.type = 'button';
  close.className = `${APP}__dialog-close`;
  close.setAttribute('aria-label', '关闭');
  close.disabled = Boolean(disabled);
  close.appendChild(createCloseIcon());
  close.addEventListener('click', onClick);
  return close;
}

function createDialogMessage(targetDocument, message, error = false) {
  const node = targetDocument.createElement('div');
  node.className = `${APP}__favorite-message${error ? ` ${APP}--error` : ''}`;
  node.textContent = message;
  return node;
}

function finishDialogMount(targetDocument, mask, panel, closeAction, actions, onAction) {
  mask.appendChild(panel);
  const closeOnEscape = (event) => {
    if (event.key === 'Escape' && !actions.busy) onAction?.(closeAction);
  };
  targetDocument.addEventListener('keydown', closeOnEscape);
  mask.__biliCleanup = () => targetDocument.removeEventListener('keydown', closeOnEscape);
  targetDocument.body.appendChild(mask);
  targetDocument.defaultView?.requestAnimationFrame?.(() => {
    const input = panel.querySelector(`.${APP}__favorite-create input`);
    if (input) input.focus();
    else panel.focus({ preventScroll: true });
  });
}

function createActionButton(targetDocument, {
  active,
  disabled,
  icon,
  label,
  onClick,
}) {
  const button = targetDocument.createElement('button');
  button.type = 'button';
  button.className = `${APP}__video-action`;
  button.classList.toggle(`${APP}--active`, Boolean(active));
  button.disabled = Boolean(disabled);
  button.title = label;
  button.setAttribute('aria-label', label);
  button.appendChild(createOfficialActionIcon(targetDocument, icon));
  const text = targetDocument.createElement('span');
  text.className = `${APP}__video-action-label`;
  text.textContent = label;
  button.appendChild(text);
  if (onClick) button.addEventListener('click', onClick);
  return button;
}

function bindLongPress(button, row, onClick, onLongPress) {
  const thresholdDuration = 800;
  const chargeDuration = 1500;
  let thresholdTimer = 0;
  let chargeTimer = 0;
  let pointerId = null;
  let phase = 'idle';
  let suppressClick = false;

  const reset = () => {
    const view = button.ownerDocument.defaultView;
    if (thresholdTimer) view?.clearTimeout(thresholdTimer);
    if (chargeTimer) view?.clearTimeout(chargeTimer);
    thresholdTimer = 0;
    chargeTimer = 0;
    phase = 'idle';
    row.classList.remove(`${APP}--long-pressing`);
  };
  button.addEventListener('pointerdown', (event) => {
    if (button.disabled || event.button !== 0) return;
    pointerId = event.pointerId;
    phase = 'threshold';
    button.setPointerCapture?.(event.pointerId);
    thresholdTimer = button.ownerDocument.defaultView?.setTimeout(() => {
      thresholdTimer = 0;
      phase = 'charging';
      row.classList.add(`${APP}--long-pressing`);
      chargeTimer = button.ownerDocument.defaultView?.setTimeout(() => {
        chargeTimer = 0;
        phase = 'triggered';
        suppressClick = true;
        row.classList.remove(`${APP}--long-pressing`);
        onLongPress?.();
      }, chargeDuration);
    }, thresholdDuration);
  });
  button.addEventListener('pointerup', (event) => {
    if (pointerId !== event.pointerId) return;
    pointerId = null;
    suppressClick = true;
    const shortClick = phase === 'threshold';
    reset();
    if (shortClick) onClick?.();
  });
  for (const eventName of ['pointercancel', 'lostpointercapture']) {
    button.addEventListener(eventName, () => {
      pointerId = null;
      reset();
    });
  }
  button.addEventListener('click', (event) => {
    if (suppressClick) {
      suppressClick = false;
      event.preventDefault();
      return;
    }
    if (event.detail === 0) onClick?.();
  });
}

function createLongPressRing(targetDocument) {
  const svg = targetDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 42 42');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add(`${APP}__video-action-ring`);
  const circle = targetDocument.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '21');
  circle.setAttribute('cy', '21');
  circle.setAttribute('r', '20');
  svg.appendChild(circle);
  return svg;
}

function cleanupFavoriteDialog(targetDocument) {
  targetDocument.querySelectorAll(`.${APP}__action-dialog`).forEach((dialog) => {
    dialog.__biliCleanup?.();
    dialog.remove();
  });
}

function createOfficialActionIcon(targetDocument, type) {
  const definition = OFFICIAL_ACTION_ICONS[type] || OFFICIAL_ACTION_ICONS.favorite;
  const svg = targetDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', definition.viewBox);
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add(`${APP}__video-action-icon`, `${APP}__video-action-icon--${type}`);
  const path = targetDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute('clip-rule', 'evenodd');
  path.setAttribute('d', definition.path);
  path.setAttribute('fill', 'currentColor');
  svg.appendChild(path);
  return svg;
}

const OFFICIAL_ACTION_ICONS = {
  like: {
    viewBox: '0 0 36 36',
    path: 'M9.77234 30.8573V11.7471H7.54573C5.50932 11.7471 3.85742 13.3931 3.85742 15.425V27.1794C3.85742 29.2112 5.50932 30.8573 7.54573 30.8573H9.77234ZM11.9902 30.8573V11.7054C14.9897 10.627 16.6942 7.8853 17.1055 3.33591C17.2666 1.55463 18.9633 0.814421 20.5803 1.59505C22.1847 2.36964 23.243 4.32583 23.243 6.93947C23.243 8.50265 23.0478 10.1054 22.6582 11.7471H29.7324C31.7739 11.7471 33.4289 13.402 33.4289 15.4435C33.4289 15.7416 33.3928 16.0386 33.3215 16.328L30.9883 25.7957C30.2558 28.7683 27.5894 30.8573 24.528 30.8573H11.9911H11.9902Z',
  },
  coin: {
    viewBox: '0 0 28 28',
    path: 'M14.045 25.5454C7.69377 25.5454 2.54504 20.3967 2.54504 14.0454C2.54504 7.69413 7.69377 2.54541 14.045 2.54541C20.3963 2.54541 25.545 7.69413 25.545 14.0454C25.545 17.0954 24.3334 20.0205 22.1768 22.1771C20.0201 24.3338 17.095 25.5454 14.045 25.5454ZM9.66202 6.81624H18.2761C18.825 6.81624 19.27 7.22183 19.27 7.72216C19.27 8.22248 18.825 8.62807 18.2761 8.62807H14.95V10.2903C17.989 10.4444 20.3766 12.9487 20.3855 15.9916V17.1995C20.3854 17.6997 19.9799 18.1052 19.4796 18.1052C18.9793 18.1052 18.5738 17.6997 18.5737 17.1995V15.9916C18.5667 13.9478 16.9882 12.2535 14.95 12.1022V20.5574C14.95 21.0577 14.5444 21.4633 14.0441 21.4633C13.5437 21.4633 13.1382 21.0577 13.1382 20.5574V12.1022C11.1 12.2535 9.52148 13.9478 9.51448 15.9916V17.1995C9.5144 17.6997 9.10883 18.1052 8.60856 18.1052C8.1083 18.1052 7.70273 17.6997 7.70265 17.1995V15.9916C7.71158 12.9487 10.0992 10.4444 13.1382 10.2903V8.62807H9.66202C9.11309 8.62807 8.66809 8.22248 8.66809 7.72216C8.66809 7.22183 9.11309 6.81624 9.66202 6.81624Z',
  },
  favorite: {
    viewBox: '0 0 28 28',
    path: 'M19.8071 9.26152C18.7438 9.09915 17.7624 8.36846 17.3534 7.39421L15.4723 3.4972C14.8998 2.1982 13.1004 2.1982 12.4461 3.4972L10.6468 7.39421C10.1561 8.36846 9.25639 9.09915 8.19315 9.26152L3.94016 9.91102C2.63155 10.0734 2.05904 11.6972 3.04049 12.6714L6.23023 15.9189C6.96632 16.6496 7.29348 17.705 7.1299 18.7605L6.39381 23.307C6.14844 24.6872 7.62063 25.6614 8.84745 25.0119L12.4461 23.0634C13.4276 22.4951 14.6544 22.4951 15.6359 23.0634L19.2345 25.0119C20.4614 25.6614 21.8518 24.6872 21.6882 23.307L20.8703 18.7605C20.7051 17.705 21.0339 16.6496 21.77 15.9189L24.9597 12.6714C25.9412 11.6972 25.3687 10.0734 24.06 9.91102L19.8071 9.26152Z',
  },
};

export { fetchOwnerProfile };

export async function requestFollowUp(mid, follow = true) {
  const normalizedMid = Number(mid);
  if (!Number.isFinite(normalizedMid) || normalizedMid <= 0) throw new Error('缺少 UP 主 mid');

  const csrf = getCookieValue('bili_jct');
  if (!csrf) throw new Error(follow ? '需要登录后才能关注' : '需要登录后才能取消关注');

  const response = await fetch(RELATION_MODIFY_API, {
    method: 'POST',
    credentials: 'include',
    headers: {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body: new URLSearchParams({
      fid: String(Math.trunc(normalizedMid)),
      act: follow ? '1' : '2',
      re_src: '11',
      csrf,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`请求失败：${response.status}`);
  if (!payload || payload.code !== 0) throw new Error(payload?.message || (follow ? '关注失败' : '取消关注失败'));
  return payload;
}

function getVideoIntroInfo(bootstrap) {
  if (bootstrap?.kind === 'ogv') return getOgvIntroInfo(bootstrap);

  const videoData = bootstrap?.initialState?.videoData || {};
  const owner = videoData.owner || {};
  const mid = Number(owner.mid);
  const description = getDescriptionText(videoData);
  const meta = [];
  const publishedAt = formatDate(videoData.pubdate || videoData.ctime);
  if (publishedAt) meta.push(publishedAt);
  const fans = formatCount(owner.fans);
  if (fans) meta.push(`${fans} 粉丝`);
  const stat = videoData.stat || {};
  const details = [
    buildDetail('播放', stat.view),
    buildDetail('弹幕', stat.danmaku),
    buildDetail('点赞', stat.like),
    buildDetail('投币', stat.coin),
    buildDetail('收藏', stat.favorite),
  ].filter(Boolean);
  const category = String(videoData.tname || '').trim();
  if (category) meta.push(category);
  const pageCount = Number(videoData.videos || videoData.pages?.length || 0);
  if (pageCount > 1) meta.push(`${pageCount}P`);

  return {
    description,
    details,
    followed: videoData.req_user?.attention === true ||
      videoData.req_user?.attention === 1 ||
      videoData.req_user?.attention === '1',
    meta,
    owner: {
      mid: Number.isFinite(mid) && mid > 0 ? mid : 0,
      name: String(owner.name || '').trim(),
      face: normalizeResourceUrl(owner.face, bootstrap?.href || location.href),
      href: Number.isFinite(mid) && mid > 0 ? `https://space.bilibili.com/${Math.trunc(mid)}` : '',
      sign: String(owner.sign || '').trim(),
    },
  };
}

function getOgvIntroInfo(bootstrap) {
  const videoData = bootstrap?.initialState?.videoData || {};
  const season = bootstrap?.initialState?.ogvSeason || videoData.ogv_season || {};
  const episode = bootstrap?.initialState?.ogvCurrentEpisode || videoData.ogv_episode || {};
  const seasonId = season.season_id || bootstrap?.playerInfo?.seasonId || '';
  const title = String(season.title || season.season_title || videoData.title || 'Bilibili 番剧').trim();
  const description = String(season.evaluate || videoData.desc || '').trim();
  const meta = [];
  const rating = season.rating?.score || season.new_ep?.desc;
  if (rating) meta.push(String(rating).trim());
  const stat = season.stat || {};
  const views = formatCount(stat.view ?? stat.views ?? episode.stat?.play);
  if (views) meta.push(`${views} 播放`);
  const follows = formatCount(stat.follow ?? stat.favorites);
  if (follows) meta.push(`${follows} 追番`);
  const styles = Array.isArray(season.styles)
    ? season.styles.map((item) => String(item?.name || item || '').trim()).filter(Boolean).slice(0, 3).join(' / ')
    : '';
  if (styles) meta.push(styles);
  const details = [
    buildDetail('播放', stat.view ?? stat.views ?? episode.stat?.play),
    buildDetail('追番', stat.follow ?? stat.favorites),
    buildDetail('弹幕', stat.danmakus ?? stat.danmaku),
    buildDetail('评分', season.rating?.score, false),
  ].filter(Boolean);
  const episodeCount = Array.isArray(season.episodes) ? season.episodes.length : 0;
  if (episodeCount) meta.push(`${episodeCount} 集`);

  return {
    description,
    details,
    followed: season.user_status?.follow === 1 || season.user_status?.follow_status === 1,
    meta,
    owner: {
      mid: 0,
      name: title,
      face: normalizeResourceUrl(season.square_cover || season.cover || episode.cover, bootstrap?.href || location.href),
      href: seasonId ? `https://www.bilibili.com/bangumi/play/ss${seasonId}` : '',
      sign: String(season.subtitle || season.share_sub_title || '').trim(),
    },
  };
}

function buildDetail(label, value, compact = true) {
  const formatted = compact ? formatCount(value) : String(value || '').trim();
  return formatted ? { label, value: `${formatted} ${label}` } : null;
}

function getDescriptionText(videoData) {
  const desc = String(videoData?.desc || '').trim();
  if (desc) return desc;
  if (!Array.isArray(videoData?.desc_v2)) return '';
  return videoData.desc_v2
    .map((item) => String(item?.raw_text || item?.text || '').trim())
    .filter(Boolean)
    .join('\n');
}

function formatDate(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const date = new Date(seconds * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) return '';
  if (count >= 100000000) return `${trimFixed(count / 100000000)}亿`;
  if (count >= 10000) return `${trimFixed(count / 10000)}万`;
  return String(Math.round(count));
}

function trimFixed(value) {
  return value.toFixed(1).replace(/\.0$/, '');
}

function getCookieValue(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const item = document.cookie
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : '';
}
