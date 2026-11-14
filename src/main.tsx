import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import './index.css';
import App from './App.tsx';
import { registerServiceWorkerPrompt } from './hooks/usePWAInstall';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register Service Worker in production or supporting browsers
if (import.meta.env.PROD || 'serviceWorker' in navigator) {
  registerServiceWorkerPrompt();
}
