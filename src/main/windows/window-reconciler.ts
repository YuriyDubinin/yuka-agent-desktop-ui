// Desired vs. actual window state – pure functions, no Electron.
//
// The presence state machine says what the panel *should* look like; macOS may disagree
// (it hid the app, moved the window with a display, the page crashed…). Every tick the
// window manager reads what the windows really are, and `reconcile*` returns the actions
// that bring them back. Like React: describe the target, let reconciliation fix reality –
// so a window can never stay lost, whatever hid it.

import type { PresencePhase } from '../../shared/protocol';
import type { Rect } from '../../shared/geometry';

export interface PanelDesired {
  visible: boolean;
  /** Target opacity; null while a fade animation owns it. */
  opacity: 0 | 1 | null;
}

export interface WindowActual {
  visible: boolean;
  opacity: number;
  /** At least half of the window lies on some display. */
  onScreen: boolean;
  rendererAlive: boolean;
  /** An opacity animation is running. */
  animating: boolean;
}

export type WindowAction =
  | 'show' // make it visible again (and unhide the app)
  | 'hide'
  | 'opaque' // opacity → 1
  | 'reposition' // back onto a visible display
  | 'reassert' // "above everything, on every Space" again
  | 'reload'; // the page is gone: reload it

export function desiredPanel(phase: PresencePhase): PanelDesired {
  switch (phase) {
    case 'hidden':
      return { visible: false, opacity: 0 };
    case 'fading':
      return { visible: true, opacity: null };
    case 'shown':
    case 'lingering':
      return { visible: true, opacity: 1 };
  }
}

/** Actions that bring the panel to `desired`. Empty when they already agree. */
export function reconcilePanel(desired: PanelDesired, actual: WindowActual): WindowAction[] {
  const actions: WindowAction[] = [];
  if (!actual.rendererAlive) actions.push('reload');

  if (!desired.visible) {
    if (actual.visible && !actual.animating) actions.push('hide');
    return actions;
  }

  if (!actual.visible) {
    actions.push('show', 'reassert');
    if (desired.opacity === 1 && !actual.animating) actions.push('opaque');
    return actions;
  }
  if (!actual.onScreen) actions.push('reposition');
  if (desired.opacity === 1 && !actual.animating && actual.opacity < 0.95) actions.push('opaque');
  return actions;
}

/** The orb must always be on screen. */
export function reconcileOrb(actual: WindowActual): WindowAction[] {
  const actions: WindowAction[] = [];
  if (!actual.rendererAlive) actions.push('reload');
  if (!actual.visible) actions.push('show', 'reassert');
  if (!actual.onScreen) actions.push('reposition');
  if (!actual.animating && actual.opacity < 0.95) actions.push('opaque');
  return actions;
}

/** Share of `rect` lying on the given displays (0…1). */
export function visibleShare(rect: Rect, displays: readonly Rect[]): number {
  const area = rect.width * rect.height;
  if (area <= 0) return 0;
  let covered = 0;
  for (const d of displays) {
    const w = Math.min(rect.x + rect.width, d.x + d.width) - Math.max(rect.x, d.x);
    const h = Math.min(rect.y + rect.height, d.y + d.height) - Math.max(rect.y, d.y);
    if (w > 0 && h > 0) covered += w * h;
  }
  return Math.min(1, covered / area);
}

/**
 * Limits how often one corrective action may run (per window): if macOS keeps refusing,
 * we retry calmly instead of 30 times a second.
 */
export class ActionThrottle {
  private readonly last = new Map<string, number>();
  private readonly intervalMs: number;

  constructor(intervalMs = 500) {
    this.intervalMs = intervalMs;
  }

  allow(key: string, now: number): boolean {
    const previous = this.last.get(key);
    if (previous !== undefined && now - previous < this.intervalMs) return false;
    this.last.set(key, now);
    return true;
  }
}

// ------------------------------------------------------------------ gestures

/** How long a press may last without a release while the cursor is away from the orb. */
export const STALE_PRESS_MS = 3_000;
/** How long a drag may go without a release. */
export const STALE_DRAG_MS = 10_000;

/**
 * A press or drag whose release was lost (a Ctrl+click menu swallowed it, the pointer
 * capture broke…). Left alone it would make the orb look hovered forever.
 */
export function isStaleGesture(
  now: number,
  pressedAt: number | null,
  dragStartedAt: number | null,
  overOrb: boolean,
): boolean {
  if (dragStartedAt !== null) return now - dragStartedAt > STALE_DRAG_MS;
  if (pressedAt !== null) return !overOrb && now - pressedAt > STALE_PRESS_MS;
  return false;
}
