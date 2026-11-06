// Wire protocol between the `yuka` agent (C++) and this desktop face.
// Transport: Unix domain socket, one JSON object per line (NDJSON).
// The agent is the server; the face connects to the path from $YUKA_SOCKET.
// Specification: ../yuka-agent/docs/face-protocol.md (version 2 adds tools, MCP-shaped).

/** The protocol version this face speaks. */
export const PROTOCOL_VERSION = 2;

export interface AgentInfo {
  name: string;
  model: string;
}

/** Conversation messages sent by the agent to the face (they make up the transcript). */
export type AgentEvent =
  | { type: 'hello'; agent: AgentInfo; greeting: string; protocol?: number }
  | { type: 'assistant_start'; id: number }
  | { type: 'assistant_chunk'; id: number; text: string }
  | { type: 'assistant_end'; id: number }
  | { type: 'error'; message: string }
  | { type: 'bye' };

/** The agent asks the face to run one of its tools (v2). Handled in main, not shown as chat. */
export interface ToolCall {
  type: 'tool_call';
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Everything the agent can send. */
export type AgentMessage = AgentEvent | ToolCall;

// ------------------------------------------------------------------ tools (v2, MCP-shaped)

/** JSON Schema subset used by tool arguments (see src/main/tools/schema.ts). */
export interface JsonSchema {
  type?: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array';
  description?: string;
  enum?: readonly (string | number | boolean)[];
  properties?: Record<string, JsonSchema>;
  required?: readonly string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
}

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  /** Irreversible or very noticeable: the face asks the user before running it. */
  destructiveHint?: boolean;
  idempotentHint?: boolean;
}

/** A tool as advertised to the agent (field names as in MCP `tools/list`). */
export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema & { type: 'object' };
  annotations: ToolAnnotations;
}

export interface ToolResultContent {
  type: 'text';
  text: string;
}

/** Messages sent by the face to the agent. */
export type FaceCommand =
  | { type: 'user_message'; text: string }
  | { type: 'capabilities'; protocol: number; instructions: string; tools: ToolDefinition[] }
  | { type: 'tool_result'; id: string; content: ToolResultContent[]; isError: boolean };

export type ConnectionState =
  | 'connecting' // trying to reach the agent socket
  | 'connected'
  | 'disconnected' // connection lost (dev mode keeps retrying)
  | 'no-agent'; // app started without an agent to talk to

/**
 * The conversation as seen by every window. Main records these in order and replays them
 * to a window that (re)loads, so the orb and the panel always share one transcript.
 */
export type FaceEvent =
  | { kind: 'agent'; event: AgentEvent }
  | { kind: 'connection'; state: ConnectionState }
  | { kind: 'user'; text: string }
  /** Yuka runs one of the face's tools: shown as a quiet line in the transcript. */
  | {
      kind: 'tool';
      callId: string;
      title: string;
      phase: 'start' | 'end';
      ok?: boolean;
      summary?: string;
    }
  /** A destructive tool waits for the user's "yes" (see confirmAnswer). */
  | {
      kind: 'confirm';
      callId: string;
      question: string;
      phase: 'ask' | 'answered';
      accepted?: boolean;
    };

// ------------------------------------------------------------------ UI (main ↔ windows)

export type ThemeName = 'morning' | 'day' | 'evening' | 'night';
export type ThemeMode = ThemeName | 'auto';
export const THEME_MODES: readonly ThemeMode[] = ['auto', 'morning', 'day', 'evening', 'night'];

/** Which window a page is rendered in (`index.html?view=…`). */
export type ViewName = 'orb' | 'panel';

/** Visibility of the dialog panel (see src/main/presence.ts). */
export type PresencePhase = 'hidden' | 'shown' | 'lingering' | 'fading';

/** Where the panel sits relative to the orb – the direction its animations come from. */
export type PanelPlacement = 'left' | 'right' | 'above' | 'below';

/** UI state owned by main and mirrored into both windows. */
export interface UiState {
  presence: PresencePhase;
  pinned: boolean;
  /** A reply arrived while the panel was hidden. */
  unread: boolean;
  /** The pointer is over the orb. */
  orbHover: boolean;
  /** The orb is being dragged. */
  dragging: boolean;
  placement: PanelPlacement;
  themeMode: ThemeMode;
}

/** What the composer tells main, so the panel does not vanish under the user's hands. */
export interface ComposerState {
  focused: boolean;
  hasDraft: boolean;
}

/** API exposed to the renderer as `window.yuka` by the preload script. */
export interface YukaBridge {
  /** Which window this page lives in. */
  readonly view: ViewName;
  /** Subscribes to conversation events; returns an unsubscribe function. */
  onEvent(listener: (event: FaceEvent) => void): () => void;
  /** Subscribes to UI state; returns an unsubscribe function. */
  onUi(listener: (state: UiState) => void): () => void;
  /** Main asks the panel to put the caret into the composer (e.g. after ⌥Space). */
  onFocusComposer(listener: () => void): () => void;
  /** Signals that the UI is mounted; main replays the session and the UI state. */
  ready(): void;
  sendMessage(text: string): void;
  /** Aligns native window chrome (macOS vibrancy) with the UI theme. */
  setAppearance(scheme: 'light' | 'dark'): void;

  // Orb
  orbPress(): void; // pointer went down on the sphere (a drag may follow)
  orbDragStart(): void; // the pointer moved far enough: it is a drag
  orbRelease(click: boolean): void; // pointer up; `click` when it did not move
  orbContextMenu(): void;

  // Panel
  setComposerState(state: ComposerState): void;
  /** Preferred height of the panel content in CSS pixels. */
  setPanelHeight(height: number): void;
  hidePanel(): void;
  /** The user's answer to a `confirm` event. */
  confirmAnswer(callId: string, accepted: boolean): void;
  quit(): void;
}

export const IPC = {
  event: 'yuka:event',
  ui: 'yuka:ui',
  focusComposer: 'yuka:focus-composer',
  ready: 'yuka:ready',
  send: 'yuka:send',
  appearance: 'yuka:appearance',
  orbPress: 'yuka:orb-press',
  orbDragStart: 'yuka:orb-drag-start',
  orbRelease: 'yuka:orb-release',
  orbContextMenu: 'yuka:orb-context-menu',
  composerState: 'yuka:composer-state',
  panelHeight: 'yuka:panel-height',
  hidePanel: 'yuka:hide-panel',
  confirmAnswer: 'yuka:confirm-answer',
  quit: 'yuka:quit',
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

/** A well-formed `tool_call`; anything else of that type is answered with an error. */
export function isToolCall(value: unknown): value is ToolCall {
  if (typeof value !== 'object' || value === null) return false;
  const call = value as Partial<Record<keyof ToolCall, unknown>>;
  return (
    call.type === 'tool_call' &&
    typeof call.id === 'string' &&
    call.id.length > 0 &&
    typeof call.name === 'string' &&
    typeof call.arguments === 'object' &&
    call.arguments !== null &&
    !Array.isArray(call.arguments)
  );
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value);
}
