import { EventEmitter } from 'node:events';
import net from 'node:net';

import {
  type AgentEvent,
  type ConnectionState,
  type FaceCommand,
  isAgentEvent,
} from '../shared/protocol';

interface AgentConnectionEvents {
  state: [ConnectionState];
  event: [AgentEvent];
}

interface AgentConnectionOptions {
  socketPath: string;
  /** Keep reconnecting after a disconnect (dev/attach mode). */
  reconnect: boolean;
  reconnectDelayMs?: number;
}

/** NDJSON client for the agent's Unix domain socket. */
export class AgentConnection extends EventEmitter<AgentConnectionEvents> {
  private socket: net.Socket | null = null;
  private buffer = '';
  private state: ConnectionState = 'connecting';
  private retryTimer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(private readonly options: AgentConnectionOptions) {
    super();
  }

  get currentState(): ConnectionState {
    return this.state;
  }

  connect(): void {
    if (this.closed) return;
    this.setState('connecting');

    const socket = net.createConnection(this.options.socketPath);
    socket.setEncoding('utf8');
    this.socket = socket;

    socket.on('connect', () => this.setState('connected'));
    socket.on('data', (chunk: string) => this.onData(chunk));
    socket.on('error', () => {
      // 'close' follows and handles the state change.
    });
    socket.on('close', () => {
      this.socket = null;
      this.buffer = '';
      if (this.closed) return;
      this.setState('disconnected');
      if (this.options.reconnect) {
        this.retryTimer = setTimeout(() => this.connect(), this.options.reconnectDelayMs ?? 1500);
      }
    });
  }

  send(command: FaceCommand): void {
    if (this.socket && this.state === 'connected') {
      this.socket.write(`${JSON.stringify(command)}\n`);
    }
  }

  close(): void {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.socket?.end();
    this.socket = null;
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let newline: number;
    while ((newline = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this.onLine(line);
    }
  }

  private onLine(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      console.warn('[yuka] ignoring malformed message:', line);
      return;
    }
    if (isAgentEvent(parsed)) {
      this.emit('event', parsed);
    }
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.emit('state', state);
  }
}
