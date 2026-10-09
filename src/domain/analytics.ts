// 저장하지 않는 분석 셀과 가족 지표. 세트의 정답·유형을 조회 시점에 결합한다(spec §13, §17).
import { questionViews } from './derive';
import { sectionBounds } from './events';
import { effectiveProfile } from './profiles';
import type { AllData, SessionScope } from './types';

export const SHRINK_K = 4;
export const VERDICT_THRESHOLDS = {
  studyMinN: 3, studyTop: 3, timedMinN: 4, speedRatio: 1.3,
  deferScoreRatio: 0.6, guessMargin: 0.1,
} as const;
export const UNCLASSIFIED = '미분류';

export type Condition = SessionScope | 'external' | 'external-overtime';
export interface AnalysisFilter { profileId: string; firstOnly: boolean }

/** 시간 표본을 보존해야 여러 셀의 중앙값을 정확히 구할 수 있다. */
export interface Cell {
  recordId: string;
  source: 'tool' | 'import';
  setId?: string;
  profileId: string;
  sectionId: string | null;
  familyId: string;
  leafId?: string;
  condition: Condition;
  firstAttempt: boolean;
  n: number; // 정답을 아는 문항 수
  correct: number;
  answered: number | null;
  inLimitCorrect: number | null;
  guessedCorrect: number | null;
  timeSec: number | null;
  timedN: number;
  times: number[];
  questionN: number; // 정답 유무와 독립된 유형 비중의 문항 수
  paceSec: number;
  sectionQuestions: number;
  examQuestions: number;
  choices: number;
  penaltyEnabled: boolean;
}

export interface AggregateRow {
  id: string | null;
  n: number;
  correct: number;
  p: number | null;
  answered: number | null;
  answeredN: number;
  inLimitCorrect: number | null;
  inLimitN: number;
  guessedCorrect: number | null;
  guessedN: number;
  timeSec: number | null;
  timedN: number;
  medianSec: number | null;
}

export type Verdict = '공부' | '속도 훈련' | '뒤로' | '찍기 후보';
export interface FamilyRow extends AggregateRow {
  familyId: string;
  w: number;
  prior: number;
  pTilde: number;
  paceSec: number;
  timeRatio: number | null;
  pointsPerMin: number | null;
  sectionPointsPerMin: number | null;
  expectedWrong: number;
  overtimePossible: boolean;
  guessRuleUnconfirmed: boolean;
  verdict: Verdict[];
}

export function toCells(data: AllData): Cell[] {
  const cells: Cell[] = [];
  const sets = new Map(data.sets.map(set => [set.id, set]));
  for (const session of data.sessions) {
    const set = session.setId === null ? undefined : sets.get(session.setId);
    if (session.status !== 'graded' || !set) continue;
    const profile = effectiveProfile(session.profileId, data.profiles);
    const external = session.mode === 'external';
    const bounds = sectionBounds(session);
    const grouped = new Map<string, Cell>();
    for (const view of questionViews(session, set)) {
      const plan = session.plan[view.sectionIdx];
      const section = profile.sections.find(s => s.id === plan.sectionId);
      const range = set.ranges.find(r => view.q >= r.from && view.q <= r.to);
      const familyId = range?.familyId ?? set.defaultFamilyId ?? UNCLASSIFIED;
      const leafId = range?.leafId;
      const groupKey = JSON.stringify([plan.sectionId, familyId, leafId]);
      let cell = grouped.get(groupKey);
      if (!cell) {
        cell = {
          recordId: session.id, source: 'tool', setId: set.id, profileId: session.profileId,
          sectionId: plan.sectionId, familyId, ...(leafId === undefined ? {} : { leafId }),
          condition: external ? 'external' : session.scope, firstAttempt: session.attempt === 1,
          n: 0, correct: 0, answered: 0, inLimitCorrect: external ? null : 0,
          guessedCorrect: external ? null : 0, timeSec: null, timedN: 0, times: [], questionN: 0,
          paceSec: plan.paceSec, sectionQuestions: section?.questions ?? plan.qTo - plan.qFrom + 1,
          examQuestions: profile.sections.reduce((n, s) => n + s.questions, 0),
          choices: set.choices, penaltyEnabled: profile.penalty.enabled,
        };
        grouped.set(groupKey, cell);
      }
      cell.questionN++;
      // Whole-set frequency is independent of how far this attempt progressed.
      if (!external && bounds[view.sectionIdx].start === null) continue;
      // A valid lap remains useful even when the answer key is not known yet.
      if (!external && view.timeSec !== null) {
        cell.times.push(view.timeSec);
        cell.timeSec = (cell.timeSec ?? 0) + view.timeSec;
        cell.timedN++;
      }
      if (view.key === null) continue;
      const answer = external && session.externalAnswers
        ? session.externalAnswers[view.q] ?? null : view.answer;
      const correct = answer === view.key;
      cell.n++;
      cell.correct += Number(correct);
      cell.answered! += Number(answer !== null);
      if (!external) {
        cell.inLimitCorrect! += Number(view.inLimitCorrect === true);
        cell.guessedCorrect! += Number(view.flag === 'guess' && correct);
      }
    }
    cells.push(...grouped.values());
  }
  for (const record of data.imports) {
    if (record.status !== 'confirmed') continue;
    const profile = effectiveProfile(record.profileId, data.profiles);
    for (const row of record.rows ?? []) {
      const section = profile.sections.find(s => s.id === row.sectionId);
      cells.push({
        recordId: record.id, source: 'import', profileId: record.profileId,
        sectionId: row.sectionId, familyId: row.family, ...(row.leaf ? { leafId: row.leaf } : {}),
        condition: record.overtime ? 'external-overtime' : 'external', firstAttempt: true,
        n: row.total, correct: row.correct, answered: null, inLimitCorrect: null, guessedCorrect: null,
        timeSec: null, timedN: 0, times: [], questionN: row.total,
        paceSec: section ? section.seconds / section.questions : 0,
        sectionQuestions: section?.questions ?? 0,
        examQuestions: profile.sections.reduce((n, s) => n + s.questions, 0),
        choices: profile.choices, penaltyEnabled: profile.penalty.enabled,
      });
    }
  }
  return cells;
}

function filtered(cells: Cell[], filter: AnalysisFilter): Cell[] {
  return cells.filter(c => c.profileId === filter.profileId && (!filter.firstOnly || c.firstAttempt));
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function groupCells(cells: Cell[], by: 'section' | 'family'): Map<string | null, Cell[]> {
  const groups = new Map<string | null, Cell[]>();
  for (const cell of cells) {
    const id = by === 'section' ? cell.sectionId : cell.familyId;
    const group = groups.get(id) ?? [];
    group.push(cell);
    groups.set(id, group);
  }
  return groups;
}

function summary(id: string | null, cells: Cell[]): AggregateRow {
  const sum = (key: 'n' | 'correct' | 'timedN') => cells.reduce((n, c) => n + c[key], 0);
  const knownSum = (key: 'answered' | 'inLimitCorrect' | 'guessedCorrect' | 'timeSec') => {
    const known = cells.filter(c => c[key] !== null);
    return known.length ? known.reduce((n, c) => n + c[key]!, 0) : null;
  };
  const knownN = (key: 'answered' | 'inLimitCorrect' | 'guessedCorrect') =>
    cells.reduce((n, c) => n + (c[key] !== null ? c.n : 0), 0);
  const n = sum('n');
  return {
    id, n, correct: sum('correct'), p: n ? sum('correct') / n : null,
    answered: knownSum('answered'), answeredN: knownN('answered'),
    inLimitCorrect: knownSum('inLimitCorrect'), inLimitN: knownN('inLimitCorrect'),
    guessedCorrect: knownSum('guessedCorrect'), guessedN: knownN('guessedCorrect'),
    timeSec: knownSum('timeSec'), timedN: sum('timedN'), medianSec: median(cells.flatMap(c => c.times)),
  };
}

export function aggregate(cells: Cell[], by: 'section' | 'family', filter: AnalysisFilter): AggregateRow[] {
  return [...groupCells(filtered(cells, filter), by)].map(([id, group]) => summary(id, group));
}

export function shrink(correct: number, n: number, prior: number, k = SHRINK_K): number {
  return n + k === 0 ? prior : (correct + k * prior) / (n + k);
}

/** 같은 전체 세트의 재풀이는 빈도 표본을 늘리지 않는다. 없는 가족은 그 모의에서 0문항이다. */
function familyWeights(cells: Cell[]): Map<string, number> {
  const mocks = new Map<string, Map<string, number>>();
  const seenSets = new Set<string>();
  const includedSessions = new Set<string>();
  for (const c of cells) {
    if (c.source === 'tool') {
      if (!c.setId || (c.condition !== 'full' && c.condition !== 'external')) continue;
      if (!includedSessions.has(c.recordId)) {
        if (seenSets.has(c.setId)) continue;
        seenSets.add(c.setId);
        includedSessions.add(c.recordId);
      }
    }
    const key = JSON.stringify([c.source, c.source === 'import' ? c.recordId : c.setId]);
    const counts = mocks.get(key) ?? new Map<string, number>();
    counts.set(c.familyId, (counts.get(c.familyId) ?? 0) + c.questionN);
    mocks.set(key, counts);
  }
  const weights = new Map<string, number>();
  const examQuestions = cells[0]?.examQuestions ?? 0;
  if (mocks.size && examQuestions > 0) {
    for (const counts of mocks.values()) {
      for (const [family, count] of counts) weights.set(family, (weights.get(family) ?? 0) + count / mocks.size / examQuestions);
    }
    return weights;
  }
  for (const sectionCells of groupCells(cells, 'section').values()) {
    const families = new Set(sectionCells.map(c => c.familyId));
    const sectionWeight = examQuestions ? sectionCells[0].sectionQuestions / examQuestions : 0;
    for (const family of families) weights.set(family, (weights.get(family) ?? 0) + sectionWeight / families.size);
  }
  return weights;
}

function metricRows(cells: Cell[]): FamilyRow[] {
  const sections = new Map([...groupCells(cells, 'section')].map(([id, group]) => [id, summary(id, group)]));
  const weights = familyWeights(cells);
  const rows: FamilyRow[] = [];
  for (const [id, group] of groupCells(cells, 'family')) {
    const base = summary(id, group);
    if (!base.n) continue;
    let prior = 0;
    let paceSec = 0;
    let sectionPointsPerMin = 0;
    let baselineAvailable = true;
    for (const c of group) {
      if (!c.n) continue;
      const section = sections.get(c.sectionId)!;
      const weight = c.n / base.n;
      prior += (section.p ?? 0) * weight;
      paceSec += c.paceSec * weight;
      if (section.medianSec !== null && section.medianSec > 0) {
        sectionPointsPerMin += (section.p ?? 0) / (section.medianSec / 60) * weight;
      } else baselineAvailable = false;
    }
    const pTilde = shrink(base.correct, base.n, prior);
    const w = weights.get(id!) ?? 0;
    rows.push({
      ...base, familyId: id!, w, prior, pTilde, paceSec,
      timeRatio: base.medianSec !== null && paceSec > 0 ? base.medianSec / paceSec : null,
      pointsPerMin: base.medianSec !== null && base.medianSec > 0 ? pTilde / (base.medianSec / 60) : null,
      sectionPointsPerMin: baselineAvailable ? sectionPointsPerMin : null,
      expectedWrong: w * group[0].examQuestions * (1 - pTilde),
      overtimePossible: group.some(c => c.condition === 'external-overtime'),
      guessRuleUnconfirmed: !group.some(c => c.penaltyEnabled), verdict: [],
    });
  }
  return rows.sort((a, b) => b.expectedWrong - a.expectedWrong || a.familyId.localeCompare(b.familyId, 'ko'));
}

export function familyRows(cells: Cell[], filter: AnalysisFilter): FamilyRow[] {
  const selected = filtered(cells, filter);
  const rows = metricRows(selected);
  const eligible = rows.filter(r => r.familyId !== UNCLASSIFIED);
  const study = new Set(eligible.filter(r => r.n >= VERDICT_THRESHOLDS.studyMinN)
    .slice(0, VERDICT_THRESHOLDS.studyTop).map(r => r.familyId));
  // 뒤로 판정의 정답률·시간·기준 영역도 모두 첫 풀이 시간제 데이터로 다시 계산한다.
  const timedFirst = metricRows(selected.filter(c => c.firstAttempt && (c.condition === 'full' || c.condition === 'section')));
  const defer = new Set(timedFirst.filter(r => r.timedN >= VERDICT_THRESHOLDS.timedMinN
    && r.pointsPerMin !== null && r.sectionPointsPerMin !== null
    && r.pointsPerMin < r.sectionPointsPerMin * VERDICT_THRESHOLDS.deferScoreRatio).map(r => r.familyId));
  for (const r of eligible) {
    if (study.has(r.familyId)) r.verdict.push('공부');
    if (r.timedN >= VERDICT_THRESHOLDS.timedMinN && r.pTilde >= r.prior
      && r.timeRatio !== null && r.timeRatio >= VERDICT_THRESHOLDS.speedRatio) r.verdict.push('속도 훈련');
    if (defer.has(r.familyId)) r.verdict.push('뒤로');
    const group = selected.filter(c => c.familyId === r.familyId);
    const choices = group[0].choices;
    if (r.guessRuleUnconfirmed && r.pTilde <= 1 / choices + VERDICT_THRESHOLDS.guessMargin) r.verdict.push('찍기 후보');
  }
  return rows;
}

export function verdicts(cells: Cell[], filter: AnalysisFilter): {
  study: FamilyRow[]; speed: FamilyRow[]; defer: FamilyRow[]; guess: FamilyRow[];
} {
  const rows = familyRows(cells, filter);
  return {
    study: rows.filter(r => r.verdict.includes('공부')),
    speed: rows.filter(r => r.verdict.includes('속도 훈련')),
    defer: rows.filter(r => r.verdict.includes('뒤로')),
    guess: rows.filter(r => r.verdict.includes('찍기 후보')),
  };
}
