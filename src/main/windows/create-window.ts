import path from 'node:path';

import { BrowserWindow, type BrowserWindowConstructorOptions, shell } from 'electron';

import type { ThemeMode, ViewName } from '../../shared/protocol';

export interface PageOptions {
  view: ViewName;
  /** Painted before React mounts, so the window never flashes the wrong theme. */
  themeMode: ThemeMode;
  /** Dev server URL (npm run dev); otherwise the bundled index.html is loaded. */
  rendererUrl?: string;
}

/** Creates a window running one view of the renderer, with the app's security defaults. */
export function createViewWindow(
  page: PageOptions,
  options: BrowserWindowConstructorOptions,
): BrowserWindow {
  const window = new BrowserWindow({
    ...options,
    show: false,
    title: 'Юка',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      // The orb keeps breathing while another app is in front.
      backgroundThrottling: false,
      additionalArguments: [`--yuka-view=${page.view}`],
    },
  });

  const { webContents } = window;

  // Keep navigation inside the app; open external links in the default browser.
  webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  webContents.on('will-navigate', (event, url) => {
    if (url !== webContents.getURL()) event.preventDefault();
  });

  // Surface renderer warnings/errors in stdout (the agent writes it to /tmp/yuka-face-*.log).
  webContents.on('console-message', ({ level, message, sourceId, lineNumber }) => {
    if (level === 'warning' || level === 'error') {
      console.log(`[${page.view}:${level}] ${message} (${sourceId}:${lineNumber})`);
    }
  });
  webContents.on('render-process-gone', (_event, details) => {
    console.log(`[${page.view}] renderer gone: ${details.reason}`);
  });

  const query = { view: page.view, theme: page.themeMode };
  if (page.rendererUrl) {
    void window.loadURL(`${page.rendererUrl}?${new URLSearchParams(query)}`);
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'), { query });
  }
  return window;
}

/** Shared by both windows: float above everything, on every Space, even full-screen ones. */
export function floatAboveEverything(window: BrowserWindow, relativeLevel = 0): void {
  window.setAlwaysOnTop(true, 'floating', relativeLevel);
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}
