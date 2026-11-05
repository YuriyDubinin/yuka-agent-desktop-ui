// Design tokens for the four time-of-day themes.
// Single source of truth: the values feed both CSS custom properties (animated via
// @property) and the WebGL shaders (interpolated per frame).

import type { ThemeName } from '../../shared/protocol';

export type { ThemeMode, ThemeName } from '../../shared/protocol';

/** Colour tokens exposed to CSS as `--c-<kebab-name>`. */
export interface ThemeColors {
  /** The ice panel, drawn over native vibrancy: tint, top/bottom edge, diagonal sheen. */
  iceTint: string;
  iceEdge: string;
  iceEdgeLow: string;
  iceSheen: string;
  /** Hairline separators. */
  hairline: string;

  text: string;
  textSecondary: string;
  textMuted: string;

  accent: string;
  accentAlt: string;
  accentGlow: string;
  /** Text on top of the accent colour. */
  onAccent: string;

  /** Yuka's core. */
  core1: string;
  core2: string;
  core3: string;

  userBubble: string;
  codeBg: string;
  danger: string;
  success: string;
  warning: string;
}

export interface Theme {
  name: ThemeName;
  label: string;
  scheme: 'light' | 'dark';
  colors: ThemeColors;
}

export const THEMES: Record<ThemeName, Theme> = {
  morning: {
    name: 'morning',
    label: 'Утро',
    scheme: 'light',
    colors: {
      iceTint: 'rgba(255, 244, 240, 0.30)',
      iceEdge: 'rgba(255, 255, 255, 0.82)',
      iceEdgeLow: 'rgba(118, 74, 92, 0.16)',
      iceSheen: 'rgba(255, 255, 255, 0.55)',
      hairline: 'rgba(96, 62, 84, 0.12)',
      text: '#2a2030',
      textSecondary: '#5a4b5f',
      textMuted: '#74677a',
      accent: '#c4587e',
      accentAlt: '#e38a55',
      accentGlow: 'rgba(230, 120, 120, 0.32)',
      onAccent: '#ffffff',
      core1: '#ffa77e',
      core2: '#e58ccc',
      core3: '#fff3dc',
      userBubble: 'rgba(255, 255, 255, 0.58)',
      codeBg: 'rgba(58, 36, 56, 0.06)',
      danger: '#d2475b',
      success: '#3aa57a',
      warning: '#d98a2b',
    },
  },
  day: {
    name: 'day',
    label: 'День',
    scheme: 'light',
    colors: {
      iceTint: 'rgba(238, 246, 255, 0.30)',
      iceEdge: 'rgba(255, 255, 255, 0.88)',
      iceEdgeLow: 'rgba(30, 60, 110, 0.14)',
      iceSheen: 'rgba(255, 255, 255, 0.6)',
      hairline: 'rgba(24, 52, 96, 0.11)',
      text: '#0e1b2c',
      textSecondary: '#3f5168',
      textMuted: '#62738a',
      accent: '#2a73f0',
      accentAlt: '#13b6cf',
      accentGlow: 'rgba(42, 115, 240, 0.28)',
      onAccent: '#ffffff',
      core1: '#4fa6ff',
      core2: '#6fe8d8',
      core3: '#eaf7ff',
      userBubble: 'rgba(255, 255, 255, 0.62)',
      codeBg: 'rgba(16, 40, 80, 0.055)',
      danger: '#d43f56',
      success: '#1f9d70',
      warning: '#d0861f',
    },
  },
  evening: {
    name: 'evening',
    label: 'Вечер',
    scheme: 'dark',
    colors: {
      iceTint: 'rgba(52, 22, 48, 0.28)',
      iceEdge: 'rgba(255, 214, 196, 0.32)',
      iceEdgeLow: 'rgba(8, 2, 10, 0.4)',
      iceSheen: 'rgba(255, 220, 200, 0.14)',
      hairline: 'rgba(255, 190, 170, 0.1)',
      text: '#fbeee9',
      textSecondary: '#ecd2cd',
      textMuted: '#c4a6aa',
      accent: '#ff8a5a',
      accentAlt: '#ff4f8b',
      accentGlow: 'rgba(255, 118, 86, 0.36)',
      onAccent: '#2a0f1c',
      core1: '#ffae45',
      core2: '#ff5a7d',
      core3: '#ffe2c6',
      userBubble: 'rgba(110, 52, 92, 0.5)',
      codeBg: 'rgba(10, 2, 12, 0.36)',
      danger: '#ff5d73',
      success: '#5fd3a0',
      warning: '#ffb44d',
    },
  },
  night: {
    name: 'night',
    label: 'Ночь',
    scheme: 'dark',
    colors: {
      iceTint: 'rgba(14, 20, 48, 0.28)',
      iceEdge: 'rgba(190, 215, 255, 0.3)',
      iceEdgeLow: 'rgba(0, 0, 8, 0.45)',
      iceSheen: 'rgba(190, 215, 255, 0.12)',
      hairline: 'rgba(150, 180, 255, 0.09)',
      text: '#e8eeff',
      textSecondary: '#bfc8e8',
      textMuted: '#959fc2',
      accent: '#72f0d6',
      accentAlt: '#9a8aff',
      accentGlow: 'rgba(86, 230, 200, 0.3)',
      onAccent: '#03141a',
      core1: '#52f1d2',
      core2: '#8566ff',
      core3: '#e6fbff',
      userBubble: 'rgba(44, 56, 112, 0.52)',
      codeBg: 'rgba(0, 0, 8, 0.4)',
      danger: '#ff6b81',
      success: '#4fe0a8',
      warning: '#ffc25c',
    },
  },
};

export const THEME_ORDER: ThemeName[] = ['morning', 'day', 'evening', 'night'];

/** Hour boundaries (local time): morning 5–11, day 11–17, evening 17–22, night 22–5. */
export function themeForHour(hour: number): ThemeName {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'day';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

export const cssVarName = (key: keyof ThemeColors) =>
  `--c-${key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`;

export const COLOR_KEYS = Object.keys(THEMES.night.colors) as (keyof ThemeColors)[];

/** Parses #rrggbb or rgba(...) into linear-ish [r, g, b] in 0..1 for shaders. */
export function toRgb(color: string): [number, number, number] {
  if (color.startsWith('#')) {
    const value = parseInt(color.slice(1), 16);
    return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
  }
  const parts = color.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
  return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
}
