import type { BrowserWindow } from 'electron';

import { createViewWindow, floatAboveEverything, type PageOptions } from './create-window';
import { ORB_WINDOW_SIZE, type Rect } from '../../shared/geometry';

/**
 * The orb: a fully transparent, frameless square with the glass sphere painted in the
 * middle. No vibrancy and no shadow – nothing but the sphere and its halo is visible.
 * Clicks pass through the whole window except the sphere itself (see WindowManager).
 */
export function createOrbWindow(page: Omit<PageOptions, 'view'>, bounds: Rect): BrowserWindow {
  const window = createViewWindow(
    { ...page, view: 'orb' },
    {
      ...bounds,
      width: ORB_WINDOW_SIZE,
      height: ORB_WINDOW_SIZE,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false, // moved by WindowManager while dragging
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      // Clicking the sphere must not steal focus from the app the user works in.
      focusable: false,
      acceptFirstMouse: true,
      roundedCorners: false,
    },
  );

  // Above the panel, so the halo glows over its edge.
  floatAboveEverything(window, 1);
  window.setIgnoreMouseEvents(true, { forward: true });
  window.once('ready-to-show', () => window.showInactive());
  return window;
}
