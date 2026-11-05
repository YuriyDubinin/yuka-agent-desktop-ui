import '@fontsource-variable/manrope';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/app.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { applyTheme } from './theme/applyTheme';
import { resolveInitialTheme } from './theme/useTimeTheme';

applyTheme(resolveInitialTheme());

const container = document.getElementById('root');
if (!container) throw new Error('#root element is missing');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
