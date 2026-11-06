// When the dialog panel is visible – a pure state machine (no Electron, no timers).
//
//   hidden ──hover──▶ shown ──pointer left, nothing holds it──▶ lingering (1 s countdown)
//     ▲                 ▲ ◀──────────── hover / something holds it ─────────┘   │
//     │                 └──────── hover ──────── fading (420 ms) ◀── deadline ─┘
//     └──────────────────────────── fade over ───────┘
//
// "Holds" pause the countdown: the panel is pinned, the user is typing (composer focused
// with a draft) or Yuka is answering. Esc, the shortcut or a click outside Yuka dismiss it
// at once.
//
// Never losing the panel:
//   – the pointer is fed in on every tick, not only when it changes: "the cursor is on the
//     orb and the panel is hidden" always opens it (unless the user has just dismissed it
//     there – then it waits until the cursor leaves, so Esc still works);
//   – `reveal` (a click on the orb, the menu, ⌥Space) opens the panel from any state;
//   – losing focus closes the panel only when the cursor is away from Yuka.
//
// Time is passed in by the caller, which makes every transition testable. The same input
// in the same state returns the very same object, so callers can feed inputs every tick.

import type { PresencePhase } from '../shared/protocol';

export const HIDE_DELAY_MS = 1_000;
export const FADE_OUT_MS = 420;
/** Focus lost this soon after the panel appeared is not a "click outside". */
export const FOCUS_GRACE_MS = 300;

export interface PresenceState {
  phase: PresencePhase;
  pinned: boolean;
  hoverOrb: boolean;
  hoverPanel: boolean;
  /** The user dismissed the panel under the cursor: hovering does not reopen it until the
   *  cursor has left Yuka. */
  hoverSuppressed: boolean;
  /** The composer has focus and a draft. */
  composing: boolean;
  /** Yuka is thinking or streaming a reply. */
  busy: boolean;
  /** When the panel last appeared (from hidden or fading). */
  shownAt: number | null;
  /** lingering: when fading starts. */
  hideAt: number | null;
  /** fading: when the panel is fully gone. */
  goneAt: number | null;
}

export type PresenceInput =
  | { type: 'pointer'; orb: boolean; panel: boolean } // every tick
  | { type: 'pin'; pinned?: boolean } // toggles when `pinned` is omitted
  | { type: 'composer'; composing: boolean }
  | { type: 'busy'; busy: boolean }
  | { type: 'reveal' } // guaranteed show: click on the orb, the menu, ⌥Space
  | { type: 'show' } // alias of reveal (tools, confirmations)
  | { type: 'toggle' } // ⌥Space while the panel is open
  | { type: 'dismiss' } // Esc, ⌘W
  | { type: 'focusLost'; overYuka: boolean; menuOpen: boolean } // the panel lost key focus
  | { type: 'tick' };

export const initialPresence: PresenceState = {
  phase: 'hidden',
  pinned: false,
  hoverOrb: false,
  hoverPanel: false,
  hoverSuppressed: false,
  composing: false,
  busy: false,
  shownAt: null,
  hideAt: null,
  goneAt: null,
};

/** The panel is on screen (possibly fading out). */
export const isVisible = (phase: PresencePhase) => phase !== 'hidden';

/** The panel is on screen and not leaving. */
export const isOpen = (phase: PresencePhase) => phase === 'shown' || phase === 'lingering';

function show(state: PresenceState, now: number): PresenceState {
  const appearing = state.phase === 'hidden' || state.phase === 'fading';
  return {
    ...state,
    phase: 'shown',
    hideAt: null,
    goneAt: null,
    shownAt: appearing ? now : state.shownAt,
  };
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
  const keep = (hovering(state) && !state.hoverSuppressed) || held(state);
  if (state.phase === 'shown' && !keep) {
    return { ...state, phase: 'lingering', hideAt: now + HIDE_DELAY_MS };
  }
  if (state.phase === 'lingering' && keep) {
    return { ...state, phase: 'shown', hideAt: null };
  }
  return state;
}

/** Returns `previous` itself when nothing changed, so repeated inputs are free. */
function unchangedOr(previous: PresenceState, next: PresenceState): PresenceState {
  for (const key of Object.keys(next) as (keyof PresenceState)[]) {
    if (next[key] !== previous[key]) return next;
  }
  return previous;
}

function reveal(state: PresenceState, now: number): PresenceState {
  return settle(show({ ...state, hoverSuppressed: false }, now), now);
}

function reduce(state: PresenceState, input: PresenceInput, now: number): PresenceState {
  switch (input.type) {
    case 'pointer': {
      let next = { ...state, hoverOrb: input.orb, hoverPanel: input.panel };
      // The cursor has left Yuka: hovering may open the panel again.
      if (next.hoverSuppressed && !input.orb && !input.panel) next.hoverSuppressed = false;
      // Level-triggered: whenever the cursor is on Yuka, the panel is open.
      if (hovering(next) && !next.hoverSuppressed && next.phase !== 'shown') {
        next = show(next, now);
      }
      return settle(next, now);
    }
    case 'pin': {
      const pinned = input.pinned ?? !state.pinned;
      const next = { ...state, pinned };
      return pinned ? reveal(next, now) : settle(next, now);
    }
    case 'composer':
      return settle({ ...state, composing: input.composing }, now);
    case 'busy':
      return settle({ ...state, busy: input.busy }, now);
    case 'reveal':
    case 'show':
      return reveal(state, now);
    case 'toggle':
      return isOpen(state.phase) ? dismiss(state, now) : reveal(state, now);
    case 'dismiss':
      return dismiss(state, now);
    case 'focusLost': {
      // Only a real "click outside": not while the cursor is on Yuka, not because of her own
      // menu, not in the first moments after the panel appeared.
      if (!isOpen(state.phase) || input.overYuka || input.menuOpen) return state;
      if (state.shownAt !== null && now - state.shownAt < FOCUS_GRACE_MS) return state;
      return fadeOut(state, now);
    }
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

function dismiss(state: PresenceState, now: number): PresenceState {
  const next = fadeOut(state, now);
  if (next === state) return state;
  // Closed under the cursor: do not reopen it right away just because it is still there.
  return { ...next, hoverSuppressed: state.hoverOrb || state.hoverPanel };
}

export function reducePresence(
  state: PresenceState,
  input: PresenceInput,
  now: number,
): PresenceState {
  return unchangedOr(state, reduce(state, input, now));
}
