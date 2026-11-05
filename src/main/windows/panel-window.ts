import type { BrowserWindow } from 'electron';

import { createViewWindow, floatAboveEverything, type PageOptions } from './create-window';
import { PANEL_MIN_HEIGHT, PANEL_WIDTH } from '../../shared/geometry';

/**
 * The dialog panel – a sheet of ice: native macOS vibrancy (real blur of whatever is
 * behind it) in a frameless, rounded window. The page adds the tint, edge and highlight.
 * It appears without taking focus (showInactive); a click into it focuses it for typing.
 */
export function createPanelWindow(page: Omit<PageOptions, 'view'>): BrowserWindow {
  const window = createViewWindow(
    { ...page, view: 'panel' },
    {
      width: PANEL_WIDTH,
      height: PANEL_MIN_HEIGHT,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      // 'popover' follows the light/dark appearance set from the theme (HUD stays dark).
      vibrancy: 'popover',
      visualEffectState: 'active',
      roundedCorners: true,
      hasShadow: true,
      resizable: false,
      movable: false, // it follows the orb
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      acceptFirstMouse: true,
    },
  );

  floatAboveEverything(window, 0);
  window.setOpacity(0);
  return window;
}
