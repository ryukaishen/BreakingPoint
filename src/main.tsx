import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted variable fonts (no font CDN; the app keeps its type offline).
import '@fontsource-variable/mona-sans/standard.css';
import '@fontsource-variable/anybody/standard-italic.css';
import App from './App';
import './styles.css';
import './styles-platform.css';
import './ui/numerals.css';
import './styles-session.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
