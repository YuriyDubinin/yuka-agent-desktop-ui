import { useEffect, useState } from 'react';

import type { ThemeMode, UiState } from '../../shared/protocol';
import { initialThemeMode } from '../theme/useTimeTheme';

const fallback = (themeMode: ThemeMode): UiState => ({
  presence: 'hidden',
  pinned: false,
  unread: false,
  orbHover: false,
  dragging: false,
  placement: 'left',
  themeMode,
});

/** UI state owned by main (presence, pin, hover, theme mode), mirrored into this window. */
export function useUiState(): UiState {
  const [state, setState] = useState<UiState>(() => fallback(initialThemeMode()));
  useEffect(() => window.yuka.onUi(setState), []);
  return state;
}
