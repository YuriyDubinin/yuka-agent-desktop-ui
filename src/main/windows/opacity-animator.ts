import type { BrowserWindow } from 'electron';

const FRAME_MS = 16;

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInCubic = (t: number) => t ** 3;

/**
 * Animates a window's opacity (NSWindow.alphaValue on macOS). CSS cannot fade the native
 * vibrancy behind the page, so the window itself fades while the page animates its content.
 * A new animation replaces the running one and starts from the current opacity.
 */
export class OpacityAnimator {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly window: BrowserWindow) {}

  animate(to: number, durationMs: number, onDone?: () => void): void {
    this.stop();
    if (this.window.isDestroyed()) return;

    const from = this.window.getOpacity();
    const ease = to > from ? easeOutCubic : easeInCubic;
    const start = Date.now();

    const step = () => {
      if (this.window.isDestroyed()) return this.stop();
      const t = Math.min(1, (Date.now() - start) / durationMs);
      this.window.setOpacity(from + (to - from) * ease(t));
      if (t >= 1) {
        this.stop();
        onDone?.();
      }
    };
    step();
    if (this.timer === null && Date.now() - start < durationMs) {
      this.timer = setInterval(step, FRAME_MS);
    }
  }

  /** An animation is running (it owns the window's opacity until it ends). */
  isAnimating(): boolean {
    return this.timer !== null;
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
