import { app, ipcMain, type IpcMainEvent, nativeTheme } from 'electron';

import { IPC, type ViewName } from '../shared/protocol';
import type { AgentConnection } from './agent-connection';
import type { Confirmations } from './confirmations';
import type { SessionHub } from './session-hub';
import type { WindowManager } from './windows/window-manager';

interface IpcDeps {
  windows: WindowManager;
  session: SessionHub;
  connection: AgentConnection | null;
  confirmations: Confirmations;
}

/**
 * Every channel accepts messages only from the window it is meant for, and validates its
 * arguments: the renderer is treated as untrusted input.
 */
export function registerIpc({ windows, session, connection, confirmations }: IpcDeps): void {
  const on = (
    channel: string,
    views: readonly ViewName[],
    handler: (event: IpcMainEvent, ...args: unknown[]) => void,
  ) => {
    ipcMain.on(channel, (event, ...args: unknown[]) => {
      const view = windows.viewOf(event.sender);
      if (view && views.includes(view)) handler(event, ...args);
    });
  };
  const both = ['orb', 'panel'] as const;

  on(IPC.ready, both, (event) => {
    session.attach(event.sender);
    windows.sendUi(event.sender);
  });

  // The renderer picks the theme; native chrome (vibrancy, menus) follows its scheme.
  on(IPC.appearance, both, (_event, scheme) => {
    if (scheme === 'light' || scheme === 'dark') nativeTheme.themeSource = scheme;
  });

  on(IPC.send, ['panel'], (_event, text) => {
    if (typeof text !== 'string') return;
    const trimmed = text.trim();
    if (!trimmed || !connection) return;
    connection.send({ type: 'user_message', text: trimmed });
    session.record({ kind: 'user', text: trimmed });
  });

  on(IPC.orbPress, ['orb'], () => windows.orbPress());
  on(IPC.orbDragStart, ['orb'], () => windows.orbDragStart());
  on(IPC.orbRelease, ['orb'], (_event, click) => windows.orbRelease(click === true));
  on(IPC.orbContextMenu, ['orb'], () => windows.showContextMenu());

  on(IPC.composerState, ['panel'], (_event, state) => {
    if (typeof state !== 'object' || state === null) return;
    const { focused, hasDraft } = state as { focused?: unknown; hasDraft?: unknown };
    windows.setComposing(focused === true && hasDraft === true);
  });
  on(IPC.panelHeight, ['panel'], (_event, height) => {
    if (typeof height === 'number' && Number.isFinite(height)) windows.setPanelHeight(height);
  });
  on(IPC.hidePanel, ['panel'], () => windows.dismissPanel());
  on(IPC.confirmAnswer, ['panel'], (_event, callId, accepted) => {
    if (typeof callId === 'string' && typeof accepted === 'boolean') {
      confirmations.answer(callId, accepted);
    }
  });
  on(IPC.quit, both, () => app.quit());
}
