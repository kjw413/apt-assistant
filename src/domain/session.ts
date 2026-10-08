// 이벤트 로그 리듀서: 세션 생성, 따라잡기(advance), 사용자 동작(reduce), 공백 처리. spec §7.
import {
  APP_VERSION, SCHEMA_VERSION,
  type Ev, type SectionPlan, type Session, type SessionMode, type SessionPolicy, type SessionScope,
} from './types';
import { currentAnswers, currentFlags, endedCount, lastEventT, sectionBounds, sectionOfQ } from './events';
import { autoStartAt, deadlineOf, isPaused } from './timer';

export type SessionAction =
  | { type: 'answer'; q: number; c: number }
  | { type: 'clear'; q: number }
  | { type: 'flag'; q: number; on: boolean }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'endSection' }
  | { type: 'startSection' }
  | { type: 'finish' }
  | { type: 'abandon' };

export type Notice = 'locked' | 'paused' | 'ignored';

export const GAP_THRESHOLD_MS = 120_000;

export function createSession(p: {
  id: string; profileId: string; setId: string | null; label?: string;
  scope: SessionScope; mode: SessionMode; policy: SessionPolicy; autoStart: boolean;
  attempt: number; plan: SectionPlan[]; now: number;
}): Session {
  const s: Session = {
    id: p.id, profileId: p.profileId, setId: p.setId,
    scope: p.scope, mode: p.mode, policy: p.policy, autoStart: p.autoStart, attempt: p.attempt,
    plan: p.plan, events: [], status: 'in_progress', createdAt: p.now,
    appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION,
  };
  if (p.label !== undefined) s.label = p.label;
  return s;
}

function push(s: Session, ev: Ev): Session {
  return { ...s, events: [...s.events, ev] };
}

function finalize(s: Session, t: number): Session {
  const x = push(s, { t, k: 'finish' });
  return { ...x, status: s.mode === 'external' ? 'external_done' : 'awaiting_key', finishedAt: t };
}

/** 마감·자동 시작·종료를 now까지 따라잡는다. 바뀐 게 없으면 같은 객체를 돌려준다. */
export function advance(s: Session, now: number, opts: { autoStart?: boolean } = {}): Session {
  let x = s;
  for (let guard = 0; guard <= x.plan.length * 2 + 2; guard++) {
    if (x.status !== 'in_progress') return x;
    const idx = endedCount(x);
    if (idx >= x.plan.length) return finalize(x, lastEventT(x));
    const b = sectionBounds(x)[idx];
    if (b.start === null) {
      const at = opts.autoStart === false ? undefined : autoStartAt(x, idx);
      if (at !== undefined && now >= at) {
        x = push(x, { t: Math.max(at, lastEventT(x)), k: 'sectionStart', s: idx, auto: true });
        continue;
      }
      return x;
    }
    if (x.policy === 'hard') {
      const deadline = deadlineOf(x, idx, now);
      if (now >= deadline) {
        x = push(x, { t: Math.max(deadline, lastEventT(x)), k: 'sectionEnd', s: idx, reason: 'deadline' });
        continue;
      }
    }
    return x;
  }
  return x;
}

export function reduce(
  s0: Session,
  a: SessionAction,
  now0: number,
): { session: Session; notice?: Notice } {
  const s = advance(s0, now0);
  const now = Math.max(now0, lastEventT(s));
  const same = (notice?: Notice) => (notice ? { session: s, notice } : { session: s });
  if (s.status !== 'in_progress') return same('ignored');

  const idx = endedCount(s);
  const b = idx < s.plan.length ? sectionBounds(s)[idx] : null;
  const running = b !== null && b.start !== null && b.end === null;
  const paused = running && isPaused(s, idx);

  switch (a.type) {
    case 'answer':
    case 'clear':
    case 'flag': {
      if (!running) return same('locked');
      if (paused) return same('paused');
      if (sectionOfQ(s, a.q) !== idx) return same('ignored');
      const answers = currentAnswers(s);
      if (a.type === 'answer') {
        const choices = s.plan[idx].choices;
        if (!Number.isInteger(a.c) || a.c < 1 || a.c > choices) return same('ignored');
        if (answers.get(a.q) === a.c) return same();
        return { session: push(s, { t: now, k: 'answer', q: a.q, c: a.c }) };
      }
      if (a.type === 'clear') {
        if (!answers.has(a.q)) return same();
        return { session: push(s, { t: now, k: 'clear', q: a.q }) };
      }
      const cur = currentFlags(s).get(a.q);
      if (a.on === (cur !== undefined)) return same();
      const kind = a.on ? (answers.has(a.q) ? 'guess' : 'skip') : (cur as 'guess' | 'skip');
      return { session: push(s, { t: now, k: 'flag', q: a.q, on: a.on, kind }) };
    }
    case 'pause':
      if (s.policy !== 'soft' || !running || paused) return same('ignored');
      return { session: push(s, { t: now, k: 'pause' }) };
    case 'resume':
      if (!paused) return same('ignored');
      return { session: push(s, { t: now, k: 'resume' }) };
    case 'startSection':
      if (b === null || b.start !== null) return same('ignored');
      return { session: push(s, { t: now, k: 'sectionStart', s: idx }) };
    case 'endSection': {
      if (!running) return same('ignored');
      const x = push(s, { t: now, k: 'sectionEnd', s: idx, reason: 'manual' });
      return { session: idx + 1 >= s.plan.length ? finalize(x, now) : x };
    }
    case 'finish': {
      const x = running ? push(s, { t: now, k: 'sectionEnd', s: idx, reason: 'manual' }) : s;
      return { session: finalize(x, now) };
    }
    case 'abandon':
      return { session: { ...push(s, { t: now, k: 'abandon' }), status: 'abandoned', finishedAt: now } };
  }
}

export function isGap(lastSeen: number, now: number, thresholdMs = GAP_THRESHOLD_MS): boolean {
  return now - lastSeen > thresholdMs;
}

/**
 * 공백(절전·창 닫힘) 따라잡기(spec §7.5):
 * 1) 살아 있던 동안(from까지)의 자동 시작·마감 반영
 * 2) 공백 동안은 진행 중 영역만 마감하고 다음 영역은 자동 시작하지 않음
 * 3) gap 기록(쉬는 시간은 공백 끝부터 다시 셈) 4) 연습이면 공백을 일시정지로 봄
 */
export function catchUpAfterGap(s: Session, from: number, to: number, cause: 'sleep' | 'closed'): Session {
  if (s.status !== 'in_progress') return s;
  let x = advance(s, from);
  x = advance(x, to, { autoStart: false });
  if (x.status !== 'in_progress') return x;
  const t = Math.max(to, lastEventT(x));
  x = push(x, { t, k: 'gap', from, to, cause });
  if (x.policy === 'soft') x = push(x, { t, k: 'pauseRange', from, to });
  return x;
}
