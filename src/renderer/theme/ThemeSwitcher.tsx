import type { ReactNode } from 'react';

import { THEMES, type ThemeMode } from './themes';

interface ThemeSwitcherProps {
  mode: ThemeMode;
  modes: ThemeMode[];
  onChange: (mode: ThemeMode) => void;
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const GLYPHS: Record<ThemeMode, ReactNode> = {
  auto: (
    <>
      <circle cx="12" cy="12" r="7.5" {...stroke} />
      <path d="M12 4.5a7.5 7.5 0 0 1 0 15z" fill="currentColor" />
    </>
  ),
  morning: (
    <>
      <path d="M6.5 16a5.5 5.5 0 0 1 11 0" {...stroke} />
      <path d="M3.5 19h17M12 5.5v2.5M6 8.5l1.6 1.6M18 8.5l-1.6 1.6" {...stroke} />
    </>
  ),
  day: (
    <>
      <circle cx="12" cy="12" r="4" {...stroke} />
      <path
        d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6"
        {...stroke}
      />
    </>
  ),
  evening: (
    <>
      <path d="M6.5 15a5.5 5.5 0 0 1 11 0" {...stroke} />
      <path d="M3.5 18h17M7 21h10M12 4.5v3.5M10 6.5l2 2 2-2" {...stroke} />
    </>
  ),
  night: (
    <>
      <path d="M18.5 14.2A7 7 0 1 1 9.8 5.5a5.6 5.6 0 0 0 8.7 8.7Z" {...stroke} />
      <path d="M17 4.5v2M16 5.5h2" {...stroke} />
    </>
  ),
};

const LABELS: Record<ThemeMode, string> = {
  auto: 'Авто — по времени суток',
  morning: THEMES.morning.label,
  day: THEMES.day.label,
  evening: THEMES.evening.label,
  night: THEMES.night.label,
};

/** Segmented control; a drop of light glides to the active option. */
export function ThemeSwitcher({ mode, modes, onChange }: ThemeSwitcherProps) {
  const index = Math.max(0, modes.indexOf(mode));

  return (
    <div className="theme-switcher" role="radiogroup" aria-label="Тема оформления">
      <span
        className="theme-switcher__drop"
        style={{ transform: `translateX(calc(${index} * var(--switch-size)))` }}
        aria-hidden="true"
      />
      {modes.map((item) => (
        <button
          key={item}
          type="button"
          role="radio"
          aria-checked={item === mode}
          aria-label={LABELS[item]}
          title={LABELS[item]}
          className={`theme-switcher__option${item === mode ? ' is-active' : ''}`}
          onClick={() => onChange(item)}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            {GLYPHS[item]}
          </svg>
        </button>
      ))}
    </div>
  );
}
