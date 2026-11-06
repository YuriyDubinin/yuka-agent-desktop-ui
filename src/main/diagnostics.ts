// A small event log for window behaviour. Lines go to stdout, which the agent writes to
// /tmp/yuka-face-yuka-agent-desktop-ui.log – so if the panel ever misbehaves, the log tells
// exactly what was expected, what macOS actually did and what was corrected.
//
//   2026-11-06T12:00:00.123Z [presence] hidden→shown reason=pointer orb=true panel=false
//   2026-11-06T12:00:05.456Z [reconcile] panel: show,reassert,opaque (want visible, was hidden)
//
// The same line repeated within a second is folded into "…повторилось N раз".

export type LogCategory = 'presence' | 'reconcile' | 'gesture' | 'focus' | 'system' | 'renderer';

const FOLD_MS = 1_000;

export class EventLog {
  private lastLine = '';
  private lastAt = 0;
  private repeats = 0;
  private readonly write: (line: string) => void;
  private readonly clock: () => number;

  constructor(write: (line: string) => void = (line) => console.log(line), clock = Date.now) {
    this.write = write;
    this.clock = clock;
  }

  log(category: LogCategory, message: string): void {
    const now = this.clock();
    const line = `[${category}] ${message}`;
    if (line === this.lastLine && now - this.lastAt < FOLD_MS) {
      this.repeats += 1;
      this.lastAt = now;
      return;
    }
    this.flushRepeats();
    this.write(`${new Date(now).toISOString()} ${line}`);
    this.lastLine = line;
    this.lastAt = now;
  }

  /** Writes the pending "repeated N times" line, if any. */
  flushRepeats(): void {
    if (this.repeats > 0) {
      this.write(
        `${new Date(this.lastAt).toISOString()} ${this.lastLine} …повторилось ${this.repeats} раз`,
      );
      this.repeats = 0;
    }
  }
}

/** The process-wide log. */
export const eventLog = new EventLog();
