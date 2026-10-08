// dist/index.html을 app/index.html로 복사한다. 직전 판은 app/prev/index.html로 보관한다.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'dist', 'index.html');
const appDir = path.join(root, 'app');
const cur = path.join(appDir, 'index.html');
const prevDir = path.join(appDir, 'prev');

if (!fs.existsSync(src)) {
  throw new Error('dist/index.html이 없습니다. npm run build를 먼저 실행하세요.');
}
fs.mkdirSync(prevDir, { recursive: true });
if (fs.existsSync(cur)) fs.copyFileSync(cur, path.join(prevDir, 'index.html'));
fs.copyFileSync(src, cur);
console.log(`released -> ${cur}`);
