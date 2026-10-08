import { useApp } from '../useApp';

export function Home() {
  const go = useApp(s => s.go);
  return (
    <div className="screen">
      TODO Home{' '}
      <button type="button" onClick={() => go({ name: 'setup' })}>새 세션</button>{' '}
      <button type="button" onClick={() => go({ name: 'settings' })}>설정</button>
    </div>
  );
}
