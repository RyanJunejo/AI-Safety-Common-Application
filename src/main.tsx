import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { legacyRedirect } from './router';
import { Providers } from './state/Providers';
import './styles.css';

// Old Common App links (#/programs/mats, #/resources) go to their new pages before the first render.
const legacy = legacyRedirect(window.location.hash);
if (legacy) window.history.replaceState(null, '', legacy);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <App />
    </Providers>
  </StrictMode>,
);
