import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  FADE_OUT_MS,
  HIDE_DELAY_MS,
  initialPresence,
  type PresenceInput,
  type PresenceState,
  reducePresence,
} from '../src/main/presence.ts';

/** Applies inputs at the given times; returns the final state. */
function run(steps: [number, PresenceInput][], from: PresenceState = initialPresence) {
  return steps.reduce((state, [now, input]) => reducePresence(state, input, now), from);
}

const enterOrb: PresenceInput = { type: 'pointer', orb: true, panel: false };
const enterPanel: PresenceInput = { type: 'pointer', orb: false, panel: true };
const leave: PresenceInput = { type: 'pointer', orb: false, panel: false };
const tick: PresenceInput = { type: 'tick' };

describe('presence', () => {
  test('starts hidden', () => {
    assert.equal(initialPresence.phase, 'hidden');
  });

  test('hovering the orb shows the panel', () => {
    assert.equal(run([[0, enterOrb]]).phase, 'shown');
  });

  test('hovering where the hidden panel would be does nothing', () => {
    assert.equal(run([[0, enterPanel]]).phase, 'hidden');
  });

  test('moving from the orb to the panel keeps it open', () => {
    const state = run([
      [0, enterOrb],
      [100, enterPanel],
      [60_000, tick],
    ]);
    assert.equal(state.phase, 'shown');
  });

  test('leaving starts a 1 s countdown, then fades and hides', () => {
    let state = run([
      [0, enterOrb],
      [1_000, leave],
    ]);
    assert.equal(state.phase, 'lingering');
    assert.equal(state.hideAt, 1_000 + HIDE_DELAY_MS);

    state = reducePresence(state, tick, 1_000 + HIDE_DELAY_MS - 1);
    assert.equal(state.phase, 'lingering');

    state = reducePresence(state, tick, 1_000 + HIDE_DELAY_MS);
    assert.equal(state.phase, 'fading');

    state = reducePresence(state, tick, 1_000 + HIDE_DELAY_MS + FADE_OUT_MS);
    assert.equal(state.phase, 'hidden');
  });

  test('coming back before the countdown ends cancels it; leaving again restarts it', () => {
    const back = HIDE_DELAY_MS * 0.9;
    const leftAgain = HIDE_DELAY_MS * 0.95;
    let state = run([
      [0, enterOrb],
      [0, leave],
      [back, enterPanel],
    ]);
    assert.equal(state.phase, 'shown');
    assert.equal(state.hideAt, null);

    state = run(
      [
        [leftAgain, leave],
        [HIDE_DELAY_MS + 1, tick], // the old deadline has passed…
      ],
      state,
    );
    assert.equal(state.phase, 'lingering', '…but a fresh countdown runs from the second leave');
    assert.equal(reducePresence(state, tick, leftAgain + HIDE_DELAY_MS).phase, 'fading');
  });

  test('hovering during the fade brings the panel back', () => {
    const state = run([
      [0, enterOrb],
      [0, leave],
      [HIDE_DELAY_MS, tick],
      [HIDE_DELAY_MS + 100, enterPanel],
    ]);
    assert.equal(state.phase, 'shown');
    assert.equal(state.goneAt, null);
  });

  test('a pinned panel never fades on its own', () => {
    let state = run([
      [0, { type: 'pin' }],
      [1, leave],
      [60_000, tick],
    ]);
    assert.equal(state.phase, 'shown');
    assert.equal(state.pinned, true);

    state = run([[60_001, { type: 'pin' }]], state);
    assert.equal(state.pinned, false);
    assert.equal(state.phase, 'lingering');
  });

  test('pinning shows the panel', () => {
    assert.equal(run([[0, { type: 'pin', pinned: true }]]).phase, 'shown');
  });

  test('typing holds the panel; the countdown starts after the draft is gone', () => {
    let state = run([
      [0, enterOrb],
      [10, { type: 'composer', composing: true }],
      [20, leave],
      [30_000, tick],
    ]);
    assert.equal(state.phase, 'shown');

    state = run(
      [
        [30_000, { type: 'composer', composing: false }],
        [30_000 + HIDE_DELAY_MS, tick],
      ],
      state,
    );
    assert.equal(state.phase, 'fading');
  });

  test('a streaming reply holds the panel', () => {
    let state = run([
      [0, enterOrb],
      [0, { type: 'busy', busy: true }],
      [1, leave],
      [20_000, tick],
    ]);
    assert.equal(state.phase, 'shown');

    state = run([[20_000, { type: 'busy', busy: false }]], state);
    assert.equal(state.phase, 'lingering');
    assert.equal(state.hideAt, 20_000 + HIDE_DELAY_MS);
  });

  test('being busy does not open a hidden panel', () => {
    assert.equal(run([[0, { type: 'busy', busy: true }]]).phase, 'hidden');
  });

  test('Esc dismisses immediately and unpins', () => {
    const state = run([
      [0, { type: 'pin', pinned: true }],
      [5, { type: 'dismiss' }],
    ]);
    assert.equal(state.phase, 'fading');
    assert.equal(state.pinned, false);
    assert.equal(reducePresence(state, tick, 5 + FADE_OUT_MS).phase, 'hidden');
  });

  test('Esc while the pointer is still on the orb is respected', () => {
    const state = run([
      [0, enterOrb],
      [10, { type: 'dismiss' }],
      [10 + FADE_OUT_MS, tick],
    ]);
    assert.equal(state.phase, 'hidden');
  });

  test('the shortcut toggles', () => {
    let state = run([[0, { type: 'toggle' }]]);
    assert.equal(state.phase, 'lingering', 'shown without hover → countdown');
    state = run([[1, { type: 'toggle' }]], state);
    assert.equal(state.phase, 'fading');
    state = run([[2, { type: 'toggle' }]], state);
    assert.equal(state.phase, 'lingering');
  });

  test('ticks without deadlines change nothing', () => {
    const shown = run([[0, enterOrb]]);
    assert.equal(reducePresence(shown, tick, 1e9), shown);
    assert.equal(reducePresence(initialPresence, tick, 1e9), initialPresence);
  });
});
