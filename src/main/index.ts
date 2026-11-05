import path from 'node:path';

import { app } from 'electron';

import { DEV_SOCKET_PATH } from '../shared/protocol';
import { AgentConnection } from './agent-connection';
import { registerIpc } from './ipc';
import { SessionHub } from './session-hub';
import { SettingsStore } from './settings-store';
import { WindowManager } from './windows/window-manager';

// When the agent launches us it passes its socket via $YUKA_SOCKET; in that case the app's
// lifetime is tied to the agent. Without it (dev) we attach to the dev socket and retry.
const agentSocket = process.env.YUKA_SOCKET;
const launchedByAgent = Boolean(agentSocket);
const rendererUrl = process.env.YUKA_RENDERER_URL;
const socketPath = agentSocket ?? (app.isPackaged ? undefined : DEV_SOCKET_PATH);

app.setName('Юка');

// One face per agent session.
if (!app.requestSingleInstanceLock()) app.quit();

const session = new SessionHub();
const connection = socketPath
  ? new AgentConnection({ socketPath, reconnect: !launchedByAgent })
  : null;

if (connection) {
  connection.on('state', (state) => {
    session.record({ kind: 'connection', state });
    // The agent is gone; there is nothing left to show.
    if (state === 'disconnected' && launchedByAgent) app.quit();
  });
  connection.on('event', (event) => {
    session.record({ kind: 'agent', event });
    // In dev (attach) mode keep running and reconnect when the agent is restarted.
    if (event.type === 'bye' && launchedByAgent) app.quit();
  });
} else {
  session.record({ kind: 'connection', state: 'no-agent' });
}

let windows: WindowManager | null = null;

app.whenReady().then(() => {
  // Yuka lives on top of other apps, not in the Dock.
  app.dock?.hide();

  const settings = new SettingsStore(path.join(app.getPath('userData'), 'ui-state.json'));
  windows = new WindowManager({ settings, rendererUrl });
  registerIpc({ windows, session, connection });

  session.on('busy', (busy) => windows?.setBusy(busy));
  session.on('replyFinished', () => windows?.replyFinished());

  windows.start();
  connection?.connect();
});

app.on('window-all-closed', () => app.quit());

app.on('before-quit', () => {
  windows?.dispose();
  connection?.close();
});
