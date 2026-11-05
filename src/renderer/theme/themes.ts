// Design tokens for the four time-of-day themes.
// Single source of truth: the values feed both CSS custom properties (animated via
// @property) and the WebGL shaders (interpolated per frame).

export type ThemeName = 'morning' | 'day' | 'evening' | 'night';
export type ThemeMode = ThemeName | 'auto';

/** Colour tokens exposed to CSS as `--c-<kebab-name>`. */
export interface ThemeColors {
  /** Base gradient behind the aurora. */
  bgTop: string;
  bgBottom: string;
  /** Aurora streams. */
  aurora1: string;
  aurora2: string;
  aurora3: string;

  /** Glass surfaces. */
  glass: string;
  glassStrong: string;
  glassBorder: string;
  glassHighlight: string;
  glassShadow: string;
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

/** Non-colour parameters of the background shader. */
export interface SceneParams {
  stars: number; // star field intensity
  haze: number; // warm haze rising from the bottom (morning)
  horizon: number; // sunset band near the horizon (evening)
  auroraStrength: number;
  grain: number;
}

export interface Theme {
  name: ThemeName;
  label: string;
  scheme: 'light' | 'dark';
  colors: ThemeColors;
  scene: SceneParams;
}

export const THEMES: Record<ThemeName, Theme> = {
  morning: {
    name: 'morning',
    label: 'Утро',
    scheme: 'light',
    colors: {
      bgTop: '#f7eee8',
      bgBottom: '#eee2ee',
      aurora1: '#ffc2a1',
      aurora2: '#d9c3f2',
      aurora3: '#ffe2ad',
      glass: 'rgba(255, 252, 250, 0.52)',
      glassStrong: 'rgba(255, 252, 250, 0.74)',
      glassBorder: 'rgba(255, 255, 255, 0.78)',
      glassHighlight: 'rgba(255, 255, 255, 0.95)',
      glassShadow: 'rgba(118, 74, 92, 0.18)',
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
      userBubble: 'rgba(255, 255, 255, 0.62)',
      codeBg: 'rgba(58, 36, 56, 0.06)',
      danger: '#d2475b',
      success: '#3aa57a',
      warning: '#d98a2b',
    },
    scene: { stars: 0, haze: 1, horizon: 0, auroraStrength: 1, grain: 0.035 },
  },
  day: {
    name: 'day',
    label: 'День',
    scheme: 'light',
    colors: {
      bgTop: '#eef4fb',
      bgBottom: '#e4edf8',
      aurora1: '#9cd6ff',
      aurora2: '#b8c6ff',
      aurora3: '#c3fbef',
      glass: 'rgba(255, 255, 255, 0.55)',
      glassStrong: 'rgba(255, 255, 255, 0.78)',
      glassBorder: 'rgba(255, 255, 255, 0.85)',
      glassHighlight: 'rgba(255, 255, 255, 1)',
      glassShadow: 'rgba(30, 60, 110, 0.16)',
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
      userBubble: 'rgba(255, 255, 255, 0.66)',
      codeBg: 'rgba(16, 40, 80, 0.055)',
      danger: '#d43f56',
      success: '#1f9d70',
      warning: '#d0861f',
    },
    scene: { stars: 0, haze: 0.15, horizon: 0, auroraStrength: 1, grain: 0.03 },
  },
  evening: {
    name: 'evening',
    label: 'Вечер',
    scheme: 'dark',
    colors: {
      bgTop: '#1b1026',
      bgBottom: '#2b1330',
      aurora1: '#ff7a55',
      aurora2: '#d23f7d',
      aurora3: '#ffae45',
      glass: 'rgba(42, 20, 46, 0.46)',
      glassStrong: 'rgba(48, 24, 54, 0.66)',
      glassBorder: 'rgba(255, 196, 176, 0.16)',
      glassHighlight: 'rgba(255, 220, 200, 0.22)',
      glassShadow: 'rgba(8, 2, 10, 0.5)',
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
      userBubble: 'rgba(86, 40, 74, 0.62)',
      codeBg: 'rgba(10, 2, 12, 0.36)',
      danger: '#ff5d73',
      success: '#5fd3a0',
      warning: '#ffb44d',
    },
    scene: { stars: 0.25, haze: 0, horizon: 1, auroraStrength: 0.75, grain: 0.04 },
  },
  night: {
    name: 'night',
    label: 'Ночь',
    scheme: 'dark',
    colors: {
      bgTop: '#04050d',
      bgBottom: '#0a0e22',
      aurora1: '#2be0c2',
      aurora2: '#7458ff',
      aurora3: '#1c66ff',
      glass: 'rgba(14, 18, 38, 0.46)',
      glassStrong: 'rgba(18, 22, 46, 0.66)',
      glassBorder: 'rgba(160, 190, 255, 0.13)',
      glassHighlight: 'rgba(190, 215, 255, 0.18)',
      glassShadow: 'rgba(0, 0, 6, 0.6)',
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
      userBubble: 'rgba(30, 38, 80, 0.64)',
      codeBg: 'rgba(0, 0, 8, 0.4)',
      danger: '#ff6b81',
      success: '#4fe0a8',
      warning: '#ffc25c',
    },
    scene: { stars: 1, haze: 0, horizon: 0, auroraStrength: 0.9, grain: 0.04 },
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
