// The "never lose the panel" guarantees, end to end on the pure parts: the presence state
// machine and the reconciler drive a fake window that a fake macOS keeps breaking – the same
// loop the window manager runs every tick.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  FADE_OUT_MS,
  initialPresence,
  isOpen,
  type PresenceInput,
  type PresenceState,
  reducePresence,
} from '../src/main/presence.ts';
import {
  ActionThrottle,
  desiredPanel,
  isStaleGesture,
  reconcilePanel,
  type WindowAction,
} from '../src/main/windows/window-reconciler.ts';

const TICK = 33;

class FakePanel {
  visible = false;
  opacity = 0;
  onScreen = true;
  rendererAlive = true;
  animatingUntil = 0;
  reloads = 0;
}

class Simulation {
  now = 0;
  presence: PresenceState = initialPresence;
  panel = new FakePanel();
  cursor = { orb: false, panel: false };
  log: WindowAction[] = [];
  private throttle = new ActionThrottle(500);

  input(input: PresenceInput) {
    const previous = this.presence;
    this.presence = reducePresence(previous, input, this.now);
    if (this.presence.phase === previous.phase) return;
    // applyPhase: the animations of a phase change
    const to = this.presence.phase;
    if (to === 'hidden') {
      this.panel.visible = false;
      this.panel.opacity = 0;
    } else if (to === 'fading') {
      this.panel.animatingUntil = this.now + FADE_OUT_MS;
    } else if (previous.phase === 'hidden' || previous.phase === 'fading') {
      this.panel.visible = true;
      this.panel.animatingUntil = this.now + 260;
    }
  }

  /** One tick of the window manager: pointer every tick, timers, reconciliation. */
  tick() {
    this.now += TICK;
    const animating = this.now < this.panel.animatingUntil;
    if (!animating && this.presence.phase !== 'fading' && this.panel.visible) {
      this.panel.opacity = isOpen(this.presence.phase) ? 1 : this.panel.opacity;
    }
    const overPanel = this.cursor.panel && this.panel.visible && this.presence.phase !== 'hidden';
    this.input({ type: 'pointer', orb: this.cursor.orb, panel: overPanel });
    if (this.presence.phase === 'lingering' || this.presence.phase === 'fading') {
      this.input({ type: 'tick' });
    }
    const actions = reconcilePanel(desiredPanel(this.presence.phase), {
      visible: this.panel.visible,
      opacity: this.panel.opacity,
      onScreen: this.panel.onScreen,
      rendererAlive: this.panel.rendererAlive,
      animating: this.now < this.panel.animatingUntil,
    }).filter((a) => this.throttle.allow(a, this.now));
    for (const a of actions) {
      this.log.push(a);
      if (a === 'show') this.panel.visible = true;
      if (a === 'hide') this.panel.visible = false;
      if (a === 'opaque') this.panel.opacity = 1;
      if (a === 'reposition') this.panel.onScreen = true;
      if (a === 'reload') {
        this.panel.rendererAlive = true;
        this.panel.reloads += 1;
      }
    }
  }

  run(ms: number) {
    for (let t = 0; t < ms; t += TICK) this.tick();
  }

  /** What the user sees. */
  get seen() {
    return this.panel.visible && this.panel.opacity > 0.5 && this.panel.onScreen;
  }
}

describe('the panel is never lost', () => {
  test('hover shows it; leaving hides it after the countdown', () => {
    const sim = new Simulation();
    sim.cursor.orb = true;
    sim.run(500);
    assert.ok(sim.seen);
    sim.cursor.orb = false;
    sim.run(2_000);
    assert.ok(!sim.panel.visible);
  });

  test('macOS hides the shown panel → it is back within one tick', () => {
    const sim = new Simulation();
    sim.cursor.orb = true;
    sim.run(500);
    sim.panel.visible = false; // e.g. a Space switch or "Hide Others"
    sim.tick();
    assert.ok(sim.seen);
    assert.deepEqual(sim.log.slice(-3), ['show', 'reassert', 'opaque']);
  });

  test('opacity stuck at 0 while open → fixed', () => {
    const sim = new Simulation();
    sim.input({ type: 'pin', pinned: true });
    sim.run(500);
    sim.panel.opacity = 0;
    sim.tick();
    assert.ok(sim.seen);
  });

  test('the panel ended up on an unplugged display → back on screen', () => {
    const sim = new Simulation();
    sim.input({ type: 'pin', pinned: true });
    sim.run(500);
    sim.panel.onScreen = false;
    sim.tick();
    assert.ok(sim.seen);
  });

  test('a crashed page is reloaded', () => {
    const sim = new Simulation();
    sim.panel.rendererAlive = false;
    sim.tick();
    assert.equal(sim.panel.reloads, 1);
  });

  test('state machine thinks hidden but cursor rests on the orb → opens without moving the cursor', () => {
    const sim = new Simulation();
    sim.cursor.orb = true;
    sim.run(300);
    // something hid it behind the state machine's back and it went to "hidden"
    sim.presence = { ...sim.presence, phase: 'hidden' };
    sim.panel.visible = false;
    sim.run(100); // cursor never moved
    assert.ok(sim.seen);
  });

  test('Esc under the cursor: stays closed, opens after the cursor leaves and returns', () => {
    const sim = new Simulation();
    sim.cursor.orb = true;
    sim.run(500);
    sim.input({ type: 'dismiss' });
    sim.run(1_000);
    assert.ok(!sim.panel.visible, 'Esc is respected');
    sim.cursor.orb = false;
    sim.run(100);
    sim.cursor.orb = true;
    sim.run(500);
    assert.ok(sim.seen);
  });

  test('⌘Tab with the cursor on the orb does not close the panel', () => {
    const sim = new Simulation();
    sim.cursor.orb = true;
    sim.run(1_000);
    sim.input({ type: 'focusLost', overYuka: true, menuOpen: false });
    sim.run(2_000);
    assert.ok(sim.seen);
  });

  test('a click on the orb always brings it back, even with hover suppressed', () => {
    const sim = new Simulation();
    sim.cursor.orb = true;
    sim.run(500);
    sim.input({ type: 'dismiss' });
    sim.run(1_000);
    sim.input({ type: 'reveal' }); // the click
    sim.run(500);
    assert.ok(sim.seen);
  });

  test('a lost release (Ctrl+click) is detected and cleared', () => {
    // pressed at 0, the menu swallowed the release, the cursor went away
    assert.ok(isStaleGesture(3_500, 0, null, false));
  });
});
