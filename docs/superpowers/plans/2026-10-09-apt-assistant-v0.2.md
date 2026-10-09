# APT Assistant v0.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **실행 방식(사용자 결정):** 각 작업 패키지를 Codex `gpt-6.1-sol`이 `codex exec --sandbox workspace-write`로 구현한다(TDD: 실패하는 테스트 먼저). brain(Claude)은 패키지마다 `npx tsc --noEmit`, `npx vitest run`, `npm run build`, `npx playwright test`로 검증하고 커밋한다.

**Goal:** 외부 모의 채점 입력, 1회 기록·유형 체계·DCAT 기본 틀 시드, 유형 칠하기, 누적 분석 화면을 추가한다.

**Architecture:** v0.1 구조(순수 domain ← Zustand store ← Dexie repo, 늦은 결합) 위에 `domain/seed.ts`(1회 데이터·유형 추출·기본 틀), `domain/analytics.ts`(셀·지표·판정)를 더하고, store 동작과 UI 화면 3개(외부 채점 입력, 유형 칠하기, 분석)를 붙인다. 스키마 버전은 1을 유지하고 선택 필드만 더한다.

**Tech Stack:** v0.1과 같음(React 19, TS strict, Vite 8, Zustand 5, Dexie 4, Vitest 5, Playwright). 차트 라이브러리 없음(SVG 직접).

**Spec:** [docs/superpowers/specs/2026-10-08-apt-assistant-design.md](../specs/2026-10-08-apt-assistant-design.md) §13, §17(우선), 부록 A.

## Global Constraints

- v0.1의 Global Constraints 전부 유지(단일 파일, file://, 한국어 UI, 버튼 포커스 차단, `window.confirm` 금지, 모르는 필드 보존).
- `schemaVersion` 1 유지. 타입에는 선택 필드만 추가: `Session.externalAnswers?`, `Settings.seeded?`.
- 수축 강도 k = 4, 판정 임계값은 spec §13.5 값을 상수로 둔다.
- 기존 테스트(단위 185, E2E 12)는 계속 통과해야 한다.

## Review Focus

1. 외부 채점 입력에서 내 답 숫자열 길이가 75가 아니거나 원문자·전각이 섞인다 → `parseKey` 규칙으로 읽고 길이 불일치를 알리며 저장은 막는다. (P2 store 테스트, P3 E2E)
2. 유형을 칠한 뒤 같은 세트의 정답을 고친다 → 분석 셀이 바로 바뀐다(늦은 결합). (P1 analytics 테스트)
3. 1회 시드 기록을 지운 뒤 재부팅한다 → 다시 생기지 않는다. (P2 store 테스트)
4. 칠하지 않은 문항이 섞인 세트 → '미분류' 가족으로 집계되고 판정에서 빠진다. (P1 analytics 테스트)
5. 외부 모의(시간 데이터 없음)만 있을 때 '속도 훈련'·'뒤로' 판정 → 시간 데이터 n 조건 때문에 나오지 않는다. (P1 analytics 테스트)

---

### P1: domain — 시드와 분석 (`seed.ts`, `analytics.ts` + 테스트)

**Files:** Create `src/domain/seed.ts`, `src/domain/seed.test.ts`, `src/domain/analytics.ts`, `src/domain/analytics.test.ts`; Modify `src/domain/types.ts`(선택 필드 2개).

**Produces:**
- `PASSSIDAE_DCAT_R1: { header; rows: { path: string; correct: number; total: number }[] }` — spec 부록 A의 42행(표 순서), 헤더 1회차·2026-10-08·40/101·83/65분·61.2/100·46/75.
- `splitPath(path): { category?: string; family: string; leaf: string }` — spec §12.2(괄호·대괄호 밖 `-`만 분리, 접두 `^\d+\.` 대분류, 접두 없는 행은 앞 행 대분류 상속, 가족 = 첫 조각에서 끝 괄호 제거, 세부 = 나머지).
- `buildSeedTaxonomy(): Taxonomy`(profileId `dcat`, 가족 13개: 명제추리, 단문독해, 글의구조, 어휘어법, 어휘추리, 수열, 응용수리, 자료해석, 수/문자추리, 입체도형, 전개도, 평면도형, 도형추리; 가족 id는 이름 그대로).
- `buildSeedImport(now): ImportRecord`(id `seed-passsidae-dcat-r1`, 행마다 qFrom/qTo 누적, sectionId 위치 매핑, mapped `position`, status `confirmed`, overtime true).
- `buildDcatTemplate(): { from: number; to: number; familyId: string; leafId?: string }[]`(행 순서대로 0~74 범위, leafId = 세부 이름).
- analytics: `type Cell`(spec §6.3), `toCells(data: AllData): Cell[]`, `aggregate(cells, by: 'section' | 'family', filter: { profileId: string; firstOnly: boolean })`, `shrink(correct, n, prior, k = 4)`, `familyRows(...)`(w, x/n, p̃, medianSec, timedN, expectedWrong, verdict), `verdicts(...)`.
  - 세션 셀: status `graded`이고 세트가 있는 세션. 문항 유형 = 세트 ranges(없으면 `defaultFamilyId`, 그것도 없으면 `'미분류'`). 조건: scope `full`/`section`/`drill`, 외부 채점 세션은 `external`. firstAttempt = attempt === 1.
  - 가져오기 셀: ImportRecord 행(조건 overtime ? `external-overtime` : `external`, 시간 null, answered null).
  - 비중 w: 가족의 실전 1회 문항 비율 = 가져온 모의/전체 모의 세트의 가족 문항 수 평균 ÷ 실전 문항 수(DCAT 75). 없으면 영역 비중 ÷ 영역 안 가족 수.

**Tests (반드시 포함):**
- 시드: 42행, Σ 46/75, 영역 합계 15/20 · 12/15 · 11/20 · 2/10 · 6/10, 가족 13개와 가족 합계(명제추리 5/6, 단문독해 5/6, 글의구조 5/8, 어휘어법 10/13, 어휘추리 2/2, 수열 2/2, 응용수리 4/7, 자료해석 5/10, 수/문자추리 0/1, 입체도형 2/2, 전개도 0/6, 평면도형 1/4, 도형추리 5/8), 기본 틀이 0~74를 빈틈없이 덮음.
- `splitPath('12. 공간지각 - 입체도형 - [단면도]-[3×3×3큐브] (두산)')` → family `입체도형`, leaf `[단면도]-[3×3×3큐브] (두산)`; `'2. 수리능력 - 자료해석(그래프) - 자료계산(그래프)'` → family `자료해석`.
- 1회 시드만 넣었을 때(k=4): 전개도 p̃ ≈ 0.08, 기대 오답 ≈ 5.52; 자료해석 p̃ ≈ 0.514, 기대 오답 ≈ 4.86; 응용수리 p̃ ≈ 0.564; 기대 오답 합 ≈ 29.66(±0.05).
- 판정: 시간 데이터가 없으면 '속도 훈련'·'뒤로'가 나오지 않음; 공부 Top3 = 전개도, 자료해석, 도형추리(1회만, n ≥ 3 조건).
- 늦은 결합: 같은 세트의 key를 바꾸면 toCells 결과의 정답 수가 바뀜. 칠하지 않은 문항은 `'미분류'`로 집계되고 verdicts에서 제외.

### P2: data·store — 저장과 동작

**Files:** Modify `src/data/repo.ts`, `src/state/store.ts`, `src/domain/derive.ts`(외부 답), 테스트 `src/data/repo.test.ts`, `src/state/store.test.ts`.

- repo: `saveImport`, `saveTaxonomy`, `saveTemplate(profileId, ranges)`(kv `template:<id>`), `loadAll`이 `templates: Record<string, Range[]>`를 함께 반환, `deleteImport(id)`.
- derive: `mode === 'external'`이고 `externalAnswers`가 있으면 답 = 그 배열, 시간 null, 시간 내 답 = 답.
- store 동작: `gradeExternal(sessionId, answersText, keyText)`(둘 다 parseKey; 길이 불일치·오류면 `{ok:false, reason}`; 성공 시 세트 생성(레이아웃 = 프로필 전체, ranges = DCAT면 템플릿 복사), 세션에 setId·externalAnswers·status graded, 백업 다운로드 규칙은 completeGrading과 같음, 화면 result), `saveRanges(setId, ranges)`, `saveTemplateFromSet(setId)`, `addFamily(profileId, name)`, `deleteImport(id)`. 부팅 시 `settings.seeded`가 없으면 시드 import·taxonomy·template를 넣고 `seeded = true`. 새 DCAT 전체 모의 세트를 만들 때 템플릿을 ranges로 복사.
- 테스트: 시드는 한 번만(삭제 후 재부팅해도 다시 안 생김), gradeExternal 성공·길이 불일치 거부, ranges 저장 후 다시 부팅해도 유지, 템플릿 복사.

### P3: UI — 외부 채점 입력과 유형 칠하기

**Files:** Create `src/ui/screens/ExternalKeyEntry.tsx`, `src/ui/screens/TypeTagger.tsx`; Modify `ExternalSummary.tsx`(버튼 '채점 입력'), `Result.tsx`(TypeTagger 포함), `App.tsx`(라우트 `externalKey`), `e2e/v02.spec.ts`(새 파일).

- ExternalKeyEntry: textarea `내 답`, `정답`, 문항별 미리보기(번호·내 답·정답·○×), 오류·길이 표시, 버튼 `채점 저장`.
- TypeTagger(결과 화면 아래): 가족 칩 목록(+ `새 유형` 입력), 세부는 선택 목록; 문항 행을 클릭/드래그해 선택한 가족으로 칠함(행에 가족 이름 표시, `data-testid="tag-row-{q}"`); 버튼 `기본 틀로 저장`(DCAT만), `기본 틀 적용`.
- E2E: 외부 모의(DCAT, 연습) 시작 → 5영역 종료 → '채점 입력' → 내 답 75자·정답 75자 입력 → 결과에 점수 표시 → 유형 행 0이 `명제추리`로 미리 칠해져 있음 → 행 0~1을 다른 가족으로 칠하고 새로고침해도 유지.

### P4: UI — 분석 화면

**Files:** Create `src/ui/screens/Analysis.tsx`, `src/ui/screens/analysis.module.css`; Modify `Home.tsx`(버튼 `분석`), `App.tsx`(라우트 `analysis`), `e2e/v02.spec.ts`(테스트 추가).

- spec §13.4: 필터(프로필, 첫 풀이만), 회차 표, 영역 표(CSS 막대), 가족 표(행 클릭 시 세부 펼침), SVG 산점도(`data-testid="scatter"`, x = 시간 비율, y = p̃, 기준선 y=0.2·x=1.0, 시간 데이터가 없으면 '시간 데이터 없음' 표시), 판정 카드(`data-testid="verdict-study"` 등 4종). x/n 항상 표시, n<5는 회색.
- E2E: 첫 부팅 → 홈 '분석' → 가족 표 첫 행이 `전개도`, 공부 카드에 전개도·자료해석·도형추리.

### P5: 리뷰와 릴리스

- Codex 읽기 전용 전체 리뷰 → Important 이상만 한 번의 수정 패스(테스트 먼저) → `npm run release`.
