import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import {
  type FaceEvent,
  IPC,
  type UiState,
  type ViewName,
  type YukaBridge,
} from '../shared/protocol';

// Minimal, typed surface for the renderer. No Node or Electron objects leak through.

const viewArg = process.argv.find((arg) => arg.startsWith('--yuka-view='))?.split('=')[1];
const view: ViewName = viewArg === 'orb' ? 'orb' : 'panel';

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const bridge: YukaBridge = {
  view,
  onEvent: (listener) => subscribe<FaceEvent>(IPC.event, listener),
  onUi: (listener) => subscribe<UiState>(IPC.ui, listener),
  onFocusComposer: (listener) => subscribe<void>(IPC.focusComposer, () => listener()),
  ready: () => ipcRenderer.send(IPC.ready),
  sendMessage: (text) => ipcRenderer.send(IPC.send, text),
  setAppearance: (scheme) => ipcRenderer.send(IPC.appearance, scheme),

  orbPress: () => ipcRenderer.send(IPC.orbPress),
  orbDragStart: () => ipcRenderer.send(IPC.orbDragStart),
  orbRelease: (click) => ipcRenderer.send(IPC.orbRelease, click),
  orbContextMenu: () => ipcRenderer.send(IPC.orbContextMenu),

  setComposerState: (state) => ipcRenderer.send(IPC.composerState, state),
  setPanelHeight: (height) => ipcRenderer.send(IPC.panelHeight, height),
  hidePanel: () => ipcRenderer.send(IPC.hidePanel),
  confirmAnswer: (callId, accepted) => ipcRenderer.send(IPC.confirmAnswer, callId, accepted),
  quit: () => ipcRenderer.send(IPC.quit),
};

contextBridge.exposeInMainWorld('yuka', bridge);
