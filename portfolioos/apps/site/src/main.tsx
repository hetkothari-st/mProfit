import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './styles/index';

const root = document.getElementById('root')!;
const app = (
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// Each route is prerendered at build time. Hydrate when the HTML we were
// served is the one for this path; otherwise (dev server, or a host that
// falls back to the home page for unknown paths) render from scratch.
const served = root.dataset.prerendered;
const here = window.location.pathname.replace(/\/+$/, '') || '/';
const isNotFoundPage = served === '/404';
if (served && (served === here || isNotFoundPage)) hydrateRoot(root, app);
else {
  root.replaceChildren();
  createRoot(root).render(app);
}
