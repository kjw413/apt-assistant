// 이벤트 로그에서 문항별 뷰(답·정오·시간 내 정오·랩)를 계산한다. 저장하지 않는 파생값이다(spec §6.3).
import type { ProblemSet, QuestionView, Session } from './types';
import { currentAnswers, currentFlags, lastEventT, sectionBounds } from './events';
import { deadlineOf, pauseIntervals } from './timer';

/** 영역 idx의 문항만, t ≤ until까지 재생한 답. */
export function answersAt(s: Session, idx: number, until: number): Map<number, number> {
  const p = s.plan[idx];
  const out = new Map<number, number>();
  for (const [q, c] of currentAnswers(s, until)) if (q >= p.qFrom && q <= p.qTo) out.set(q, c);
  return out;
}

function overlapMs(a: number, b: number, intervals: [number, number][]): number {
  let total = 0;
  for (const [x, z] of intervals) total += Math.max(0, Math.min(b, z) - Math.max(a, x));
  return total;
}

/** 문항 → 초(소수 1자리). 직전 이벤트(처음은 영역 시작)부터 답·해제·⚑까지의 간격에서 정지를 빼 그 문항에 더한다. */
export function laps(s: Session): Map<number, number | null> {
  const out = new Map<number, number | null>();
  const bounds = sectionBounds(s);
  const gaps: [number, number][] = [];
  for (const e of s.events) if (e.k === 'gap') gaps.push([e.from, e.to]);

  s.plan.forEach((p, idx) => {
    for (let q = p.qFrom; q <= p.qTo; q++) out.set(q, null);
    const b = bounds[idx];
    if (b.start === null) return;
    const end = b.end ?? lastEventT(s);
    const pauses = pauseIntervals(s, idx, end);
    const ms = new Map<number, number>();
    const poisoned = new Set<number>();
    let cursor = b.start;
    for (const e of s.events) {
      if (e.k !== 'answer' && e.k !== 'clear' && e.k !== 'flag') continue;
      if (e.q < p.qFrom || e.q > p.qTo || e.t < b.start || e.t > end) continue;
      if (overlapMs(cursor, e.t, gaps) > 0) poisoned.add(e.q);
      const active = e.t - cursor - overlapMs(cursor, e.t, pauses);
      ms.set(e.q, (ms.get(e.q) ?? 0) + Math.max(0, active));
      cursor = e.t;
    }
    for (const [q, v] of ms) out.set(q, poisoned.has(q) ? null : Math.round(v / 100) / 10);
  });
  return out;
}

export function flagsOf(s: Session): Map<number, 'guess' | 'skip'> {
  return currentFlags(s);
}

/** 문항별 최종 답 시각(해제되면 null)과 답 이벤트 수. */
function answerStats(s: Session): Map<number, { at: number | null; count: number }> {
  const m = new Map<number, { at: number | null; count: number }>();
  for (const e of s.events) {
    if (e.k === 'answer') {
      m.set(e.q, { at: e.t, count: (m.get(e.q)?.count ?? 0) + 1 });
    } else if (e.k === 'clear') {
      const prev = m.get(e.q);
      if (prev) m.set(e.q, { at: null, count: prev.count });
    }
  }
  return m;
}

function displayNo(set: ProblemSet, s: Session, q: number, idx: number): string {
  const { startNo, mode } = set.numbering;
  return String(mode === 'perSection' ? startNo + (q - s.plan[idx].qFrom) : startNo + q);
}

export function questionViews(s: Session, set: ProblemSet): QuestionView[] {
  const externalAnswers = s.mode === 'external' && s.externalAnswers !== undefined ? s.externalAnswers : null;
  const bounds = sectionBounds(s);
  const answers = currentAnswers(s);
  const flags = currentFlags(s);
  const lapMap = laps(s);
  const stats = answerStats(s);
  const views: QuestionView[] = [];

  s.plan.forEach((p, idx) => {
    const b = bounds[idx];
    const started = b.start !== null;
    const deadline = started ? deadlineOf(s, idx, b.end ?? lastEventT(s)) : null;
    const inLimit = deadline !== null ? currentAnswers(s, deadline) : new Map<number, number>();
    for (let q = p.qFrom; q <= p.qTo; q++) {
      const answer = externalAnswers ? (externalAnswers[q] ?? null) : (started ? (answers.get(q) ?? null) : null);
      const rec = stats.get(q);
      const answeredAt = externalAnswers ? null : (answer !== null ? (rec?.at ?? null) : null);
      const inLimitAnswer = externalAnswers ? answer : (started ? (inLimit.get(q) ?? null) : null);
      const key = set.key ? (set.key[q] ?? null) : null;
      const graded = set.key !== null && key !== null;
      views.push({
        q,
        no: displayNo(set, s, q, idx),
        sectionIdx: idx,
        answer,
        answeredAt,
        changes: externalAnswers ? 0 : Math.max(0, (rec?.count ?? 0) - 1),
        inLimitAnswer,
        overtime: externalAnswers ? false : answeredAt !== null && deadline !== null && answeredAt > deadline,
        flag: flags.get(q) ?? null,
        key,
        correct: graded ? answer === key : null,
        inLimitCorrect: graded ? inLimitAnswer === key : null,
        timeSec: externalAnswers ? null : lapMap.get(q) ?? null,
      });
    }
  });
  return views;
}
