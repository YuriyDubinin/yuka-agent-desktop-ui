import path from 'node:path';

import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron';

import { DEV_SOCKET_PATH, type FaceEvent, IPC } from '../shared/protocol';
import { AgentConnection } from './agent-connection';

// When the agent launches us it passes its socket via $YUKA_SOCKET; in that case the app's
// lifetime is tied to the agent. Without it (dev) we attach to the dev socket and retry.
const agentSocket = process.env.YUKA_SOCKET;
const launchedByAgent = Boolean(agentSocket);
const rendererUrl = process.env.YUKA_RENDERER_URL;
const socketPath = agentSocket ?? (app.isPackaged ? undefined : DEV_SOCKET_PATH);

app.setName('Юка');

let mainWindow: BrowserWindow | null = null;
let rendererReady = false;

// Everything sent to the renderer is recorded so a reload (dev) can replay the session.
const sessionLog: FaceEvent[] = [];

function deliver(event: FaceEvent): void {
  sessionLog.push(event);
  if (rendererReady && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC.event, event);
  }
}

const connection = socketPath
  ? new AgentConnection({ socketPath, reconnect: !launchedByAgent })
  : null;

if (connection) {
  connection.on('state', (state) => {
    deliver({ kind: 'connection', state });
    if (state === 'disconnected' && launchedByAgent) {
      // The agent is gone; this window has nothing left to show.
      app.quit();
    }
  });
  connection.on('event', (event) => {
    deliver({ kind: 'agent', event });
    // In dev (attach) mode keep the window and reconnect when the agent is restarted.
    if (event.type === 'bye' && launchedByAgent) app.quit();
  });
} else {
  deliver({ kind: 'connection', state: 'no-agent' });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 780,
    minWidth: 400,
    minHeight: 560,
    show: false,
    title: 'Юка',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 22 },
    // Native macOS glass under the (slightly translucent) living background.
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // Keep navigation inside the app; open external links in the default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault();
  });

  // Surface renderer warnings/errors in stdout (the agent writes it to /tmp/yuka-face-*.log).
  mainWindow.webContents.on('console-message', ({ level, message, sourceId, lineNumber }) => {
    if (level === 'warning' || level === 'error') {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${lineNumber})`);
    }
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.log(`[renderer] process gone: ${details.reason}`);
  });

  mainWindow.webContents.on('did-start-loading', () => {
    rendererReady = false;
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    rendererReady = false;
  });

  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

ipcMain.on(IPC.ready, (event) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return;
  rendererReady = true;
  for (const item of sessionLog) event.sender.send(IPC.event, item);
});

// The renderer picks the theme; native chrome (vibrancy, menus) follows its scheme.
ipcMain.on(IPC.appearance, (event, scheme: unknown) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return;
  if (scheme === 'light' || scheme === 'dark') nativeTheme.themeSource = scheme;
});

ipcMain.on(IPC.send, (event, text: unknown) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return;
  if (typeof text !== 'string') return;
  const trimmed = text.trim();
  if (trimmed) connection?.send({ type: 'user_message', text: trimmed });
});

app.whenReady().then(() => {
  createWindow();
  connection?.connect();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Yuka is a single-window chat: closing the window ends the session (and the agent).
app.on('window-all-closed', () => app.quit());

app.on('before-quit', () => connection?.close());
