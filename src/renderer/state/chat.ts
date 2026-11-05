import type { AgentEvent, AgentInfo, ConnectionState, FaceEvent } from '../../shared/protocol';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
  /** True while the assistant reply is still streaming in. */
  streaming: boolean;
  /** Wall-clock time the message appeared (ms since epoch). */
  at: number;
}

export interface ChatState {
  connection: ConnectionState;
  agent: AgentInfo | null;
  messages: ChatMessage[];
  /** Sent a message, reply has not started yet. */
  awaitingReply: boolean;
  /** Counter for ids of messages that have none on the wire. */
  localIds: number;
}

/** Every action carries its timestamp so the reducer stays pure. */
export type ChatAction = { type: 'face'; event: FaceEvent; at: number };

export const initialChatState: ChatState = {
  connection: 'connecting',
  agent: null,
  messages: [],
  awaitingReply: false,
  localIds: 0,
};

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

function append(state: ChatState, message: Omit<ChatMessage, 'id'>): ChatState {
  const localIds = state.localIds + 1;
  return {
    ...state,
    localIds,
    messages: [...state.messages, { ...message, id: `local-${localIds}` }],
  };
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
          { id: `reply-${event.id}`, role: 'assistant', text: '', streaming: true, at },
        ],
      };
    case 'assistant_chunk':
      return {
        ...state,
        messages: updateMessage(state.messages, `reply-${event.id}`, (m) => ({
          ...m,
          text: m.text + event.text,
        })),
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
      return append(
        {
          ...state,
          awaitingReply: false,
          messages: state.messages.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
        },
        { role: 'error', text: event.message, streaming: false, at },
      );
    case 'bye':
      return { ...state, connection: 'disconnected', awaitingReply: false };
  }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  const { event, at } = action;
  switch (event.kind) {
    case 'user':
      return append(
        { ...state, awaitingReply: true },
        { role: 'user', text: event.text, streaming: false, at },
      );
    case 'connection':
      return {
        ...state,
        connection: event.state,
        awaitingReply: event.state === 'connected' ? state.awaitingReply : false,
      };
    case 'agent':
      return reduceAgentEvent(state, event.event, at);
  }
}

export function isReplying(state: ChatState): boolean {
  return state.awaitingReply || state.messages.some((m) => m.streaming);
}

export type CoreMood = 'idle' | 'thinking' | 'talking' | 'sleeping' | 'offline';

/** How Yuka's sphere should look right now. */
export function selectMood(state: ChatState): CoreMood {
  if (state.connection === 'no-agent') return 'sleeping';
  if (state.connection !== 'connected') return 'offline';
  if (state.awaitingReply) return 'thinking';
  if (state.messages.some((m) => m.streaming)) return 'talking';
  return 'idle';
}
