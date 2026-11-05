import { useEffect, useState } from 'react';

import { isThemeMode, type ThemeMode } from '../../shared/protocol';
import { applyTheme } from './applyTheme';
import { THEMES, type ThemeName, themeForHour } from './themes';

const CLOCK_INTERVAL_MS = 30_000;

const currentTimeTheme = () => themeForHour(new Date().getHours());

/** The theme mode main put into the page URL (`?theme=…`), so the first paint is right. */
export function initialThemeMode(): ThemeMode {
  const fromUrl = new URLSearchParams(window.location.search).get('theme');
  return isThemeMode(fromUrl) ? fromUrl : 'auto';
}

export function resolveTheme(mode: ThemeMode): ThemeName {
  return mode === 'auto' ? currentTimeTheme() : mode;
}

/**
 * The active theme for a mode chosen in main (context menu). "auto" follows the local
 * clock, re-checked every 30 s – both windows compute it the same way. Applies the result
 * to the document and aligns the native vibrancy with its light/dark scheme.
 */
export function useTimeTheme(mode: ThemeMode): ThemeName {
  const [clockTheme, setClockTheme] = useState<ThemeName>(currentTimeTheme);

  // The clock is always followed (cheap), so switching to "auto" is instantly right.
  useEffect(() => {
    const timer = setInterval(() => setClockTheme(currentTimeTheme()), CLOCK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const theme: ThemeName = mode === 'auto' ? clockTheme : mode;

  useEffect(() => {
    applyTheme(theme);
    window.yuka?.setAppearance?.(THEMES[theme].scheme);
  }, [theme]);

  return theme;
}
