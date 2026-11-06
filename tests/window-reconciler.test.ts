import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  ActionThrottle,
  desiredPanel,
  isStaleGesture,
  reconcileOrb,
  reconcilePanel,
  STALE_DRAG_MS,
  STALE_PRESS_MS,
  visibleShare,
  type WindowActual,
} from '../src/main/windows/window-reconciler.ts';

const ok: WindowActual = {
  visible: true,
  opacity: 1,
  onScreen: true,
  rendererAlive: true,
  animating: false,
};
const hiddenWindow: WindowActual = { ...ok, visible: false, opacity: 0 };

describe('panel reconciliation', () => {
  test('agreeing states need nothing', () => {
    assert.deepEqual(reconcilePanel(desiredPanel('shown'), ok), []);
    assert.deepEqual(reconcilePanel(desiredPanel('lingering'), ok), []);
    assert.deepEqual(reconcilePanel(desiredPanel('hidden'), hiddenWindow), []);
  });

  test('macOS hid the panel while it should be shown → show it again', () => {
    assert.deepEqual(reconcilePanel(desiredPanel('shown'), hiddenWindow), [
      'show',
      'reassert',
      'opaque',
    ]);
  });

  test('opacity stuck at 0 while shown, no animation → make it opaque', () => {
    assert.deepEqual(reconcilePanel(desiredPanel('shown'), { ...ok, opacity: 0 }), ['opaque']);
  });

  test('a running animation owns the opacity', () => {
    assert.deepEqual(
      reconcilePanel(desiredPanel('shown'), { ...ok, opacity: 0.3, animating: true }),
      [],
    );
    assert.deepEqual(
      reconcilePanel(desiredPanel('fading'), { ...ok, opacity: 0.5, animating: true }),
      [],
    );
  });

  test('during the fade-out nothing is forced', () => {
    assert.deepEqual(reconcilePanel(desiredPanel('fading'), { ...ok, opacity: 0.2 }), []);
  });

  test('panel on a display that is gone → put it back', () => {
    assert.deepEqual(reconcilePanel(desiredPanel('shown'), { ...ok, onScreen: false }), [
      'reposition',
    ]);
  });

  test('should be hidden but is visible → hide (unless fading out)', () => {
    assert.deepEqual(reconcilePanel(desiredPanel('hidden'), ok), ['hide']);
    assert.deepEqual(reconcilePanel(desiredPanel('hidden'), { ...ok, animating: true }), []);
  });

  test('the page crashed → reload, whatever the phase', () => {
    assert.deepEqual(reconcilePanel(desiredPanel('shown'), { ...ok, rendererAlive: false }), [
      'reload',
    ]);
    assert.deepEqual(
      reconcilePanel(desiredPanel('hidden'), { ...hiddenWindow, rendererAlive: false }),
      ['reload'],
    );
  });
});

describe('orb reconciliation', () => {
  test('the orb is always visible, opaque and on screen', () => {
    assert.deepEqual(reconcileOrb(ok), []);
    assert.deepEqual(reconcileOrb(hiddenWindow), ['show', 'reassert', 'opaque']);
    assert.deepEqual(reconcileOrb({ ...ok, onScreen: false }), ['reposition']);
    assert.deepEqual(reconcileOrb({ ...ok, rendererAlive: false }), ['reload']);
  });
});

describe('helpers', () => {
  const screen = { x: 0, y: 0, width: 1000, height: 800 };

  test('visible share of a window', () => {
    assert.equal(visibleShare({ x: 10, y: 10, width: 100, height: 100 }, [screen]), 1);
    assert.equal(visibleShare({ x: 950, y: 0, width: 100, height: 100 }, [screen]), 0.5);
    assert.equal(visibleShare({ x: 2000, y: 0, width: 100, height: 100 }, [screen]), 0);
    assert.equal(visibleShare({ x: 0, y: 0, width: 0, height: 0 }, [screen]), 0);
  });

  test('throttle lets one action through per interval and per key', () => {
    const t = new ActionThrottle(500);
    assert.equal(t.allow('panel:show', 0), true);
    assert.equal(t.allow('panel:show', 100), false);
    assert.equal(t.allow('orb:show', 100), true);
    assert.equal(t.allow('panel:show', 500), true);
  });

  test('stale gestures', () => {
    assert.equal(isStaleGesture(0, null, null, false), false);
    assert.equal(
      isStaleGesture(STALE_PRESS_MS + 1, 0, null, false),
      true,
      'press lost, cursor away',
    );
    assert.equal(
      isStaleGesture(STALE_PRESS_MS + 1, 0, null, true),
      false,
      'still holding on the orb',
    );
    assert.equal(isStaleGesture(STALE_PRESS_MS - 1, 0, null, false), false);
    assert.equal(isStaleGesture(STALE_DRAG_MS + 1, 0, 0, true), true, 'drag without release');
    assert.equal(isStaleGesture(STALE_DRAG_MS - 1, 0, 0, false), false);
  });
});
