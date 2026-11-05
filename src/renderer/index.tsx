import '@fontsource-variable/manrope';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/base.css';
import './styles/orb.css';
import './styles/panel.css';
import './styles/messages.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { applyTheme } from './theme/applyTheme';
import { initialThemeMode, resolveTheme } from './theme/useTimeTheme';
import { OrbView } from './views/OrbView';
import { PanelView } from './views/PanelView';

// Paint the right theme before React mounts (no flash).
applyTheme(resolveTheme(initialThemeMode()));

// One bundle, two windows: main loads index.html?view=orb|panel.
const view = window.yuka.view;
document.documentElement.dataset.view = view;

// Screenshot harness only: a fake desktop behind the transparent window.
const preview = new URLSearchParams(window.location.search).get('preview');
if (preview === 'light' || preview === 'dark') document.documentElement.dataset.preview = preview;

const container = document.getElementById('root');
if (!container) throw new Error('#root element is missing');

createRoot(container).render(
  <StrictMode>{view === 'orb' ? <OrbView /> : <PanelView />}</StrictMode>,
);
