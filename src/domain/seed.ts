// DCAT 1회 결과표 시드. spec §12.2, §17, 부록 A가 원천이다.
import { SCHEMA_VERSION, type ImportRecord, type Taxonomy } from './types';

type SeedRow = { path: string; correct: number; total: number };

export const PASSSIDAE_DCAT_R1: {
  header: { round: number; date: string; rank: number; takers: number; usedMin: number; limitMin: number; score: number; scoreMax: number; correct: number; total: number };
  rows: readonly SeedRow[];
} = {
  header: { round: 1, date: '2026-10-08', rank: 40, takers: 101, usedMin: 83, limitMin: 65, score: 61.2, scoreMax: 100, correct: 46, total: 75 },
  rows: [
    ['11. 추리 - 명제추리 - 참/거짓', 2, 2], ['11. 추리 - 명제추리 - 삼단논법', 2, 2], ['11. 추리 - 명제추리 - 명제', 1, 2],
    ['1. 의사소통능력(언어) - 단문독해 - 내용일치', 2, 2], ['1. 의사소통능력(언어) - 단문독해 - 주제/제목찾기', 1, 2], ['1. 의사소통능력(언어) - 단문독해 - 추론하기', 2, 2],
    ['1. 의사소통능력(언어) - 글의구조 - 배열하기', 2, 2], ['1. 의사소통능력(언어) - 글의구조 - 문장삽입', 1, 2], ['1. 의사소통능력(언어) - 글의구조 - 빈칸추론', 2, 2], ['1. 의사소통능력(언어) - 글의구조 - 개요수정', 0, 1], ['1. 의사소통능력(언어) - 글의구조 - 도식화하기', 0, 1],
    ['1. 의사소통능력(언어) - 어휘어법 - 동의어/유의어', 1, 1], ['1. 의사소통능력(언어) - 어휘어법 - 동음이의어/다의어', 1, 1], ['1. 의사소통능력(언어) - 어휘어법 - 반의어', 2, 2], ['1. 의사소통능력(언어) - 어휘어법 - 어휘선택', 1, 2], ['1. 의사소통능력(언어) - 어휘어법 - 맞춤법', 1, 2], ['1. 의사소통능력(언어) - 어휘어법 - 관용적표현', 2, 2], ['11. 추리 - 어휘추리 - 어휘유추', 2, 2], ['1. 의사소통능력(언어) - 어휘어법 - 표준어', 1, 2], ['1. 의사소통능력(언어) - 어휘어법 - 관계유추', 1, 1],
    ['2. 수리능력 - 수열', 2, 2], ['2. 수리능력 - 응용수리 - 거리/시간/속력', 2, 3], ['2. 수리능력 - 응용수리 - 경우의 수/확률', 1, 2], ['2. 수리능력 - 응용수리 - 인원/개수', 1, 2], ['2. 수리능력 - 자료해석(그래프) - 자료계산(그래프)', 2, 2], ['2. 수리능력 - 자료해석(그래프) - 자료변환(그래프)', 0, 2], ['2. 수리능력 - 자료해석(그래프) - 추론/분석(그래프)', 2, 2], ['2. 수리능력 - 자료해석(표) - 자료계산(표)', 1, 2], ['2. 수리능력 - 자료해석(표) - 추론/분석(표)', 0, 2], ['11. 추리 - 수/문자추리 - 알고리즘형', 0, 1],
    ['12. 공간지각 - 입체도형 - [단면도]-[3×3×3큐브] (두산)', 2, 2], ['12. 공간지각 - 전개도 - [전개도활용]-[절반의 물] (두산)', 0, 2], ['12. 공간지각 - 평면도형 - 평면도형 활용', 0, 2], ['12. 공간지각 - 전개도 - [전개도활용]-[전개도 회전] (두산)', 0, 2], ['12. 공간지각 - 전개도 - [전개도활용]-[결합모양] (HMAT, 두산)', 0, 2],
    ['11. 추리 - 도형추리 - 도형의 규칙(9개의 칸) (GSAT 3급, 포스코, 샘표, SK생산)', 2, 2], ['12. 공간지각 - 평면도형 - 회전/대칭/비교', 0, 1], ['12. 공간지각 - 평면도형 - 평면도형 비교(같은 모양) (삼성 4,5급, SK생산)', 1, 1], ['11. 추리 - 도형추리 - 도형의 변화(일정한 규칙(과정형)) (LG)', 2, 2], ['11. 추리 - 도형추리 - 도형의 규칙(6개의 칸(패턴)) (LG)', 1, 1], ['11. 추리 - 도형추리 - 도형의 규칙(6개의 칸(비패턴)) (LG)', 0, 1], ['11. 추리 - 도형추리 - 도형의 규칙(4분원, 반원) (LG)', 0, 2],
  ].map(([path, correct, total]) => ({ path: path as string, correct: correct as number, total: total as number })),
};

function normalized(path: string): string {
  return path.normalize('NFKC').replace(/[‐–—−]/g, '-').replace(/\s+/g, ' ').trim();
}

function outsideParts(path: string): string[] {
  const parts: string[] = [];
  let current = '';
  let parens = 0;
  let brackets = 0;
  for (const char of path) {
    if (char === '(') parens += 1;
    else if (char === ')' && parens > 0) parens -= 1;
    else if (char === '[') brackets += 1;
    else if (char === ']' && brackets > 0) brackets -= 1;
    if (char === '-' && parens === 0 && brackets === 0) {
      parts.push(current.trim());
      current = '';
    } else current += char;
  }
  parts.push(current.trim());
  return parts.filter(Boolean);
}

function withoutTrailingParenthetical(value: string): string {
  let start = -1;
  let depth = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === '(') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (value[i] === ')' && depth > 0) {
      depth -= 1;
      if (depth === 0 && value.slice(i + 1).trim() === '') return value.slice(0, start).trim();
    }
  }
  return value.trim();
}

/** §12.2의 한 행 파서. category 상속은 이 순수 함수 밖의 순차 builder가 한다. */
export function splitPath(path: string): { category?: string; family: string; leaf: string } {
  const parts = outsideParts(normalized(path));
  const category = /^\d+\./.test(parts[0] ?? '') ? parts.shift() : undefined;
  const rawFamily = parts.shift() ?? '';
  const family = withoutTrailingParenthetical(rawFamily);
  return { ...(category ? { category } : {}), family, leaf: parts.join('-') };
}

function seededRows() {
  let inheritedCategory: string | undefined;
  return PASSSIDAE_DCAT_R1.rows.map(row => {
    const parsed = splitPath(row.path);
    if (parsed.category) inheritedCategory = parsed.category;
    return { ...row, ...parsed, category: parsed.category ?? inheritedCategory };
  });
}

const SECTION_BOUNDARIES: readonly [number, string][] = [[20, 'verbal-logic'], [35, 'verbal-expression'], [55, 'numerical'], [65, 'spatial'], [75, 'figure']];

function sectionFor(qFrom: number, qTo: number): string | null {
  return SECTION_BOUNDARIES.find(([end]) => qFrom >= 0 && qTo < end)?.[1] ?? null;
}

export function buildSeedTaxonomy(): Taxonomy {
  const rows = seededRows();
  const familyOrder = [...new Set(rows.map(row => row.family))];
  const sectionHints = new Map<string, Set<string>>();
  let q = 0;
  for (const row of rows) {
    const sectionId = sectionFor(q, q + row.total - 1);
    if (sectionId) (sectionHints.get(row.family) ?? sectionHints.set(row.family, new Set()).get(row.family)!).add(sectionId);
    q += row.total;
  }
  const leaves = rows.filter(row => row.leaf).map(row => ({ id: row.leaf, familyId: row.family, name: row.leaf }));
  return {
    profileId: 'dcat',
    families: familyOrder.map(id => ({ id, name: id, sectionHint: [...(sectionHints.get(id) ?? [])] })),
    leaves: leaves.filter((leaf, index) => leaves.findIndex(other => other.familyId === leaf.familyId && other.id === leaf.id) === index),
  };
}

export function buildSeedImport(now: number): ImportRecord {
  let q = 0;
  return {
    id: 'seed-passsidae-dcat-r1', source: 'passsidae', profileId: 'dcat', capturedAt: now,
    raw: { text: '' }, parserVersion: 1, header: { ...PASSSIDAE_DCAT_R1.header },
    rows: seededRows().map(row => {
      const qFrom = q;
      q += row.total;
      return { pathRaw: row.path, category: row.category, family: row.family, leaf: row.leaf,
        correct: row.correct, total: row.total, qFrom, qTo: q - 1,
        sectionId: sectionFor(qFrom, q - 1), mapped: 'position' as const };
    }),
    status: 'confirmed', overtime: true, schemaVersion: SCHEMA_VERSION,
  };
}

export function buildDcatTemplate(): { from: number; to: number; familyId: string; leafId?: string }[] {
  let q = 0;
  return seededRows().map(row => {
    const from = q;
    q += row.total;
    return { from, to: q - 1, familyId: row.family, ...(row.leaf ? { leafId: row.leaf } : {}) };
  });
}
