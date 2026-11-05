import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import { type FaceEvent, IPC, type YukaBridge } from '../shared/protocol';

// Minimal, typed surface for the renderer. No Node or Electron objects leak through.
const bridge: YukaBridge = {
  onEvent(listener) {
    const handler = (_event: IpcRendererEvent, payload: FaceEvent) => listener(payload);
    ipcRenderer.on(IPC.event, handler);
    return () => {
      ipcRenderer.removeListener(IPC.event, handler);
    };
  },
  ready() {
    ipcRenderer.send(IPC.ready);
  },
  sendMessage(text) {
    ipcRenderer.send(IPC.send, text);
  },
  setAppearance(scheme) {
    ipcRenderer.send(IPC.appearance, scheme);
  },
};

contextBridge.exposeInMainWorld('yuka', bridge);
