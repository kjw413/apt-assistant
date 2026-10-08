# APT Assistant v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **이 계획의 실행 방식(사용자 결정, 2026-10-08 23:4x):** 이 세션의 Claude가 직접 구현한다(Native → superpowers:executing-plans). 마지막에 새 리뷰어 1명이 전체 브랜치를 검토한다. 계획 검토는 사용자가 아침에 한다.
>
> **코드 표기 원칙:** 도메인 로직의 테스트 코드는 이 계획에 전문을 싣는다(행동 계약). 구현 코드는 실행자가 테스트와 spec을 근거로 작성한다. UI는 필수 동작, 접근성 이름/testid, Playwright 테스트로 계약을 정한다.

**Goal:** DCAT·LG 영역별 시간 구조로 연습하고(타이머·OMR·계산기·메모·그림판), 회차 결과(시간 내/전체 점수)를 남기는 로컬 웹앱 v0.1을 만든다.

**Architecture:** React 19 + TypeScript 앱을 `vite-plugin-singlefile`로 `dist/index.html` 한 파일로 빌드해 Chrome `--app` 창(file://)에서 연다. 순수 도메인(이벤트 로그 리듀서·타이머·채점·계산기) ← Zustand 스토어 ← Dexie(IndexedDB) 저장소 구조이고, 세션은 시각이 붙은 이벤트 로그만 저장하며 파생값은 조회할 때 계산한다.

**Tech Stack:** Vite, React 19, TypeScript(strict), Zustand(vanilla store + React hook), Dexie 4, CSS Modules + 전역 CSS, Vitest + fake-indexeddb, Playwright(설치된 Chrome, channel `chrome`).

**Spec:** [docs/superpowers/specs/2026-10-08-apt-assistant-design.md](../specs/2026-10-08-apt-assistant-design.md) — 이 계획은 spec을 근거로 한다. 충돌하면 spec이 우선한다.

## Global Constraints

- 실행 환경: Windows 11, Node 24.14.0, npm 11.9.0, Chrome 154(`C:\Program Files\Google\Chrome\Application\chrome.exe`).
- 산출물은 외부 참조가 없는 `dist/index.html` 하나다. file://에서 동작해야 하므로 동적 import, Web Worker, 런타임 fetch를 쓰지 않는다.
- 의존성은 이것만: `react`, `react-dom`, `zustand`, `dexie` / 개발용 `vite`, `@vitejs/plugin-react`, `vite-plugin-singlefile`, `typescript`, `vitest`, `fake-indexeddb`, `@playwright/test`, `@types/react`, `@types/react-dom`, `@types/node`. 차트 라이브러리 금지.
- UI 문구는 한국어다.
- 시험 값은 spec §3.1 그대로다: DCAT `verbal-logic` 20문항/1200초, `verbal-expression` 15/600, `numerical` 20/1200, `spatial` 10/450, `figure` 10/450(공간·도형은 도구 잠금). LG `verbal-comprehension`·`verbal-reasoning`·`data-interpretation`·`creative-math` 각 20/1200. 모두 5지선다, 쉬는 시간 15초, 실전 자동 시작.
- `schemaVersion`은 1이다. 모든 쓰기는 `{...원본, ...변경}`으로 모르는 필드를 보존한다.
- domain 함수는 `Date.now()`를 부르지 않고 `now`를 인자로 받는다.
- 세션 이벤트 배열은 `t` 오름차순(같은 값 허용)을 항상 유지한다.
- 러너의 모든 버튼은 `tabIndex={-1}`이고 `onMouseDown`에서 `preventDefault()`한다. `window.confirm`·`alert`·`prompt`는 쓰지 않는다.
- 실데이터 Chrome 프로필은 `%LOCALAPPDATA%\APT-Assistant\chrome-profile`이다. 테스트는 `e2e/.profile-test/` 아래만 쓴다.
- 매 작업 끝에 `npm test`(해당 작업 이후) 와 `npm run build`가 통과해야 한다. UI 작업은 해당 Playwright 스펙도 통과해야 한다.

## Review Focus

spec이 함축하지만 일반 경로 테스트로는 드러나지 않는, 사람이 쓰다가 가장 먼저 부딪힐 입력·상황 다섯 가지와 담당 작업:

1. 정답표가 원문자(③)·전각 숫자(２)로 되어 있어 그대로 붙여 넣는다 → 숫자로 읽혀야 한다. (Task 5 `parseKey` 테스트)
2. '시작' 버튼을 빠르게 두 번 누른다 → 세션은 1개만 생긴다. (Task 7 store 테스트)
3. 진행 중 세션이 있는데 설정에서 백업을 복원한다 → 거부되고 기록이 그대로다. (Task 7 store 테스트)
4. e-book 창을 클릭했다가 툴로 돌아와 OMR 버블을 누른 뒤 숫자를 친다 → 메모가 아니라 계산기로 가고 답은 바뀌지 않는다. (Task 10 Playwright)
5. 1366×768·125% 화면의 30% 창(340×530)에서 쓴다 → 가로 스크롤 없이 OMR 4행 이상이 보인다. (Task 10 Playwright)

---

## File Structure

```
.gitignore                     node_modules/ dist/ app/ e2e/.profile-test/ test-results/ playwright-report/
package.json  tsconfig.json  vite.config.ts  playwright.config.ts  index.html
scripts/release.mjs            dist/index.html → app/index.html (직전 판은 app/prev/)
scripts/make-shortcut.ps1      바탕화면 'APT Assistant' 바로가기
src/main.tsx                   부트스트랩(?probe면 프로브, 아니면 앱)
src/probe.ts                   file:// 영속성 프로브(원시 IndexedDB 카운터)
src/domain/types.ts            모든 타입·상수(계약)
src/domain/profiles.ts         내장 프로필, 프로필 편집 검사, plan 생성, 시간 요약
src/domain/calculator.ts       즉시 실행형 계산기 리듀서
src/domain/events.ts           이벤트 재생 도우미(현재 답·⚑·영역 경계)
src/domain/timer.ts            정지 합집합, 마감, 단계(phase), 페이스
src/domain/session.ts          createSession, advance, reduce, catchUpAfterGap, isGap
src/domain/derive.ts           answersAt, laps, questionViews
src/domain/grading.ts          parseKey, summarize
src/domain/backup.ts           백업 파일 생성·검사·migrate, 파일 이름, AllData 기본값
src/domain/testkit.ts          테스트 전용 세션·plan 생성 도우미
src/data/db.ts                 Dexie 스키마 v1
src/data/repo.ts               Repo 구현(kv: settings, meta, memo:<id>, alive:<id>)
src/state/platform.ts          Web Locks 잠금, 파일 다운로드
src/state/store.ts             앱 스토어(부팅·세션·채점·백업·설정 동작)
src/ui/App.tsx                 화면 라우팅, 차단 화면, 오류 경계
src/ui/useApp.ts               스토어 컨텍스트와 훅
src/ui/app.css                 전역 스타일(토큰·버튼·표·화면 공통)
src/ui/format.ts               시각·시간 표기
src/ui/alerts.ts               알림 스케줄(순수) + WebAudio 비프
src/ui/ConfirmDialog.tsx       화면 안 확인 대화상자
src/ui/tools/ToolDock.tsx      메모·그림판 탭 + 계산기, 키 라우팅, 잠금
src/ui/tools/Calculator.tsx    계산기 키패드·표시
src/ui/tools/Paint.tsx         그림판 캔버스
src/ui/tools/paintStore.ts     세션별 획 저장(모듈 상태)
src/ui/tools/tools.module.css  도구 스타일
src/ui/screens/Home.tsx  Setup.tsx  ProfileEditor.tsx  Runner.tsx  BreakScreen.tsx  KeyEntry.tsx  Result.tsx  Settings.tsx
e2e/helpers.ts  probe.spec.ts  runner.spec.ts  flow.spec.ts
```

---

### Task 1: 스캐폴드, 영속 프로브, 릴리스·바로가기 스크립트

**Files:**
- Create: `.gitignore`, `package.json`, `tsconfig.json`, `vite.config.ts`, `playwright.config.ts`, `index.html`, `src/main.tsx`, `src/probe.ts`, `scripts/release.mjs`, `scripts/make-shortcut.ps1`, `e2e/helpers.ts`, `e2e/probe.spec.ts`

**Interfaces:**
- Produces: `npm run build` → `dist/index.html`(단일 파일), `npm test`(vitest), `npm run e2e`(build + playwright), `npm run release`. `e2e/helpers.ts`의 `APP_URL`, `launch(name, opts)`.

- [ ] **Step 1: git 저장소와 .gitignore**

```bash
cd "E:/APT assistant" && git init && git branch -m main
```

`.gitignore`:
```
node_modules/
dist/
app/
e2e/.profile-test/
test-results/
playwright-report/
```

- [ ] **Step 2: package.json과 의존성 설치**

```json
{
  "name": "apt-assistant",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "e2e": "npm run build && playwright test",
    "release": "npm test && npm run e2e && node scripts/release.mjs"
  }
}
```

```bash
npm i react react-dom zustand dexie
npm i -D vite @vitejs/plugin-react vite-plugin-singlefile typescript vitest fake-indexeddb @playwright/test @types/react @types/react-dom @types/node
```
Expected: 설치 성공. `vite-plugin-singlefile`가 최신 vite와 peer 충돌을 내면, 그 플러그인이 지원하는 가장 높은 vite 메이저로 고정해 다시 설치한다.

- [ ] **Step 3: 설정 파일**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "e2e", "vite.config.ts", "playwright.config.ts"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  build: { target: 'es2022' },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
});
```

`index.html`:
```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>APT Assistant</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: 프로브 E2E를 먼저 쓴다(실패 확인용)**

`e2e/helpers.ts`:
```ts
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const APP_URL = pathToFileURL(path.resolve('dist/index.html')).href;

export async function launch(
  name: string,
  opts: { fresh?: boolean; viewport?: { width: number; height: number } } = {},
): Promise<{ ctx: BrowserContext; page: Page }> {
  const dir = path.resolve('e2e/.profile-test', name);
  if (opts.fresh !== false) fs.rmSync(dir, { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext(dir, {
    channel: 'chrome',
    headless: true,
    acceptDownloads: true,
    viewport: opts.viewport ?? { width: 460, height: 900 },
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  return { ctx, page };
}
```

`e2e/probe.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { APP_URL, launch } from './helpers';

test('file:// 영속성 프로브: 재시작 뒤 IndexedDB 카운터가 이어진다', async () => {
  let { ctx, page } = await launch('probe');
  await page.goto(APP_URL + '?probe');
  await expect(page.getByTestId('probe-count')).toHaveText('1');
  const info = (await page.getByTestId('probe-info').textContent()) ?? '';
  expect(info).toContain('secure=true');
  expect(info).toContain('locks=true');
  await ctx.close();

  ({ ctx, page } = await launch('probe', { fresh: false }));
  await page.goto(APP_URL + '?probe');
  await expect(page.getByTestId('probe-count')).toHaveText('2');
  await ctx.close();
});
```

Run: `npx playwright test e2e/probe.spec.ts` → Expected: FAIL(`dist/index.html` 없음).

- [ ] **Step 5: main.tsx와 probe.ts**

- `src/probe.ts`의 `runProbe(root: HTMLElement): Promise<void>`: 원시 `indexedDB`로 DB `apt-probe`(store `kv`)의 `count`를 읽어 +1 하고 저장한 뒤, `<p data-testid="probe-count">{n}</p>`와 `<p data-testid="probe-info">secure={isSecureContext} locks={'locks' in navigator} persisted={await navigator.storage.persisted()}</p>`를 `root`에 그린다(React 없이 DOM API로).
- `src/main.tsx`: `?probe`가 있으면 `runProbe`, 없으면 React로 `<p>APT Assistant 준비 중</p>`를 그린다(Task 9에서 앱으로 바꾼다).

- [ ] **Step 6: 빌드와 프로브 통과 확인**

Run: `npm run build && npx playwright test e2e/probe.spec.ts`
Expected: `dist/index.html` 1개(같은 폴더에 다른 js/css 파일 없음), 프로브 PASS.

- [ ] **Step 7: 릴리스·바로가기 스크립트**

`scripts/release.mjs`:
```js
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'dist', 'index.html');
const appDir = path.join(root, 'app');
const cur = path.join(appDir, 'index.html');
const prevDir = path.join(appDir, 'prev');

if (!fs.existsSync(src)) throw new Error('dist/index.html이 없습니다. npm run build를 먼저 실행하세요.');
fs.mkdirSync(prevDir, { recursive: true });
if (fs.existsSync(cur)) fs.copyFileSync(cur, path.join(prevDir, 'index.html'));
fs.copyFileSync(src, cur);
console.log(`released → ${cur}`);
```

`scripts/make-shortcut.ps1`:
```powershell
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$profileDir = Join-Path $env:LOCALAPPDATA 'APT-Assistant\chrome-profile'
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
$appUrl = 'file:///E:/APT%20assistant/app/index.html'
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut((Join-Path $desktop 'APT Assistant.lnk'))
$lnk.TargetPath = $chrome
$lnk.Arguments = "--user-data-dir=`"$profileDir`" --no-first-run --no-default-browser-check --autoplay-policy=no-user-gesture-required --app=`"$appUrl`""
$lnk.WorkingDirectory = 'E:\APT assistant'
$lnk.Description = 'APT Assistant (DCAT/LG 연습)'
$lnk.Save()
Write-Output "shortcut → $(Join-Path $desktop 'APT Assistant.lnk')"
```

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "chore: scaffold single-file vite app with file:// persistence probe"
```

---

### Task 2: 도메인 타입과 시험 프로필

**Files:**
- Create: `src/domain/types.ts`, `src/domain/profiles.ts`, `src/domain/profiles.test.ts`

**Interfaces:**
- Produces(types.ts): spec §6.2·§6.3의 모든 타입 + `SCHEMA_VERSION = 1`, `APP_VERSION = '0.1.0'`, `SetLayoutPart`, `SetupDraft`, `Settings`, `AllData`(`memos` 포함), `SectionSummary`(`started` 포함), `SessionSummary`(`unseenSections` 포함). v0.2 타입 `ImportRecord`, `Taxonomy`, `AliasEntry`는 spec §12.5 그대로 선언만 한다.
  - `SetupDraft = { profileId; scope; mode; policy; sectionIdx: number | null; drillCount: number; drillSeconds: number | null; setId: string | null; newSetName: string; startNo: number; numberingMode: 'continuous' | 'perSection'; label: string }`
  - `Settings = { autoBackupDownload: boolean; sound: boolean; flash: boolean; lastSetup?: SetupDraft }`
- Produces(profiles.ts):
  - `BUILTIN_PROFILES: ExamProfile[]`, `DEFAULT_SETTINGS: Settings`(`{ autoBackupDownload: true, sound: true, flash: true }`)
  - `effectiveProfile(id: string, overrides: ExamProfile[]): ExamProfile` — 수정본(같은 id) 우선, 없으면 내장값의 **깊은 복사**. 모르는 id는 throw.
  - `validateProfileEdit(p: ExamProfile): { ok: true } | { ok: false; errors: { path: string; msg: string }[] }` — 영역 시간 정수 10~10800, `breakSec` 정수 0~600, 영역 이름 비어 있지 않음.
  - `profilePaceSec(p): number` = round(Σseconds / Σquestions)
  - `defaultDrillSeconds(p, sectionIdx: number | null, count: number): number`
  - `makeSetLayout(p, scope, opts: { sectionIdx?: number | null; drillCount?: number }): SetLayoutPart[]`
  - `makePlan(p, set: ProblemSet | null, scope, opts?: { sectionIdx?: number | null; drill?: DrillSpec; external?: boolean }): SectionPlan[]` — plan은 프로필과 참조를 공유하지 않는 스냅샷. `set`이 null이면 프로필 영역 배치를 쓴다(외부 모의). `external: true`면 모든 `breakSec = 0`.
  - `formatTimesSummary(p): string`, `formatMmSs(sec: number): string`

- [ ] **Step 1: 실패하는 테스트**

`src/domain/profiles.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  BUILTIN_PROFILES, effectiveProfile, validateProfileEdit, makeSetLayout, makePlan,
  defaultDrillSeconds, formatTimesSummary, profilePaceSec,
} from './profiles';
import type { ExamProfile, ProblemSet, SetLayoutPart } from './types';

const dcat = () => effectiveProfile('dcat', []);
const lg = () => effectiveProfile('lg-wayfit', []);

function setFor(p: ExamProfile, layout: SetLayoutPart[] = makeSetLayout(p, 'full', {})): ProblemSet {
  return {
    id: 'set1', name: 't', profileId: p.id, layout, choices: p.choices,
    numbering: { startNo: 1, mode: 'continuous' }, key: null, ranges: [],
    createdAt: 0, updatedAt: 0, schemaVersion: 1,
  };
}

describe('내장 프로필(교재 값)', () => {
  it('DCAT: 5영역 75문항 3900초, 5지선다', () => {
    const p = dcat();
    expect(p.sections.map(s => s.name)).toEqual(['언어논리', '언어표현', '수리자료분석', '공간추리', '도형추리']);
    expect(p.sections.map(s => s.id)).toEqual(['verbal-logic', 'verbal-expression', 'numerical', 'spatial', 'figure']);
    expect(p.sections.map(s => s.questions)).toEqual([20, 15, 20, 10, 10]);
    expect(p.sections.map(s => s.seconds)).toEqual([1200, 600, 1200, 450, 450]);
    expect(p.choices).toBe(5);
  });
  it('DCAT 공간추리·도형추리는 도구 잠금, 나머지는 허용, 수리는 계산기 펼침', () => {
    const p = dcat();
    expect(p.sections[3].tools.allowed).toEqual({ calc: false, memo: false, paint: false });
    expect(p.sections[4].tools.allowed).toEqual({ calc: false, memo: false, paint: false });
    for (const s of p.sections.slice(0, 3)) expect(s.tools.allowed).toEqual({ calc: true, memo: true, paint: true });
    expect(p.sections.map(s => s.tools.calc).slice(0, 3)).toEqual(['collapsed', 'collapsed', 'open']);
  });
  it('LG: 4영역 각 20문항 1200초', () => {
    const p = lg();
    expect(p.sections.map(s => s.name)).toEqual(['언어이해', '언어추리', '자료해석', '창의수리']);
    expect(p.sections.every(s => s.questions === 20 && s.seconds === 1200)).toBe(true);
    expect(p.sections.map(s => s.tools.calc)).toEqual(['collapsed', 'collapsed', 'open', 'open']);
  });
  it('공통 기본 규칙', () => {
    for (const p of BUILTIN_PROFILES) {
      expect(p.breakSec).toBe(15);
      expect(p.autoStart).toBe(true);
      expect(p.navigation).toEqual({ backWithinSection: true, backAcrossSections: false, carryOver: false });
      expect(p.penalty.enabled).toBe(false);
      expect(p.calcKeyboard).toBe(true);
      expect(p.schemaVersion).toBe(1);
    }
  });
  it('평균 페이스: DCAT 52초, LG 60초', () => {
    expect(profilePaceSec(dcat())).toBe(52);
    expect(profilePaceSec(lg())).toBe(60);
  });
});

describe('effectiveProfile', () => {
  it('수정본이 있으면 수정본', () => {
    const edited = dcat();
    edited.sections[0].seconds = 900;
    expect(effectiveProfile('dcat', [edited]).sections[0].seconds).toBe(900);
  });
  it('반환값을 고쳐도 내장값은 그대로', () => {
    const a = dcat();
    a.sections[0].seconds = 1;
    a.sections[3].tools.allowed.calc = true;
    expect(dcat().sections[0].seconds).toBe(1200);
    expect(dcat().sections[3].tools.allowed.calc).toBe(false);
  });
  it('모르는 id면 예외', () => {
    expect(() => effectiveProfile('nope', [])).toThrow();
  });
});

describe('validateProfileEdit', () => {
  it('내장값은 통과', () => {
    expect(validateProfileEdit(dcat())).toEqual({ ok: true });
  });
  it('영역 시간: 10초 미만, 3시간 초과, 정수 아님은 거부', () => {
    const p = dcat();
    p.sections[0].seconds = 9;
    p.sections[1].seconds = 10_801;
    p.sections[2].seconds = 12.5;
    const r = validateProfileEdit(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map(e => e.path).sort()).toEqual(['sections.0.seconds', 'sections.1.seconds', 'sections.2.seconds']);
  });
  it('쉬는 시간 0~600초', () => {
    const p = dcat();
    p.breakSec = 601;
    const r = validateProfileEdit(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].path).toBe('breakSec');
    p.breakSec = 0;
    expect(validateProfileEdit(p).ok).toBe(true);
  });
});

describe('makeSetLayout / makePlan', () => {
  it('전체 모의: 영역 경계와 시간·페이스', () => {
    const p = dcat();
    const plan = makePlan(p, setFor(p), 'full');
    expect(plan.map(x => [x.qFrom, x.qTo])).toEqual([[0, 19], [20, 34], [35, 54], [55, 64], [65, 74]]);
    expect(plan.map(x => x.limitSec)).toEqual([1200, 600, 1200, 450, 450]);
    expect(plan.map(x => x.paceSec)).toEqual([60, 40, 60, 45, 45]);
    expect(plan.every(x => x.breakSec === 15 && x.choices === 5)).toBe(true);
    expect(plan[3].tools.allowed.calc).toBe(false);
  });
  it('plan은 스냅샷: 이후 프로필을 고쳐도 바뀌지 않는다', () => {
    const p = dcat();
    const plan = makePlan(p, setFor(p), 'full');
    p.sections[0].seconds = 1;
    p.sections[3].tools.allowed.calc = true;
    expect(plan[0].limitSec).toBe(1200);
    expect(plan[3].tools.allowed.calc).toBe(false);
  });
  it('영역 하나: 수리자료분석', () => {
    const p = dcat();
    const layout = makeSetLayout(p, 'section', { sectionIdx: 2 });
    expect(layout).toEqual([{ sectionId: 'numerical', name: '수리자료분석', count: 20 }]);
    const plan = makePlan(p, setFor(p, layout), 'section', { sectionIdx: 2 });
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ sectionId: 'numerical', qFrom: 0, qTo: 19, limitSec: 1200, paceSec: 60 });
  });
  it('드릴: 기본 시간 = 영역 페이스 × 문항 수', () => {
    const p = dcat();
    expect(defaultDrillSeconds(p, 1, 10)).toBe(400);
    expect(defaultDrillSeconds(p, null, 10)).toBe(520);
    const layout = makeSetLayout(p, 'drill', { sectionIdx: 1, drillCount: 10 });
    expect(layout).toEqual([{ sectionId: 'verbal-expression', name: '언어표현', count: 10 }]);
    const plan = makePlan(p, setFor(p, layout), 'drill', { drill: { sectionIdx: 1, count: 10, seconds: 400 } });
    expect(plan[0]).toMatchObject({ sectionId: 'verbal-expression', name: '언어표현', qFrom: 0, qTo: 9, limitSec: 400, paceSec: 40 });
  });
  it('영역 없는 드릴은 도구 모두 허용', () => {
    const p = dcat();
    const layout = makeSetLayout(p, 'drill', { sectionIdx: null, drillCount: 5 });
    const plan = makePlan(p, setFor(p, layout), 'drill', { drill: { sectionIdx: null, count: 5, seconds: 300 } });
    expect(plan[0]).toMatchObject({ sectionId: null, name: '자유 드릴', limitSec: 300, paceSec: 60 });
    expect(plan[0].tools.allowed).toEqual({ calc: true, memo: true, paint: true });
  });
  it('외부 모의: 세트 없이 프로필 배치, 쉬는 시간 0', () => {
    const p = dcat();
    const plan = makePlan(p, null, 'full', { external: true });
    expect(plan.map(x => [x.qFrom, x.qTo])).toEqual([[0, 19], [20, 34], [35, 54], [55, 64], [65, 74]]);
    expect(plan.every(x => x.breakSec === 0)).toBe(true);
  });
});

describe('formatTimesSummary', () => {
  it('DCAT 요약', () => {
    expect(formatTimesSummary(dcat())).toBe('20:00 · 10:00 · 20:00 · 7:30 · 7:30 / 쉬는 시간 15초');
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/domain/profiles.test.ts` → Expected: FAIL(모듈 없음)
- [ ] **Step 3: types.ts와 profiles.ts 구현** — 위 Interfaces와 spec §3·§6을 따른다. 내장 프로필은 `deepFreeze`한 상수로 두고 반환할 때 `structuredClone`한다.
- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/domain/profiles.test.ts` → Expected: PASS
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(domain): types and exam profiles (DCAT/LG textbook values, tool locks)"`

---

### Task 3: 계산기

**Files:**
- Create: `src/domain/calculator.ts`, `src/domain/calculator.test.ts`

**Interfaces:**
- Produces: `type CalcKey = '0'|…|'9'|'00'|'.'|'+'|'-'|'*'|'/'|'='|'C'|'BS'|'SQRT'`, `interface CalcState`, `CALC_INITIAL: CalcState`, `press(s, k): CalcState`, `view(s): { main: string; expr: string }`, `formatCalcNumber(n: number): string`, `keyFromKeyboard(e: { key: string }): CalcKey | null`.
- 상태: `display`(입력 중 원문 또는 결과 문자열), `acc: number | null`, `op`, `entering`(숫자 입력 중), `fresh`(직전 연산자 이후 피연산자가 생김: 숫자 입력이나 √), `lastOp`, `lastOperand`, `expr`, `error`.
- 규칙(spec §9.1): 즉시 실행, 연산자 연속 입력은 교체(`fresh`가 거짓이면 계산하지 않음), `=`의 피연산자는 현재 표시값, `=` 반복은 `lastOp`·`lastOperand` 반복, `√`는 표시값에 적용하고 `fresh = true`, 결과는 `Number(x.toPrecision(12))`로 정규화해 저장, 숫자 입력 12자리 제한, 0으로 나누기·음수 √는 오류, 오류 중 연산자·=·√·⌫ 무시(⌫과 C는 초기화), 오류 중 숫자는 초기화 뒤 입력.
- 표시: `formatCalcNumber` = 정규화 뒤 절댓값이 1e12 이상이거나 1e−6 미만(0 제외)이면 `toExponential(6)`에서 소수 끝 0 제거(`9.999970e+17` → `9.99997e+17`), 아니면 `String(n)`. 기호는 `+ − × ÷`.
- `keyFromKeyboard`: `0-9 . + - * /`는 그대로, `Enter`·`=` → `=`, `Backspace` → `BS`, `Escape`·`Delete` → `C`, 그 밖은 null(넘패드는 `e.key`가 같으므로 따로 처리하지 않는다).

- [ ] **Step 1: 실패하는 테스트**

`src/domain/calculator.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { CALC_INITIAL, press, view, keyFromKeyboard, type CalcKey } from './calculator';

function run(keys: string) {
  let s = CALC_INITIAL;
  for (const k of keys.split(' ').filter(Boolean)) s = press(s, k as CalcKey);
  return view(s);
}
const main = (keys: string) => run(keys).main;

describe('계산기(즉시 실행형)', () => {
  it.each([
    ['0 . 1 + 0 . 2 =', '0.3'],
    ['0 . 1 + 0 . 2 - 0 . 3 =', '0'],
    ['1 . 1 * 1 . 1 - 1 . 2 1 =', '0'],
    ['2 + 3 * 4 =', '20'],
    ['9 SQRT', '3'],
    ['1 6 + 9 SQRT =', '19'],
    ['9 + SQRT =', '12'],
    ['5 * =', '25'],
    ['5 + =', '10'],
    ['5 + * 3 =', '15'],
    ['5 + 3 = =', '11'],
    ['5 + 3 = * 2 =', '16'],
    ['5 + 3 = 2 =', '5'],
    ['1 / 3 * 3 =', '1'],
    ['. 5 + . 5 =', '1'],
    ['1 00', '100'],
    ['00', '0'],
    ['0 0 7', '7'],
    ['1 2 3 BS', '12'],
    ['5 BS', '0'],
    ['7 + 8 C', '0'],
    ['8 - 9 =', '-1'],
    ['5 / 0 =', '오류'],
    ['4 - 9 = SQRT', '오류'],
    ['5 / 0 = 7', '7'],
    ['5 / 0 = + 3 =', '3'],
    ['5 / 0 = C', '0'],
    ['9 9 9 9 9 9 * 9 9 9 9 9 9 * 9 9 9 9 9 9 =', '9.99997e+17'],
  ])('%s → %s', (keys, expected) => {
    expect(main(keys)).toBe(expected);
  });

  it('숫자 입력은 12자리까지', () => {
    expect(main('1 2 3 4 5 6 7 8 9 0 1 2 3 4')).toBe('123456789012');
  });
  it('소수점은 한 번만', () => {
    expect(main('1 . 2 . 3')).toBe('1.23');
  });
  it('식 표시', () => {
    expect(run('1 2 *').expr).toBe('12 ×');
    expect(run('1 2 * 3 =').expr).toBe('12 × 3 =');
    expect(run('7 + 8 C').expr).toBe('');
  });
  it('키보드 대응', () => {
    expect(keyFromKeyboard({ key: '7' })).toBe('7');
    expect(keyFromKeyboard({ key: 'Enter' })).toBe('=');
    expect(keyFromKeyboard({ key: 'Backspace' })).toBe('BS');
    expect(keyFromKeyboard({ key: 'Escape' })).toBe('C');
    expect(keyFromKeyboard({ key: '*' })).toBe('*');
    expect(keyFromKeyboard({ key: 'a' })).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/domain/calculator.test.ts` → FAIL
- [ ] **Step 3: calculator.ts 구현** — Interfaces의 규칙대로.
- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/domain/calculator.test.ts` → PASS
- [ ] **Step 5: Commit** — `git commit -am "feat(domain): immediate-execution calculator with 12-digit normalization"` (새 파일은 `git add` 먼저)

---

### Task 4: 이벤트 재생, 타이머, 세션 리듀서

**Files:**
- Create: `src/domain/events.ts`, `src/domain/timer.ts`, `src/domain/session.ts`, `src/domain/testkit.ts`, `src/domain/timer.test.ts`, `src/domain/session.test.ts`

**Interfaces:**
- Consumes: `types.ts`
- Produces(events.ts):
  - `lastEventT(s): number` — 이벤트가 없으면 `s.createdAt`
  - `sectionBounds(s): { start: number | null; end: number | null; auto: boolean }[]` — plan 인덱스별
  - `endedCount(s): number`
  - `sectionOfQ(s, q): number` — 없으면 −1
  - `currentAnswers(s, until = Infinity): Map<number, number>` — `answer`/`clear`를 `t ≤ until`까지 재생
  - `currentFlags(s, until = Infinity): Map<number, 'guess' | 'skip'>` — 마지막 `flag` 이벤트 기준, `skip`은 그 뒤 `answer`가 있으면 해제
- Produces(timer.ts):
  - `pauseIntervals(s, idx, now): [number, number][]` — 그 영역의 pause~resume(열린 정지는 now까지) + pauseRange, 영역 시작 이전은 잘라 내고 합집합으로 정렬
  - `deadlineOf(s, idx, now): number` — 시작 전이면 throw. 활동 시간이 limit에 처음 닿는 시각(spec §7.1)
  - `breakBase(s, idx): number` — `max(idx === 0 ? createdAt : end(idx−1), 그 이후 마지막 gap.to)`
  - `autoStartAt(s, idx): number | undefined` — `policy === 'hard' && autoStart`일 때 `breakBase + breakSec × 1000`
  - `phaseOf(s, now): { idx; phase: 'break' | 'running' | 'paused' | 'done'; remainingMs; overtimeMs; autoStartAt? }` — `break`면 remainingMs = limitSec × 1000
  - `pace(s, now): { expected; answered; delta }` — 진행 중 영역 기준
- Produces(session.ts):
  - `type SessionAction`(spec §5.3에서 `excuseGap` 제외)
  - `createSession(p: { id; profileId; setId: string | null; label?: string; scope; mode; policy; autoStart; attempt; plan; now }): Session`
  - `advance(s, now, opts?: { autoStart?: boolean }): Session` — 바뀐 게 없으면 같은 객체
  - `reduce(s, a, now): { session: Session; notice?: 'locked' | 'paused' | 'ignored' }` — 먼저 `advance(s, now)`. `now`는 `max(now, lastEventT)`로 고정.
  - `catchUpAfterGap(s, from, to, cause): Session` — spec §7.5의 1~4단계
  - `isGap(lastSeen, now, thresholdMs = 120_000): boolean`
- Produces(testkit.ts, 테스트 전용): `ALL_TOOLS`, `mkPlan(parts)`, `mkSession(opts)`

`src/domain/testkit.ts`:
```ts
import { createSession } from './session';
import type { SectionPlan, SectionTools, Session } from './types';

export const ALL_TOOLS: SectionTools = { allowed: { calc: true, memo: true, paint: true }, calc: 'collapsed', tab: 'memo' };

export function mkPlan(parts: { count: number; limitSec: number; breakSec?: number }[]): SectionPlan[] {
  let q = 0;
  return parts.map((p, i) => {
    const plan: SectionPlan = {
      sectionId: `s${i}`, name: `S${i}`, qFrom: q, qTo: q + p.count - 1, limitSec: p.limitSec,
      choices: 5, paceSec: p.limitSec / p.count, breakSec: p.breakSec ?? 15, tools: ALL_TOOLS,
    };
    q += p.count;
    return plan;
  });
}

export function mkSession(o: {
  policy?: 'hard' | 'soft'; autoStart?: boolean; mode?: 'omr' | 'external';
  parts?: { count: number; limitSec: number; breakSec?: number }[]; createdAt?: number;
} = {}): Session {
  return createSession({
    id: 'S', profileId: 'dcat', setId: 'set1', scope: 'full', mode: o.mode ?? 'omr',
    policy: o.policy ?? 'hard', autoStart: o.autoStart ?? true, attempt: 1,
    plan: mkPlan(o.parts ?? [{ count: 3, limitSec: 60 }, { count: 2, limitSec: 30 }]),
    now: o.createdAt ?? 0,
  });
}
```

- [ ] **Step 1: 실패하는 테스트**

`src/domain/timer.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { mkSession } from './testkit';
import { advance, reduce, catchUpAfterGap, isGap } from './session';
import { phaseOf, deadlineOf, pace } from './timer';
import type { Session } from './types';

const sorted = (s: Session) => s.events.every((e, i, a) => i === 0 || a[i - 1].t <= e.t);
const kinds = (s: Session) => s.events.map(e => `${e.k}${'s' in e ? e.s : ''}@${e.t}`);

describe('쉬는 시간과 자동 시작(실전)', () => {
  it('첫 영역 전 15초 뒤 자동 시작', () => {
    const s = mkSession();
    expect(phaseOf(s, 14_999)).toMatchObject({ idx: 0, phase: 'break', autoStartAt: 15_000 });
    expect(advance(s, 14_999)).toBe(s);
    expect(advance(s, 15_000).events).toEqual([{ t: 15_000, k: 'sectionStart', s: 0, auto: true }]);
  });
  it('breakSec 0이면 즉시 시작', () => {
    const s = mkSession({ parts: [{ count: 2, limitSec: 60, breakSec: 0 }] });
    expect(advance(s, 0).events).toEqual([{ t: 0, k: 'sectionStart', s: 0, auto: true }]);
  });
  it('autoStart 끔이면 시작 버튼으로만', () => {
    const s = mkSession({ autoStart: false });
    expect(advance(s, 100_000)).toBe(s);
    expect(phaseOf(s, 100_000).autoStartAt).toBeUndefined();
    expect(reduce(s, { type: 'startSection' }, 100_000).session.events).toEqual([{ t: 100_000, k: 'sectionStart', s: 0 }]);
  });
  it('연습(soft)은 자동 시작 없음', () => {
    const s = mkSession({ policy: 'soft' });
    expect(advance(s, 100_000)).toBe(s);
  });
});

describe('하드 마감', () => {
  it('틱이 늦어도 마감 시각에 닫고 다음 쉬는 시간', () => {
    let s = advance(mkSession(), 15_000);
    expect(deadlineOf(s, 0, 20_000)).toBe(75_000);
    s = advance(s, 80_000);
    expect(kinds(s)).toEqual(['sectionStart0@15000', 'sectionEnd0@75000']);
    expect(phaseOf(s, 80_000)).toMatchObject({ idx: 1, phase: 'break', autoStartAt: 90_000 });
  });
  it('마감 뒤 답은 locked', () => {
    const s = advance(mkSession(), 15_000);
    const r = reduce(s, { type: 'answer', q: 0, c: 3 }, 75_001);
    expect(r.notice).toBe('locked');
    expect(r.session.events.some(e => e.k === 'answer')).toBe(false);
    expect(r.session.events.some(e => e.k === 'sectionEnd')).toBe(true);
  });
  it('마지막 영역 마감 → finish, 채점 대기', () => {
    let s = advance(mkSession(), 15_000);
    s = advance(s, 1_000_000);
    expect(kinds(s)).toEqual(['sectionStart0@15000', 'sectionEnd0@75000', 'sectionStart1@90000', 'sectionEnd1@120000', 'finish@120000']);
    expect(s.status).toBe('awaiting_key');
    expect(s.finishedAt).toBe(120_000);
    expect(sorted(s)).toBe(true);
  });
  it('외부 모의는 external_done', () => {
    const s = advance(mkSession({ mode: 'external', parts: [{ count: 2, limitSec: 60, breakSec: 0 }] }), 1_000_000);
    expect(s.status).toBe('external_done');
  });
});

describe('공백 따라잡기', () => {
  it('실전: 진행 중 영역만 마감하고 다음 영역은 자동 시작하지 않는다', () => {
    let s = advance(mkSession(), 15_000);
    s = catchUpAfterGap(s, 30_000, 7_200_000, 'closed');
    expect(kinds(s)).toEqual(['sectionStart0@15000', 'sectionEnd0@75000', 'gap@7200000']);
    expect(phaseOf(s, 7_200_000)).toMatchObject({ idx: 1, phase: 'break', autoStartAt: 7_215_000 });
    expect(s.status).toBe('in_progress');
    expect(sorted(s)).toBe(true);
  });
  it('실전: 공백 이전(살아 있던 때)의 자동 시작은 반영', () => {
    const s = catchUpAfterGap(mkSession(), 20_000, 500_000, 'sleep');
    expect(kinds(s)).toEqual(['sectionStart0@15000', 'sectionEnd0@75000', 'gap@500000']);
  });
  it('실전: 공백 끝에 아직 마감 전이면 계속 진행', () => {
    let s = advance(mkSession({ parts: [{ count: 3, limitSec: 600 }, { count: 2, limitSec: 30 }] }), 15_000);
    s = catchUpAfterGap(s, 20_000, 300_000, 'closed');
    expect(phaseOf(s, 300_000)).toMatchObject({ idx: 0, phase: 'running', remainingMs: 315_000 });
  });
  it('연습: 공백은 자동으로 일시정지가 되어 마감이 밀린다', () => {
    let s = reduce(mkSession({ policy: 'soft', parts: [{ count: 3, limitSec: 60 }] }), { type: 'startSection' }, 0).session;
    s = catchUpAfterGap(s, 10_000, 310_000, 'sleep');
    expect(deadlineOf(s, 0, 310_000)).toBe(360_000);
    expect(s.events.some(e => e.k === 'pauseRange')).toBe(true);
  });
  it('공백 기준 120초', () => {
    expect(isGap(0, 120_000)).toBe(false);
    expect(isGap(0, 120_001)).toBe(true);
  });
});

describe('연습 마감과 일시정지', () => {
  it('마감 뒤에도 답을 받고 초과 시간을 보인다', () => {
    const s = reduce(mkSession({ policy: 'soft', parts: [{ count: 3, limitSec: 60 }] }), { type: 'startSection' }, 0).session;
    expect(advance(s, 100_000)).toBe(s);
    expect(phaseOf(s, 100_000)).toMatchObject({ phase: 'running', remainingMs: 0, overtimeMs: 40_000 });
    const r = reduce(s, { type: 'answer', q: 0, c: 2 }, 100_000);
    expect(r.notice).toBeUndefined();
    expect(r.session.events.at(-1)).toEqual({ t: 100_000, k: 'answer', q: 0, c: 2 });
  });
  it('정지만큼 마감이 밀리고 정지 중 남은 시간은 고정', () => {
    let s = reduce(mkSession({ policy: 'soft', parts: [{ count: 3, limitSec: 600 }] }), { type: 'startSection' }, 0).session;
    s = reduce(s, { type: 'pause' }, 100_000).session;
    expect(phaseOf(s, 130_000)).toMatchObject({ phase: 'paused', remainingMs: 500_000 });
    expect(phaseOf(s, 150_000)).toMatchObject({ phase: 'paused', remainingMs: 500_000 });
    s = reduce(s, { type: 'resume' }, 160_000).session;
    expect(deadlineOf(s, 0, 160_000)).toBe(660_000);
  });
  it('마감 뒤 정지는 마감을 늦추지 않는다', () => {
    let s = reduce(mkSession({ policy: 'soft', parts: [{ count: 3, limitSec: 60 }] }), { type: 'startSection' }, 0).session;
    s = reduce(s, { type: 'answer', q: 0, c: 1 }, 180_000).session;
    s = reduce(s, { type: 'pause' }, 190_000).session;
    s = reduce(s, { type: 'resume' }, 490_000).session;
    expect(deadlineOf(s, 0, 500_000)).toBe(60_000);
  });
  it('겹치는 정지는 한 번만 뺀다', () => {
    let s = reduce(mkSession({ policy: 'soft', parts: [{ count: 3, limitSec: 600 }] }), { type: 'startSection' }, 0).session;
    s = reduce(s, { type: 'pause' }, 100_000).session;
    s = reduce(s, { type: 'resume' }, 300_000).session;
    s = catchUpAfterGap(s, 150_000, 400_000, 'sleep');
    expect(deadlineOf(s, 0, 400_000)).toBe(900_000);
  });
  it('실전에서 일시정지는 ignored', () => {
    const s = advance(mkSession(), 15_000);
    const r = reduce(s, { type: 'pause' }, 20_000);
    expect(r.notice).toBe('ignored');
    expect(r.session).toBe(s);
  });
});

describe('시계 역행', () => {
  it('마지막 이벤트 시각으로 고정', () => {
    const s = reduce(mkSession({ policy: 'soft' }), { type: 'startSection' }, 50_000).session;
    const r = reduce(s, { type: 'answer', q: 0, c: 1 }, 40_000);
    expect(r.session.events.at(-1)!.t).toBe(50_000);
    expect(sorted(r.session)).toBe(true);
  });
});

describe('페이스', () => {
  it('기대 = floor(활동 시간 / 페이스), delta = 답한 수 − 기대', () => {
    let s = reduce(mkSession({ policy: 'soft', parts: [{ count: 10, limitSec: 600 }] }), { type: 'startSection' }, 0).session;
    s = reduce(s, { type: 'answer', q: 0, c: 1 }, 50_000).session;
    s = reduce(s, { type: 'answer', q: 1, c: 2 }, 110_000).session;
    expect(pace(s, 185_000)).toEqual({ expected: 3, answered: 2, delta: -1 });
  });
});
```

`src/domain/session.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { mkSession } from './testkit';
import { reduce } from './session';
import { currentAnswers, currentFlags } from './events';

function running(policy: 'hard' | 'soft' = 'soft', mode: 'omr' | 'external' = 'omr') {
  return reduce(mkSession({ policy, mode, autoStart: false }), { type: 'startSection' }, 1_000).session;
}

describe('답·해제', () => {
  it('같은 답을 다시 누르면 같은 객체', () => {
    const s1 = reduce(running(), { type: 'answer', q: 0, c: 3 }, 2_000).session;
    expect(reduce(s1, { type: 'answer', q: 0, c: 3 }, 3_000).session).toBe(s1);
  });
  it('다른 답은 바꾼다', () => {
    let s = reduce(running(), { type: 'answer', q: 0, c: 3 }, 2_000).session;
    s = reduce(s, { type: 'answer', q: 0, c: 4 }, 3_000).session;
    expect(currentAnswers(s).get(0)).toBe(4);
  });
  it('clear로 지우고, 답이 없으면 같은 객체', () => {
    let s = reduce(running(), { type: 'answer', q: 1, c: 2 }, 2_000).session;
    s = reduce(s, { type: 'clear', q: 1 }, 3_000).session;
    expect(currentAnswers(s).has(1)).toBe(false);
    expect(reduce(s, { type: 'clear', q: 1 }, 4_000).session).toBe(s);
  });
  it('현재 영역 밖 문항, 선택지 밖 답은 ignored', () => {
    const s = running();
    expect(reduce(s, { type: 'answer', q: 3, c: 1 }, 2_000)).toEqual({ session: s, notice: 'ignored' });
    expect(reduce(s, { type: 'answer', q: 0, c: 6 }, 2_000).notice).toBe('ignored');
    expect(reduce(s, { type: 'answer', q: 0, c: 0 }, 2_000).notice).toBe('ignored');
  });
  it('쉬는 시간 중 답은 locked, 일시정지 중 답은 paused', () => {
    expect(reduce(mkSession({ autoStart: false }), { type: 'answer', q: 0, c: 1 }, 1_000).notice).toBe('locked');
    const p = reduce(running('soft'), { type: 'pause' }, 2_000).session;
    expect(reduce(p, { type: 'answer', q: 0, c: 1 }, 3_000).notice).toBe('paused');
  });
});

describe('⚑', () => {
  it('답 없이 켜면 skip, 나중에 답하면 해제', () => {
    let s = reduce(running(), { type: 'flag', q: 0, on: true }, 2_000).session;
    expect(s.events.at(-1)).toMatchObject({ k: 'flag', q: 0, on: true, kind: 'skip' });
    expect(currentFlags(s).get(0)).toBe('skip');
    s = reduce(s, { type: 'answer', q: 0, c: 2 }, 3_000).session;
    expect(currentFlags(s).has(0)).toBe(false);
  });
  it('답한 뒤 켜면 guess, 답을 바꿔도 유지', () => {
    let s = reduce(running(), { type: 'answer', q: 1, c: 5 }, 2_000).session;
    s = reduce(s, { type: 'flag', q: 1, on: true }, 3_000).session;
    s = reduce(s, { type: 'answer', q: 1, c: 4 }, 4_000).session;
    expect(currentFlags(s).get(1)).toBe('guess');
  });
  it('켜진 ⚑를 다시 켜면 같은 객체, 끄면 해제', () => {
    let s = reduce(running(), { type: 'flag', q: 2, on: true }, 2_000).session;
    expect(reduce(s, { type: 'flag', q: 2, on: true }, 3_000).session).toBe(s);
    s = reduce(s, { type: 'flag', q: 2, on: false }, 4_000).session;
    expect(currentFlags(s).has(2)).toBe(false);
  });
});

describe('영역·세션 종료', () => {
  it('마지막 영역 수동 종료 → finish, awaiting_key', () => {
    let s = reduce(running('soft'), { type: 'endSection' }, 5_000).session;
    s = reduce(s, { type: 'startSection' }, 6_000).session;
    s = reduce(s, { type: 'endSection' }, 7_000).session;
    expect(s.status).toBe('awaiting_key');
    expect(s.events.at(-1)).toEqual({ t: 7_000, k: 'finish' });
  });
  it('외부 모의 → external_done', () => {
    let s = reduce(running('soft', 'external'), { type: 'endSection' }, 5_000).session;
    s = reduce(s, { type: 'startSection' }, 6_000).session;
    s = reduce(s, { type: 'endSection' }, 7_000).session;
    expect(s.status).toBe('external_done');
  });
  it('finish: 진행 중 영역을 닫고 남은 영역은 미응시', () => {
    const s = reduce(running('soft'), { type: 'finish' }, 5_000).session;
    expect(s.status).toBe('awaiting_key');
    expect(s.events.map(e => e.k)).toEqual(['sectionStart', 'sectionEnd', 'finish']);
  });
  it('abandon 뒤 동작은 ignored', () => {
    const s = reduce(running(), { type: 'abandon' }, 5_000).session;
    expect(s.status).toBe('abandoned');
    expect(reduce(s, { type: 'answer', q: 0, c: 1 }, 6_000)).toEqual({ session: s, notice: 'ignored' });
  });
  it('일시정지 중에도 영역 종료 가능', () => {
    let s = reduce(running('soft'), { type: 'pause' }, 2_000).session;
    s = reduce(s, { type: 'endSection' }, 3_000).session;
    expect(s.events.at(-1)).toMatchObject({ k: 'sectionEnd', s: 0, reason: 'manual' });
  });
});

describe('createSession', () => {
  it('초기 상태', () => {
    expect(mkSession({ autoStart: false, createdAt: 123 })).toMatchObject({
      status: 'in_progress', events: [], autoStart: false, createdAt: 123, schemaVersion: 1, appVersion: '0.1.0',
    });
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/domain/timer.test.ts src/domain/session.test.ts` → FAIL
- [ ] **Step 3: events.ts, timer.ts, session.ts 구현** — 핵심 알고리즘:
  - `deadlineOf`: `remaining = limitMs; cursor = start; for [a,b] of pauseIntervals(합집합, 정렬): if (a - cursor >= remaining) return cursor + remaining; remaining -= max(0, a - cursor); cursor = max(cursor, b); return cursor + remaining.`
  - `advance` 루프: 상태가 진행 중이 아니면 그대로 반환 → `idx = endedCount` → `idx ≥ plan.length`면 `finish{t: 마지막 종료}` 추가와 상태 전환(`omr` → awaiting_key, `external` → external_done, `finishedAt`) → 시작 전이면 `opts.autoStart !== false && autoStartAt(idx) !== undefined && now ≥ autoStartAt`일 때 `sectionStart{t: autoStartAt, auto: true}` → 진행 중이고 `hard`이며 `now ≥ deadline`이면 `sectionEnd{t: deadline, reason: 'deadline'}`(열린 정지가 있어도 deadline으로 닫는다) → 반복.
  - `reduce`: `advance` → 상태 검사(진행 중 아님 → ignored) → 동작별 규칙(테스트 참고). `endSection`·`finish`는 `sectionEnd{reason: 'manual'}` 뒤 마지막이면 finish까지. `finish`는 진행 중 영역이 있으면 닫고 바로 finish한다.
  - `catchUpAfterGap`: `advance(s, from)` → `advance(x, to, { autoStart: false })` → `gap{t: max(to, lastEventT), from, to, cause}` → `soft`면 `pauseRange{t: 같은 값, from, to}` 추가.
- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/domain` → PASS
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(domain): event-sourced session reducer, deadlines, gap catch-up"`

---

### Task 5: 파생과 채점

**Files:**
- Create: `src/domain/derive.ts`, `src/domain/grading.ts`, `src/domain/derive.test.ts`, `src/domain/grading.test.ts`

**Interfaces:**
- Consumes: `events.ts`(`currentAnswers`, `currentFlags`, `sectionBounds`), `timer.ts`(`deadlineOf`, `pauseIntervals`)
- Produces(derive.ts):
  - `answersAt(s, idx, until): Map<number, number>` — 영역 idx 문항만
  - `laps(s): Map<number, number | null>` — 초 단위(소수 1자리 반올림). 영역별로 시작부터 answer/clear/flag 이벤트를 훑어 간격(정지 겹침 제외)을 그 문항에 더한다. 간격이 gap 구간과 겹치면 그 문항은 null로 고정. 이벤트 없는 문항은 null.
  - `questionViews(s, set: ProblemSet): QuestionView[]` — `no`는 `set.numbering` 기준. `answeredAt` = 최종 답을 만든 answer 이벤트 시각. `changes` = 그 문항 answer 이벤트 수 − 1(최소 0). 시작하지 않은 영역 문항은 answer null. `overtime` = answeredAt > 영역 deadline. `correct`: key 없으면 null, 키 항목 null이면 null, 아니면 answer === key(무응답은 false). `inLimitCorrect`도 같은 규칙으로 `inLimitAnswer`에 적용.
- Produces(grading.ts):
  - `parseKey(input, qCount, choices): { key: (number | null)[]; errors: { pos: number; ch: string }[]; lengthMismatch: boolean }` — NFKC 정규화, 공백·쉼표·줄바꿈 제거, 문자당 1문항. `0`·`-` → null. 1~choices 밖 → null + error(qCount 안쪽만). 짧으면 뒤를 null로 채우고 길면 자른다.
  - `summarize(views, s): SessionSummary` — 시작한 영역만 합계에 넣는다. `usedSec` = (종료 또는 지금 대신 마지막 이벤트) − 시작 − 정지, 정수 초. `overtimeSec` = max(0, 종료 − deadline). `guessed`는 flag === 'guess'. `medianLapSec`은 null이 아닌 랩의 중앙값.

- [ ] **Step 1: 실패하는 테스트**

`src/domain/derive.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { mkSession } from './testkit';
import { reduce, catchUpAfterGap } from './session';
import { answersAt, laps, questionViews } from './derive';
import type { ProblemSet } from './types';

function soft2() {
  return reduce(mkSession({ policy: 'soft', autoStart: false }), { type: 'startSection' }, 0).session;
}
const set = (key: (number | null)[] | null, numbering: ProblemSet['numbering'] = { startNo: 1, mode: 'continuous' }): ProblemSet => ({
  id: 'set1', name: 't', profileId: 'dcat',
  layout: [{ sectionId: 's0', name: 'S0', count: 3 }, { sectionId: 's1', name: 'S1', count: 2 }],
  choices: 5, numbering, key, ranges: [], createdAt: 0, updatedAt: 0, schemaVersion: 1,
});

describe('answersAt', () => {
  it('마감 시각까지 재생한 답만', () => {
    let s = soft2();
    s = reduce(s, { type: 'answer', q: 0, c: 1 }, 30_000).session;
    s = reduce(s, { type: 'answer', q: 0, c: 2 }, 70_000).session;
    s = reduce(s, { type: 'answer', q: 1, c: 3 }, 80_000).session;
    const m = answersAt(s, 0, 60_000);
    expect(m.get(0)).toBe(1);
    expect(m.has(1)).toBe(false);
  });
});

describe('laps', () => {
  it('직전 이벤트부터의 간격, 같은 문항은 합산', () => {
    let s = soft2();
    s = reduce(s, { type: 'answer', q: 0, c: 1 }, 30_000).session;
    s = reduce(s, { type: 'flag', q: 1, on: true }, 50_000).session;
    s = reduce(s, { type: 'answer', q: 1, c: 2 }, 80_000).session;
    s = reduce(s, { type: 'answer', q: 0, c: 3 }, 100_000).session;
    const l = laps(s);
    expect(l.get(0)).toBe(50);
    expect(l.get(1)).toBe(50);
    expect(l.get(2)).toBeNull();
  });
  it('정지는 빼고 공백이 걸친 간격은 null', () => {
    let s = soft2();
    s = reduce(s, { type: 'pause' }, 10_000).session;
    s = reduce(s, { type: 'resume' }, 40_000).session;
    s = reduce(s, { type: 'answer', q: 0, c: 1 }, 50_000).session;
    s = catchUpAfterGap(s, 55_000, 400_000, 'sleep');
    s = reduce(s, { type: 'answer', q: 1, c: 1 }, 410_000).session;
    const l = laps(s);
    expect(l.get(0)).toBe(20);
    expect(l.get(1)).toBeNull();
  });
});

describe('questionViews', () => {
  it('번호·답·정오·시간 내 정오·초과·⚑·변경 수', () => {
    let s = soft2();
    s = reduce(s, { type: 'answer', q: 0, c: 1 }, 10_000).session;
    s = reduce(s, { type: 'answer', q: 0, c: 2 }, 20_000).session;
    s = reduce(s, { type: 'answer', q: 1, c: 4 }, 30_000).session;
    s = reduce(s, { type: 'flag', q: 1, on: true }, 31_000).session;
    s = reduce(s, { type: 'answer', q: 2, c: 5 }, 90_000).session;
    const v = questionViews(s, set([2, 3, 5, 1, null]));
    expect(v.map(x => x.no)).toEqual(['1', '2', '3', '4', '5']);
    expect(v[0]).toMatchObject({ answer: 2, changes: 1, correct: true, inLimitCorrect: true, overtime: false });
    expect(v[1]).toMatchObject({ answer: 4, correct: false, flag: 'guess' });
    expect(v[2]).toMatchObject({ answer: 5, correct: true, inLimitAnswer: null, inLimitCorrect: false, overtime: true });
    expect(v[3]).toMatchObject({ answer: null, correct: false, sectionIdx: 1 });
    expect(v[4]).toMatchObject({ key: null, correct: null });
  });
  it('정답 키가 없으면 correct는 null', () => {
    expect(questionViews(soft2(), set(null)).every(x => x.correct === null && x.inLimitCorrect === null)).toBe(true);
  });
  it('번호 방식', () => {
    expect(questionViews(soft2(), set(null, { startNo: 1, mode: 'perSection' })).map(x => x.no)).toEqual(['1', '2', '3', '1', '2']);
    expect(questionViews(soft2(), set(null, { startNo: 21, mode: 'continuous' })).map(x => x.no)).toEqual(['21', '22', '23', '24', '25']);
  });
});
```

`src/domain/grading.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseKey, summarize } from './grading';
import { mkSession } from './testkit';
import { reduce } from './session';
import { questionViews } from './derive';
import type { ProblemSet } from './types';

const set2 = (key: (number | null)[] | null): ProblemSet => ({
  id: 'set1', name: 't', profileId: 'dcat',
  layout: [{ sectionId: 's0', name: 'S0', count: 3 }, { sectionId: 's1', name: 'S1', count: 2 }],
  choices: 5, numbering: { startNo: 1, mode: 'continuous' }, key, ranges: [],
  createdAt: 0, updatedAt: 0, schemaVersion: 1,
});

describe('parseKey', () => {
  it('공백·쉼표·줄바꿈 무시', () => {
    expect(parseKey('31425 21', 7, 5)).toEqual({ key: [3, 1, 4, 2, 5, 2, 1], errors: [], lengthMismatch: false });
    expect(parseKey('3,1\n4', 3, 5).key).toEqual([3, 1, 4]);
  });
  it('0과 -는 정답 모름', () => {
    expect(parseKey('30-1', 4, 5).key).toEqual([3, null, null, 1]);
  });
  it('원문자·전각 숫자', () => {
    expect(parseKey('③①④２', 4, 5).key).toEqual([3, 1, 4, 2]);
  });
  it('선택지 밖 문자는 위치 표시', () => {
    const r = parseKey('3176', 4, 5);
    expect(r.key).toEqual([3, 1, null, null]);
    expect(r.errors).toEqual([{ pos: 2, ch: '7' }, { pos: 3, ch: '6' }]);
  });
  it('길이 불일치', () => {
    expect(parseKey('123', 5, 5)).toEqual({ key: [1, 2, 3, null, null], errors: [], lengthMismatch: true });
    expect(parseKey('123456', 3, 5)).toMatchObject({ key: [1, 2, 3], lengthMismatch: true });
  });
});

describe('summarize', () => {
  it('영역별·전체 집계', () => {
    let s = reduce(mkSession({ policy: 'soft', autoStart: false }), { type: 'startSection' }, 0).session;
    s = reduce(s, { type: 'answer', q: 0, c: 2 }, 10_000).session;
    s = reduce(s, { type: 'answer', q: 1, c: 1 }, 20_000).session;
    s = reduce(s, { type: 'flag', q: 1, on: true }, 21_000).session;
    s = reduce(s, { type: 'answer', q: 2, c: 5 }, 70_000).session;
    s = reduce(s, { type: 'endSection' }, 80_000).session;
    s = reduce(s, { type: 'startSection' }, 90_000).session;
    s = reduce(s, { type: 'answer', q: 3, c: 1 }, 100_000).session;
    s = reduce(s, { type: 'endSection' }, 110_000).session;
    const sum = summarize(questionViews(s, set2([2, 1, 5, 2, null])), s);
    expect(sum).toMatchObject({
      n: 5, graded: 4, correct: 3, inLimitCorrect: 2, answered: 4, unanswered: 1,
      guessed: 1, guessedCorrect: 1, overtimeAnswers: 1, unseenSections: 0,
    });
    expect(sum.sections[0]).toMatchObject({ started: true, n: 3, graded: 3, correct: 3, inLimitCorrect: 2, usedSec: 80, limitSec: 60, overtimeSec: 20 });
    expect(sum.sections[1]).toMatchObject({ started: true, n: 2, graded: 1, correct: 0, unanswered: 1, usedSec: 20, limitSec: 30, overtimeSec: 0 });
  });
  it('시작하지 않은 영역은 합계에서 빼고 unseenSections로 센다', () => {
    let s = reduce(mkSession({ policy: 'soft', autoStart: false }), { type: 'startSection' }, 0).session;
    s = reduce(s, { type: 'finish' }, 10_000).session;
    const sum = summarize(questionViews(s, set2(null)), s);
    expect(sum).toMatchObject({ n: 3, unseenSections: 1 });
    expect(sum.sections[1].started).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/domain/derive.test.ts src/domain/grading.test.ts` → FAIL
- [ ] **Step 3: derive.ts, grading.ts 구현**
- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/domain` → PASS
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(domain): derived question views, laps, answer-key parsing, summaries"`

---

### Task 6: 백업과 저장소

**Files:**
- Create: `src/domain/backup.ts`, `src/domain/backup.test.ts`, `src/data/db.ts`, `src/data/repo.ts`, `src/data/repo.test.ts`

**Interfaces:**
- Produces(backup.ts): `interface BackupFile { format: 'apt-backup'; schemaVersion: number; appVersion: string; exportedAt: string; counts: { sessions: number; sets: number; imports: number }; data: AllData }`, `emptyAllData(): AllData`, `normalizeAllData(d: Partial<AllData>): AllData`, `buildBackup(all, now, appVersion = APP_VERSION): BackupFile`, `validateBackup(x: unknown, appSchemaVersion = SCHEMA_VERSION)`, `migrate(file): BackupFile`(빠진 배열·객체만 채우는 멱등 함수, 원 객체를 바꾸지 않음), `backupFileName(now): string`(로컬 시각 `apt-backup-YYYYMMDD-HHmm.json`).
  - 거부 사유 문구: 형식 → `백업 파일 형식이 아닙니다`, 버전 → `앱보다 새 버전의 백업입니다`, 데이터 → `백업 데이터가 올바르지 않습니다`.
- Produces(db.ts): `class AptDb extends Dexie`(이름 기본 `apt-assistant`, 테이블 `profiles:id, sets:id, sessions:id, imports:id, taxonomy:profileId, aliases:key, kv:key`).
- Produces(repo.ts): `interface Meta { lastBackupAt: number | null }`, `interface Loaded { data: AllData; meta: Meta; alive: Record<string, number> }`, `interface Repo { loadAll(); saveSession(s); saveSet(p); saveProfileOverride(p); deleteProfileOverride(id); saveMemo(sessionId, text); saveSettings(s); saveMeta(m); saveAlive(sessionId, at); replaceAll(d: AllData); requestPersist(): Promise<boolean> }`, `createDexieRepo(db: AptDb): Repo`.
  - `replaceAll`: 한 트랜잭션에서 모든 테이블을 비우고 다시 채운다. kv는 `settings`와 `memo:*`만 교체하고 `meta`·`alive:*`는 남긴다.
  - `requestPersist`: `navigator.storage?.persist?.()`, 실패하면 false.

- [ ] **Step 1: 실패하는 테스트**

`src/domain/backup.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildBackup, validateBackup, migrate, backupFileName, emptyAllData, type BackupFile } from './backup';
import { mkSession } from './testkit';
import type { AllData } from './types';

const data = (): AllData => ({ ...emptyAllData(), sessions: [mkSession()], memos: { S: '메모' } });

describe('backup', () => {
  it('왕복', () => {
    const f = buildBackup(data(), Date.UTC(2026, 9, 9, 12, 30));
    expect(f.counts).toEqual({ sessions: 1, sets: 0, imports: 0 });
    const r = validateBackup(JSON.parse(JSON.stringify(f)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.file.data).toEqual(data());
  });
  it.each([
    [null, '형식'],
    ['x', '형식'],
    [{ format: 'other' }, '형식'],
    [{ format: 'apt-backup', schemaVersion: 2, data: {} }, '새 버전'],
    [{ format: 'apt-backup', schemaVersion: 1, data: { sessions: 'x' } }, '데이터'],
  ])('잘못된 파일 거부 #%#', (x, word) => {
    const r = validateBackup(x);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(word);
  });
  it('migrate는 빠진 배열을 채우고 멱등', () => {
    const f = buildBackup(data(), 0);
    const partial = { ...f, data: { ...f.data, aliases: undefined } } as unknown as BackupFile;
    const m1 = migrate(partial);
    expect(m1.data.aliases).toEqual([]);
    expect(migrate(m1)).toEqual(m1);
  });
  it('모르는 필드를 보존', () => {
    const f = buildBackup(data(), 0);
    (f.data.sessions[0] as unknown as Record<string, unknown>).futureField = 42;
    const r = validateBackup(JSON.parse(JSON.stringify(f)));
    expect(r.ok && (r.file.data.sessions[0] as unknown as Record<string, unknown>).futureField).toBe(42);
  });
  it('파일 이름은 로컬 시각', () => {
    expect(backupFileName(new Date(2026, 9, 9, 21, 5).getTime())).toBe('apt-backup-20261009-2105.json');
  });
});
```

`src/data/repo.test.ts`:
```ts
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { AptDb } from './db';
import { createDexieRepo } from './repo';
import { mkSession } from '../domain/testkit';
import { emptyAllData } from '../domain/backup';
import { effectiveProfile } from '../domain/profiles';

let n = 0;
const fresh = () => createDexieRepo(new AptDb(`repo-test-${++n}`));

describe('repo', () => {
  it('빈 DB는 기본값', async () => {
    const l = await fresh().loadAll();
    expect(l.data.sessions).toEqual([]);
    expect(l.data.settings).toEqual({ autoBackupDownload: true, sound: true, flash: true });
    expect(l.meta).toEqual({ lastBackupAt: null });
    expect(l.alive).toEqual({});
  });
  it('세션·메모·생존 기록·meta 왕복', async () => {
    const repo = fresh();
    await repo.saveSession(mkSession());
    await repo.saveMemo('S', '12×3');
    await repo.saveAlive('S', 777);
    await repo.saveMeta({ lastBackupAt: 5 });
    const l = await repo.loadAll();
    expect(l.data.sessions.map(s => s.id)).toEqual(['S']);
    expect(l.data.memos).toEqual({ S: '12×3' });
    expect(l.alive).toEqual({ S: 777 });
    expect(l.meta).toEqual({ lastBackupAt: 5 });
  });
  it('메모 저장과 세션 저장은 서로 덮어쓰지 않는다', async () => {
    const repo = fresh();
    const s = mkSession();
    await repo.saveSession(s);
    await repo.saveMemo(s.id, 'm');
    await repo.saveSession({ ...s, events: [{ t: 1, k: 'sectionStart', s: 0 }] });
    const l = await repo.loadAll();
    expect(l.data.memos[s.id]).toBe('m');
    expect(l.data.sessions[0].events).toHaveLength(1);
  });
  it('프로필 수정본 저장·삭제', async () => {
    const repo = fresh();
    const p = effectiveProfile('dcat', []);
    p.breakSec = 30;
    await repo.saveProfileOverride(p);
    expect((await repo.loadAll()).data.profiles[0].breakSec).toBe(30);
    await repo.deleteProfileOverride('dcat');
    expect((await repo.loadAll()).data.profiles).toEqual([]);
  });
  it('replaceAll: 전체 교체, meta는 유지', async () => {
    const repo = fresh();
    await repo.saveSession(mkSession());
    await repo.saveMeta({ lastBackupAt: 9 });
    await repo.replaceAll({ ...emptyAllData(), memos: { X: 'x' } });
    const l = await repo.loadAll();
    expect(l.data.sessions).toEqual([]);
    expect(l.data.memos).toEqual({ X: 'x' });
    expect(l.meta.lastBackupAt).toBe(9);
  });
  it('replaceAll 중간 실패 시 원본 유지', async () => {
    const repo = fresh();
    await repo.saveSession(mkSession());
    const bad = { ...emptyAllData(), sessions: [{ ...mkSession(), id: 'X', bad: () => 1 } as never] };
    await expect(repo.replaceAll(bad)).rejects.toThrow();
    expect((await repo.loadAll()).data.sessions.map(s => s.id)).toEqual(['S']);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/domain/backup.test.ts src/data` → FAIL
- [ ] **Step 3: backup.ts, db.ts, repo.ts 구현**
- [ ] **Step 4: 통과 확인** — Run: `npm test` → PASS
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(data): backup format and Dexie repository"`

---

### Task 7: 앱 스토어

**Files:**
- Create: `src/state/platform.ts`, `src/state/store.ts`, `src/state/store.test.ts`

**Interfaces:**
- Consumes: domain 전부, `Repo`
- Produces(platform.ts): `acquireWriterLock(): Promise<'acquired' | 'busy' | 'unsupported'>`(Web Locks `ifAvailable`, 잡으면 영원히 보유), `downloadText(filename, text): void`(Blob + `a[download]` 클릭, 동기)
- Produces(store.ts):
```ts
export type Screen =
  | { name: 'home' } | { name: 'setup' } | { name: 'settings' } | { name: 'blocked' }
  | { name: 'runner'; sessionId: string } | { name: 'key'; sessionId: string }
  | { name: 'result'; sessionId: string } | { name: 'externalSummary'; sessionId: string };
export interface AppState {
  ready: boolean; screen: Screen; data: AllData; meta: Meta;
  lockWarning: boolean; persisted: boolean | null; saveError: string | null; toast: string | null;
}
export interface AppActions {
  boot(): Promise<void>;
  go(screen: Screen): void;                 // 진행 중 세션이 있으면 러너 밖으로 못 나간다
  startSession(draft: SetupDraft): Promise<string | null>;
  act(sessionId: string, action: SessionAction): Promise<string | undefined>;   // notice
  tick(): Promise<void>;                    // advance, 공백(sleep) 감지, 5초마다 alive 저장, 상태 전환 시 화면 이동
  setMemo(sessionId: string, text: string): void;   // 상태 즉시 반영 + 1초 디바운스 저장
  flushMemos(): Promise<void>;
  saveKey(setId: string, key: (number | null)[]): Promise<void>;
  completeGrading(sessionId: string): Promise<void>;  // graded + 백업 다운로드(설정 켜짐) + 결과 화면
  gradeLater(sessionId: string): Promise<void>;       // 백업 다운로드 + 홈
  confirmExternal(sessionId: string): Promise<void>;  // 백업 다운로드 + 홈
  saveProfile(p: ExamProfile): Promise<{ ok: true } | { ok: false; errors: { path: string; msg: string }[] }>;
  resetProfile(id: string): Promise<void>;
  saveSettings(patch: Partial<Settings>): Promise<void>;
  exportNow(): Promise<void>;
  restore(text: string): Promise<{ ok: boolean; reason?: string }>;
}
export interface Deps {
  repo: Repo; now: () => number;
  download: (filename: string, text: string) => void;
  acquireLock: () => Promise<'acquired' | 'busy' | 'unsupported'>;
}
export function createAppStore(deps: Deps): StoreApi<AppState & AppActions>;
export function unbackedCount(data: AllData, meta: Meta): number;
```
- 규칙:
  - 부팅: 잠금 → `busy`면 `screen = blocked`로 두고 끝(이후 모든 쓰기 동작은 null/무시). `unsupported`면 `lockWarning = true`. → `persisted` 요청 → `loadAll` + `migrate` → 진행 중 세션(가장 최근 것) 처리: `lastSeen = alive[id] ?? lastEventT`, `isGap(lastSeen, now)`면 `catchUpAfterGap(…, 'closed')`, 그다음 `advance(now)`, 바뀌면 저장 → 상태에 따라 runner/key/externalSummary, 없으면 home.
  - `startSession`: 진행 중 플래그로 동시 호출을 막는다(두 번째 호출은 null). OMR이면 세트를 고르거나 만든다(새 세트 이름이 비면 드릴 `드릴 MM/DD HH:mm`, 그 외 `${프로필 이름} MM/DD HH:mm`). `attempt` = 같은 세트 세션 수 + 1. 외부 모의는 `setId: null`, `label`(비면 `외부 모의 MM/DD HH:mm`). `settings.lastSetup = draft` 저장.
  - 세션 저장은 직렬 큐로 하고, 항상 상태의 최신 객체를 쓴다. 쓰기 실패 시 `saveError`를 채우고 다음 저장 때 다시 시도한다.
  - `restore`: 진행 중 세션이 있으면 `{ ok: false, reason: '진행 중인 세션을 끝낸 뒤 복원하세요' }`. 검사 실패면 그 사유. 성공 경로: 현재 데이터를 먼저 다운로드 → `replaceAll` → 다시 읽기 → `meta.lastBackupAt = now`.
  - 백업 다운로드는 `buildBackup(현재 데이터)`를 `backupFileName(now)`로 내려받고 `meta.lastBackupAt = now`를 저장한다.

- [ ] **Step 1: 실패하는 테스트**

`src/state/store.test.ts`:
```ts
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { createAppStore } from './store';
import { AptDb } from '../data/db';
import { createDexieRepo, type Repo } from '../data/repo';
import type { SetupDraft } from '../domain/types';

let n = 0;
function setup(lock: 'acquired' | 'busy' | 'unsupported' = 'acquired', repo?: Repo) {
  const r = repo ?? createDexieRepo(new AptDb(`store-test-${++n}`));
  let now = 1_000_000;
  const downloads: string[] = [];
  const store = createAppStore({
    repo: r, now: () => now, download: name => downloads.push(name), acquireLock: async () => lock,
  });
  return { store, repo: r, downloads, setNow: (t: number) => { now = t; } };
}
const draft = (o: Partial<SetupDraft> = {}): SetupDraft => ({
  profileId: 'dcat', scope: 'drill', mode: 'omr', policy: 'soft', sectionIdx: 2, drillCount: 3, drillSeconds: 180,
  setId: null, newSetName: '', startNo: 1, numberingMode: 'continuous', label: '', ...o,
});

describe('store', () => {
  it('빈 DB 부팅 → 홈', async () => {
    const { store } = setup();
    await store.getState().boot();
    expect(store.getState().ready).toBe(true);
    expect(store.getState().screen).toEqual({ name: 'home' });
  });
  it('잠금 실패 → 차단 화면, 세션 시작 불가', async () => {
    const { store, repo } = setup('busy');
    await store.getState().boot();
    expect(store.getState().screen).toEqual({ name: 'blocked' });
    expect(await store.getState().startSession(draft())).toBeNull();
    expect((await repo.loadAll()).data.sessions).toEqual([]);
  });
  it('세션 시작 → 드릴 세트 자동 생성, 러너, lastSetup 저장', async () => {
    const { store, repo } = setup();
    await store.getState().boot();
    const id = await store.getState().startSession(draft());
    expect(store.getState().screen).toEqual({ name: 'runner', sessionId: id });
    const l = await repo.loadAll();
    expect(l.data.sessions).toHaveLength(1);
    expect(l.data.sets[0].name).toMatch(/^드릴 /);
    expect(l.data.settings.lastSetup).toMatchObject({ profileId: 'dcat', scope: 'drill' });
  });
  it('시작 두 번 동시 호출 → 세션 1개', async () => {
    const { store, repo } = setup();
    await store.getState().boot();
    const ids = await Promise.all([store.getState().startSession(draft()), store.getState().startSession(draft())]);
    expect(ids.filter(Boolean)).toHaveLength(1);
    expect((await repo.loadAll()).data.sessions).toHaveLength(1);
  });
  it('답은 즉시 저장되고 다시 부팅하면 러너로 이어진다', async () => {
    const t = setup();
    await t.store.getState().boot();
    const id = (await t.store.getState().startSession(draft()))!;
    t.setNow(1_001_000);
    await t.store.getState().act(id, { type: 'startSection' });
    t.setNow(1_005_000);
    await t.store.getState().act(id, { type: 'answer', q: 0, c: 4 });
    const t2 = setup('acquired', t.repo);
    t2.setNow(1_006_000);
    await t2.store.getState().boot();
    expect(t2.store.getState().screen).toEqual({ name: 'runner', sessionId: id });
    const s = t2.store.getState().data.sessions[0];
    expect(s.events.some(e => e.k === 'answer' && e.q === 0 && e.c === 4)).toBe(true);
  });
  it('생존 기록 뒤 120초 넘게 지나 부팅하면 공백(closed) 기록', async () => {
    const t = setup();
    await t.store.getState().boot();
    const id = (await t.store.getState().startSession(draft({ policy: 'hard', scope: 'full', sectionIdx: null })))!;
    await t.repo.saveAlive(id, 1_000_000);
    const t2 = setup('acquired', t.repo);
    t2.setNow(1_600_000);
    await t2.store.getState().boot();
    const s = t2.store.getState().data.sessions.find(x => x.id === id)!;
    expect(s.events.some(e => e.k === 'gap' && e.cause === 'closed')).toBe(true);
  });
  it('메모와 답이 경합하지 않는다', async () => {
    const t = setup();
    await t.store.getState().boot();
    const id = (await t.store.getState().startSession(draft()))!;
    await t.store.getState().act(id, { type: 'startSection' });
    t.store.getState().setMemo(id, '12×3=36');
    await t.store.getState().act(id, { type: 'answer', q: 1, c: 2 });
    await t.store.getState().flushMemos();
    const l = await t.repo.loadAll();
    expect(l.data.memos[id]).toBe('12×3=36');
    expect(l.data.sessions[0].events.some(e => e.k === 'answer')).toBe(true);
  });
  it('진행 중 세션이 있으면 복원 거부', async () => {
    const t = setup();
    await t.store.getState().boot();
    await t.store.getState().startSession(draft());
    const r = await t.store.getState().restore('{"format":"apt-backup","schemaVersion":1,"data":{}}');
    expect(r).toEqual({ ok: false, reason: '진행 중인 세션을 끝낸 뒤 복원하세요' });
    expect((await t.repo.loadAll()).data.sessions).toHaveLength(1);
  });
  it('채점 저장 → graded, 결과 화면, 백업 1회, lastBackupAt', async () => {
    const t = setup();
    await t.store.getState().boot();
    const id = (await t.store.getState().startSession(draft()))!;
    await t.store.getState().act(id, { type: 'startSection' });
    await t.store.getState().act(id, { type: 'finish' });
    expect(t.store.getState().screen).toEqual({ name: 'key', sessionId: id });
    const setId = t.store.getState().data.sessions[0].setId!;
    await t.store.getState().saveKey(setId, [1, 2, 3]);
    await t.store.getState().completeGrading(id);
    expect(t.store.getState().data.sessions[0].status).toBe('graded');
    expect(t.store.getState().screen).toEqual({ name: 'result', sessionId: id });
    expect(t.downloads).toHaveLength(1);
    expect((await t.repo.loadAll()).meta.lastBackupAt).toBe(1_000_000);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/state` → FAIL
- [ ] **Step 3: platform.ts, store.ts 구현** — Zustand `createStore`(vanilla). `act`가 세션을 끝내면(awaiting_key / external_done) 화면을 key / externalSummary로 옮긴다.
- [ ] **Step 4: 통과 확인** — Run: `npm test` → PASS
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(state): app store with boot recovery, single writer, backups"`

---

### Task 8: 도구 패널(계산기·메모·그림판)

**Files:**
- Create: `src/ui/tools/ToolDock.tsx`, `src/ui/tools/Calculator.tsx`, `src/ui/tools/Paint.tsx`, `src/ui/tools/paintStore.ts`, `src/ui/tools/tools.module.css`

**Interfaces:**
- Consumes: `calculator.ts`(`press`, `view`, `keyFromKeyboard`, `CALC_INITIAL`), `SectionTools`
- Produces: `<ToolDock sessionId tools calcKeyboard memo onMemo />` — 러너가 영역 내내 계속 마운트한다. 계산기 상태는 ToolDock 안(세션 동안 유지).
- 필수 동작(spec §3.4, §8.5, §9):
  - 레이아웃: 위는 탭 패널(`[메모] [그림판]`, 남는 높이), 아래는 계산기(접기 가능, 영역 기본값 `tools.calc` 적용). 영역이 바뀌면 그 영역의 `tools`로 탭·접힘을 다시 설정한다.
  - 잠금: 허용되지 않은 도구는 `hidden`으로 숨기고(언마운트 금지) `data-testid="tool-lock"` 문구 `이 영역은 계산기·메모·그림판을 쓸 수 없습니다`를 보인다. 모두 잠기면 계산기 키 입력도 받지 않는다.
  - 키 라우팅(document `keydown`, capture): Ctrl·Alt·Meta 조합은 무시. 대상이 메모 textarea면 Esc만 blur하고 나머지는 그대로. 다른 input·textarea·select면 무시. 그 밖에서 계산기가 허용·표시되고 `calcKeyboard`면 `keyFromKeyboard` → `press`, `preventDefault`.
  - 메모 밖 `pointerdown`(document, capture)이 오면 메모 포커스를 푼다. 계산기 머리에 `⌨ 계산기` / `⌨ 메모` 표시.
  - 모든 버튼 `tabIndex={-1}` + `onMouseDown={e => e.preventDefault()}`.
  - testid: `tab-memo`, `tab-paint`, `memo`(textarea), `calc-display`, `calc-expr`, `calc-key-{0..9|00|.|+|-|*|/|=|C|BS|SQRT}`, `calc-toggle`, `paint-canvas`(속성 `data-strokes` = 보이는 획 수).
  - 그림판: Pointer Events + `setPointerCapture`, 획은 `paintStore`(세션 id별 `Map`, 엔트리 = 획 또는 지움 표시)에 둔다. `ResizeObserver`로 캔버스 크기를 CSS × DPR로 맞추고 다시 그린다. 도구 버튼: 검정, 빨강, 지우개(`destination-out`), 전체 지우기, 실행 취소. `touch-action: none`.

- [ ] **Step 1: 구현** — 위 동작대로 컴포넌트를 만든다(검증은 Task 10의 Playwright에서 러너 안에서 한다).
- [ ] **Step 2: 빌드 확인** — Run: `npm run build` → Expected: 성공
- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat(ui): tool dock with calculator, memo, paint and key routing"`

---

### Task 9: 앱 셸, 시작 화면, 프로필 조정

**Files:**
- Create: `src/ui/App.tsx`, `src/ui/useApp.ts`, `src/ui/app.css`, `src/ui/format.ts`, `src/ui/ConfirmDialog.tsx`, `src/ui/screens/Setup.tsx`, `src/ui/screens/ProfileEditor.tsx`
- Modify: `src/main.tsx`(앱 부트스트랩: `createAppStore` + `createDexieRepo(new AptDb())` + `acquireWriterLock` + `downloadText` → `boot()` → `<App/>`)

**Interfaces:**
- Produces: `useApp(selector)`(React 훅, 컨텍스트로 스토어 주입), `formatClock(ms)`(`m:ss`, 1시간 이상 `h:mm:ss`), `formatOver(ms)`(`+m:ss`), `formatDateTime(ms)`(`10/09 21:05`), `<ConfirmDialog open title body confirmText onConfirm onCancel />`(기본 포커스 '취소', Enter로 확정하지 않음).
- App: `screen.name`으로 화면을 고른다. `blocked`면 `다른 창에서 열려 있습니다. 이 창을 닫으세요.`만 보인다. `lockWarning`·`saveError`면 상단 배너. ErrorBoundary는 `진행 중 세션은 저장돼 있습니다. 새로고침하세요.`와 '내보내기' 버튼.
- Setup(spec §8.3) 접근성 이름: 선택상자 `프로필`, `범위`(값 `full`/`section`/`drill`/`external`), `영역`, 입력 `문항 수`, `시간(초)`, 선택상자 `모드`(값 `hard` 실전 / `soft` 연습, 범위를 바꾸면 기본값으로), `세트`(기존 세트 또는 `새 세트`), 입력 `새 세트 이름`, `시작 번호`, 선택상자 `번호 방식`, 입력 `외부 모의 이름`. `data-testid="times-summary"`(`formatTimesSummary`), 버튼 `조정`, `시작`(누르는 동안 비활성).
- ProfileEditor(spec §3.3): 영역마다 `{영역 이름} 시간`(m:ss 입력), 체크박스 `{영역 이름} 계산기`·`메모`·`그림판`, 입력 `쉬는 시간(초)`, 체크박스 `실전 자동 시작`, `계산기 키보드 입력`, 버튼 `저장`, `교재 기본값으로`, `취소`. 검사 오류는 해당 칸 옆에 표시.

- [ ] **Step 1: 구현**
- [ ] **Step 2: 빌드와 기존 테스트** — Run: `npm test && npm run build` → PASS
- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat(ui): app shell, setup screen and profile editor"`

---

### Task 10: 러너, 쉬는 시간, 알림, 외부 모의

**Files:**
- Create: `src/ui/screens/Runner.tsx`, `src/ui/screens/BreakScreen.tsx`, `src/ui/alerts.ts`, `src/ui/alerts.test.ts`, `e2e/runner.spec.ts`
- Modify: `src/ui/App.tsx`(runner 라우트), `src/ui/app.css`, `vite.config.ts`(vitest include에 `src/**/*.test.ts` 유지 확인)

**Interfaces:**
- Consumes: `phaseOf`, `pace`, `currentAnswers`, `currentFlags`, `useApp`, `ToolDock`
- Produces(alerts.ts): `type AlertKind = 'warn60' | 'deadline' | 'autostart'`, `dueAlerts(s: Session, prevNow: number, now: number): AlertKind[]`(순수), `beep(kind): void`, `flash(el): void`
  - `warn60`: 진행 중 영역의 `deadline − 60s`가 `(prevNow, now]` 안이고 `now < deadline`일 때.
  - `deadline`: `deadline`이 `(prevNow, now]` 안이고 `now − deadline < 5s`일 때(오래 잠든 뒤 몰아서 울리지 않음). 실전에서 이미 닫힌 영역도 그 영역의 종료 시각으로 판단한다.
  - `autostart`: `auto: true`인 `sectionStart.t`가 `(prevNow, now]` 안일 때.
- Runner(spec §8.4): 250ms 간격으로 `tick()`, 매 틱 `dueAlerts`로 소리·점멸(설정에 따름). 상태바(`data-testid="section-clock"`, `unanswered`, 페이스, `⏸`/`▶`(연습만), 버튼 `종료`, `⋯` → `중단`), OMR 행(`omr-row-{q}`, 버블 `bubble-{q}-{c}` `aria-pressed`, `flag-{q}` `aria-pressed`, `clear-{q}`), 마감 시 `locked` 알림. 외부 모의는 OMR 대신 영역 카드(`data-testid="external-card"`). 쉬는 시간이면 BreakScreen(다음 영역 이름·번호 범위·시간·페이스·도구 허용, 자동 시작 카운트다운, 버튼 `지금 시작`(자동) 또는 `시작`(수동)).
  - 높이 적응: OMR 영역은 `min-height` 4행, 창 높이가 작으면 계산기 키 높이를 줄인다(`clamp`).

- [ ] **Step 1: 실패하는 테스트**

`src/ui/alerts.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { dueAlerts } from './alerts';
import { mkSession } from '../domain/testkit';
import { advance } from '../domain/session';

describe('dueAlerts', () => {
  const s = advance(mkSession({ parts: [{ count: 3, limitSec: 600 }] }), 15_000);   // deadline 615s
  it('60초 전 알림은 한 번', () => {
    expect(dueAlerts(s, 554_000, 555_000)).toEqual(['warn60']);
    expect(dueAlerts(s, 555_000, 556_000)).toEqual([]);
  });
  it('마감 알림은 마감 직후에만', () => {
    const ended = advance(s, 615_100);
    expect(dueAlerts(ended, 614_900, 615_100)).toContain('deadline');
    expect(dueAlerts(advance(s, 700_000), 554_000, 700_000)).not.toContain('deadline');
    expect(dueAlerts(advance(s, 700_000), 554_000, 700_000)).not.toContain('warn60');
  });
  it('자동 시작 알림', () => {
    const b = mkSession({ parts: [{ count: 3, limitSec: 600 }] });
    expect(dueAlerts(advance(b, 15_000), 14_900, 15_000)).toEqual(['autostart']);
  });
});
```

`e2e/runner.spec.ts`:
```ts
import { test, expect, type Page } from '@playwright/test';
import { APP_URL, launch } from './helpers';

async function startDrill(page: Page, opts: { section: string; count: number }) {
  await page.goto(APP_URL);
  await page.getByRole('button', { name: '새 세션' }).click();
  await page.getByLabel('범위').selectOption('drill');
  await page.getByLabel('영역').selectOption({ label: opts.section });
  await page.getByLabel('문항 수').fill(String(opts.count));
  await page.getByLabel('모드').selectOption('soft');
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.getByRole('button', { name: '시작', exact: true }).click();   // 쉬는 시간 화면(연습은 수동)
}

test('답 3개 → 새로고침 → 유지, 더블클릭해도 답 유지', async () => {
  const { ctx, page } = await launch('runner-reload');
  await startDrill(page, { section: '수리자료분석', count: 5 });
  await page.getByTestId('bubble-0-3').click();
  await page.getByTestId('bubble-1-1').dblclick();
  await page.getByTestId('bubble-2-5').click();
  await page.reload();
  await expect(page.getByTestId('bubble-0-3')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('bubble-1-1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('bubble-2-5')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('section-clock')).toBeVisible();
  await ctx.close();
});

test('키 라우팅: 메모 → 계산기 클릭 → 숫자는 계산기, 버블 뒤 Enter·Space·숫자는 답을 바꾸지 않음', async () => {
  const { ctx, page } = await launch('runner-keys');
  await startDrill(page, { section: '수리자료분석', count: 5 });
  await page.getByTestId('memo').click();
  await page.keyboard.type('abc');
  await page.getByTestId('calc-key-7').click();
  await page.keyboard.press('8');
  await expect(page.getByTestId('calc-display')).toHaveText('78');
  await expect(page.getByTestId('memo')).toHaveValue('abc');
  await page.getByTestId('bubble-0-2').click();
  await page.keyboard.press('Enter');
  await page.keyboard.press(' ');
  await page.keyboard.press('4');
  await expect(page.getByTestId('bubble-0-2')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('bubble-0-4')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('calc-key-C').click();
  await page.keyboard.type('0.1+0.2=');
  await expect(page.getByTestId('calc-display')).toHaveText('0.3');
  await ctx.close();
});

test('그림판: 그리기 → 메모 탭 → 그림판 탭, 창 크기 변경 뒤에도 획 유지', async () => {
  const { ctx, page } = await launch('runner-paint');
  await startDrill(page, { section: '수리자료분석', count: 5 });
  await page.getByTestId('tab-paint').click();
  const box = (await page.getByTestId('paint-canvas').boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 40, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('paint-canvas')).toHaveAttribute('data-strokes', '1');
  await page.getByTestId('tab-memo').click();
  await page.getByTestId('tab-paint').click();
  await page.setViewportSize({ width: 400, height: 760 });
  await expect(page.getByTestId('paint-canvas')).toHaveAttribute('data-strokes', '1');
  await ctx.close();
});

test('DCAT 공간추리: 도구 잠금', async () => {
  const { ctx, page } = await launch('runner-lock');
  await startDrill(page, { section: '공간추리', count: 3 });
  await expect(page.getByTestId('tool-lock')).toBeVisible();
  await expect(page.getByTestId('calc-display')).toBeHidden();
  await page.keyboard.press('7');
  await expect(page.getByTestId('bubble-0-1')).toHaveAttribute('aria-pressed', 'false');
  await ctx.close();
});

test('340×530 창: 가로 스크롤 없음, OMR 4행 이상', async () => {
  const { ctx, page } = await launch('runner-small', { viewport: { width: 340, height: 530 } });
  await startDrill(page, { section: '수리자료분석', count: 10 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(340);
  const visible = await page.locator('[data-testid^="omr-row-"]').evaluateAll(rows =>
    rows.filter(r => { const b = r.getBoundingClientRect(); return b.top >= 0 && b.bottom <= window.innerHeight; }).length);
  expect(visible).toBeGreaterThanOrEqual(4);
  await ctx.close();
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/ui/alerts.test.ts` → FAIL, `npm run e2e -- runner` → FAIL
- [ ] **Step 3: alerts.ts, BreakScreen.tsx, Runner.tsx 구현, App 라우트 연결**
- [ ] **Step 4: 통과 확인** — Run: `npm test && npm run e2e` → PASS
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(ui): runner with OMR rows, break screen, alerts, external mode"`
- [ ] **Step 6: 중간 릴리스** — Run: `node scripts/release.mjs && powershell -ExecutionPolicy Bypass -File scripts/make-shortcut.ps1`. 이 시점부터 바로가기로 연습·외부 모의에 쓸 수 있다(채점·결과 화면은 Task 11).

---

### Task 11: 홈, 정답 입력, 결과, 설정·백업

**Files:**
- Create: `src/ui/screens/Home.tsx`, `src/ui/screens/KeyEntry.tsx`, `src/ui/screens/Result.tsx`, `src/ui/screens/Settings.tsx`, `e2e/flow.spec.ts`
- Modify: `src/ui/App.tsx`, `src/ui/app.css`

**Interfaces:**
- Home(spec §8.2): 버튼 `직전 설정으로 시작`(lastSetup 있을 때), `새 세션`, `설정`, `지금 내보내기`; 채점 대기 목록(누르면 key), 최근 결과 5개(누르면 result); `data-testid="unbacked"`(미백업 n); 저장소가 비면 `백업에서 복원` 안내.
- KeyEntry(spec §10): textarea 이름 `정답`(세트에 정답이 있으면 채워 둠), 5개씩 묶은 행 미리보기(번호·내 답·정답·○×), 오류 위치·길이 불일치 표시, 버튼 `채점 저장`(`saveKey` → `completeGrading`), `나중에 채점`(`gradeLater`).
- Result(spec §8.7): `data-testid="score-inlimit"`(`x/N`), `score-total`, 소요/제한, 초과, 미응답, 찍음(맞음/틀림), 채점 제외 n, 미응시 영역 수; 영역 표; 문항 표(접기, 열 머리 클릭 정렬); 버튼 `홈으로`.
- External summary: 영역별 사용/제한/초과 표와 버튼 `확인`(`confirmExternal`).
- Settings(spec §8.8): `지금 내보내기`, 파일 선택 `백업 파일 복원`(결과 사유 표시), 체크박스 `세션 종료 시 자동 백업`, `소리`, `점멸`, 저장 상태(`persisted`, `storage.estimate()`), 프로필 조정(ProfileEditor 재사용), 앱 버전.

- [ ] **Step 1: 실패하는 테스트**

`e2e/flow.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { APP_URL, launch } from './helpers';

test('드릴 종료 → 정답 입력 → 결과(시간 내/전체) → 백업 다운로드', async () => {
  const { ctx, page } = await launch('flow-grade');
  await page.goto(APP_URL);
  await page.getByRole('button', { name: '새 세션' }).click();
  await page.getByLabel('범위').selectOption('drill');
  await page.getByLabel('영역').selectOption({ label: '언어논리' });
  await page.getByLabel('문항 수').fill('3');
  await page.getByLabel('모드').selectOption('soft');
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.getByTestId('bubble-0-1').click();
  await page.getByTestId('bubble-1-2').click();
  await page.getByTestId('bubble-2-4').click();
  await page.getByRole('button', { name: '종료' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '확인' }).click();
  await page.getByLabel('정답').fill('123');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '채점 저장' }).click();
  expect((await download).suggestedFilename()).toMatch(/^apt-backup-\d{8}-\d{4}\.json$/);
  await expect(page.getByTestId('score-total')).toHaveText('2/3');
  await expect(page.getByTestId('score-inlimit')).toHaveText('2/3');
  await ctx.close();
});

test('외부 모의: 쉬는 시간 없이 시작, 영역 카드, 종료 뒤 요약', async () => {
  const { ctx, page } = await launch('flow-external');
  await page.goto(APP_URL);
  await page.getByRole('button', { name: '새 세션' }).click();
  await page.getByLabel('범위').selectOption('external');
  await page.getByLabel('외부 모의 이름').fill('합격시대 DCAT 2회');
  await page.getByLabel('모드').selectOption('soft');
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.getByTestId('external-card')).toContainText('1–20번');
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: '종료' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '확인' }).click();
    if (i < 4) await page.getByRole('button', { name: '시작', exact: true }).click();
  }
  await expect(page.getByRole('button', { name: '확인' })).toBeVisible();
  await ctx.close();
});

test('프로필 조정: 시간 바꾸면 요약이 바뀌고, 교재 기본값으로 복원', async () => {
  const { ctx, page } = await launch('flow-profile');
  await page.goto(APP_URL);
  await page.getByRole('button', { name: '새 세션' }).click();
  await page.getByRole('button', { name: '조정' }).click();
  await page.getByLabel('언어논리 시간').fill('18:00');
  await page.getByLabel('쉬는 시간(초)').fill('30');
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page.getByTestId('times-summary')).toHaveText('18:00 · 10:00 · 20:00 · 7:30 · 7:30 / 쉬는 시간 30초');
  await page.getByRole('button', { name: '조정' }).click();
  await page.getByRole('button', { name: '교재 기본값으로' }).click();
  await expect(page.getByTestId('times-summary')).toHaveText('20:00 · 10:00 · 20:00 · 7:30 · 7:30 / 쉬는 시간 15초');
  await ctx.close();
});
```

- [ ] **Step 2: 실패 확인** — Run: `npm run e2e -- flow` → FAIL
- [ ] **Step 3: 화면 구현과 라우트 연결**
- [ ] **Step 4: 통과 확인** — Run: `npm test && npm run e2e` → PASS
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(ui): home, answer key entry, results, settings and backups"`

---

### Task 12: 사용 안내와 v0.1 릴리스

**Files:**
- Create: `README.md`(사용자용 3분 안내: 바로가기 실행, 스냅 70:30, 세션 시작·종료·채점, 백업 위치, 프로필 조정, 롤백 방법, 수동 확인 6항목)

- [ ] **Step 1: README 작성**
- [ ] **Step 2: 전체 검증** — Run: `npm run release` → Expected: vitest 전부 PASS, Playwright 전부 PASS, `app/index.html` 갱신
- [ ] **Step 3: 바로가기 생성** — Run: `powershell -ExecutionPolicy Bypass -File scripts/make-shortcut.ps1`
- [ ] **Step 4: Commit** — `git add -A && git commit -m "docs: user guide; release v0.1"`

---

### Task 13: 전체 리뷰와 마무리

- [ ] **Step 1:** 새 리뷰어 1명(가장 성능 좋은 모델)이 spec 대비 전체 브랜치를 검토한다: 타이머·공백·마감 정확성, 데이터 유실, 키 라우팅, 잠금, 백업·복원.
- [ ] **Step 2:** 확인된 결함만 고치고(테스트 먼저), `npm run release`를 다시 통과시킨다.
- [ ] **Step 3:** 사용자 아침 확인용 요약: 무엇이 됐는지, 수동 확인 6항목, 알려진 한계, v0.2 계획 착수 조건.
