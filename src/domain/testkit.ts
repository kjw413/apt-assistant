// 테스트 전용 도우미. 앱 코드에서 import하지 않는다.
import { createSession } from './session';
import type { SectionPlan, SectionTools, Session } from './types';

export const ALL_TOOLS: SectionTools = { allowed: { calc: true, memo: true, paint: true }, calc: 'open', tab: 'memo' };

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
