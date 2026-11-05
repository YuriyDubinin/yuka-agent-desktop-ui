import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  clampPanelHeight,
  clampRect,
  defaultOrbBounds,
  isOverOrb,
  ORB_RADIUS,
  ORB_WINDOW_SIZE,
  PANEL_GAP,
  PANEL_MAX_HEIGHT,
  PANEL_MIN_HEIGHT,
  PANEL_WIDTH,
  placePanel,
  type Rect,
  rectContains,
  SCREEN_MARGIN,
} from '../src/shared/geometry.ts';

const screen: Rect = { x: 0, y: 25, width: 1512, height: 920 }; // menu bar at the top
const inside = (rect: Rect, area: Rect) =>
  rect.x >= area.x &&
  rect.y >= area.y &&
  rect.x + rect.width <= area.x + area.width &&
  rect.y + rect.height <= area.y + area.height;

describe('geometry', () => {
  test('default orb sits in the bottom-right corner, fully on screen', () => {
    const orb = defaultOrbBounds(screen);
    assert.equal(orb.width, ORB_WINDOW_SIZE);
    assert.ok(inside(orb, screen));
    const cx = orb.x + orb.width / 2;
    const cy = orb.y + orb.height / 2;
    assert.equal(screen.x + screen.width - (cx + ORB_RADIUS), SCREEN_MARGIN);
    assert.equal(screen.y + screen.height - (cy + ORB_RADIUS), SCREEN_MARGIN);
  });

  test('hit testing uses the circle, not the window square', () => {
    const orb: Rect = { x: 100, y: 100, width: 168, height: 168 };
    assert.ok(isOverOrb(orb, { x: 184, y: 184 }));
    assert.ok(isOverOrb(orb, { x: 184 + 50, y: 184 }));
    assert.ok(!isOverOrb(orb, { x: 101, y: 101 }), 'transparent corner');
    assert.ok(!isOverOrb(orb, { x: 184 + 70, y: 184 }));
  });

  test('rectContains is half-open', () => {
    const r: Rect = { x: 0, y: 0, width: 10, height: 10 };
    assert.ok(rectContains(r, { x: 0, y: 0 }));
    assert.ok(!rectContains(r, { x: 10, y: 5 }));
  });

  test('panel goes to the left of an orb in the right corner, bottoms aligned', () => {
    const orb = defaultOrbBounds(screen);
    const { bounds, placement } = placePanel(orb, 300, screen);
    assert.equal(placement, 'left');
    const cx = orb.x + orb.width / 2;
    const cy = orb.y + orb.height / 2;
    assert.equal(bounds.x + bounds.width, cx - ORB_RADIUS - PANEL_GAP);
    assert.equal(bounds.y + bounds.height, cy + ORB_RADIUS);
    assert.equal(bounds.width, PANEL_WIDTH);
    assert.ok(inside(bounds, screen));
  });

  test('panel flips to the right near the left edge', () => {
    const orb: Rect = { x: 0, y: 500, width: 168, height: 168 };
    assert.equal(placePanel(orb, 300, screen).placement, 'right');
  });

  test('a tall panel next to a high orb is clamped onto the screen', () => {
    const orb: Rect = { x: 1300, y: 30, width: 168, height: 168 };
    const { bounds, placement } = placePanel(orb, 480, screen);
    assert.equal(placement, 'left');
    assert.ok(inside(bounds, screen));
  });

  test('on a narrow screen the panel stacks above or below', () => {
    const narrow: Rect = { x: 0, y: 0, width: 400, height: 900 };
    const low: Rect = { x: 116, y: 700, width: 168, height: 168 };
    assert.equal(placePanel(low, 300, narrow).placement, 'above');
    const high: Rect = { x: 116, y: 10, width: 168, height: 168 };
    assert.equal(placePanel(high, 300, narrow).placement, 'below');
  });

  test('clampRect keeps size and moves the rect inside', () => {
    const r = clampRect({ x: -50, y: 2000, width: 168, height: 168 }, screen);
    assert.deepEqual(r, { x: 0, y: 25 + 920 - 168, width: 168, height: 168 });
  });

  test('panel height limits', () => {
    assert.equal(clampPanelHeight(10), PANEL_MIN_HEIGHT);
    assert.equal(clampPanelHeight(10_000), PANEL_MAX_HEIGHT);
    assert.equal(clampPanelHeight(300.4), 300);
  });
});
