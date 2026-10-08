// 시간 계산: 정지 구간 합집합, 마감, 단계, 페이스. 시간은 모두 이벤트 타임스탬프에서 나온다(spec §7.1).
import type { Session } from './types';
import { currentAnswers, endedCount, sectionBounds } from './events';

/** 영역 idx의 정지 구간(pause~resume, 열린 정지는 now까지, pauseRange)을 영역 안으로 자르고 합친다. */
export function pauseIntervals(s: Session, idx: number, now: number): [number, number][] {
  const b = sectionBounds(s)[idx];
  if (!b || b.start === null) return [];
  const start = b.start;
  const end = b.end ?? Infinity;
  const raw: [number, number][] = [];
  let open: number | null = null;
  for (const e of s.events) {
    if (e.k === 'pause') {
      if (open === null && e.t >= start && e.t < end) open = e.t;
    } else if (e.k === 'resume') {
      if (open !== null) {
        raw.push([open, e.t]);
        open = null;
      }
    } else if (e.k === 'pauseRange') {
      raw.push([e.from, e.to]);
    }
  }
  if (open !== null) raw.push([open, Math.min(now, end)]);

  const clipped = raw
    .map(([a, z]) => [Math.max(a, start), Math.min(z, end)] as [number, number])
    .filter(([a, z]) => z > a)
    .sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const iv of clipped) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else merged.push([iv[0], iv[1]]);
  }
  return merged;
}

/** 정지를 뺀 활동 시간이 제한에 처음 닿는 시각. 마감 뒤의 정지는 마감을 늦추지 않는다. */
export function deadlineOf(s: Session, idx: number, now: number): number {
  const b = sectionBounds(s)[idx];
  if (!b || b.start === null) throw new Error('영역이 시작되지 않았습니다');
  let remaining = s.plan[idx].limitSec * 1000;
  let cursor = b.start;
  for (const [a, z] of pauseIntervals(s, idx, now)) {
    if (a - cursor >= remaining) return cursor + remaining;
    remaining -= Math.max(0, a - cursor);
    cursor = Math.max(cursor, z);
  }
  return cursor + remaining;
}

/** 쉬는 시간 기준 시각 = max(이전 영역 종료(첫 영역은 세션 생성), 그 뒤 마지막 공백의 끝). */
export function breakBase(s: Session, idx: number): number {
  const bounds = sectionBounds(s);
  let base = idx === 0 ? s.createdAt : (bounds[idx - 1]?.end ?? s.createdAt);
  for (const e of s.events) if (e.k === 'gap' && e.to >= base) base = e.to;
  return base;
}

export function autoStartAt(s: Session, idx: number): number | undefined {
  if (s.policy !== 'hard' || !s.autoStart) return undefined;
  return breakBase(s, idx) + s.plan[idx].breakSec * 1000;
}

export function isPaused(s: Session, idx: number): boolean {
  const b = sectionBounds(s)[idx];
  if (!b || b.start === null || b.end !== null) return false;
  let paused = false;
  for (const e of s.events) {
    if (e.t < b.start) continue;
    if (e.k === 'pause') paused = true;
    else if (e.k === 'resume') paused = false;
  }
  return paused;
}

export interface Phase {
  idx: number;
  phase: 'break' | 'running' | 'paused' | 'done';
  remainingMs: number;
  overtimeMs: number;
  autoStartAt?: number;
}

export function phaseOf(s: Session, now: number): Phase {
  const idx = endedCount(s);
  if (s.status !== 'in_progress' || idx >= s.plan.length) {
    return { idx: Math.max(0, Math.min(idx, s.plan.length - 1)), phase: 'done', remainingMs: 0, overtimeMs: 0 };
  }
  const b = sectionBounds(s)[idx];
  if (b.start === null) {
    const at = autoStartAt(s, idx);
    const ph: Phase = { idx, phase: 'break', remainingMs: s.plan[idx].limitSec * 1000, overtimeMs: 0 };
    if (at !== undefined) ph.autoStartAt = at;
    return ph;
  }
  const deadline = deadlineOf(s, idx, now);
  return {
    idx,
    phase: isPaused(s, idx) ? 'paused' : 'running',
    remainingMs: Math.max(0, deadline - now),
    overtimeMs: Math.max(0, now - deadline),
  };
}

/** 진행 중 영역의 페이스: 기대 문항 = floor(활동 시간 / 문항당 페이스). */
export function pace(s: Session, now: number): { expected: number; answered: number; delta: number } {
  const ph = phaseOf(s, now);
  if (ph.phase !== 'running' && ph.phase !== 'paused') return { expected: 0, answered: 0, delta: 0 };
  const plan = s.plan[ph.idx];
  const start = sectionBounds(s)[ph.idx].start as number;
  const pausedMs = pauseIntervals(s, ph.idx, now).reduce((a, [x, z]) => a + Math.max(0, Math.min(z, now) - x), 0);
  const active = Math.max(0, now - start - pausedMs);
  const expected = Math.floor(active / (plan.paceSec * 1000));
  let answered = 0;
  for (const q of currentAnswers(s).keys()) if (q >= plan.qFrom && q <= plan.qTo) answered++;
  return { expected, answered, delta: answered - expected };
}
