import { useCallback, useEffect, useState } from 'react';

import { applyTheme } from './applyTheme';
import { THEME_ORDER, THEMES, type ThemeMode, type ThemeName, themeForHour } from './themes';

const STORAGE_KEY = 'yuka.theme-mode';
const CLOCK_INTERVAL_MS = 30_000;

const MODES: ThemeMode[] = ['auto', 'morning', 'day', 'evening', 'night'];

function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (MODES as string[]).includes(stored)) return stored as ThemeMode;
  } catch {
    // Storage unavailable – fall back to auto.
  }
  return 'auto';
}

const currentTimeTheme = () => themeForHour(new Date().getHours());

/** Theme to paint before React mounts (avoids a flash of the wrong theme). */
export function resolveInitialTheme(): ThemeName {
  const mode = readStoredMode();
  return mode === 'auto' ? currentTimeTheme() : mode;
}

/**
 * Theme selection: "auto" follows the local clock (re-checked every 30 s), otherwise the
 * user's choice is used and persisted. Applies the result to the document.
 */
export function useTimeTheme() {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const [clockTheme, setClockTheme] = useState<ThemeName>(currentTimeTheme);

  useEffect(() => {
    if (mode !== 'auto') return;
    const timer = setInterval(() => setClockTheme(currentTimeTheme()), CLOCK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [mode]);

  const theme: ThemeName = mode === 'auto' ? clockTheme : mode;

  useEffect(() => {
    applyTheme(theme);
    window.yuka?.setAppearance?.(THEMES[theme].scheme);
  }, [theme]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    if (next === 'auto') setClockTheme(currentTimeTheme());
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not persisted – still applied for this session.
    }
  }, []);

  /** Switches to the next theme (morning → day → evening → night → morning). */
  const cycle = useCallback(() => {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
    setMode(next);
  }, [theme, setMode]);

  return { mode, theme, setMode, cycle, modes: MODES };
}
