# APT Assistant 설계 — DCAT · LG Way Fit 연습·기록·분석 툴

| 항목 | 내용 |
|---|---|
| 작성일 | 2026-10-08 |
| 상태 | 사용자 검토 대기 |
| 독자 | 사용자(검토), 구현 계획 작성자, 구현 담당(Codex)·리뷰 담당(Claude) |
| 설계 근거 | [2026-10-08-apt-assistant-design-rationale.md](2026-10-08-apt-assistant-design-rationale.md) — 설계 패널 병합안 원본. 대안 비교와 충돌 결정의 이유는 이 파일에 있다 |

---

## 1. 배경과 목표

### 1.1 배경

- 사용자는 두산 DCAT(먼저 응시, 2026-10-08 기준 1주 이내)와 LG Way Fit Test를 준비한다. 두 시험 모두 온라인 시험이고 영역마다 제한시간이 따로 있다.
- 공부 환경은 Windows PC 1대, 모니터 1대, Chrome이다. 알라딘 e-book 교재를 화면 왼쪽 약 70%에, 툴을 오른쪽 약 30%에 스냅 분할해 쓴다.
- 지금 쓰는 SKCT 연습 툴(타인 제작)은 DCAT·LG의 영역·시간 구조와 다르고 문항별 시간을 남기지 않는다. 합격시대 DCAT 1회에서는 제한 65분에 83분을 썼다.
- 기록은 두 곳에서 나온다. ① e-book 교재 문제를 툴의 OMR로 풀고 정답을 입력해 채점한다. ② 합격시대(sdedu) 온라인 모의고사 결과표를 붙여 넣는다(v0.2).

### 1.2 목표

1. DCAT·LG의 영역별 시간 압박을 교재 구조 그대로 연습한다.
2. 실전에서 쓸 수 있는 도구(계산기·메모·그림판)를, 쓸 수 있는 영역에서만 쓴다.
3. 회차마다 정답과 시간을 남겨 시험·영역·유형별 강점과 약점을 스스로 판단한다. 판단할 것은 세 가지다.
   - 남은 날 무엇을 공부할지
   - 실전에서 무엇을 뒤로 미루거나 찍을지
   - 어느 영역에서 시간이 새는지

### 1.3 성공 기준

1. v0.1 릴리스 다음 연습부터 SKCT 툴 대신 쓴다.
2. 세션 설정은 30초, 채점(75문항)은 2분, 유형 태깅은 1분 안에 끝난다(드릴은 태깅 0초).
3. 새로고침, 창 닫힘, 절전 뒤에도 기록과 타이머가 이어진다.
4. 세션이 끝날 때마다 백업 파일이 남는다.
5. 사용자 수동 확인은 릴리스당 3분 이하다.

---

## 2. 범위와 일정

### 2.1 v0.1 — D1 (2026-10-09)

| # | 기능 | 절 |
|---|---|---|
| 1 | 단일 `index.html` 빌드, 전용 Chrome 프로필 `--app` 바로가기, 릴리스 사본(`app/`), 저장소 영속 프로브 | §4 |
| 2 | 시험 프로필: DCAT·LG 기본값(교재), 자유 드릴, **영역별 시간·쉬는 시간·자동 시작·도구 허용 조정** | §3 |
| 3 | 시작 화면: 프로필, 범위(전체/영역 하나/드릴/외부 모의), 모드(실전/연습), 세트(이름·시작 번호·번호 방식). 직전 값 자동 채움 | §8.3 |
| 4 | 러너: 상태바, 번호 행 OMR(①~⑤ + ⚑ + ×), 메모·그림판 탭과 계산기(접기), 영역별 도구 기본값과 **잠금** | §8.4 |
| 5 | 타이머: 마감 시각 기준. 실전은 하드 마감, 연습은 소프트 마감. 쉬는 시간 화면, 비프·점멸 알림 | §7 |
| 6 | 이벤트 로그 즉시 저장, 재개, 닫기 경고, 단일 작성자 잠금 | §7.5, §11.1 |
| 7 | 도구: 계산기(SKCT 배열·즉시 실행·키보드), 메모(세션별 저장), 그림판(벡터 획·실행 취소·크기 변경 뒤 유지) | §9 |
| 8 | 외부 모의 모드(타이머·도구만): 합격시대 온라인 모의고사를 풀 때 영역 타이머와 도구만 쓴다 | §8.6 |
| 9 | 채점: 정답 숫자열 입력·붙여넣기, 즉시 ○/×, 정답을 세트에 저장해 재사용, 나중에 채점 | §10 |
| 10 | 결과: 시간 내 점수와 전체 점수, 영역 표, 문항 표(소요 시간순 정렬 가능) | §8.7 |
| 11 | 백업: 세션 종료 뒤 첫 확정 클릭 때 JSON 자동 다운로드, 수동 내보내기, 교체 복원, 미백업 배지, `storage.persist()` | §11 |

### 2.2 v0.2 — D2 (2026-10-10), 이후 기능 동결

- 합격시대 가져오기(§12)
- 유형 칠하기와 오답 이유(§13.1)
- 누적 분석과 판정(§13.2~§13.5)
- 결과 화면 보강: 직전 회차 대비 Δ, 일괄 마킹 의심 표시(§7.6)
- 선택 사항: 병합 복원, File System Access 폴더 백업, 그림판 획 저장과 크게 보기

### 2.3 넣지 않는 것

| 항목 | 이유 |
|---|---|
| 문제 본문·이미지 입력(캡처·OCR) | DRM·저작권 문제와 입력 비용. 답만 기록한다 |
| 응시 화면 스킨, 로그인, 감독, 인성검사 | 페이스와 무관하다 |
| 서버, 계정, 동기화, PWA, 서비스 워커, Electron/Tauri | PC 1대에서만 쓴다(사용자 확정) |
| 수동 점수 입력 | 사용자가 필요 없다고 했다 |
| 답 선택 숫자 단축키 | 포커스에 따라 숫자 의미가 바뀌어 조용한 오마킹이 생긴다 |
| 항상 위에 뜨는 창, 오버레이 | 스냅 분할로 충분하다 |
| 차트 라이브러리, 레이더·파이 차트, 유형별 추세선 | 세션 수가 적어 잡음이다. 표, CSS 막대, SVG 산점도 1개로 충분하다 |
| IRT, 예상 점수, 백분위, 사이트 점수 재계산 | 표본이 작고 공식을 모른다 |
| 세부 유형(잎) 단위 판정, 임의 깊이 분류 트리 | 합격시대 1회 42행 중 41행이 n≤2다 |
| 문항별 그림판·메모 스냅샷 | 이번 주 판단에 쓰이지 않는다 |
| 합격시대 자동 수집 | 로그인·약관 위험. 붙여넣기로 충분하다 |

### 2.4 일정

- D0(10-08) 밤: spec과 구현 계획을 승인받고 구현을 시작한다.
- D1: v0.1 릴리스. 체크포인트①(도구와 카운트다운)이 먼저 나오면 그것부터 쓴다(§16).
- D2: v0.2 릴리스. D3부터는 버그만 고친다.
- 실전 전날: 마지막 백업 파일이 열리는지 확인한다.

---

## 3. 시험 프로필

### 3.1 기본값 (교재 시험 구성표, 2026-10-08 사용자 제공)

| 시험 | 순서 | 영역 id | 영역 | 문항 | 시간 | 문항당 페이스 | 도구 |
|---|---|---|---|---|---|---|---|
| DCAT | 1 | `verbal-logic` | 언어논리 | 20 | 20:00 | 60초 | 허용(계산기 접힘, 메모 탭) |
| | 2 | `verbal-expression` | 언어표현 | 15 | 10:00 | 40초 | 허용(접힘, 메모) |
| | 3 | `numerical` | 수리자료분석 | 20 | 20:00 | 60초 | 허용(계산기 펼침, 메모) |
| | 4 | `spatial` | 공간추리 | 10 | 7:30 | 45초 | **잠금** |
| | 5 | `figure` | 도형추리 | 10 | 7:30 | 45초 | **잠금** |
| LG Way Fit | 1 | `verbal-comprehension` | 언어이해 | 20 | 20:00 | 60초 | 허용(접힘, 메모) |
| | 2 | `verbal-reasoning` | 언어추리 | 20 | 20:00 | 60초 | 허용(접힘, 메모) |
| | 3 | `data-interpretation` | 자료해석 | 20 | 20:00 | 60초 | 허용(펼침, 메모) |
| | 4 | `creative-math` | 창의수리 | 20 | 20:00 | 60초 | 허용(펼침, 메모) |

- 프로필 id는 `dcat`, `lg-wayfit`이다. 두 시험 모두 5지선다다.
- 합계는 DCAT 75문항/3,900초, LG 80문항/4,800초다. LG 인성검사(183문항/20분)는 범위 밖이다.
- DCAT 공간추리·도형추리의 도구 잠금은 사용자가 알려 준 실전 규칙이다. 나머지 영역의 도구 허용은 확인되지 않았다.
- 자유 드릴의 기본 시간은 '문항 수 × 고른 영역의 페이스'다. 영역을 고르지 않으면 프로필 평균 페이스(DCAT 52초, LG 60초)를 쓴다.

### 3.2 확인되지 않은 규칙의 기본값

| 규칙 | 기본값 |
|---|---|
| 끝난 영역으로 돌아가기 | 불가 |
| 영역 안에서 문항 이동 | 가능 |
| 남은 시간을 다음 영역으로 이월 | 없음 |
| 오답 감점 | 없음 |
| 응시 순서 | 교재 표 순서 |
| 쉬는 시간(영역 사이 대기, 첫 영역 전 준비 포함) | 15초. 실전은 끝나면 자동 시작 |
| 계산기 키보드 입력 | 허용 |

실전 규칙이 확인되면 코드가 아니라 프로필 값만 고친다.

### 3.3 사용자 조정

- 조정할 수 있는 값은 다섯 가지다.
  - 영역별 시간(분:초)
  - 쉬는 시간(초, 0~600)
  - 실전 자동 시작(켬/끔)
  - 영역별 도구 허용(계산기·메모·그림판 각각)
  - 계산기 키보드 입력(켬/끔)
- 시작 화면에 현재 값을 한 줄로 요약해 보인다(예: `20:00 · 10:00 · 20:00 · 7:30 · 7:30 / 쉬는 시간 15초`). '조정'을 누르면 같은 화면에서 편집한다.
- 저장한 값은 프로필 수정본으로 남아 다음 세션에도 쓰인다. '교재 기본값으로'를 누르면 수정본을 지운다.
- 입력 검사: 영역 시간은 10초~3시간, 쉬는 시간은 0~600초다. 범위를 벗어나면 저장하지 않고 해당 칸을 표시한다.
- 세션은 시작 시점의 값을 `plan`에 복사해 쓴다. 나중에 값을 바꿔도 지난 세션의 마감과 결과는 바뀌지 않는다.
- 문항 수와 선택지 수는 세트(교재 범위)가 정한다(§6.2). 프로필 편집에서는 바꾸지 않는다.

### 3.4 도구 잠금

- 허용되지 않은 도구는 러너에서 숨긴다. 도구 자리에는 `이 영역은 계산기·메모·그림판을 쓸 수 없습니다`를 한 줄로 보이고, 남는 높이는 OMR이 쓴다.
- 도구가 모두 잠긴 영역에서는 키보드 입력을 어디로도 보내지 않는다.
- 메모 내용과 그림판 획은 지우지 않고 숨기기만 한다. 다음에 허용되는 영역에서 다시 보인다.
- 외부 모의 모드(§8.6)에도 같은 잠금이 적용된다.

---

## 4. 실행 방식

### 4.1 스택

- Vite, React 19, TypeScript(strict), Zustand, Dexie 4, CSS Modules를 쓴다. `vite-plugin-singlefile`로 외부 참조가 없는 `dist/index.html` 한 파일을 만든다.
- 테스트는 Vitest와 fake-indexeddb, 그리고 설치된 Chrome에서 돌리는 Playwright(channel `chrome`)로 한다.
- 차트 라이브러리는 쓰지 않는다. v0.2 산점도는 SVG로 직접 그리고 막대는 CSS로 그린다.
- 확인된 실행 환경: Node 24.14.0, npm 11.9.0, Python 3.14.3, Chrome 154(`C:\Program Files\Google\Chrome\Application\chrome.exe`).

### 4.2 file:// 제약

- 동적 import, Web Worker, 런타임 fetch를 쓰지 않는다. 기본 프로필과 유형 시드는 번들에 넣는다.
- Web Locks, BroadcastChannel, `crypto.randomUUID`는 기능을 감지한 뒤에만 쓰고 대체 경로를 둔다. ID 대체값은 `Date.now().toString(36)` + 난수다.
- 부팅할 때 `navigator.storage.persist()`를 요청하고 결과를 설정 화면에 보인다.

### 4.3 바로가기와 창 운용

```
대상: "C:\Program Files\Google\Chrome\Application\chrome.exe"
인수: --user-data-dir="%LOCALAPPDATA%\APT-Assistant\chrome-profile" --no-first-run --no-default-browser-check
      --autoplay-policy=no-user-gesture-required
      --app="file:///E:/APT%20assistant/app/index.html"
```

- `scripts/make-shortcut.ps1`이 바탕화면에 'APT Assistant' 바로가기를 만든다. 창 크기는 계산하지 않고 첫 실행 뒤 스냅으로 맞춘다(PowerShell은 DPI 배율을 인식하지 않아 계산값이 어긋날 수 있다).
- 실데이터 프로필은 프로젝트 폴더 밖(`%LOCALAPPDATA%\APT-Assistant\chrome-profile`)에 둔다. `git clean` 같은 정리 명령이 기록을 지우지 않게 하려는 것이다. 메인 Chrome 프로필에서 사이트 데이터를 지워도 기록은 남는다. 이 폴더를 지우면 기록도 사라지므로 진짜 보관본은 백업 JSON이다.
- `--autoplay-policy=no-user-gesture-required`는 새로고침·재실행 직후 사용자가 아직 클릭하지 않았을 때도 마감 비프가 나게 한다.
- 첫 실행 뒤 Win+→로 창을 오른쪽에 붙이고 경계를 끌어 70:30으로 맞춘다. 키보드 포커스는 툴에 두고 e-book은 마우스 휠로 넘긴다.

### 4.4 릴리스 사본과 롤백

- 개발 빌드는 `dist/`에만 나온다. `npm run release`는 테스트를 통과한 빌드를 `app/index.html`로 복사하고, 직전 판은 `app/prev/index.html`로 옮긴다. 바로가기는 `app/index.html`을 연다.
- 롤백은 `app/prev/index.html`을 `app/index.html`로 되돌리는 것이다.
- 롤백해도 새 판의 데이터가 망가지지 않게, v0.2는 `schemaVersion`을 올리지 않고 선택 필드만 더한다. 모든 쓰기는 앱이 모르는 필드를 보존한다(§6.4). 앱보다 높은 schemaVersion 문서는 그 문서만 읽기 전용으로 둔다(§11.5).

### 4.5 영속 프로브와 폴백

- 사전 확인(2026-10-08, 헤드리스 Chrome 154, file://, 임시 프로필): `isSecureContext = true`, Web Locks 획득과 배타 동작(두 번째 탭의 `ifAvailable`은 null), 프로세스 재시작 뒤 IndexedDB 값 유지(1→2), `persist() = false`. 그래서 file:// 방식으로 확정한다. `persist() = false`는 경고가 아니라 정보로만 보인다.
- 첫 구현 작업은 같은 확인을 Playwright 영속 컨텍스트(별도 테스트 프로필) 회귀 테스트로 남긴다.
- 남지 않으면 고정 포트 로컬 서버로 바꾼다. `start-apt.cmd`가 다음 두 가지를 함께 띄운다.
  - `python -m http.server 41731 --bind 127.0.0.1 -d "E:\APT assistant\app"`
  - 같은 user-data-dir로 `--app=http://127.0.0.1:41731/`
- origin에는 포트가 들어가므로 포트는 영구 고정한다. file://에서 http로 옮기면 저장소가 달라지므로 기록은 백업·복원으로 옮긴다.

### 4.6 버전 관리

- 프로젝트 루트 `E:\APT assistant`를 git 저장소로 만든다.
- `.gitignore`: `node_modules/`, `dist/`, `app/`, `e2e/.profile-test/`, `test-results/`, `playwright-report/`

---

## 5. 아키텍처

### 5.1 레이어

```
ui (React)  →  state (Zustand store)  →  data (Dexie repo)
                    ↓
               domain (순수 TS)
```

- **domain**은 React, DOM, Dexie, `Date.now`를 쓰지 않는다. 시간은 `now` 인자로 받는다. 전부 Vitest로 검증한다.
- **data**는 Dexie 스키마와 `Repo` 구현이다.
- **state**는 사용자 동작마다 `advance(session, now)`를 먼저 실행한 뒤 `reduce(session, action, now)`를 실행한다. 세션이 바뀌었으면 곧바로 `repo.saveSession()`으로 쓴다(직렬 큐). `beforeunload`는 경고용일 뿐 저장 수단이 아니다.
- **ui**는 화면과 컴포넌트다. 250ms 화면 갱신 틱과 `visibilitychange`·`focus`·`pageshow` 때도 `advance`를 실행한다.

### 5.2 파일 배치

```
src/
  domain/  types.ts  profiles.ts  calculator.ts  timer.ts  session.ts  derive.ts  grading.ts  backup.ts
           (v0.2) taxonomy.ts  passsidae.ts  mapping.ts  analytics.ts
  data/    db.ts  repo.ts
  state/   store.ts
  ui/      App.tsx  alerts.ts
           screens/  Home  Setup  Runner  KeyEntry  Result  Settings   (v0.2) Import  Tagging  Analysis
           tools/    ToolDock  Calculator  Paint
scripts/   release.mjs  make-shortcut.ps1   (폴백) start-apt.cmd
e2e/       probe.spec.ts  smoke.spec.ts
```

### 5.3 핵심 인터페이스

```ts
// domain/profiles.ts
const BUILTIN_PROFILES: ExamProfile[];                                  // §3.1 값
function effectiveProfile(id: string, overrides: ExamProfile[]): ExamProfile;   // 수정본 ?? 기본값
function validateProfileEdit(p: ExamProfile): { ok: true } | { ok: false; errors: { path: string; msg: string }[] };
function makePlan(p: ExamProfile, set: ProblemSet, scope: SessionScope, opts?: { sectionIdx?: number; drill?: DrillSpec }): SectionPlan[];

// domain/session.ts — 이벤트 로그 리듀서
type SessionAction =
  | { type: 'answer'; q: number; c: number }        // 이미 고른 답을 다시 누르면 변화 없음
  | { type: 'clear'; q: number }                    // 행 끝 ×
  | { type: 'flag'; q: number; on: boolean }        // kind는 리듀서가 정한다(§7.6)
  | { type: 'pause' } | { type: 'resume' }          // 연습(soft)만
  | { type: 'endSection' }                          // 확인을 받은 뒤 수동 종료
  | { type: 'startSection' }                        // 쉬는 시간 화면의 '지금 시작'
  | { type: 'finish' } | { type: 'abandon' };
function advance(s: Session, now: number, opts?: { autoStart?: boolean }): Session;  // 마감·자동 시작·종료 따라잡기
function catchUpAfterGap(s: Session, from: number, to: number, cause: 'sleep' | 'closed'): Session;  // §7.5
function reduce(s: Session, a: SessionAction, now: number):
  { session: Session; notice?: 'locked' | 'paused' | 'ignored' };
// 변화가 없으면 같은 객체를 돌려준다. store는 참조 비교로 저장을 생략한다.

// domain/timer.ts
function deadlineOf(s: Session, idx: number, now: number): number;
function phaseOf(s: Session, now: number): {
  idx: number; phase: 'break' | 'running' | 'paused' | 'done';
  remainingMs: number; overtimeMs: number; autoStartAt?: number };
function pace(s: Session, now: number): { expected: number; answered: number; delta: number };

// domain/derive.ts
function answersAt(s: Session, idx: number, until: number): Map<number, number>;
function laps(s: Session): Map<number, number | null>;            // 문항 → 초
function flagsOf(s: Session): Map<number, 'guess' | 'skip'>;      // 최종 ⚑ 상태
function questionViews(s: Session, set: ProblemSet): QuestionView[];

// domain/grading.ts
function parseKey(input: string, qCount: number, choices: number):
  { key: (number | null)[]; errors: { pos: number; ch: string }[]; lengthMismatch: boolean };
function summarize(views: QuestionView[], s: Session): SessionSummary;

// domain/calculator.ts
type CalcKey = '0'|'1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'00'|'.'|'+'|'-'|'*'|'/'|'='|'C'|'BS'|'SQRT';
function press(s: CalcState, k: CalcKey): CalcState;
function view(s: CalcState): { main: string; expr: string };

// domain/backup.ts
function buildBackup(all: AllData, now: number, appVersion: string): BackupFile;
function validateBackup(x: unknown, appSchemaVersion: number):
  { ok: true; file: BackupFile } | { ok: false; reason: string };
function migrate(file: BackupFile): BackupFile;   // 부팅 로드와 복원이 같은 함수를 쓴다

// data/repo.ts
interface Repo {
  loadAll(): Promise<AllData>;
  saveSession(s: Session): Promise<void>;
  saveSet(p: ProblemSet): Promise<void>;
  saveProfileOverride(p: ExamProfile): Promise<void>;
  deleteProfileOverride(id: string): Promise<void>;
  saveImport(i: ImportRecord): Promise<void>;       // v0.2
  saveTaxonomy(t: Taxonomy): Promise<void>;         // v0.2
  saveAlias(a: AliasEntry): Promise<void>;          // v0.2
  saveKv(key: string, value: unknown): Promise<void>;
  replaceAll(d: AllData): Promise<void>;            // 트랜잭션 하나로 교체
  requestPersist(): Promise<boolean>;
}
```

---

## 6. 데이터 모델

### 6.1 저장 원칙

- 원본만 저장하고 파생값은 조회할 때 계산한다(늦은 결합).
  - 세션: 시각이 붙은 이벤트 로그
  - 정답 키와 유형 범위: 세트
  - 합격시대 결과: 붙여넣기 원문과 파싱한 행(v0.2)
- 효과는 두 가지다. 시간 내 점수와 문항 시간을 언제든 다시 계산할 수 있다. 정답 키나 유형을 고치면 그 세트의 과거 세션이 마이그레이션 없이 바로잡힌다.
- 문제가 e-book에 있으므로 문항 방문 횟수는 측정할 수 없다. 저장하지 않는다.

### 6.2 저장 타입

```ts
type ToolName = 'calc' | 'memo' | 'paint';

interface SectionTools {
  allowed: Record<ToolName, boolean>;   // false = 잠금(§3.4)
  calc: 'open' | 'collapsed';           // 허용될 때 계산기 기본 표시
  tab: 'memo' | 'paint';                // 허용될 때 기본 탭
}
interface SectionDef {
  id: string; name: string;
  questions: number;                    // 기본 문항 수(전체 모의 세트의 배치에 쓴다)
  seconds: number;                      // 사용자 조정 가능
  choices?: number;                     // 없으면 profile.choices
  tools: SectionTools;                  // 사용자 조정 가능
}
interface ExamProfile {
  id: string; name: string; choices: number; sections: SectionDef[];
  navigation: { backWithinSection: boolean; backAcrossSections: boolean; carryOver: boolean };
  penalty: { enabled: boolean };
  breakSec: number;          // 쉬는 시간(초). 사용자 조정 가능
  autoStart: boolean;        // 실전: 쉬는 시간이 끝나면 자동 시작
  calcKeyboard: boolean;
  schemaVersion: number;
}
// profiles 테이블에는 사용자 수정본만 저장한다. 유효 프로필 = 수정본 ?? 내장 기본값.

interface ProblemSet {         // 교재의 한 범위(모의고사 1회, 단원 드릴 등)
  id: string; name: string; profileId: string;
  layout: { sectionId: string | null; name: string; count: number }[];  // 문항 수 = Σcount
  choices: number;
  numbering: { startNo: number; mode: 'continuous' | 'perSection' };
  key: (number | null)[] | null;      // null = 미입력, 항목 null = 정답 모름
  defaultFamilyId?: string;           // v0.2
  ranges: { from: number; to: number; familyId: string; leafId?: string }[];  // v0.2 칠하기
  createdAt: number; updatedAt: number; schemaVersion: number;
}

type Ev =                      // t = epoch ms. 배열은 t 순서로만 덧붙인다
  | { t: number; k: 'sectionStart'; s: number; auto?: boolean }
  | { t: number; k: 'sectionEnd'; s: number; reason: 'deadline' | 'manual' }
  | { t: number; k: 'answer'; q: number; c: number }
  | { t: number; k: 'clear'; q: number }
  | { t: number; k: 'flag'; q: number; on: boolean; kind: 'guess' | 'skip' }
  | { t: number; k: 'pause' } | { t: number; k: 'resume' }
  | { t: number; k: 'gap'; from: number; to: number; cause: 'sleep' | 'closed' }
  | { t: number; k: 'pauseRange'; from: number; to: number }     // 연습 공백 보정
  | { t: number; k: 'finish' } | { t: number; k: 'abandon' };

interface SectionPlan {        // 세션 시작 때 프로필 값을 복사한 스냅샷
  sectionId: string | null; name: string; qFrom: number; qTo: number;   // qTo 포함
  limitSec: number; choices: number; paceSec: number;
  breakSec: number;            // 이 영역 앞 쉬는 시간
  tools: SectionTools;
}
type SessionScope = 'full' | 'section' | 'drill';
interface DrillSpec {          // 자유 드릴: 영역 하나(또는 없음), 문항 수, 시간
  sectionIdx: number | null; count: number; seconds: number;
}
interface Session {
  id: string; profileId: string;
  setId: string | null;                // 외부 모의는 null
  label?: string;                      // 외부 모의 이름(예: '합격시대 DCAT 2회'). v0.2 가져오기 연결에 쓴다
  scope: SessionScope;
  mode: 'omr' | 'external';            // external = 타이머·도구만(§8.6)
  policy: 'hard' | 'soft';             // 실전 / 연습
  autoStart: boolean;                  // 시작 시점 프로필 값
  attempt: number;                     // 같은 세트의 몇 번째 풀이(1부터). 외부 모의는 1
  plan: SectionPlan[]; events: Ev[];
  status: 'in_progress' | 'awaiting_key' | 'graded' | 'external_done' | 'abandoned';
  reasons?: Record<number, 'concept' | 'slip' | 'misread'>;   // v0.2 오답 이유
  createdAt: number; finishedAt?: number; backedUpAt?: number;
  appVersion: string; schemaVersion: number;
}
// 메모는 세션 레코드가 아니라 kv `memo:<sessionId>`에 따로 저장한다(§9.2).
```

- 문항 번호 `q`는 세트 안에서 0부터 매기는 순번이다. 화면 번호는 `numbering`으로 계산한다. `perSection`이면 영역마다 `startNo`부터 다시 센다.
- OMR 세션은 세트를 가진다. 이름 없이 시작한 드릴은 세트를 자동으로 만든다(예: `드릴 10/09 15:30`). 외부 모의는 채점하지 않으므로 세트 없이 `label`만 둔다.
- `ImportRecord`, `Taxonomy`, `AliasEntry`는 v0.2 타입이다(§12, §13). 테이블은 v1 스키마에서 미리 만든다.
- 부팅 때 읽는 전체 데이터와 백업 본문은 같은 모양이다.

  ```ts
  interface AllData {
    profiles: ExamProfile[];        // 사용자 수정본만
    sets: ProblemSet[]; sessions: Session[];
    memos: Record<string, string>;  // sessionId → 메모(kv memo:<id>)
    imports: ImportRecord[]; taxonomy: Taxonomy[]; aliases: AliasEntry[];   // v0.1에서는 빈 배열
    settings: Settings;             // kv의 settings
  }
  interface Settings {
    autoBackupDownload: boolean;    // 기본 true
    sound: boolean; flash: boolean; // 기본 true, true
    lastSetup?: unknown;            // 시작 화면 직전 값
  }
  ```

### 6.3 파생 타입 (저장하지 않음)

```ts
interface QuestionView {
  q: number; no: string; sectionIdx: number;
  answer: number | null; answeredAt: number | null; changes: number;
  inLimitAnswer: number | null; overtime: boolean;
  flag: 'guess' | 'skip' | null;
  key: number | null; correct: boolean | null; inLimitCorrect: boolean | null;
  timeSec: number | null; familyId?: string; leafId?: string;
}
interface SessionSummary {
  n: number; graded: number;              // graded = 정답을 아는 문항 수
  correct: number; inLimitCorrect: number;
  answered: number; unanswered: number;
  guessed: number; guessedCorrect: number; overtimeAnswers: number;
  usedSec: number; limitSec: number; overtimeSec: number;
  sections: { idx: number; name: string; n: number; graded: number; correct: number;
              inLimitCorrect: number; unanswered: number; guessed: number;
              usedSec: number; limitSec: number; overtimeSec: number;
              medianLapSec: number | null; paceSec: number }[];
}
```

### 6.4 Dexie 스키마 v1

테이블은 처음에 한꺼번에 만들고 기본 키만 둔다. 보조 인덱스와 liveQuery는 쓰지 않는다. 데이터는 주당 1MB 미만으로 예상하므로 부팅 때 전부 메모리로 읽어 계산한다.

| 테이블 | 키 | 내용 |
|---|---|---|
| profiles | id | 사용자 프로필 수정본 |
| sets | id | ProblemSet |
| sessions | id | Session(계획, 이벤트 로그, 메모) |
| imports | id | ImportRecord(v0.2) |
| taxonomy | profileId | 가족·세부 목록(v0.2) |
| aliases | key | 외부 경로 → 가족·세부(v0.2) |
| kv | key | settings, meta(schemaVersion, lastBackupAt), owner(하트비트) |

- 시험 주간에는 IndexedDB 버전 업그레이드를 하지 않는다. v0.2는 선택 필드만 더하고 `schemaVersion`을 1로 유지한다.
- 모든 쓰기는 원래 문서를 펼친 뒤 바꾼 필드만 덮어쓴다(`{...원본, ...변경}`). 앱이 모르는 필드를 보존하기 위해서다.
- `migrate()`는 메모리에서만 하고 결과를 따로 저장하지 않는다.
- kv 키: `settings`, `meta`(lastBackupAt), `memo:<sessionId>`, `alive:<sessionId>`.

---

## 7. 타이머 엔진

### 7.1 시간 계산

- 시간의 원천은 이벤트 타임스탬프 하나다. 카운터를 1초씩 깎지 않는다.
  - 정지 구간 = 그 영역의 `pause`~`resume` 구간(아직 재개하지 않았으면 `now`까지)과 `pauseRange` 구간의 **합집합**이다. 겹치는 부분은 한 번만 센다.
  - `deadline(s)` = 영역 시작부터 정지 구간을 뺀 활동 시간이 `limitSec`에 처음 닿는 시각. 마감 뒤에 생긴 정지는 마감을 늦추지 않는다. 초과 뒤 일시정지로 초과 답이 '시간 내'로 바뀌지 않게 하려는 것이다.
  - `remaining = deadline − now`
- 250ms 틱은 화면 갱신에만 쓴다. Chrome이 가려진 창의 타이머를 늦춰도 판정은 타임스탬프로 하므로 결과는 같다.
- `now`가 마지막 이벤트 시각보다 작으면(시계 역행) 마지막 이벤트 시각으로 고정한다.

### 7.2 실전(hard)과 연습(soft)

한 리듀서에서 `policy` 플래그로 나눈다. 시간 내 점수와 전체 점수는 두 모드 모두 계산한다.

| | 실전(hard) | 연습(soft) |
|---|---|---|
| 일시정지 | 없음 | 있음 |
| 0초가 되면 | `sectionEnd{t: deadline, reason: 'deadline'}` → 쉬는 시간 화면 | 빨간 `+mm:ss` 카운트업, 계속 답할 수 있음 |
| 영역이 끝나는 때 | 마감 시각, 또는 확인을 받은 수동 종료 | 사용자가 '다음 영역'(마지막 영역은 '종료')을 누를 때 |
| 마감 뒤 답 | 거부(`notice: 'locked'`, '영역 마감' 표시) | 받되 초과로 표시 |
| 영역 이동 | 다음 영역만, 지난 영역은 잠금 | 같음 |
| 페이스 표시 | 숨김 | `+2`/`−3` |
| 창 닫힘·절전 | 진행 중이던 영역은 시간이 계속 흘러 마감에 닫힌다. 다음 영역은 자동으로 시작하지 않는다 | 공백을 자동으로 일시정지로 본다 |
| 결과 | 시간 내 점수 = 전체 점수 | 두 점수를 따로 보임 |

- 기본 모드: 전체 모의, 영역 연습, 외부 모의는 실전이고 드릴은 연습이다. 시작 화면에서 바꿀 수 있다.
- 영역 수동 종료는 확인을 받은 뒤 허용한다. 남은 시간은 이월하지 않는다.

### 7.3 쉬는 시간 화면

- 각 영역 앞에 쉬는 시간 화면이 나온다(첫 영역 앞 포함). 다음 영역의 이름, 문항 번호 범위, 시간, 문항당 페이스, 도구 허용 여부를 보이고, e-book을 해당 쪽으로 넘길 시간을 준다.
- 실전이고 `autoStart`가 켜져 있으면 `breakSec`가 지난 시각에 자동으로 시작한다(`sectionStart{t: 이전 종료(첫 영역은 세션 시작) + breakSec × 1000, auto: true}`). `breakSec = 0`이면 바로 시작한다. '지금 시작'을 누르면 기다리지 않고 시작한다.
- 연습이거나 `autoStart`가 꺼져 있으면 '시작' 버튼으로만 시작한다.
- 쉬는 시간의 기준 시각은 `max(이전 영역 종료(첫 영역은 세션 생성), 마지막 공백의 끝)`이다. 공백(§7.5) 뒤에는 쉬는 시간을 새로 센다.

### 7.4 알림

- 시선이 e-book에 있어도 알아챌 수 있게 소리와 화면으로 알린다.

  | 시점 | 소리 | 화면 |
  |---|---|---|
  | 영역 마감 60초 전 | 짧은 비프 1회 | 패널 테두리 1회 점멸, 시간 주황 |
  | 영역 마감(0초) | 비프 2회 | 패널 점멸 |
  | 자동 시작 | 낮은 비프 1회 | 패널 점멸 |

- 비프는 WebAudio로 만든다. AudioContext는 세션 시작 클릭 때 만들어 둔다(자동 재생 정책).
- 알림 시각은 타임스탬프로 정하고, 같은 알림은 한 번만 울린다(창이 늦게 깨어나도 지난 알림을 몰아서 울리지 않는다. 마감 60초 전 알림은 마감이 이미 지났으면 건너뛴다).
- 설정에서 소리와 점멸을 각각 끌 수 있다.

### 7.5 재개, 절전, 창 닫힘

- 모든 동작 직후 세션을 저장한다.
- 러너가 진행 중 세션을 보이는 동안 5초마다 `kv alive:<sessionId>`를 갱신한다. 이 값이 그 세션의 '마지막 생존 시각'이다.
- 진행 중 세션이 있으면 부팅하자마자 러너로 간다. 진행 중에는 다른 화면으로 나갈 수 없다(끝내거나 중단해야 한다).
- `advance(s, now)`는 순수한 따라잡기 함수다. 모든 동작, 틱, 부팅 때 가장 먼저 실행한다.
  - 실전에서 마감이 지난 영역은 마감 시각에 닫는다.
  - 자동 시작 시각이 지난 쉬는 시간 화면은 그 시각에 시작한다.
  - 마지막 영역이 닫히면 OMR 모드는 '채점 대기', 외부 모의는 '외부 모의 완료'로 넘긴다.
- 공백 감지
  - 부팅할 때 `now − 마지막 생존 시각 > 120초`이면 공백(`cause: 'closed'`)이다.
  - 실행 중 직전 틱과의 간격이 120초를 넘으면 공백(`cause: 'sleep'`)이다.
  - 120초로 둔 이유: 가려진 창의 타이머는 최대 약 60초까지 늦을 수 있다. 이를 절전으로 오인하지 않기 위해서다.
- 공백 처리 `catchUpAfterGap(s, from, to, cause)`
  1. `advance(s, from)`: 앱이 살아 있던 동안 일어난 자동 시작과 마감을 반영한다.
  2. `advance(s, to, { autoStart: false })`: 공백 동안에는 진행 중이던 영역만 마감 시각에 닫고, **다음 영역을 자동으로 시작하지 않는다.** 사용자가 보지 못한 영역이 0답으로 기록되는 것을 막는다.
  3. `gap{t: to, from, to, cause}`를 덧붙인다. 쉬는 시간은 공백 끝부터 새로 센다(§7.3).
  4. 연습(soft)이면 공백을 묻지 않고 일시정지로 본다(`pauseRange{t: to, from, to}`).
- 실전 세션을 닫았다가 며칠 뒤 열면, 진행 중이던 영역은 마감 시각에 닫혀 있고 다음 영역의 쉬는 시간 화면에서 기다린다. 끝내 시작하지 않은 영역은 '미응시'로 표시하고 점수 합계에서 뺀다.

### 7.6 문항 시간(랩)과 ⚑

- **랩**: 영역 안의 답·해제·⚑ 이벤트를 시간순으로 훑는다. 직전 이벤트(처음에는 영역 시작)부터 이 이벤트까지의 간격에서 일시정지 시간을 빼고, 이 이벤트의 문항에 더한다.
  - 같은 문항의 이벤트가 여러 번이면 합친다. 답 변경과 재검토 시간이 여기에 들어간다.
  - 공백이 걸친 간격은 그 문항 시간을 `null`로 둔다. 이벤트가 없는 문항도 `null`이다.
- **⚑의 두 가지 뜻**: 리듀서가 ⚑를 켤 때 그 문항에 답이 있으면 `kind: 'guess'`(찍음), 없으면 `kind: 'skip'`(건너뜀)으로 기록한다.
  - `skip` ⚑는 그 뒤에 답 이벤트가 오면 해제된 것으로 본다. 건너뛴 문항을 나중에 제대로 풀면 찍음으로 세지 않는다.
  - 결과와 분석의 '찍음'은 최종 상태가 `guess`인 ⚑만 센다. 찍어서 맞힌 문항은 강점의 근거로 쓰지 않는다.
- **일괄 마킹 감지(v0.2 표시)**: 답이 10개 이상이고 답 간격의 50% 이상이 3초 미만이면 '일괄 마킹 의심'으로 보고 그 세션의 문항 시간을 숨긴다.

### 7.7 시간 내 점수

- 영역의 시간 내 답 = 그 영역 이벤트를 `t ≤ deadline`까지만 재생한 답 상태다.
- 영역 초과 시간 = `max(0, sectionEnd.t − deadline)`. `answer.t > deadline`이면 초과 응답이다.
- 실전에서는 마감 뒤 답을 거부하므로 시간 내 점수와 전체 점수가 같다.

---

## 8. 화면

### 8.1 흐름

```
홈 ─┬─ 이어하기(진행 중 세션)
    ├─ 새 세션 → 시작 화면 → [쉬는 시간 → 영역 풀이] × 영역 수 → 종료
    │      OMR 모드:  → 정답 입력(채점) → 결과        (또는 '나중에 채점' → 홈의 채점 대기)
    │      외부 모의: → 영역 시간 요약
    ├─ 채점 대기 / 최근 결과
    ├─ 설정·백업
    └─ (v0.2) 합격시대 가져오기 · 분석
```

### 8.2 홈

- '직전 설정으로 시작'(1클릭), '새 세션', 채점 대기 목록, 최근 결과 5개(날짜·세트·시간 내/전체 점수). 진행 중 세션이 있으면 홈 대신 러너가 열린다(§7.5).
- 저장된 세션 수, 미백업 n 배지, '지금 내보내기' 버튼.
- 저장소가 비어 있으면 '백업에서 복원' 안내를 띄운다.

### 8.3 시작 화면

직전 값을 자동으로 채워 30초 안에 끝나게 한다.

1. 프로필: DCAT / LG.
2. 범위: 전체 모의 / 영역 하나(드롭다운) / 자유 드릴(영역과 문항 수 입력, 시간은 자동 계산, 고칠 수 있음) / 외부 모의(타이머·도구만). 외부 모의는 `scope: 'full'`, `mode: 'external'`로 저장한다.
3. 모드: 실전 / 연습(기본값은 §7.2).
4. 시간 요약 한 줄과 '조정'(§3.3).
5. 세트: 기존 세트(같은 프로필, 최근 순, 시도 번호 자동) 또는 새 세트(이름, 시작 번호, 번호 방식 '이어서'/'영역마다 1번부터'). 외부 모의는 이름만 받는다.
6. '시작'을 누르면 첫 영역의 쉬는 시간 화면으로 간다.

### 8.4 러너

```
┌──────────── 340–480px ────────────────┐
│ 수리자료분석 3/5  12:41  미응답 7  +2  ⏸ 종료 │ 상태바
├────────────────────────────────────────┤
│ 41   ①  ②  ③  ④  ⑤   ⚑   ×            │
│ 42   ①  ②  ●  ④  ⑤   ⚑   ×            │ 번호 행 OMR
│▶43   ①  ②  ③  ④  ⑤   ⚑   ×            │
│ …                                       │
├────────────────────────────────────────┤
│ [메모] [그림판]                          │ 남는 높이 전부
├────────────────────────────────────────┤
│ C   ⌫   ÷   √                  [접기] │ 계산기
│ 7   8   9   ×                           │
│ 4   5   6   −                           │
│ 1   2   3   +                           │
│ 0   00  .   =                           │
└────────────────────────────────────────┘
```

- 상태바: 영역 이름과 순서, 영역 남은 시간(60초 이하 주황, 초과는 빨간 `+mm:ss`), 미응답 수, 연습 페이스, 일시정지(연습만), 종료. 전체 남은 시간은 보이지 않는다(영역 시간은 서로 빌려 쓸 수 없다).
- '종료'는 확인을 받은 뒤 현재 영역을 끝낸다. 마지막 영역이면 세션이 끝난다. 세션을 버리는 '중단'은 상태바의 ⋯ 메뉴에 있다(확인 필요).
- 확인창은 화면 안 대화상자로 만든다. `window.confirm`·`alert`는 쓰지 않는다.
- OMR 행: 화면 번호, 버블 ①~⑤(선택지 수만큼), ⚑, ×.
  - 버블을 누르면 그 답이 된다. 다른 버블을 누르면 답이 바뀐다.
  - **이미 고른 버블을 다시 눌러도 답이 유지된다.** 더블클릭이나 마우스 떨림으로 답이 지워지지 않게 하려는 것이다. 답을 지울 때는 ×를 누른다.
  - 답하면 다음 미응답 행을 강조한다. 스크롤은 강조 행이 보이는 영역의 아래 2행에 닿을 때만 한다.
  - '미응답 n'을 누르면 다음 미응답 행으로 스크롤한다.
- 현재 영역의 문항만 보인다. 지난 영역은 결과 화면 전까지 숨긴다.
- 영역이 시작될 때 그 영역의 도구 설정(§3.1, §3.4)을 적용한다. 영역 안에서 사용자가 바꾼 표시(계산기 접기, 탭)는 그 영역이 끝날 때까지 유지한다.

### 8.5 키보드와 포커스

- 답 선택 숫자 단축키는 없다. 숫자가 답이 되는 화면은 정답 입력 화면 하나뿐이다.
- 러너의 모든 버튼(버블, ⚑, ×, 탭, 접기, 일시정지, 종료, 지금 시작, 그림판 도구)은 포커스를 받지 않는다(`tabIndex=-1`, mousedown에서 `preventDefault`).
- 숫자·연산자·Enter·Esc·Backspace는 메모에 포커스가 있으면 메모로, 아니면 계산기로 간다(계산기가 허용된 영역에서만). 라우팅한 키는 전역 핸들러에서 `preventDefault`한다.
- 계산기, OMR, 상태바를 누르면 메모 포커스를 푼다(`blur`). 메모에서 Esc를 누르면 포커스가 풀린다. 계산기 머리에 지금 키 입력이 어디로 가는지 표시한다(`⌨ 계산기` / `⌨ 메모`).
- 확인 대화상자의 기본 포커스는 '취소'이고 Enter로 확정하지 않는다.
- 수락 기준
  - 버블을 누른 뒤 Enter, Space, 숫자를 쳐도 답이 바뀌지 않는다.
  - 메모에 입력 → 계산기 7 클릭 → 키보드 8 → 계산기 표시가 78이다.
  - 도구가 잠긴 영역에서 숫자를 쳐도 아무것도 바뀌지 않는다.

### 8.6 외부 모의 모드 (타이머·도구만)

- 합격시대 같은 온라인 모의고사를 풀 때 쓴다. 답은 사이트에서 고르고, 툴은 영역 타이머와 도구만 제공한다.
- 러너에서 OMR 대신 현재 영역 카드를 보인다: 영역 이름, 문항 번호 범위(예: `21–35번`), 남은 시간(크게), '다음 영역'(수동 종료). 상태바·알림·쉬는 시간·도구 잠금은 OMR 모드와 같다.
- 기록은 영역 시작·종료 이벤트와 메모뿐이다. 채점하지 않으므로 세트 없이 이름(`label`, 예: '합격시대 DCAT 2회')만 받는다.
- 영역 사이 쉬는 시간은 0초다. 사이트 문제가 이어서 나오기 때문이다. '시작'을 누르면 첫 영역이 바로 시작된다.
- 끝나면 영역별 사용 시간/제한/초과를 요약해 보이고 상태를 `external_done`으로 둔다. v0.2 가져오기가 같은 프로필·날짜의 외부 모의 세션과 연결해 '시간 안에 푼 외부 기록'으로 분류한다.

### 8.7 결과 화면

- 머리: 시간 내 점수 x/N, 전체 점수 y/N, 총 소요/제한, 초과 합계, 미응답, 찍음(맞음/틀림). 정답을 모르는 문항이 있으면 '채점 제외 n'을 보인다.
- 영역 표: 정답/문항/정답률, 시간 내 정답, 사용 시간/제한, 문항당 중앙값 초와 페이스, 미응답, 찍음, 초과 시간.
- 문항 표(접기): 번호, 내 답, 정답, ○×, ⚑, 초과, 초, 변경 수. 열 머리를 누르면 그 열로 정렬한다(초 정렬로 느린 문항을 찾는다).
- 세트에 정답이 이미 있으면 정답 입력 화면이 채워진 채로 열리고 확인만 누르면 된다.

### 8.8 설정·백업 화면

- 백업: 지금 내보내기, 복원, 세션 종료 자동 다운로드 켬/끔, 미백업 n, 마지막 백업 시각.
- 저장 상태: `persisted()` 결과, 저장소 사용량(`storage.estimate()`).
- 알림: 소리 켬/끔, 점멸 켬/끔.
- 프로필: 시작 화면과 같은 '조정' 편집기(§3.3).
- 정보: 앱 버전, schemaVersion.

### 8.9 작은 화면 기준

- 340px 폭에서 가로 스크롤이 없다.
- 높이 530px(1366×768 화면, 125% 배율의 30% 창)에서 상태바와 OMR 4행 이상이 보이고, 계산기를 접으면 메모를 쓸 수 있다. OMR 표시 행 수는 높이에 맞춰 4~8행으로 바뀌고, 계산기 키 높이는 창 높이에 따라 줄어든다.

---

## 9. 도구

### 9.1 계산기

- 키 배열은 SKCT 툴과 같다: `C ⌫ ÷ √ / 7 8 9 × / 4 5 6 − / 1 2 3 + / 0 00 . =`(20키). `%`는 없다.
- 즉시 실행형이다. 연산자 우선순위가 없어 `2 + 3 × 4 =`는 20이다.
- 연산자를 연달아 누르면 마지막 연산자로 바꾼다(`5 + × 3 =`은 15).
- `√`는 현재 표시값에 바로 적용한다(`9 √`는 3). 음수의 √는 '오류'다.
- `=`를 반복하면 마지막 연산을 반복한다(`5 + 3 = =`은 11).
- `÷ 0`은 '오류'를 띄운다. C나 숫자를 누르면 풀린다.
- 연산 결과는 매번 유효숫자 12자리로 정규화해 저장한다(`Number(x.toPrecision(12))`). 그래서 `0.1 + 0.2`는 0.3, `1 ÷ 3 × 3`은 1, `0.1 + 0.2 − 0.3`은 0이다. 절댓값이 1e12 이상이거나 1e−6 미만(0 제외)이면 지수 표기를 쓴다. 숫자 입력은 12자리까지 받는다.
- `9 + √ =`는 12다(√는 표시값 9에 적용). `5 × =`는 25다. `=` 뒤에 숫자를 누르면 새 계산을 시작한다. 오류 상태에서는 연산자·=·√를 무시한다.
- 위 줄에는 진행 중인 식(예: `12 × 3 =`)을 보인다.
- 키보드는 메모에 포커스가 없고 `calcKeyboard`가 켜져 있을 때만 받는다.

  | 키 | 동작 |
  |---|---|
  | 0–9, `.`, `+ - * /` | 그대로 입력 |
  | Enter, `=` | = |
  | Backspace | ⌫ |
  | Esc, Delete | C |
  | 넘패드 | 위와 같음 |

- 순수 리듀서 `press(state, key)`로 만들고 키 시퀀스 표로 테스트한다.

### 9.2 메모

- 세션마다 textarea 하나를 둔다. 1초 디바운스로 kv `memo:<sessionId>`에 저장하고, 창이 가려질 때(`visibilitychange`)는 바로 저장한다. 새로고침해도 남는다. 세션 레코드와 따로 저장하므로 답 저장과 덮어쓰기 경합이 없다. '지우기' 버튼이 있다.
- 메모 텍스트만 저장하고 문항별 스냅샷은 만들지 않는다.

### 9.3 그림판

- canvas, Pointer Events, `setPointerCapture`를 쓴다. 획은 점 배열(CSS px)로 보관한다.
- `ResizeObserver`가 크기 변화를 감지하면 캔버스를 CSS 크기 × `devicePixelRatio`로 맞추고 모든 획을 다시 그린다. 창을 스냅하거나 크기를 바꿔도 그림이 남는다.
- 도구: 펜 2색(검정·빨강), 지우개(`destination-out` 획), 전체 지우기(실행 취소할 수 있도록 '지움' 표시 획으로 기록), 실행 취소.
- v0.1은 획을 메모리에만 둔다. 새로고침하면 사라진다.
- 획은 세션 범위의 모듈 상태에 둔다. 메모·그림판 탭 전환과 도구 잠금은 숨김으로만 처리하고 컴포넌트를 내리지 않는다. 캔버스에 `touch-action: none`을 준다.
- 수락 기준: 그리기 → 메모 탭 → 그림판 탭 뒤에도 획이 남는다. 창 크기를 바꿔도 남는다.

---

## 10. 채점

### 10.1 정답 입력

- 풀이 때와 같은 번호 목록에서 정답 숫자를 이어서 친다. 5개씩 묶어 보이고, 숫자열(`31425…`) 붙여넣기도 된다.
- 입력 규칙
  - 공백, 쉼표, 줄바꿈은 무시한다.
  - `0`이나 `-`는 '정답 모름'으로 보고 채점에서 뺀다.
  - 1~선택지 수 밖의 문자는 위치를 표시한다.
  - 길이가 문항 수와 다르면 알린다.
- 치는 즉시 ○/×를 보인다.
- 해설을 읽으며 한 문항씩 쳐도 같은 화면에서 된다.
- '나중에 채점'을 누르면 세션은 채점 대기로 남는다.

### 10.2 재채점

- 정답은 세트에 저장한다. 같은 세트를 다시 풀면 자동으로 채워진다.
- 정답을 고치면 그 세트의 모든 세션 결과가 다시 계산된다(늦은 결합).

---

## 11. 저장 안전

### 11.1 단일 작성자 잠금

- 같은 프로필로 창 두 개가 같은 세션을 덮어쓰는 것을 막는다.
- `navigator.locks.request('apt-writer', { ifAvailable: true }, …)`로 잠금을 잡고 창이 살아 있는 동안 놓지 않는다. file://에서 배타 동작을 확인했다(§4.5). 창을 닫으면 잠금은 자동으로 풀린다.
- 잡지 못한 창은 아무것도 쓰지 않고 차단 화면 '다른 창에서 열려 있습니다. 이 창을 닫으세요.'만 보인다.
- `navigator.locks`가 없으면(예상하지 않음) 경고 배너를 보이고 잠금 없이 연다.

### 11.2 백업 형식

```json
{ "format": "apt-backup", "schemaVersion": 1, "appVersion": "0.1.0",
  "exportedAt": "2026-10-09T21:30:00+09:00",
  "counts": { "sessions": 3, "sets": 2, "imports": 0 },
  "data": { "profiles": [], "sets": [], "sessions": [], "imports": [],
            "taxonomy": [], "aliases": [], "settings": {} } }
```

- 원자료만 담는다: 프로필 수정본, 세트(정답 키·유형 범위), 세션(이벤트 로그·메모), 붙여넣기 원문, 분류·별칭, 설정.
- 파생값과 내장 프로필은 넣지 않는다. 세션의 `plan` 스냅샷이 당시 시간 규칙을 보존한다.

### 11.3 자동 다운로드와 미백업 배지

- 세션이 끝난 뒤 사용자가 처음 누르는 확정 버튼('채점 저장', '나중에 채점', 외부 모의 '확인')에서 백업 파일을 1회 내려받는다. 파일 이름은 `apt-backup-YYYYMMDD-HHmm.json`이다. 사용자 클릭에 묶어야 Chrome의 자동 다운로드 차단에 걸리지 않는다.
- 설정에서 끌 수 있다.
- 미백업 배지는 `meta.lastBackupAt` 이후에 바뀐 세션·세트·프로필 수정본·가져오기의 수다.

### 11.4 복원

1. 파일을 고른다.
2. `validateBackup`으로 형식, `schemaVersion ≤ 앱`, 필수 배열을 검사한다.
3. `migrate`를 실행한다.
4. 현재 DB와 파일의 건수를 나란히 보여 준다.
5. 현재 DB를 자동으로 내보낸다.
6. `replaceAll` 트랜잭션 하나로 교체한다.
7. 다시 읽는다.

잘못된 파일은 거부하고 DB는 건드리지 않는다. 부팅 로드와 복원은 같은 `migrate()`를 쓴다.

### 11.5 오류 처리

| 상황 | 처리 | 사용자에게 보이는 것 |
|---|---|---|
| IndexedDB 열기·쓰기 실패, 용량 초과 | 메모리 상태를 유지하고 다음 동작 때 다시 시도한다. 이벤트를 버리지 않는다 | 빨간 배너 '저장 실패 — 지금 내보내기' |
| 두 번째 창 | §11.1 | 차단 화면 |
| 가려진 창의 타이머 지연 | 표시·포커스 때 다시 계산하고 판정은 타임스탬프로 한다 | 없음 |
| 절전·창 닫힘(120초 넘는 공백) | §7.5 따라잡기. 실전은 진행 중 영역만 마감, 연습은 자동 일시정지 | 복귀 때 알림 |
| 진행 중 세션이 있을 때 복원 | 거부 | '진행 중인 세션을 끝낸 뒤 복원하세요' |
| 새로고침·크래시 | 저장된 이벤트로 다시 만든다. 진행 중에만 `beforeunload` 경고 | 이어하기 |
| 시스템 시계 역행 | 마지막 이벤트 시각으로 고정 | 없음 |
| 정답 입력 오류 | 잘못된 위치 강조, `0`·`-` 허용 | 인라인 표시 |
| 계산 오류 | ÷0, 음수 √는 '오류' | 화면 표시 |
| 프로필 편집 값이 범위 밖 | 저장하지 않음 | 해당 칸 표시 |
| 복원 파일 오류, 앱보다 높은 schemaVersion | 거부, DB 그대로 | 이유 표시 |
| 앱보다 높은 schemaVersion 문서(롤백 시) | 그 문서만 읽기 전용(고치지 않음), 나머지는 정상 | 해당 항목에 '새 버전 데이터' 표시 |
| 렌더링 예외 | React ErrorBoundary | '진행 중 세션은 저장돼 있음, 새로고침' + 내보내기 버튼 |
| 붙여넣기 파싱 실패(v0.2) | 원문 보관, 행 편집이나 '원문만 보관' | 미리보기 경고 |

---

## 12. v0.2 — 합격시대 가져오기

### 12.1 캡처와 파싱

- 붙여넣기 칸의 `paste` 이벤트에서 `text/html`(있으면)과 `text/plain`을 받는다. 파싱하기 전에 `ImportRecord{status: 'raw', parserVersion}`로 먼저 저장한다. 파서가 틀려도 원문이 남고, 고친 뒤 다시 파싱할 수 있다.
- 파싱 순서: ① `text/html`이 있으면 `DOMParser`로 표의 행·셀을 읽는다. ② 없으면 탭 구분 텍스트. ③ 그래도 안 되면 '셀당 한 줄' 형태를 행으로 다시 묶는다. ④ 마지막으로 줄 끝의 숫자 3개(정답·문제·정답률)를 정규식으로 찾는다.
- 헤더 정규식(공백 허용):

  ```
  응시회차\s*(\d+)\s*회차
  응시일\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일
  순위\s*(\d+)\s*위\s*/\s*(\d+)\s*명\s*\(\s*(\d+)\s*%\s*\)
  소요시간\s*(\d+)\s*분\s*/\s*(\d+)\s*분
  점수\s*([\d.]+)\s*/\s*(\d+)\s*점
  맞은\s*개수\s*(\d+)\s*문항\s*/\s*총\s*(\d+)\s*문항
  ```

- 정답률 열이 정답/문제와 다르면(응시자 평균일 수 있음) `rateRaw`에 따로 둔다.
- 사이트 점수(1회 61.2)는 46/75 = 61.33과 다르다. 공식을 모르므로 받은 값만 보관한다.

### 12.2 경로 정규화와 가족 추출

1. NFKC 정규화, 공백 정리, 대시 변형(‐ – — −)을 `-`로 바꾼다.
2. 괄호 `()`·대괄호 `[]` 바깥에 있는 `-`에서만 자르고 조각마다 앞뒤 공백을 지운다. 구분자가 ' - '이든 '-'이든 받는다.
3. 첫 조각이 `^\d+\.`로 시작하면 대분류(예: '11.추리')로 떼어 속성으로 둔다. 접두가 없는 행은 바로 앞 행의 대분류를 물려받는다.
4. 남은 첫 조각에서 끝의 괄호를 지운 것이 가족이다(예: '자료해석(그래프)' → 자료해석). 나머지 조각이 세부다.
5. 1회 42행은 13가족이 되고 합계 46/75가 맞는다(부록 A).

### 12.3 검증과 영역 매핑

- 체크섬(하드): 행마다 정답 ≤ 문제, Σ문제 = 헤더 총문항, Σ정답 = 헤더 맞은 개수. 헤더가 없으면 경고만 한다. 실패하면 행 편집 미리보기나 '원문만 보관'으로 넘긴다.
- 영역 매핑은 **문항 위치**로 한다. 결과표의 행 순서가 문항 순서이기 때문이다.
  1. 행의 문제 수를 누적해 행마다 `qFrom..qTo`를 정한다.
  2. 프로필의 영역 경계(DCAT 20/35/55/65/75, LG 20/40/60/80)가 모두 행 경계와 맞는지 확인해 `aligned`를 정한다. 1회는 정확히 맞는다.
  3. 경계가 행 중간에 걸리면 그 행은 `sectionId = null`로 두고, 가족의 영역 힌트로 추론해 '추론' 표시와 함께 경고한다.
- 대분류 이름으로 영역을 정하지 않는다. '12.공간지각-평면도형'의 두 행(회전/대칭/비교, 같은 모양 비교)은 문항 위치상 도형추리(66–75번)에 속한다.
- 별칭: 키는 `passsidae|정규화 경로(대분류 제외)`다. 키가 맞으면 자동 연결하고, 없으면 §12.2 규칙으로 가족·세부를 만들어 `decidedBy: 'auto'`로 저장한다.
- 같은 프로필·같은 날짜의 외부 모의 세션(§8.6)이 있으면 연결을 제안한다. 연결되면 조건이 `external`(시간 안), 없고 소요 시간이 제한보다 길면 `external-overtime`이다(1회: 83/65 = 128%).

### 12.4 미리보기와 저장

- 헤더 값, 영역별 합계(1회: 15/20 · 12/15 · 11/20 · 2/10 · 6/10), 체크섬 ✓, 새로 생기는 가족 수를 보인다. 저장하면 `status: 'confirmed'`.
- 폴백: 복사가 막히면 Chrome에서 Ctrl+S('웹페이지, 전체')로 저장한 HTML을 끌어다 놓는다. 같은 DOM 파서로 처리한다.

### 12.5 v0.2 저장 타입

```ts
interface ImportRecord {
  id: string; source: 'passsidae'; profileId: string; capturedAt: number;
  raw: { html?: string; text: string }; parserVersion: number;
  header?: { round?: number; date?: string; rank?: number; takers?: number; usedMin?: number;
             limitMin?: number; score?: number; scoreMax?: number; correct?: number; total?: number };
  rows?: { pathRaw: string; category?: string; family: string; leaf: string;
           correct: number; total: number; rateRaw?: string;
           qFrom: number; qTo: number; sectionId: string | null;
           mapped: 'position' | 'alias' | 'inferred' }[];
  linkedSessionId?: string;
  status: 'raw' | 'parsed' | 'confirmed'; overtime: boolean; schemaVersion: number;
}
interface Taxonomy { profileId: string;
  families: { id: string; name: string; sectionHint: string[] }[];
  leaves: { id: string; familyId: string; name: string }[] }
interface AliasEntry { key: string; familyId: string; leafId?: string; decidedBy: 'auto' | 'user' }
```

### 12.6 수락 기준 (부록 A 픽스처)

- 42행, Σ 46/75, 헤더 1회차·2026-10-08·40위/101명(40%)·83/65분·61.2/100점·46/75문항.
- 영역 15/20 · 12/15 · 11/20 · 2/10 · 6/10, `aligned = true`, 13가족, `overtime = true`.
- 같은 원문을 다시 파싱하면 같은 결과(멱등).

---

## 13. v0.2 — 유형 태깅과 분석

### 13.1 유형 태깅과 오답 이유

- 분류는 2단계(가족 → 세부)이고 영역과 독립된 축이다. 평면도형처럼 두 영역에 걸치는 가족이 있기 때문이다. 판정은 가족 단위로만 한다.
- DCAT 가족 시드(합격시대 1회): 명제추리, 단문독해, 글의구조, 어휘어법, 어휘추리, 수열, 응용수리, 자료해석, 수/문자추리, 입체도형, 전개도, 평면도형, 도형추리. LG 시드는 없고 처음 입력할 때 추가된다.
- 칠하기: 결과 화면에서 가족 칩(세부는 선택)을 고르고 OMR 행을 드래그해 범위를 지정한다. 범위는 세트에 저장되어 같은 세트를 다시 풀면 그대로 적용된다. 범위가 없는 행은 세트 기본 유형을 따른다. 수락 기준: 20문항 세트 태깅이 1분 안에 끝난다.
- 오답 이유: 미응답, 초과, 찍음(⚑ guess)은 자동으로 분류한다. 남은 오답에만 칩(개념·실수·오독)을 누른다. 선택 사항이다.

### 13.2 분석 단위: 셀

- 셀 = 세션(또는 가져오기) × 영역 × 가족/세부 × 조건. 필드: n, 정답, 응답 수|null, 시간 내 정답|null, 찍음 정답|null, 시간 합, 시간 데이터 n.
- OMR 문항은 셀로 합치고, 외부 행은 그대로 셀이 된다. 외부 집계의 '틀림'에는 오답과 무응답이 섞여 있으므로 응답 수는 `null`이다.
- 정답률은 셀을 모두 합쳐서 계산한다(백분율 평균 금지). 시간 지표는 랩이 유효한 툴 문항으로만 계산하고 커버리지('시간 데이터 38/120문항')를 함께 보인다.
- 조건: `full`, `section`, `drill`, `external`, `external-overtime`. 시도 번호로 첫 풀이를 구분한다.

### 13.3 지표

| 지표 | 정의 |
|---|---|
| 정답률 p | Σ정답 / Σn |
| 시간 내 정답률 | 툴 세션만 |
| 보정 정답률 p̃ | (정답 + k·p영역) / (n + k), k = 4(설정). 가족이 여러 영역에 걸치면 영역 p를 n으로 가중 평균 |
| 시간 비율 | 중앙값 초/문항 ÷ 영역 페이스 |
| 비중 w | 실전 1회에서 그 가족의 문항 비율. 가져온 모의고사의 빈도, 없으면 영역 비중 ÷ 영역 안 가족 수 |
| 기대 오답 | w × 실전 문항 수 × (1 − p̃) |
| 분당 득점 | p̃ ÷ (중앙값 초 / 60) |
| 속도 손실(영역) | 전체 정답 − 시간 내 정답(연습 모드) |
| 미응답·초과·찍음 맞힘 비율 | 툴 세션만 |

- 표시 규칙: x/n은 항상 보인다. %는 n ≥ 5일 때만 보이고 n < 5는 회색이다.

### 13.4 화면

- 필터: 프로필, 출처(툴/가져오기), 조건, 첫 풀이만(판정에서 기본으로 켬), 최근 N회.
- 회차 표: 날짜, 출처, 조건, 시간 내/전체 점수, 영역별 정답률(CSS 막대), 초과. `external-overtime` 기록은 시간 내 칸에 '—(초과 128%)'를 넣는다.
- 영역 표: x/n, 시간 내 x/n, 중앙값 초 대 페이스, 미응답, 초과, 속도 손실.
- 가족 표: w, x/n, p̃, 중앙값 초(시간 데이터 n), 찍음 맞힘, 기대 오답, 판정. 행을 누르면 세부와 해당 문항 목록이 펼쳐진다.
- 산점도(SVG): x = 시간 비율, y = p̃, 점 크기 = w. 기준선 y = 1/선택지(0.2), x = 1.0. 사분면 이름은 강점 / 속도 훈련 / 공부 / 뒤로·찍기.
- 판정 카드: 공부 Top3, 속도 훈련, 실전에서 뒤로 미룰 유형과 찍기 후보. 미확인 규칙(감점 등)에 기댄 판정에는 그 사실을 함께 보인다.

### 13.5 판정 규칙 (임계값은 설정값)

| 판정 | 조건 |
|---|---|
| 공부 | 기대 오답 상위 3(n ≥ 3) |
| 속도 훈련 | p̃ ≥ 영역 평균, 시간 비율 ≥ 1.3, 시간 데이터 n ≥ 4 |
| 뒤로(실전 후순위) | 분당 득점 < 영역 평균의 0.6배, 시간 데이터 n ≥ 4, 시간제·첫 풀이 데이터만 |
| 찍기 후보 | p̃ ≤ 1/선택지 + 0.1, 감점 없음(미확인 표시) |

- 예시(합격시대 1회만, k = 4): 전개도 0/6 → p̃ 0.08, 기대 오답 5.5 / 자료해석 5/10 → 0.51, 4.9 / 도형추리 5/8 → 0.62, 3.1. 1회는 `external-overtime`이므로 '뒤로' 판정에 쓰지 않고, 공부 순위에는 '시간 교란 가능'을 표시한다.

---

## 14. 테스트와 검증

### 14.1 Vitest (domain 전부)

| 대상 | 확인할 것 |
|---|---|
| 계산기(20개 이상) | 0.1+0.2=0.3, 0.1+0.2−0.3=0, 1.1×1.1−1.21=0, 5÷0=오류, 2+3×4=20, 9√=3, 9+√==12, 5×==25, 음수√=오류, 00 입력, ⌫, 연산자 교체(5+×3=15), = 반복(5+3==→11), 1÷3×3=1, C, 오류 뒤 숫자 입력, 12자리 입력 제한 |
| profiles | DCAT 75문항/3,900초, 20·15·20·10·10문항, 1,200·600·1,200·450·450초, 공간·도형 도구 잠금. LG 80문항/4,800초. 프로필 편집 검사(범위 밖 거부), 수정본 우선, 기본값 복원, plan 스냅샷이 이후 편집에 영향받지 않음 |
| 타이머 | 마감 계산, 일시정지·pauseRange 제외, 하드 마감의 `sectionEnd.t = deadline`(틱이 늦어도), 실전 마감 뒤 답 거부, 연습 초과 표시, 쉬는 시간 `breakSec`(0·15) 뒤 자동 시작, autoStart 끔이면 수동 시작만, 2시간 닫혔다 부팅하면 진행 중 영역만 마감에 닫히고 다음 영역은 쉬는 시간에서 대기, 마감 뒤 정지가 마감을 늦추지 않음, 겹치는 정지는 한 번만, 연습 공백은 자동 일시정지, 120초 공백 기준, 시계 역행 고정 |
| session | 같은 답 재클릭 무변화, ×로 해제, ⚑ kind(답 있음=guess, 없음=skip), skip ⚑가 답으로 해제, 외부 모의 세션이 external_done으로 끝남 |
| derive | answersAt, 시간 내/전체 점수, 랩(일시정지·공백 반영, 답 변경 합산), 변경 수 |
| grading | parseKey(공백, 0·-, 잘못된 문자, 길이 불일치), 영역별 요약, 정답 모름 제외 |
| backup | 왕복 결과가 같음, 깨진 JSON과 높은 schemaVersion 거부(DB 그대로), migrate 멱등 |
| repo(fake-indexeddb) | 저장·전체 읽기 왕복, replaceAll 중간 실패 시 원본 유지, 프로필 수정본 저장·삭제, 메모와 세션을 따로 저장(메모 직후 답 → 둘 다 남음) |
| store | 빈 DB 부팅, 잠금 실패 시 차단·쓰기 없음, 시작 더블클릭에도 세션 1개, 답 저장 뒤 재부팅하면 러너로 복귀, 생존 기록 뒤 120초 넘는 공백 기록, 진행 중 세션이 있으면 복원 거부, 채점 저장 때 백업 1회 |
| 알림 스케줄 | 60초 전·0초·자동 시작 알림이 각각 한 번만 나오고, 늦게 깨어나도 지난 알림을 몰아서 내지 않음 |
| v0.2 | 합격시대 픽스처(§12.6), 경로 정규화와 13가족, 위치 매핑, 수축 예(전개도 0/6 → 0.08, 응용수리 4/7 → 0.564), 기대 오답 합 29.66 |

### 14.2 Playwright (설치된 Chrome, file://, 영속 컨텍스트)

- 테스트는 `e2e/.profile-test`만 쓴다. 실제 `chrome-profile`은 건드리지 않는다.
- 프로브: 열기 → 카운터 1 → 닫기 → 다시 열기 → 카운터 2. `isSecureContext`, `navigator.locks` 유무, `persisted()`를 기록한다. 콘솔 에러 0.
- 스모크:
  1. 드릴을 시작해 답 3개를 고르고 새로고침한다. 답과 타이머가 유지된다.
  2. 버블을 더블클릭해도 답이 남는다.
  3. 종료하고 정답 `123`을 입력한다. 결과에 시간 내/전체 점수가 나온다.
  4. 백업 다운로드 이벤트가 발생한다.
  5. 키보드로 `0.1+0.2`를 치면 0.3이 나온다. 메모 입력 → 계산기 7 클릭 → 키보드 8 → 78.
  6. DCAT 공간추리 영역에서 도구 영역이 잠겨 있다.
  7. 그림판에 그린 뒤 메모 탭 → 그림판 탭으로 돌아와도, 창 크기를 바꿔도 획이 남는다.
  8. 340×530 창에서 가로 스크롤이 없고 OMR 4행 이상이 보인다.
- 리뷰 담당이 패키지마다 돌리고, 통과한 빌드만 릴리스한다.

### 14.3 사용자 수동 확인 (3분 이하)

1. 70:30 스냅에서 패널이 화면에 들어맞는다.
2. 펜 감각이 괜찮다.
3. 툴에 포커스를 둔 채 휠로 e-book이 넘어간다.
4. 바로가기가 올바른 창을 연다.
5. 비프 소리 크기가 적당하다.
6. 백업 파일이 두 번 연속 내려받아진다(Chrome의 '여러 파일 다운로드' 확인창이 뜨면 허용).

---

## 15. 위험과 대응

| 위험 | 대응 |
|---|---|
| Chrome 154에서 file:// IndexedDB가 재시작 뒤 남지 않을 수 있다(미검증) | 첫 패키지의 프로브로 사용자 시간 없이 판정한다. 실패하면 고정 포트 서버(§4.5). 전용 프로필, 세션마다 자동 백업 |
| 개발 빌드가 공부 중인 툴을 깨뜨린다 | 바로가기는 `app/` 릴리스 사본을 연다. 검증한 빌드만 복사하고 직전 판을 보관한다 |
| '풀면서 바로 마킹한다'는 가정이 틀린다 | 일괄 마킹 감지(§7.6). 첫 세션 뒤 답 간격 분포를 확인한다 |
| 화면이 작아 배치가 깨진다 | 340px 폭·530px 높이 수락 기준(§8.9) |
| 1회 공간추리 2/10은 실력과 시간 압박이 섞인 결과다 | 확정하지 않는다. '뒤로' 판정은 툴의 시간제 데이터로만 한다 |
| 실전 규칙(이동, 이월, 감점, 쉬는 시간, 계산기 키보드)이 미확인이다 | 프로필 값으로 두고 사용자가 조정한다(§3.3) |
| 합격시대 표의 복사 형식을 모르거나 복사가 막혀 있다 | 원문 선저장, html 우선 파싱, 파일 드롭 폴백. v0.2 전에 원문 1개를 받는다(부록 B) |
| 창 두 개가 같은 세션을 덮어쓴다 | 단일 작성자 잠금(§11.1) |
| 다른 Chrome 프로필로 열거나 데이터를 지워 기록이 비어 보인다 | 전용 user-data-dir, 저장소가 비면 복원 안내, 자동 백업 |
| v0.2 스키마 변경이 v0.1 기록을 손상한다 | 문서 단위 migrate, v0.1 실제 백업을 테스트 픽스처로, 배포 전 백업, 높은 버전 데이터는 읽기 전용 |
| 재풀이·드릴 정답률이 섞여 실력이 과대평가된다 | 시도 번호·조건 필드, 판정 기본 필터는 첫 풀이·시간제 |
| 표본이 작아 순위가 잡음이다 | x/n 상시 표시, n < 5 회색, 수축, 가족 단위 판정 |
| 구현 레인(Codex) 장애 | 실패 사실과 에러를 사용자에게 알리고 claude-only 프로필 전환을 제안한다 |

---

## 16. 구현 방식

- 구현 담당은 `roles.json`의 `active_profile = codex-lead`에 따라 Codex `gpt-6.1-sol`(effort high, `route_agent_task`)이다. 리뷰는 Claude(native subagent)가 맡는다. brain은 패키지마다 실제 diff와 테스트 출력을 확인한 뒤 다음 패키지를 보낸다.
- 패키지마다 파일은 5개 이하(package-lock.json 같은 생성 파일 제외)이고, 수락 기준을 명시한다. 매 패키지에서 `npm test`와 `npm run build`가 통과해야 한다.
- v0.1 순서(세부는 구현 계획에서 확정한다)
  1. 스캐폴드와 영속 프로브
  2. 릴리스·바로가기 스크립트와 Playwright 프로브
  3. domain-a: 타입, 프로필(편집 검사 포함), 계산기, 타이머
  4. 도구 패널: 계산기·메모·간이 카운트다운 = **체크포인트①**(이 시점부터 SKCT 툴 대신 도구로 쓸 수 있다)
  5. 그림판
  6. domain-b: 세션 리듀서, 파생, 채점, 백업
  7. 저장소(Dexie repo)
  8. 세션 UI: 시작 화면(프로필 조정 포함), 러너(잠금·알림·외부 모의), 쉬는 시간 화면
  9. 홈, 정답 입력, 결과, 설정·백업 = **체크포인트②**(v0.1 릴리스)
- v0.2 순서: 합격시대 파서·매핑 → 가져오기 화면 → 유형 칠하기·오답 이유 → 분석 도메인 → 분석 화면.

---

## 부록 A. 합격시대 DCAT 1회 결과표 (스크린샷 판독, v0.2 픽스처의 기대값)

- 헤더: 1회차, 응시일 2026년 10월 08일, 순위 40위 / 101명(40%), 소요시간 83분 / 65분, 점수 61.2 / 100점, 맞은 개수 46문항 / 총 75문항.
- 행(과목(영역) — 정답/문제), 표 순서 그대로:

| # | 과목(영역) | 정답/문제 | 영역(위치) |
|---|---|---|---|
| 1 | 11. 추리 - 명제추리 - 참/거짓 | 2/2 | 언어논리 |
| 2 | 11. 추리 - 명제추리 - 삼단논법 | 2/2 | 언어논리 |
| 3 | 11. 추리 - 명제추리 - 명제 | 1/2 | 언어논리 |
| 4 | 1. 의사소통능력(언어) - 단문독해 - 내용일치 | 2/2 | 언어논리 |
| 5 | 1. 의사소통능력(언어) - 단문독해 - 주제/제목찾기 | 1/2 | 언어논리 |
| 6 | 1. 의사소통능력(언어) - 단문독해 - 추론하기 | 2/2 | 언어논리 |
| 7 | 1. 의사소통능력(언어) - 글의구조 - 배열하기 | 2/2 | 언어논리 |
| 8 | 1. 의사소통능력(언어) - 글의구조 - 문장삽입 | 1/2 | 언어논리 |
| 9 | 1. 의사소통능력(언어) - 글의구조 - 빈칸추론 | 2/2 | 언어논리 |
| 10 | 1. 의사소통능력(언어) - 글의구조 - 개요수정 | 0/1 | 언어논리 |
| 11 | 1. 의사소통능력(언어) - 글의구조 - 도식화하기 | 0/1 | 언어논리 |
| 12 | 1. 의사소통능력(언어) - 어휘어법 - 동의어/유의어 | 1/1 | 언어표현 |
| 13 | 1. 의사소통능력(언어) - 어휘어법 - 동음이의어/다의어 | 1/1 | 언어표현 |
| 14 | 1. 의사소통능력(언어) - 어휘어법 - 반의어 | 2/2 | 언어표현 |
| 15 | 1. 의사소통능력(언어) - 어휘어법 - 어휘선택 | 1/2 | 언어표현 |
| 16 | 1. 의사소통능력(언어) - 어휘어법 - 맞춤법 | 1/2 | 언어표현 |
| 17 | 1. 의사소통능력(언어) - 어휘어법 - 관용적표현 | 2/2 | 언어표현 |
| 18 | 11. 추리 - 어휘추리 - 어휘유추 | 2/2 | 언어표현 |
| 19 | 1. 의사소통능력(언어) - 어휘어법 - 표준어 | 1/2 | 언어표현 |
| 20 | 1. 의사소통능력(언어) - 어휘어법 - 관계유추 | 1/1 | 언어표현 |
| 21 | 2. 수리능력 - 수열 | 2/2 | 수리자료분석 |
| 22 | 2. 수리능력 - 응용수리 - 거리/시간/속력 | 2/3 | 수리자료분석 |
| 23 | 2. 수리능력 - 응용수리 - 경우의 수/확률 | 1/2 | 수리자료분석 |
| 24 | 2. 수리능력 - 응용수리 - 인원/개수 | 1/2 | 수리자료분석 |
| 25 | 2. 수리능력 - 자료해석(그래프) - 자료계산(그래프) | 2/2 | 수리자료분석 |
| 26 | 2. 수리능력 - 자료해석(그래프) - 자료변환(그래프) | 0/2 | 수리자료분석 |
| 27 | 2. 수리능력 - 자료해석(그래프) - 추론/분석(그래프) | 2/2 | 수리자료분석 |
| 28 | 2. 수리능력 - 자료해석(표) - 자료계산(표) | 1/2 | 수리자료분석 |
| 29 | 2. 수리능력 - 자료해석(표) - 추론/분석(표) | 0/2 | 수리자료분석 |
| 30 | 11. 추리 - 수/문자추리 - 알고리즘형 | 0/1 | 수리자료분석 |
| 31 | 12. 공간지각 - 입체도형 - [단면도]-[3×3×3큐브] (두산) | 2/2 | 공간추리 |
| 32 | 12. 공간지각 - 전개도 - [전개도활용]-[절반의 물] (두산) | 0/2 | 공간추리 |
| 33 | 12. 공간지각 - 평면도형 - 평면도형 활용 | 0/2 | 공간추리 |
| 34 | 12. 공간지각 - 전개도 - [전개도활용]-[전개도 회전] (두산) | 0/2 | 공간추리 |
| 35 | 12. 공간지각 - 전개도 - [전개도활용]-[결합모양] (HMAT, 두산) | 0/2 | 공간추리 |
| 36 | 11. 추리 - 도형추리 - 도형의 규칙(9개의 칸) (GSAT 3급, 포스코, 샘표, SK생산) | 2/2 | 도형추리 |
| 37 | 12. 공간지각 - 평면도형 - 회전/대칭/비교 | 0/1 | 도형추리 |
| 38 | 12. 공간지각 - 평면도형 - 평면도형 비교(같은 모양) (삼성 4,5급, SK생산) | 1/1 | 도형추리 |
| 39 | 11. 추리 - 도형추리 - 도형의 변화(일정한 규칙(과정형)) (LG) | 2/2 | 도형추리 |
| 40 | 11. 추리 - 도형추리 - 도형의 규칙(6개의 칸(패턴)) (LG) | 1/1 | 도형추리 |
| 41 | 11. 추리 - 도형추리 - 도형의 규칙(6개의 칸(비패턴)) (LG) | 0/1 | 도형추리 |
| 42 | 11. 추리 - 도형추리 - 도형의 규칙(4분원, 반원) (LG) | 0/2 | 도형추리 |

- 영역 합계: 언어논리 15/20, 언어표현 12/15, 수리자료분석 11/20, 공간추리 2/10, 도형추리 6/10. 전체 46/75.
- 가족 합계: 명제추리 5/6, 단문독해 5/6, 글의구조 5/8, 어휘어법 10/13, 어휘추리 2/2, 수열 2/2, 응용수리 4/7, 자료해석 5/10, 수/문자추리 0/1, 입체도형 2/2, 전개도 0/6, 평면도형 1/4, 도형추리 5/8.
- 실제 붙여넣기 원문(탭·줄바꿈 형식)은 아직 없다. v0.2 파서 테스트는 사용자가 저장한 원문으로 다시 확인한다.

## 부록 B. 사용자에게 확인할 것 (선택, 모두 합쳐 5분 이하)

1. 지금 풀 때 답을 바로 툴에 마킹하는가, 종이에 적었다가 몰아서 입력하는가? (문항 시간 분석의 전제)
2. 교재 해설에 정답 일람표가 있는가? 출판사는 어디인가?
3. v0.2 전에: 합격시대 결과 페이지의 표를 복사해 메모장에 붙여 넣고 .txt로 저장해 줄 수 있는가? (파서 픽스처)
4. 알라딘 뷰어는 PC 앱인가, 웹인가? 툴에 포커스가 있을 때 휠로 쪽이 넘어가는가?
5. 실전 규칙 중 아는 것: 영역 사이 쉬는 시간 길이, 끝난 영역 복귀, 오답 감점, 계산기 키보드 입력. 확인되면 프로필 값만 고친다.

---

## 17. v0.2 변경 (2026-10-09, 사용자 확인 반영)

합격시대 결과 페이지는 복사가 막혀 있고, 2회부터는 유형별 분석표가 없다. 채점표에는 문항별 내 답·정답·O/X가 나오지만 유형 이름은 없다. 그래서 §12(붙여넣기 가져오기)를 아래로 바꾼다. §13의 분석 원리는 그대로 쓴다.

1. **외부 모의 채점 입력.** `external_done` 세션에서 '채점 입력'을 열어 내 답 숫자열과 정답 숫자열(각 75자, `parseKey` 규칙)을 넣는다. 저장하면 세트(이름 = 세션 label, 레이아웃 = 프로필 전체 배치, key = 정답)를 만들어 `setId`로 연결하고, 내 답은 `Session.externalAnswers?: (number|null)[]`에 저장한 뒤 상태를 `graded`로 바꾼다. 이런 세션의 문항 뷰는 이벤트 대신 `externalAnswers`를 답으로 쓰고, 문항 시간은 null, 시간 내 답 = 답으로 본다(시간 정보는 영역 사용 시간만). `schemaVersion`은 1을 유지한다.
2. **1회 기록 시드.** 부록 A의 42행을 번들 상수로 두고, 첫 부팅 때 한 번 `ImportRecord`(id `seed-passsidae-dcat-r1`, status `confirmed`, 위치 기반 영역 매핑, overtime true)로 넣는다. 지워도 다시 넣지 않도록 `settings.seeded = true`를 남긴다.
3. **유형 분류 체계 시드.** 1회 행에서 §12.2 규칙으로 DCAT 가족 13개와 세부를 만들어 `taxonomy`에 넣는다. 사용자가 새 가족 이름을 추가할 수 있다.
4. **DCAT 모의 기본 틀.** 1회 행 순서로 "문항 위치 → 가족·세부" 범위 목록을 만들어 kv `template:dcat`에 둔다. DCAT 전체 모의 세트(e-book·외부 모의 채점 세트 모두)를 처음 만들 때 이 틀을 `ranges`로 복사한다. 결과 화면의 '기본 틀로 저장'은 현재 세트의 `ranges`를 템플릿으로 덮어쓴다. LG는 틀이 없다(직접 칠함).
5. **유형 칠하기.** 결과 화면에서 가족 칩(세부는 선택)을 고르고 문항 행을 클릭·드래그해 범위를 칠한다. 범위는 세트의 `ranges`에 저장되고 그 세트의 모든 세션 분석에 소급 적용된다. 칠하지 않은 문항은 '미분류'다.
6. **분석 화면(§13.2~13.5 그대로).** 셀 = 채점된 세션(세트 범위로 유형을 붙인 문항) + 가져온 기록 행. 필터: 프로필, 첫 풀이만(판정 기본 켬). 회차 표, 영역 표, 가족 표(w, x/n, p̃(k=4), 중앙값 초·시간 데이터 n, 기대 오답, 판정), SVG 산점도 1개, 판정 카드 4종. 외부 모의 채점 세션의 조건은 `external`(시간 데이터 없음), 1회 시드는 `external-overtime`.
7. **v0.2에서 뺀 것:** 결과표 붙여넣기·HTML 파서, 오답 이유 태깅, 병합 복원, 그림판 획 저장.

---

## 18. v0.3 ShareX 캡처 연결 (2026-10-09, 사용자 제안·확인)

- 사용 규칙: e-book 문항을 **처음 펼칠 때 ShareX로 한 번 캡처**한다. 파일 이름에 `%y-%mo-%d_%h-%mi-%s`(예: `AladinEbook_2026-10-09_14-32-05.png`)가 들어간다. 알라딘 e-book 캡처는 가능함을 사용자가 확인했다.
- 설정의 '캡처 폴더'로 ShareX 저장 폴더를 지정한다(`showDirectoryPicker`, 핸들은 kv `captureDir`에 저장, 쓸 때마다 권한 확인·재요청). file://에서 API가 없으면 `<input type="file" multiple accept="image/*">`로 파일을 고르는 대안을 쓴다.
- 결과 화면 '캡처 연결': 파일 이름의 `(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})`를 로컬 시각으로 읽어, 세션 시작 5초 전~종료 5초 후의 이미지를 시각순으로 고른다. 각 이미지를 시각이 속한 영역(영역 시작~종료 구간)에 넣고, 영역 안에서는 순서대로 그 영역 문항에 짝짓는다. 장수와 문항 수가 다르면 미리보기에서 영역별로 '한 칸 밀기/당기기'로 맞춘 뒤 저장한다.
- 저장: `Session.captures?: { q: number; t: number; file: string }[]`(파일 이름만, 이미지는 복사하지 않음). 스키마 버전 1 유지.
- 시간: 캡처가 있는 문항의 시간 = 다음 캡처(또는 영역 종료)까지 − 그 사이 정지. 캡처가 없는 문항은 기존 랩. 분석의 시간 지표도 이 값을 쓴다.
- 문항 표에 '보기' 버튼: 폴더 핸들로 파일을 읽어 큰 이미지로 보인다(없으면 '파일 없음').
