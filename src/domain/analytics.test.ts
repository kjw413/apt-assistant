import { describe, expect, it } from 'vitest';
import { aggregate, familyRows, shrink, toCells, verdicts } from './analytics';
import { emptyAllData } from './backup';
import { effectiveProfile, makePlan, makeSetLayout } from './profiles';
import { buildSeedImport } from './seed';
import type { AllData, ProblemSet, Session } from './types';

const filter = { profileId: 'dcat', firstOnly: true };
function seedData(): AllData {
  return { ...emptyAllData(), imports: [buildSeedImport(0)] };
}
function toolData(): AllData {
  const p = effectiveProfile('dcat', []);
  const set: ProblemSet = {
    id: 'set1', name: '책', profileId: p.id, layout: makeSetLayout(p, 'full', {}), choices: 5,
    numbering: { startNo: 1, mode: 'continuous' }, key: Array(75).fill(1),
    ranges: [{ from: 0, to: 1, familyId: '명제추리', leafId: '명제' }],
    createdAt: 0, updatedAt: 0, schemaVersion: 1,
  };
  const s: Session = {
    id: 's1', profileId: p.id, setId: set.id, scope: 'full', mode: 'omr', policy: 'soft',
    autoStart: false, attempt: 1, plan: makePlan(p, set, 'full'), status: 'graded',
    events: [{ k: 'sectionStart', s: 0, t: 0 }, { k: 'answer', q: 0, c: 1, t: 30_000 },
      { k: 'flag', q: 0, on: true, kind: 'guess', t: 30_000 },
      { k: 'answer', q: 1, c: 2, t: 60_000 }, { k: 'sectionEnd', s: 0, reason: 'manual', t: 60_000 }],
    createdAt: 0, finishedAt: 60_000, appVersion: '0.1.0', schemaVersion: 1,
  };
  return { ...emptyAllData(), sets: [set], sessions: [s] };
}

describe('toCells와 aggregate', () => {
  it('시드 행을 외부 초과 셀로 만들고 알 수 없는 응답·시간은 null로 둔다', () => {
    const cells = toCells(seedData());
    expect(cells).toHaveLength(42);
    expect(cells.every(c => c.condition === 'external-overtime' && c.firstAttempt
      && c.answered === null && c.inLimitCorrect === null && c.guessedCorrect === null
      && c.timeSec === null && c.timedN === 0)).toBe(true);
    expect(aggregate(cells, 'section', filter).map(r => [r.id, r.correct, r.n])).toEqual([
      ['verbal-logic', 15, 20], ['verbal-expression', 12, 15], ['numerical', 11, 20],
      ['spatial', 2, 10], ['figure', 6, 10],
    ]);
  });
  it('세션×영역×가족/세부로 합치고 현재 키와 칠하기 범위를 늦게 결합한다', () => {
    const data = toolData();
    const before = aggregate(toCells(data), 'family', filter).find(r => r.id === '명제추리')!;
    expect(before).toMatchObject({ n: 2, correct: 1, answered: 2, inLimitCorrect: 1,
      guessedCorrect: 1, timeSec: 60, timedN: 2, medianSec: 30 });
    data.sets[0].key![1] = 2;
    expect(aggregate(toCells(data), 'family', filter).find(r => r.id === '명제추리')!.correct).toBe(2);
    data.sets[0].ranges = [{ from: 0, to: 1, familyId: '응용수리' }];
    expect(toCells(data).some(c => c.familyId === '명제추리')).toBe(false);
    expect(toCells(data).some(c => c.familyId === '응용수리')).toBe(true);
  });
  it('칠하지 않은 문항은 미분류 집계, 기본 가족은 빈 범위를 채우며 미분류는 판정 제외', () => {
    const data = toolData();
    expect(aggregate(toCells(data), 'family', filter).find(r => r.id === '미분류')!.n).toBe(73);
    expect(Object.values(verdicts(toCells(data), filter)).flat().some(r => r.familyId === '미분류')).toBe(false);
    data.sets[0].defaultFamilyId = '단문독해';
    expect(aggregate(toCells(data), 'family', filter).find(r => r.id === '단문독해')!.n).toBe(73);
  });
  it('graded+세트만 포함하고 프로필·첫 풀이 필터와 scope 조건을 적용한다', () => {
    const data = toolData();
    const s = data.sessions[0];
    data.sessions.push({ ...s, id: 'retry', attempt: 2, scope: 'drill' },
      { ...s, id: 'section', scope: 'section' },
      { ...s, id: 'ungraded', status: 'awaiting_key' }, { ...s, id: 'missing', setId: 'missing' });
    const cells = toCells(data);
    expect(new Set(cells.map(c => c.condition))).toEqual(new Set(['full', 'section', 'drill']));
    expect(aggregate(cells, 'family', filter).find(r => r.id === '명제추리')!.n).toBe(4);
    expect(aggregate(cells, 'family', { ...filter, firstOnly: false }).find(r => r.id === '명제추리')!.n).toBe(6);
    expect(aggregate(cells, 'family', { profileId: 'lg-wayfit', firstOnly: false })).toEqual([]);
  });
  it('외부 답은 이벤트보다 우선하고 문항 시간·시간 내 지표는 외부 분석에 섞이지 않는다', () => {
    const data = toolData();
    data.sessions[0] = { ...data.sessions[0], mode: 'external', externalAnswers: [2, 1, ...Array(73).fill(null)] };
    const cells = toCells(data);
    const row = aggregate(cells, 'family', filter).find(r => r.id === '명제추리')!;
    expect(row).toMatchObject({ correct: 1, answered: 2, inLimitCorrect: null,
      timeSec: null, timedN: 0, medianSec: null, guessedCorrect: null });
    expect(cells.every(c => c.condition === 'external')).toBe(true);
    expect(verdicts(cells, filter).speed).toEqual([]);
    expect(verdicts(cells, filter).defer).toEqual([]);
  });
  it('확정되지 않은 가져오기는 제외하고 일반 외부 조건도 지원한다', () => {
    const data = seedData();
    data.imports.push({ ...buildSeedImport(0), id: 'raw', status: 'raw' });
    data.imports[0].overtime = false;
    expect(toCells(data)).toHaveLength(42);
    expect(toCells(data).every(c => c.condition === 'external')).toBe(true);
  });
  it('정답을 모르는 문항은 정답률 분모에서 제외하고 입력을 변경하지 않는다', () => {
    const data = toolData();
    data.sets[0].key![1] = null;
    const snapshot = structuredClone(data);
    expect(aggregate(toCells(data), 'family', filter).find(r => r.id === '명제추리')!.n).toBe(1);
    expect(data).toEqual(snapshot);
  });
  it('비율은 셀별 평균이 아니라 정답과 n의 합이며 중앙값은 랩 전체에서 계산한다', () => {
    const data = toolData();
    const s = data.sessions[0];
    data.sessions.push({ ...s, id: 's2', events: [
      { k: 'sectionStart', s: 0, t: 0 }, { k: 'answer', q: 0, c: 1, t: 10_000 },
      { k: 'answer', q: 1, c: 1, t: 100_000 }, { k: 'sectionEnd', s: 0, reason: 'manual', t: 100_000 },
    ] });
    const row = aggregate(toCells(data), 'family', filter).find(r => r.id === '명제추리')!;
    expect(row).toMatchObject({ n: 4, correct: 3, p: 0.75, timedN: 4, medianSec: 30 });
  });
});

describe('수축·비중·가족 판정', () => {
  it('k=4 수축과 빈 표본', () => {
    expect(shrink(0, 6, 0.2)).toBeCloseTo(0.08);
    expect(shrink(4, 7, 0.55)).toBeCloseTo(0.563636);
    expect(shrink(0, 0, 0.6)).toBeCloseTo(0.6);
    expect(shrink(3, 5, 0.2, 0)).toBe(0.6);
  });
  it('1회 시드의 수축 정답률, 기대 오답과 전체 합', () => {
    const rows = familyRows(toCells(seedData()), filter);
    const net = rows.find(r => r.familyId === '전개도')!;
    expect(net).toMatchObject({ n: 6, correct: 0, timedN: 0, medianSec: null });
    expect(net.w).toBeCloseTo(6 / 75);
    expect(net.pTilde).toBeCloseTo(0.08);
    expect(net.expectedWrong).toBeCloseTo(5.52);
    const table = rows.find(r => r.familyId === '자료해석')!;
    expect(table.pTilde).toBeCloseTo(0.5142857);
    expect(table.expectedWrong).toBeCloseTo(4.8571428);
    expect(rows.find(r => r.familyId === '응용수리')!.pTilde).toBeCloseTo(0.563636);
    expect(rows.reduce((x, r) => x + r.expectedWrong, 0)).toBeCloseTo(29.66, 1);
    expect(rows.find(r => r.familyId === '평면도형')!.prior).toBeCloseTo(0.4);
  });
  it('1회만 공부 Top3, 시간 조건 판정은 없음, 초과 교란 표시', () => {
    const result = verdicts(toCells(seedData()), filter);
    expect(result.study.map(r => r.familyId)).toEqual(['전개도', '자료해석', '도형추리']);
    expect(result.study.every(r => r.overtimePossible)).toBe(true);
    expect(result.speed).toEqual([]);
    expect(result.defer).toEqual([]);
    expect(result.guess.map(r => r.familyId)).toContain('전개도');
  });
  it('모의 비중은 전체 세트당 한 번 계산해 재풀이 횟수에 끌려가지 않는다', () => {
    const data = toolData();
    data.sets.push({ ...structuredClone(data.sets[0]), id: 'set2', ranges: [{ from: 0, to: 5, familyId: '명제추리' }] });
    data.sessions.push({ ...data.sessions[0], id: 'other', setId: 'set2' },
      { ...data.sessions[0], id: 'retry', attempt: 2 });
    expect(familyRows(toCells(data), { ...filter, firstOnly: false }).find(r => r.familyId === '명제추리')!.w)
      .toBeCloseTo(4 / 75);
  });
  it('전체 모의가 없으면 영역 비중을 영역 안 가족 수로 나눈다', () => {
    const data = toolData();
    data.sessions[0].scope = 'section';
    const rows = familyRows(toCells(data), filter);
    expect(rows.find(r => r.familyId === '명제추리')!.w).toBeCloseTo(20 / 75 / 2);
  });
  it('빈 데이터는 빈 집계와 빈 판정', () => {
    const cells = toCells(emptyAllData());
    expect(familyRows(cells, filter)).toEqual([]);
    expect(verdicts(cells, filter)).toEqual({ study: [], speed: [], defer: [], guess: [] });
  });

  function timedData(): AllData {
    const data = toolData();
    data.sets[0].ranges = [{ from: 0, to: 3, familyId: '느린강점' }, { from: 4, to: 7, familyId: '느린약점' }];
    const s = data.sessions[0];
    s.scope = 'section';
    s.plan = [{ ...s.plan[0], qTo: 7, limitSec: 480, paceSec: 60 }];
    s.events = [{ k: 'sectionStart', s: 0, t: 0 }];
    let t = 0;
    for (let q = 0; q < 8; q++) {
      t += q < 4 ? 120_000 : 300_000;
      s.events.push({ k: 'answer', q, c: q < 4 ? 1 : 2, t });
    }
    s.events.push({ k: 'sectionEnd', s: 0, reason: 'manual', t });
    return data;
  }

  it('유효한 시간 4문항으로 속도 훈련과 낮은 분당 득점 뒤로 판정을 낸다', () => {
    const result = verdicts(toCells(timedData()), filter);
    expect(result.speed.map(r => r.familyId)).toEqual(['느린강점']);
    expect(result.defer.map(r => r.familyId)).toEqual(['느린약점']);
  });
  it('뒤로 판정은 첫 풀이·시간제 모의만 쓰고 재풀이·드릴을 배제한다', () => {
    const data = timedData();
    data.sessions[0].attempt = 2;
    expect(verdicts(toCells(data), { ...filter, firstOnly: false }).defer).toEqual([]);
    data.sessions[0].attempt = 1;
    data.sessions[0].scope = 'drill';
    expect(verdicts(toCells(data), filter).defer).toEqual([]);
  });
  it('시간 n<4이면 시간 판정을 내지 않고 감점 있는 프로필에는 찍기를 권하지 않는다', () => {
    const data = timedData();
    data.sets[0].key![0] = null;
    data.sets[0].key![4] = null;
    const p = effectiveProfile('dcat', []);
    p.penalty.enabled = true;
    data.profiles = [p];
    const result = verdicts(toCells(data), filter);
    expect(result.speed).toEqual([]);
    expect(result.defer).toEqual([]);
    expect(result.guess).toEqual([]);
  });
});
