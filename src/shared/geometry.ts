// Pure window geometry (screen coordinates, CSS pixels): the orb's circle, where the panel
// goes, keeping windows on screen. No Electron imports – unit-tested directly.

import type { PanelPlacement } from './protocol';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The orb window: a square with the sphere in the middle and room for its halo. */
export const ORB_WINDOW_SIZE = 168;
/** Radius of the glass sphere itself (must match the shader, see OrbView). */
export const ORB_RADIUS = 52;
/** Slightly larger than the sphere, so its edge is easy to hit. */
export const ORB_HIT_RADIUS = 56;

export const PANEL_WIDTH = 352;
export const PANEL_MIN_HEIGHT = 132;
export const PANEL_MAX_HEIGHT = 520;
/** Space between the sphere's edge and the panel. */
export const PANEL_GAP = 10;
/**
 * Distance from the sphere's edge to the screen edge for the default position: exactly the
 * halo margin, so the orb window sits flush with the work area and never needs clamping.
 */
export const SCREEN_MARGIN = ORB_WINDOW_SIZE / 2 - ORB_RADIUS;

export function center(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function rectContains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

/** The pointer is over the sphere (a circle, not the window's square). */
export function isOverOrb(orbBounds: Rect, point: Point, radius = ORB_HIT_RADIUS): boolean {
  const c = center(orbBounds);
  return Math.hypot(point.x - c.x, point.y - c.y) <= radius;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

/** Moves `rect` (without resizing) so it lies inside `area`. */
export function clampRect(rect: Rect, area: Rect): Rect {
  return {
    ...rect,
    x: Math.round(clamp(rect.x, area.x, area.x + area.width - rect.width)),
    y: Math.round(clamp(rect.y, area.y, area.y + area.height - rect.height)),
  };
}

/** Default orb position: bottom-right corner of the work area. */
export function defaultOrbBounds(area: Rect): Rect {
  const cx = area.x + area.width - SCREEN_MARGIN - ORB_RADIUS;
  const cy = area.y + area.height - SCREEN_MARGIN - ORB_RADIUS;
  return clampRect(
    {
      x: Math.round(cx - ORB_WINDOW_SIZE / 2),
      y: Math.round(cy - ORB_WINDOW_SIZE / 2),
      width: ORB_WINDOW_SIZE,
      height: ORB_WINDOW_SIZE,
    },
    area,
  );
}

export function clampPanelHeight(height: number): number {
  return Math.round(clamp(height, PANEL_MIN_HEIGHT, PANEL_MAX_HEIGHT));
}

/**
 * Places the panel next to the sphere. Preference: to the left (bottom edges aligned, the
 * panel grows upwards), then right, above, below – the first side with enough room wins.
 * The other axis is clamped to the work area.
 */
export function placePanel(
  orbBounds: Rect,
  height: number,
  area: Rect,
  width = PANEL_WIDTH,
): { bounds: Rect; placement: PanelPlacement } {
  const c = center(orbBounds);
  const r = ORB_RADIUS;
  const right = area.x + area.width;
  const bottom = area.y + area.height;

  const sideY = c.y + r - height; // bottoms aligned
  const stackX = c.x + r - width; // right edges aligned

  const candidates: { placement: PanelPlacement; rect: Rect; fits: boolean }[] = [
    {
      placement: 'left',
      rect: { x: c.x - r - PANEL_GAP - width, y: sideY, width, height },
      fits: c.x - r - PANEL_GAP - width >= area.x,
    },
    {
      placement: 'right',
      rect: { x: c.x + r + PANEL_GAP, y: sideY, width, height },
      fits: c.x + r + PANEL_GAP + width <= right,
    },
    {
      placement: 'above',
      rect: { x: stackX, y: c.y - r - PANEL_GAP - height, width, height },
      fits: c.y - r - PANEL_GAP - height >= area.y,
    },
    {
      placement: 'below',
      rect: { x: stackX, y: c.y + r + PANEL_GAP, width, height },
      fits: c.y + r + PANEL_GAP + height <= bottom,
    },
  ];

  const chosen = candidates.find((candidate) => candidate.fits) ?? candidates[0];
  return { bounds: clampRect(chosen.rect, area), placement: chosen.placement };
}
