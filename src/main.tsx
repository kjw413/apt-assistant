import { createRoot } from 'react-dom/client';
import { AptDb } from './data/db';
import { createDexieRepo } from './data/repo';
import { runProbe } from './probe';
import { acquireWriterLock, downloadText } from './state/platform';
import { createAppStore } from './state/store';
import { App } from './ui/App';
import { AppProvider } from './ui/useApp';
import './ui/app.css';

const root = document.getElementById('root')!;

if (new URLSearchParams(location.search).has('probe')) {
  void runProbe(root);
} else {
  const repo = createDexieRepo(new AptDb());
  const store = createAppStore({
    repo,
    now: () => Date.now(),
    download: downloadText,
    acquireLock: acquireWriterLock,
  });
  createRoot(root).render(<AppProvider store={store}><App /></AppProvider>);
  void store.getState().boot();

  const tick = () => {
    if (store.getState().ready) void store.getState().tick();
  };
  setInterval(tick, 250);
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('focus', tick);
  window.addEventListener('pageshow', tick);
}
