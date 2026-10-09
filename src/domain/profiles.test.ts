import { describe, it, expect } from 'vitest';
import {
  BUILTIN_PROFILES, effectiveProfile, validateProfileEdit, makeSetLayout, makePlan,
  defaultDrillSeconds, formatTimesSummary, profilePaceSec,
} from './profiles';
import type { ExamProfile, ProblemSet, SetLayoutPart } from './types';

const dcat = () => effectiveProfile('dcat', []);
const lg = () => effectiveProfile('lg-wayfit', []);

function setFor(p: ExamProfile, layout: SetLayoutPart[] = makeSetLayout(p, 'full', {})): ProblemSet {
  return {
    id: 'set1', name: 't', profileId: p.id, layout, choices: p.choices,
    numbering: { startNo: 1, mode: 'continuous' }, key: null, ranges: [],
    createdAt: 0, updatedAt: 0, schemaVersion: 1,
  };
}

describe('내장 프로필(교재 값)', () => {
  it('DCAT: 5영역 75문항 3900초, 5지선다', () => {
    const p = dcat();
    expect(p.sections.map(s => s.name)).toEqual(['언어논리', '언어표현', '수리자료분석', '공간추리', '도형추리']);
    expect(p.sections.map(s => s.id)).toEqual(['verbal-logic', 'verbal-expression', 'numerical', 'spatial', 'figure']);
    expect(p.sections.map(s => s.questions)).toEqual([20, 15, 20, 10, 10]);
    expect(p.sections.map(s => s.seconds)).toEqual([1200, 600, 1200, 450, 450]);
    expect(p.choices).toBe(5);
  });
  it('DCAT 공간추리·도형추리는 도구 잠금, 나머지는 허용, 계산기는 모두 펼침', () => {
    const p = dcat();
    expect(p.sections[3].tools.allowed).toEqual({ calc: false, memo: false, paint: false });
    expect(p.sections[4].tools.allowed).toEqual({ calc: false, memo: false, paint: false });
    for (const s of p.sections.slice(0, 3)) expect(s.tools.allowed).toEqual({ calc: true, memo: true, paint: true });
    expect(p.sections.map(s => s.tools.calc).slice(0, 3)).toEqual(['open', 'open', 'open']);
  });
  it('LG: 4영역 각 20문항 1200초', () => {
    const p = lg();
    expect(p.sections.map(s => s.name)).toEqual(['언어이해', '언어추리', '자료해석', '창의수리']);
    expect(p.sections.every(s => s.questions === 20 && s.seconds === 1200)).toBe(true);
    expect(p.sections.map(s => s.tools.calc)).toEqual(['open', 'open', 'open', 'open']);
  });
  it('공통 기본 규칙', () => {
    for (const p of BUILTIN_PROFILES) {
      expect(p.breakSec).toBe(15);
      expect(p.autoStart).toBe(true);
      expect(p.navigation).toEqual({ backWithinSection: true, backAcrossSections: false, carryOver: false });
      expect(p.penalty.enabled).toBe(false);
      expect(p.calcKeyboard).toBe(true);
      expect(p.schemaVersion).toBe(1);
    }
  });
  it('평균 페이스: DCAT 52초, LG 60초', () => {
    expect(profilePaceSec(dcat())).toBe(52);
    expect(profilePaceSec(lg())).toBe(60);
  });
});

describe('effectiveProfile', () => {
  it('수정본이 있으면 수정본', () => {
    const edited = dcat();
    edited.sections[0].seconds = 900;
    expect(effectiveProfile('dcat', [edited]).sections[0].seconds).toBe(900);
  });
  it('반환값을 고쳐도 내장값은 그대로', () => {
    const a = dcat();
    a.sections[0].seconds = 1;
    a.sections[3].tools.allowed.calc = true;
    expect(dcat().sections[0].seconds).toBe(1200);
    expect(dcat().sections[3].tools.allowed.calc).toBe(false);
  });
  it('모르는 id면 예외', () => {
    expect(() => effectiveProfile('nope', [])).toThrow();
  });
});

describe('validateProfileEdit', () => {
  it('내장값은 통과', () => {
    expect(validateProfileEdit(dcat())).toEqual({ ok: true });
  });
  it('영역 시간: 10초 미만, 3시간 초과, 정수 아님은 거부', () => {
    const p = dcat();
    p.sections[0].seconds = 9;
    p.sections[1].seconds = 10_801;
    p.sections[2].seconds = 12.5;
    const r = validateProfileEdit(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map(e => e.path).sort()).toEqual(['sections.0.seconds', 'sections.1.seconds', 'sections.2.seconds']);
  });
  it('쉬는 시간 0~600초', () => {
    const p = dcat();
    p.breakSec = 601;
    const r = validateProfileEdit(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].path).toBe('breakSec');
    p.breakSec = 0;
    expect(validateProfileEdit(p).ok).toBe(true);
  });
});

describe('makeSetLayout / makePlan', () => {
  it('전체 모의: 영역 경계와 시간·페이스', () => {
    const p = dcat();
    const plan = makePlan(p, setFor(p), 'full');
    expect(plan.map(x => [x.qFrom, x.qTo])).toEqual([[0, 19], [20, 34], [35, 54], [55, 64], [65, 74]]);
    expect(plan.map(x => x.limitSec)).toEqual([1200, 600, 1200, 450, 450]);
    expect(plan.map(x => x.paceSec)).toEqual([60, 40, 60, 45, 45]);
    expect(plan.every(x => x.breakSec === 15 && x.choices === 5)).toBe(true);
    expect(plan[3].tools.allowed.calc).toBe(false);
  });
  it('plan은 스냅샷: 이후 프로필을 고쳐도 바뀌지 않는다', () => {
    const p = dcat();
    const plan = makePlan(p, setFor(p), 'full');
    p.sections[0].seconds = 1;
    p.sections[3].tools.allowed.calc = true;
    expect(plan[0].limitSec).toBe(1200);
    expect(plan[3].tools.allowed.calc).toBe(false);
  });
  it('영역 하나: 수리자료분석', () => {
    const p = dcat();
    const layout = makeSetLayout(p, 'section', { sectionIdx: 2 });
    expect(layout).toEqual([{ sectionId: 'numerical', name: '수리자료분석', count: 20 }]);
    const plan = makePlan(p, setFor(p, layout), 'section', { sectionIdx: 2 });
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ sectionId: 'numerical', qFrom: 0, qTo: 19, limitSec: 1200, paceSec: 60 });
  });
  it('드릴: 기본 시간 = 영역 페이스 × 문항 수', () => {
    const p = dcat();
    expect(defaultDrillSeconds(p, 1, 10)).toBe(400);
    expect(defaultDrillSeconds(p, null, 10)).toBe(520);
    const layout = makeSetLayout(p, 'drill', { sectionIdx: 1, drillCount: 10 });
    expect(layout).toEqual([{ sectionId: 'verbal-expression', name: '언어표현', count: 10 }]);
    const plan = makePlan(p, setFor(p, layout), 'drill', { drill: { sectionIdx: 1, count: 10, seconds: 400 } });
    expect(plan[0]).toMatchObject({ sectionId: 'verbal-expression', name: '언어표현', qFrom: 0, qTo: 9, limitSec: 400, paceSec: 40 });
  });
  it('영역 없는 드릴은 도구 모두 허용', () => {
    const p = dcat();
    const layout = makeSetLayout(p, 'drill', { sectionIdx: null, drillCount: 5 });
    const plan = makePlan(p, setFor(p, layout), 'drill', { drill: { sectionIdx: null, count: 5, seconds: 300 } });
    expect(plan[0]).toMatchObject({ sectionId: null, name: '자유 드릴', limitSec: 300, paceSec: 60 });
    expect(plan[0].tools.allowed).toEqual({ calc: true, memo: true, paint: true });
  });
  it('외부 모의: 세트 없이 프로필 배치, 쉬는 시간 0', () => {
    const p = dcat();
    const plan = makePlan(p, null, 'full', { external: true });
    expect(plan.map(x => [x.qFrom, x.qTo])).toEqual([[0, 19], [20, 34], [35, 54], [55, 64], [65, 74]]);
    expect(plan.every(x => x.breakSec === 0)).toBe(true);
  });
});

describe('formatTimesSummary', () => {
  it('DCAT 요약', () => {
    expect(formatTimesSummary(dcat())).toBe('20:00 · 10:00 · 20:00 · 7:30 · 7:30 / 쉬는 시간 15초');
  });
});
