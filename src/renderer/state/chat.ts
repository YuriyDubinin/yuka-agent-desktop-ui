import type { AgentEvent, AgentInfo, ConnectionState, FaceEvent } from '../../shared/protocol';

export interface ReplyMetrics {
  /** Streamed chunks (Ollama sends roughly one token per chunk). */
  chunks: number;
  /** ms from the user's message to the first chunk. */
  latencyMs: number | null;
  firstChunkAt: number | null;
  lastChunkAt: number | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
  /** True while the assistant reply is still streaming in. */
  streaming: boolean;
  /** Wall-clock time the message appeared (ms since epoch). */
  at: number;
  metrics?: ReplyMetrics;
}

export interface ChatState {
  connection: ConnectionState;
  agent: AgentInfo | null;
  messages: ChatMessage[];
  /** Sent a message, reply has not started yet. */
  awaitingReply: boolean;
  /** When the last user message was sent (for latency). */
  lastSentAt: number | null;
}

/** Every action carries its timestamp so the reducer stays pure. */
export type ChatAction =
  | { type: 'face'; event: FaceEvent; at: number }
  | { type: 'user_sent'; text: string; at: number };

export const initialChatState: ChatState = {
  connection: 'connecting',
  agent: null,
  messages: [],
  awaitingReply: false,
  lastSentAt: null,
};

let localId = 0;
const nextLocalId = () => `local-${++localId}`;

function updateMessage(
  messages: ChatMessage[],
  id: string,
  update: (message: ChatMessage) => ChatMessage,
): ChatMessage[] {
  const index = messages.findIndex((m) => m.id === id);
  if (index === -1) return messages;
  const copy = messages.slice();
  copy[index] = update(copy[index]);
  return copy;
}

function reduceAgentEvent(state: ChatState, event: AgentEvent, at: number): ChatState {
  switch (event.type) {
    case 'hello':
      // A new session: start the transcript with the greeting.
      return {
        ...state,
        agent: event.agent,
        awaitingReply: false,
        messages: [
          { id: 'greeting', role: 'assistant', text: event.greeting, streaming: false, at },
        ],
      };
    case 'assistant_start':
      return {
        ...state,
        awaitingReply: false,
        messages: [
          ...state.messages,
          {
            id: `reply-${event.id}`,
            role: 'assistant',
            text: '',
            streaming: true,
            at,
            metrics: { chunks: 0, latencyMs: null, firstChunkAt: null, lastChunkAt: null },
          },
        ],
      };
    case 'assistant_chunk':
      return {
        ...state,
        messages: updateMessage(state.messages, `reply-${event.id}`, (m) => {
          const metrics = m.metrics ?? {
            chunks: 0,
            latencyMs: null,
            firstChunkAt: null,
            lastChunkAt: null,
          };
          const first = metrics.firstChunkAt ?? at;
          return {
            ...m,
            text: m.text + event.text,
            metrics: {
              chunks: metrics.chunks + 1,
              firstChunkAt: first,
              lastChunkAt: at,
              latencyMs:
                metrics.latencyMs ?? (state.lastSentAt !== null ? first - state.lastSentAt : null),
            },
          };
        }),
      };
    case 'assistant_end':
      return {
        ...state,
        messages: updateMessage(state.messages, `reply-${event.id}`, (m) => ({
          ...m,
          streaming: false,
        })),
      };
    case 'error':
      return {
        ...state,
        awaitingReply: false,
        messages: [
          ...state.messages.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
          { id: nextLocalId(), role: 'error', text: event.message, streaming: false, at },
        ],
      };
    case 'bye':
      return { ...state, connection: 'disconnected', awaitingReply: false };
  }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  if (action.type === 'user_sent') {
    return {
      ...state,
      awaitingReply: true,
      lastSentAt: action.at,
      messages: [
        ...state.messages,
        { id: nextLocalId(), role: 'user', text: action.text, streaming: false, at: action.at },
      ],
    };
  }

  const { event } = action;
  if (event.kind === 'connection') {
    return {
      ...state,
      connection: event.state,
      awaitingReply: event.state === 'connected' ? state.awaitingReply : false,
    };
  }
  return reduceAgentEvent(state, event.event, action.at);
}

export function isReplying(state: ChatState): boolean {
  return state.awaitingReply || state.messages.some((m) => m.streaming);
}

export interface Telemetry {
  tokensPerSecond: number | null;
  latencySeconds: number | null;
  /** Total chunks in the streaming / latest reply – drives the core's pulse. */
  activity: number;
  live: boolean;
}

/** Metrics of the latest reply (live while it streams). */
export function selectTelemetry(state: ChatState): Telemetry {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i];
    if (m.role !== 'assistant' || !m.metrics) continue;
    const { chunks, firstChunkAt, lastChunkAt, latencyMs } = m.metrics;
    const seconds =
      firstChunkAt !== null && lastChunkAt !== null ? (lastChunkAt - firstChunkAt) / 1000 : 0;
    return {
      tokensPerSecond: chunks > 4 && seconds > 0.2 ? chunks / seconds : null,
      latencySeconds: latencyMs !== null ? latencyMs / 1000 : null,
      activity: chunks,
      live: m.streaming,
    };
  }
  return { tokensPerSecond: null, latencySeconds: null, activity: 0, live: false };
}
