import { createElement, ArrowUp, ChevronLeft, ChevronRight, ExternalLink, Gamepad2, Maximize, Minimize, PanelRight, PictureInPicture2, Repeat2, RotateCcw, Settings, X } from 'lucide';

function createIcon(node) {
  return createElement(node, { width: 20, height: 20, 'stroke-width': 2, 'aria-hidden': 'true' });
}

export const createSettingsIcon = () => createIcon(Settings);
export const createExternalLinkIcon = () => createIcon(ExternalLink);
export const createHistoryBackIcon = () => createIcon(ChevronLeft);
export const createHistoryForwardIcon = () => createIcon(ChevronRight);
export const createMaximizeIcon = () => createIcon(Maximize);
export const createMinimizeIcon = () => createIcon(Minimize);
export const createPictureInPictureIcon = () => createIcon(PictureInPicture2);
export const createAutoPlayIcon = () => createIcon(Repeat2);
export const createResetSizeIcon = () => createIcon(RotateCcw);
export const createFitLayoutIcon = () => createIcon(PanelRight);
export const createGamepadIcon = () => createIcon(Gamepad2);
export const createCloseIcon = () => createIcon(X);
export const externalLinkIconMarkup = () => createExternalLinkIcon().outerHTML;
export const arrowUpIconMarkup = () => createIcon(ArrowUp).outerHTML;
