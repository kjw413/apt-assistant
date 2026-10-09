// 내장 시험 프로필(교재 값), 프로필 편집 검사, 세트 배치와 세션 plan 생성.
import {
  SCHEMA_VERSION,
  type DrillSpec, type ExamProfile, type ProblemSet, type SectionDef, type SectionPlan,
  type SectionTools, type SessionScope, type SetLayoutPart, type Settings,
} from './types';

const ALLOWED_ALL = { calc: true, memo: true, paint: true };
const TOOLS_OPEN: SectionTools = { allowed: ALLOWED_ALL, calc: 'open', tab: 'memo' };
const TOOLS_LOCKED: SectionTools = { allowed: { calc: false, memo: false, paint: false }, calc: 'open', tab: 'memo' };

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

function section(id: string, name: string, questions: number, seconds: number, tools: SectionTools): SectionDef {
  return { id, name, questions, seconds, tools: structuredClone(tools) };
}

function profile(id: string, name: string, sections: SectionDef[]): ExamProfile {
  return {
    id, name, choices: 5, sections,
    navigation: { backWithinSection: true, backAcrossSections: false, carryOver: false },
    penalty: { enabled: false },
    breakSec: 15,
    autoStart: true,
    calcKeyboard: true,
    schemaVersion: SCHEMA_VERSION,
  };
}

export const BUILTIN_PROFILES: readonly ExamProfile[] = deepFreeze([
  profile('dcat', '두산 DCAT', [
    section('verbal-logic', '언어논리', 20, 1200, TOOLS_OPEN),
    section('verbal-expression', '언어표현', 15, 600, TOOLS_OPEN),
    section('numerical', '수리자료분석', 20, 1200, TOOLS_OPEN),
    section('spatial', '공간추리', 10, 450, TOOLS_LOCKED),
    section('figure', '도형추리', 10, 450, TOOLS_LOCKED),
  ]),
  profile('lg-wayfit', 'LG Way Fit', [
    section('verbal-comprehension', '언어이해', 20, 1200, TOOLS_OPEN),
    section('verbal-reasoning', '언어추리', 20, 1200, TOOLS_OPEN),
    section('data-interpretation', '자료해석', 20, 1200, TOOLS_OPEN),
    section('creative-math', '창의수리', 20, 1200, TOOLS_OPEN),
  ]),
]);

export const DEFAULT_SETTINGS: Settings = { autoBackupDownload: true, sound: true, flash: true };

/** 수정본(같은 id)이 있으면 그것을, 없으면 내장값을 깊은 복사해 돌려준다. */
export function effectiveProfile(id: string, overrides: ExamProfile[]): ExamProfile {
  const edited = overrides.find(p => p.id === id);
  if (edited) return structuredClone(edited);
  const builtin = BUILTIN_PROFILES.find(p => p.id === id);
  if (!builtin) throw new Error(`알 수 없는 프로필: ${id}`);
  return structuredClone(builtin);
}

export function validateProfileEdit(
  p: ExamProfile,
): { ok: true } | { ok: false; errors: { path: string; msg: string }[] } {
  const errors: { path: string; msg: string }[] = [];
  if (p.sections.length === 0) errors.push({ path: 'sections', msg: '영역이 없습니다' });
  p.sections.forEach((s, i) => {
    if (!s.name.trim()) errors.push({ path: `sections.${i}.name`, msg: '영역 이름을 입력하세요' });
    if (!Number.isInteger(s.seconds) || s.seconds < 10 || s.seconds > 10_800) {
      errors.push({ path: `sections.${i}.seconds`, msg: '10초~3시간 사이로 입력하세요' });
    }
  });
  if (!Number.isInteger(p.breakSec) || p.breakSec < 0 || p.breakSec > 600) {
    errors.push({ path: 'breakSec', msg: '0~600초 사이로 입력하세요' });
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

export function profilePaceSec(p: ExamProfile): number {
  const seconds = p.sections.reduce((a, s) => a + s.seconds, 0);
  const questions = p.sections.reduce((a, s) => a + s.questions, 0);
  return Math.round(seconds / questions);
}

export function defaultDrillSeconds(p: ExamProfile, sectionIdx: number | null, count: number): number {
  if (sectionIdx === null) return count * profilePaceSec(p);
  const s = p.sections[sectionIdx];
  return Math.round((count * s.seconds) / s.questions);
}

export function makeSetLayout(
  p: ExamProfile,
  scope: SessionScope,
  opts: { sectionIdx?: number | null; drillCount?: number },
): SetLayoutPart[] {
  if (scope === 'full') return p.sections.map(s => ({ sectionId: s.id, name: s.name, count: s.questions }));
  const idx = opts.sectionIdx ?? null;
  if (scope === 'section') {
    if (idx === null) throw new Error('영역을 고르세요');
    const s = p.sections[idx];
    return [{ sectionId: s.id, name: s.name, count: s.questions }];
  }
  const count = opts.drillCount ?? 10;
  if (idx === null) return [{ sectionId: null, name: '자유 드릴', count }];
  const s = p.sections[idx];
  return [{ sectionId: s.id, name: s.name, count }];
}

function planPart(
  def: SectionDef | null, name: string, sectionId: string | null,
  qFrom: number, count: number, limitSec: number, choices: number, breakSec: number,
): SectionPlan {
  return {
    sectionId, name, qFrom, qTo: qFrom + count - 1, limitSec, choices,
    paceSec: limitSec / count,
    breakSec,
    tools: structuredClone(def ? def.tools : TOOLS_OPEN),
  };
}

/** 세션 시작 시점의 스냅샷 plan을 만든다(프로필·세트와 참조를 공유하지 않는다). */
export function makePlan(
  p: ExamProfile,
  set: ProblemSet | null,
  scope: SessionScope,
  opts: { sectionIdx?: number | null; drill?: DrillSpec; external?: boolean } = {},
): SectionPlan[] {
  const breakSec = opts.external ? 0 : p.breakSec;
  const layout = set?.layout ?? makeSetLayout(p, scope, { sectionIdx: opts.sectionIdx, drillCount: opts.drill?.count });

  if (scope === 'drill') {
    const drill = opts.drill;
    if (!drill) throw new Error('드릴 설정이 없습니다');
    const def = drill.sectionIdx === null ? null : p.sections[drill.sectionIdx];
    return [planPart(def, def?.name ?? '자유 드릴', def?.id ?? null, 0, drill.count, drill.seconds,
      def?.choices ?? p.choices, breakSec)];
  }

  if (scope === 'section') {
    const idx = opts.sectionIdx ?? p.sections.findIndex(s => s.id === layout[0]?.sectionId);
    const def = p.sections[idx];
    if (!def) throw new Error('영역을 찾을 수 없습니다');
    const count = layout[0]?.count ?? def.questions;
    return [planPart(def, def.name, def.id, 0, count, def.seconds, def.choices ?? p.choices, breakSec)];
  }

  let q = 0;
  return layout.map((part, i) => {
    const def = p.sections.find(s => s.id === part.sectionId) ?? p.sections[i];
    const plan = planPart(def, def.name, def.id, q, part.count, def.seconds, def.choices ?? p.choices, breakSec);
    q += part.count;
    return plan;
  });
}

export function formatMmSs(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatTimesSummary(p: ExamProfile): string {
  return `${p.sections.map(s => formatMmSs(s.seconds)).join(' · ')} / 쉬는 시간 ${p.breakSec}초`;
}
