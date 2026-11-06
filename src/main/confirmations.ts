import type { SessionHub } from './session-hub';

/** Shorter than the agent's 60 s, so the face always answers before the agent gives up. */
export const CONFIRM_TIMEOUT_MS = 55_000;

/**
 * Questions to the user before a destructive tool runs. Each question is a card in the
 * panel's transcript ("Закрыть Юку? Да / Нет"); the answer comes back over IPC.
 * No answer in time counts as "no".
 */
export class Confirmations {
  private readonly pending = new Map<
    string,
    { resolve: (accepted: boolean) => void; timer: NodeJS.Timeout }
  >();

  private readonly session: SessionHub;
  private readonly timeoutMs: number;

  constructor(session: SessionHub, timeoutMs = CONFIRM_TIMEOUT_MS) {
    this.session = session;
    this.timeoutMs = timeoutMs;
  }

  ask(callId: string, question: string): Promise<boolean> {
    this.settle(callId, false); // a repeated id replaces the old question
    this.session.record({ kind: 'confirm', callId, question, phase: 'ask' });
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.settle(callId, false), this.timeoutMs);
      this.pending.set(callId, { resolve, timer });
    });
  }

  /** The user's answer from the panel. Unknown or already answered ids are ignored. */
  answer(callId: string, accepted: boolean): void {
    this.settle(callId, accepted);
  }

  /** Everything still open is declined (e.g. the agent disconnected). */
  cancelAll(): void {
    for (const callId of [...this.pending.keys()]) this.settle(callId, false);
  }

  private settle(callId: string, accepted: boolean): void {
    const entry = this.pending.get(callId);
    if (!entry) return;
    this.pending.delete(callId);
    clearTimeout(entry.timer);
    this.session.record({ kind: 'confirm', callId, question: '', phase: 'answered', accepted });
    entry.resolve(accepted);
  }
}
