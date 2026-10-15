import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted variable fonts (no font CDN; the app keeps its type offline).
import '@fontsource-variable/mona-sans/standard.css';
import '@fontsource-variable/anybody/standard-italic.css';
// System Threshold faces (Figma Make): Barlow Condensed display, Inter text, JetBrains Mono codes.
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import App from './App';
import './styles.css';
import './styles-platform.css';
import './ui/numerals.css';
import './styles-session.css';
// Last on purpose: System Threshold restyles the shared header and legacy classes, so it must
// follow the stylesheets it overrides. Components must not import it themselves (that would
// move it ahead of styles.css in the bundle).
import './styles-system-threshold.css';
import './styles-threshold-entry.css';
import './styles-threshold-protocols.css';
import './styles-threshold-workout.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
