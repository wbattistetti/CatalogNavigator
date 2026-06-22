import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { GlideBenchPage } from './pages/GlideBenchPage.tsx';
import './index.css';
import 'dockview/dist/styles/dockview.css';

const isGlideBench =
  import.meta.env.DEV &&
  (new URLSearchParams(window.location.search).has('glide-bench') ||
    window.location.pathname.replace(/\/$/, '') === '/glide-bench');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isGlideBench ? <GlideBenchPage /> : <App />}
  </StrictMode>
);
