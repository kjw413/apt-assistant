import { Component, useEffect, type ReactNode } from 'react';
import { useApp, useAppStore } from './useApp';
import { Home } from './screens/Home';
import { Setup } from './screens/Setup';
import { Settings } from './screens/Settings';
import { Runner } from './screens/Runner';
import { KeyEntry } from './screens/KeyEntry';
import { Result } from './screens/Result';
import { ExternalSummary } from './screens/ExternalSummary';
import { ExternalKeyEntry } from './screens/ExternalKeyEntry';

class ErrorBoundary extends Component<
  { children: ReactNode; onExport: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="screen" role="alert">
          <p>진행 중 세션은 저장돼 있습니다. 새로고침하세요.</p>
          <button type="button" onClick={this.props.onExport}>내보내기</button>{' '}
          <button type="button" onClick={() => location.reload()}>새로고침</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const screen = useApp(s => s.screen);
  const ready = useApp(s => s.ready);
  const bootError = useApp(s => s.bootError);
  const boot = useApp(s => s.boot);
  const toast = useApp(s => s.toast);
  const lockWarning = useApp(s => s.lockWarning);
  const saveError = useApp(s => s.saveError);
  const exportNow = useApp(s => s.exportNow);

  if (bootError !== null) return <div className="screen" role="alert">
    <p>{bootError}</p>
    <button type="button" onClick={() => { void boot(); }}>다시 시도</button>{' '}
    <button type="button" onClick={() => location.reload()}>새로고침</button>
  </div>;
  if (!ready) return <div className="screen">불러오는 중…</div>;
  if (screen.name === 'blocked') {
    return <div className="screen">다른 창에서 열려 있습니다. 이 창을 닫으세요.</div>;
  }

  let content: ReactNode;
  switch (screen.name) {
    case 'home': content = <Home />; break;
    case 'setup': content = <Setup />; break;
    case 'settings': content = <Settings />; break;
    case 'runner': content = <Runner sessionId={screen.sessionId} />; break;
    case 'key': content = <KeyEntry sessionId={screen.sessionId} />; break;
    case 'result': content = <Result sessionId={screen.sessionId} />; break;
    case 'externalSummary': content = <ExternalSummary sessionId={screen.sessionId} />; break;
    case 'externalKey': content = <ExternalKeyEntry sessionId={screen.sessionId} />; break;
  }

  return (
    <>
      {toast && <div className="banner banner--warn" role="status">{toast}</div>}
      {lockWarning && (
        <div className="banner banner--warn" role="status">
          창 잠금을 쓸 수 없어 두 창을 동시에 열면 기록이 덮어써질 수 있습니다
        </div>
      )}
      {saveError !== null && (
        <div className="banner banner--error" role="alert">
          <span>저장 실패 — {saveError}</span>
          <button type="button" onClick={() => { void exportNow(); }}>지금 내보내기</button>
        </div>
      )}
      {content}
    </>
  );
}

export function App() {
  const store = useAppStore();

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (store.getState().data.sessions.some(s => s.status === 'in_progress')) {
        event.preventDefault();
      }
    };
    const visibilityChange = () => {
      if (document.visibilityState === 'hidden') void store.getState().flushMemos();
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('visibilitychange', visibilityChange);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('visibilitychange', visibilityChange);
    };
  }, [store]);

  return (
    <ErrorBoundary onExport={() => { void store.getState().exportNow(); }}>
      <AppContent />
    </ErrorBoundary>
  );
}
