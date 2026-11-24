import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import './index.css';
import App from './App.tsx';
import {
  initPWAInstallListeners,
  registerServiceWorkerPrompt,
} from './hooks/usePWAInstall';

initPWAInstallListeners();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register Service Worker in both development (for Web Push testing) and production
if ('serviceWorker' in navigator) {
  registerServiceWorkerPrompt();
}
