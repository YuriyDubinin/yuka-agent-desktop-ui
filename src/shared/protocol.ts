// Wire protocol between the `yuka` agent (C++) and this desktop face.
// Transport: Unix domain socket, one JSON object per line (NDJSON).
// The agent is the server; the face connects to the path from $YUKA_SOCKET.

export interface AgentInfo {
  name: string;
  model: string;
}

/** Messages sent by the agent to the face. */
export type AgentEvent =
  | { type: 'hello'; agent: AgentInfo; greeting: string }
  | { type: 'assistant_start'; id: number }
  | { type: 'assistant_chunk'; id: number; text: string }
  | { type: 'assistant_end'; id: number }
  | { type: 'error'; message: string }
  | { type: 'bye' };

/** Messages sent by the face to the agent. */
export type FaceCommand = { type: 'user_message'; text: string };

export type ConnectionState =
  | 'connecting' // trying to reach the agent socket
  | 'connected'
  | 'disconnected' // connection lost (dev mode keeps retrying)
  | 'no-agent'; // app started without an agent to talk to

/** Events delivered from the main process to the renderer. */
export type FaceEvent =
  | { kind: 'agent'; event: AgentEvent }
  | { kind: 'connection'; state: ConnectionState };

/** API exposed to the renderer as `window.yuka` by the preload script. */
export interface YukaBridge {
  /** Subscribes to events; returns an unsubscribe function. */
  onEvent(listener: (event: FaceEvent) => void): () => void;
  /** Signals that the UI is mounted; main replays the session so far. */
  ready(): void;
  sendMessage(text: string): void;
  /** Aligns native window chrome (macOS vibrancy) with the UI theme. */
  setAppearance(scheme: 'light' | 'dark'): void;
}

export const IPC = {
  event: 'yuka:event',
  ready: 'yuka:ready',
  send: 'yuka:send',
  appearance: 'yuka:appearance',
} as const;

/** Socket used when the agent runs in attach (development) mode: YUKA_FACE=attach. */
export const DEV_SOCKET_PATH = '/tmp/yuka-dev.sock';

export function isAgentEvent(value: unknown): value is AgentEvent {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === 'hello' ||
    type === 'assistant_start' ||
    type === 'assistant_chunk' ||
    type === 'assistant_end' ||
    type === 'error' ||
    type === 'bye'
  );
}
