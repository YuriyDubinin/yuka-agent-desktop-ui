import path from 'node:path';

import { app } from 'electron';

import { DEV_SOCKET_PATH, PROTOCOL_VERSION } from '../shared/protocol';
import { AgentConnection } from './agent-connection';
import { Confirmations } from './confirmations';
import { registerIpc } from './ipc';
import { SessionHub } from './session-hub';
import { SettingsStore } from './settings-store';
import { UiToolHost } from './tools/ui-tool-host';
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
const confirmations = new Confirmations(session);
const connection = socketPath
  ? new AgentConnection({ socketPath, reconnect: !launchedByAgent })
  : null;

let windows: WindowManager | null = null;
let tools: UiToolHost | null = null;

/** Protocol v2: tell the agent which tools this face offers (sent right after hello). */
function advertiseTools(): void {
  if (!connection || !tools) return;
  connection.send({
    type: 'capabilities',
    protocol: PROTOCOL_VERSION,
    instructions: tools.instructions(),
    tools: tools.definitions(),
  });
}

if (connection) {
  connection.on('state', (state) => {
    session.record({ kind: 'connection', state });
    if (state !== 'connected') confirmations.cancelAll();
    // The agent is gone; there is nothing left to show.
    if (state === 'disconnected' && launchedByAgent) app.quit();
  });
  connection.on('event', (event) => {
    session.record({ kind: 'agent', event });
    // Agents before v2 send no protocol version and would ignore our tools.
    if (event.type === 'hello' && (event.protocol ?? 1) >= 2) advertiseTools();
    // In dev (attach) mode keep running and reconnect when the agent is restarted.
    if (event.type === 'bye' && launchedByAgent) app.quit();
  });
  connection.on('toolCall', (call) => {
    if (!tools) return;
    void tools.execute(call).then((result) => connection.send(result));
  });
} else {
  session.record({ kind: 'connection', state: 'no-agent' });
}

app.whenReady().then(() => {
  // Yuka lives on top of other apps, not in the Dock.
  app.dock?.hide();

  const settings = new SettingsStore(path.join(app.getPath('userData'), 'ui-state.json'));
  const manager = new WindowManager({ settings, rendererUrl });
  windows = manager;
  tools = new UiToolHost({
    controller: manager,
    confirm: (callId, question) => confirmations.ask(callId, question),
    onActivity: ({ callId, title, phase, ok, summary }) =>
      session.record({ kind: 'tool', callId, title, phase, ok, summary }),
  });
  registerIpc({ windows: manager, session, connection, confirmations });

  session.on('busy', (busy) => manager.setBusy(busy));
  session.on('replyFinished', () => manager.replyFinished());

  manager.start();
  connection?.connect();
});

app.on('window-all-closed', () => app.quit());

app.on('before-quit', () => {
  windows?.dispose();
  connection?.close();
});
