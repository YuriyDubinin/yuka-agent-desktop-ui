// When the dialog panel is visible – a pure state machine (no Electron, no timers).
//
//   hidden ──hover──▶ shown ──pointer left, nothing holds it──▶ lingering (10 s countdown)
//     ▲                 ▲ ◀──────────── hover / something holds it ─────────┘   │
//     │                 └──────── hover ──────── fading (420 ms) ◀── deadline ─┘
//     └──────────────────────────── fade over ───────┘
//
// "Holds" pause the countdown: the panel is pinned, the user is typing (composer focused
// with a draft) or Yuka is answering. Esc / the shortcut dismiss the panel at once.
// Time is passed in by the caller, which makes every transition testable.

import type { PresencePhase } from '../shared/protocol';

export const HIDE_DELAY_MS = 10_000;
export const FADE_OUT_MS = 420;

export interface PresenceState {
  phase: PresencePhase;
  pinned: boolean;
  hoverOrb: boolean;
  hoverPanel: boolean;
  /** The composer has focus and a draft. */
  composing: boolean;
  /** Yuka is thinking or streaming a reply. */
  busy: boolean;
  /** lingering: when fading starts. */
  hideAt: number | null;
  /** fading: when the panel is fully gone. */
  goneAt: number | null;
}

export type PresenceInput =
  | { type: 'pointer'; orb: boolean; panel: boolean }
  | { type: 'pin'; pinned?: boolean } // toggles when `pinned` is omitted
  | { type: 'composer'; composing: boolean }
  | { type: 'busy'; busy: boolean }
  | { type: 'show' } // e.g. the global shortcut opening the panel
  | { type: 'toggle' } // the global shortcut
  | { type: 'dismiss' } // Esc
  | { type: 'tick' };

export const initialPresence: PresenceState = {
  phase: 'hidden',
  pinned: false,
  hoverOrb: false,
  hoverPanel: false,
  composing: false,
  busy: false,
  hideAt: null,
  goneAt: null,
};

/** The panel is on screen (possibly fading out). */
export const isVisible = (phase: PresencePhase) => phase !== 'hidden';

/** The panel is on screen and not leaving. */
export const isOpen = (phase: PresencePhase) => phase === 'shown' || phase === 'lingering';

function show(state: PresenceState): PresenceState {
  return { ...state, phase: 'shown', hideAt: null, goneAt: null };
}

function fadeOut(state: PresenceState, now: number): PresenceState {
  if (state.phase === 'hidden' || state.phase === 'fading') return state;
  return { ...state, phase: 'fading', pinned: false, hideAt: null, goneAt: now + FADE_OUT_MS };
}

function hovering(state: PresenceState): boolean {
  // The panel can only be hovered while it is on screen.
  return state.hoverOrb || (state.hoverPanel && isVisible(state.phase));
}

function held(state: PresenceState): boolean {
  return state.pinned || state.composing || state.busy;
}

/** Starts or cancels the countdown according to hover and holds. */
function settle(state: PresenceState, now: number): PresenceState {
  const keep = hovering(state) || held(state);
  if (state.phase === 'shown' && !keep) {
    return { ...state, phase: 'lingering', hideAt: now + HIDE_DELAY_MS };
  }
  if (state.phase === 'lingering' && keep) {
    return { ...state, phase: 'shown', hideAt: null };
  }
  return state;
}

export function reducePresence(
  state: PresenceState,
  input: PresenceInput,
  now: number,
): PresenceState {
  switch (input.type) {
    case 'pointer': {
      const next = { ...state, hoverOrb: input.orb, hoverPanel: input.panel };
      // Hovering brings the panel back from anywhere – even while it fades out.
      if (hovering(next) && next.phase !== 'shown') return settle(show(next), now);
      return settle(next, now);
    }
    case 'pin': {
      const pinned = input.pinned ?? !state.pinned;
      const next = { ...state, pinned };
      return settle(pinned ? show(next) : next, now);
    }
    case 'composer':
      return settle({ ...state, composing: input.composing }, now);
    case 'busy':
      return settle({ ...state, busy: input.busy }, now);
    case 'show':
      return settle(show(state), now);
    case 'toggle':
      return isOpen(state.phase) ? fadeOut(state, now) : settle(show(state), now);
    case 'dismiss':
      return fadeOut(state, now);
    case 'tick':
      if (state.phase === 'lingering' && state.hideAt !== null && now >= state.hideAt) {
        return fadeOut(state, now);
      }
      if (state.phase === 'fading' && state.goneAt !== null && now >= state.goneAt) {
        return { ...state, phase: 'hidden', goneAt: null };
      }
      return state;
  }
}
