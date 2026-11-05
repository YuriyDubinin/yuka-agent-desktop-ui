import { COLOR_KEYS, cssVarName, THEMES, type ThemeName } from './themes';

const TRANSITION = '1.8s cubic-bezier(0.4, 0, 0.2, 1)';

let registered = false;

/**
 * Registers every colour token as a typed custom property so the browser can interpolate
 * it: switching the theme then cross-fades the whole UI instead of jumping.
 */
function registerColorProperties(): void {
  if (registered) return;
  registered = true;

  for (const key of COLOR_KEYS) {
    try {
      CSS.registerProperty({
        name: cssVarName(key),
        syntax: '<color>',
        inherits: true,
        initialValue: THEMES.night.colors[key],
      });
    } catch {
      // Already registered (e.g. after a hot reload) – fine.
    }
  }

  const root = document.documentElement;
  root.style.transition = COLOR_KEYS.map((key) => `${cssVarName(key)} ${TRANSITION}`).join(', ');
}

/** Applies a theme to <html>: colour tokens, data-theme and color-scheme. */
export function applyTheme(name: ThemeName): void {
  registerColorProperties();

  const theme = THEMES[name];
  const root = document.documentElement;
  for (const key of COLOR_KEYS) {
    root.style.setProperty(cssVarName(key), theme.colors[key]);
  }
  root.dataset.theme = name;
  root.dataset.scheme = theme.scheme;
  root.style.colorScheme = theme.scheme;
}
