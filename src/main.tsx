import { createRoot } from 'react-dom/client';
import { runProbe } from './probe';

const root = document.getElementById('root')!;

if (new URLSearchParams(location.search).has('probe')) {
  void runProbe(root);
} else {
  createRoot(root).render(<p style={{ padding: 16 }}>APT Assistant 준비 중</p>);
}
