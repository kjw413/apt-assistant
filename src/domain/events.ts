// 세션 이벤트 로그를 재생하는 순수 도우미. 이벤트는 t 오름차순이다.
import type { Session } from './types';

export interface SectionBounds {
  start: number | null;
  end: number | null;
  auto: boolean;
}

export function lastEventT(s: Session): number {
  return s.events.length ? s.events[s.events.length - 1].t : s.createdAt;
}

export function sectionBounds(s: Session): SectionBounds[] {
  const bounds: SectionBounds[] = s.plan.map(() => ({ start: null, end: null, auto: false }));
  for (const e of s.events) {
    if (e.k === 'sectionStart') {
      bounds[e.s].start = e.t;
      bounds[e.s].auto = e.auto === true;
    } else if (e.k === 'sectionEnd') {
      bounds[e.s].end = e.t;
    }
  }
  return bounds;
}

export function endedCount(s: Session): number {
  let n = 0;
  for (const e of s.events) if (e.k === 'sectionEnd') n++;
  return n;
}

export function sectionOfQ(s: Session, q: number): number {
  return s.plan.findIndex(p => q >= p.qFrom && q <= p.qTo);
}

/** answer/clear를 t ≤ until까지 재생한 답 상태. */
export function currentAnswers(s: Session, until = Infinity): Map<number, number> {
  const m = new Map<number, number>();
  for (const e of s.events) {
    if (e.t > until) break;
    if (e.k === 'answer') m.set(e.q, e.c);
    else if (e.k === 'clear') m.delete(e.q);
  }
  return m;
}

/** 마지막 flag 이벤트 기준 ⚑ 상태. skip ⚑는 그 뒤 답 이벤트가 오면 해제된다. */
export function currentFlags(s: Session, until = Infinity): Map<number, 'guess' | 'skip'> {
  const m = new Map<number, 'guess' | 'skip'>();
  for (const e of s.events) {
    if (e.t > until) break;
    if (e.k === 'flag') {
      if (e.on) m.set(e.q, e.kind);
      else m.delete(e.q);
    } else if (e.k === 'answer' && m.get(e.q) === 'skip') {
      m.delete(e.q);
    }
  }
  return m;
}
