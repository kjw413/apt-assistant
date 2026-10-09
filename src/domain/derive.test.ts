import { describe, it, expect } from 'vitest';
import { mkSession } from './testkit';
import { reduce, catchUpAfterGap } from './session';
import { answersAt, laps, questionViews } from './derive';
import type { ProblemSet } from './types';

function soft2() {
  return reduce(mkSession({ policy: 'soft', autoStart: false }), { type: 'startSection' }, 0).session;
}
const set = (key: (number | null)[] | null, numbering: ProblemSet['numbering'] = { startNo: 1, mode: 'continuous' }): ProblemSet => ({
  id: 'set1', name: 't', profileId: 'dcat',
  layout: [{ sectionId: 's0', name: 'S0', count: 3 }, { sectionId: 's1', name: 'S1', count: 2 }],
  choices: 5, numbering, key, ranges: [], createdAt: 0, updatedAt: 0, schemaVersion: 1,
});

describe('answersAt', () => {
  it('마감 시각까지 재생한 답만', () => {
    let s = soft2();
    s = reduce(s, { type: 'answer', q: 0, c: 1 }, 30_000).session;
    s = reduce(s, { type: 'answer', q: 0, c: 2 }, 70_000).session;
    s = reduce(s, { type: 'answer', q: 1, c: 3 }, 80_000).session;
    const m = answersAt(s, 0, 60_000);
    expect(m.get(0)).toBe(1);
    expect(m.has(1)).toBe(false);
  });
});

describe('laps', () => {
  it('직전 이벤트부터의 간격, 같은 문항은 합산', () => {
    let s = soft2();
    s = reduce(s, { type: 'answer', q: 0, c: 1 }, 30_000).session;
    s = reduce(s, { type: 'flag', q: 1, on: true }, 50_000).session;
    s = reduce(s, { type: 'answer', q: 1, c: 2 }, 80_000).session;
    s = reduce(s, { type: 'answer', q: 0, c: 3 }, 100_000).session;
    const l = laps(s);
    expect(l.get(0)).toBe(50);
    expect(l.get(1)).toBe(50);
    expect(l.get(2)).toBeNull();
  });
  it('정지는 빼고 공백이 걸친 간격은 null', () => {
    let s = soft2();
    s = reduce(s, { type: 'pause' }, 10_000).session;
    s = reduce(s, { type: 'resume' }, 40_000).session;
    s = reduce(s, { type: 'answer', q: 0, c: 1 }, 50_000).session;
    s = catchUpAfterGap(s, 55_000, 400_000, 'sleep');
    s = reduce(s, { type: 'answer', q: 1, c: 1 }, 410_000).session;
    const l = laps(s);
    expect(l.get(0)).toBe(20);
    expect(l.get(1)).toBeNull();
  });
});

describe('questionViews', () => {
  it('external session also uses capture laps only for linked questions', () => {
    let s = soft2();
    s = reduce(s, { type: 'endSection' }, 60_000).session;
    s = {
      ...s,
      mode: 'external',
      externalAnswers: [1, 2, 3],
      captures: [{ q: 0, t: 15_000, file: 'first.png' }],
    };
    expect(questionViews(s, set(null)).slice(0, 3).map(v => v.timeSec)).toEqual([45, null, null]);
  });
  it('uses capture laps only for linked questions', () => {
    let s = soft2();
    s = reduce(s, { type: 'answer', q: 0, c: 1 }, 10_000).session;
    s = reduce(s, { type: 'answer', q: 1, c: 2 }, 20_000).session;
    s = reduce(s, { type: 'endSection' }, 60_000).session;
    s = { ...s, captures: [{ q: 0, t: 15_000, file: 'first.png' }] };
    expect(questionViews(s, set(null)).slice(0, 3).map(v => v.timeSec)).toEqual([45, 10, null]);
  });
  it('번호·답·정오·시간 내 정오·초과·⚑·변경 수', () => {
    let s = soft2();
    s = reduce(s, { type: 'answer', q: 0, c: 1 }, 10_000).session;
    s = reduce(s, { type: 'answer', q: 0, c: 2 }, 20_000).session;
    s = reduce(s, { type: 'answer', q: 1, c: 4 }, 30_000).session;
    s = reduce(s, { type: 'flag', q: 1, on: true }, 31_000).session;
    s = reduce(s, { type: 'answer', q: 2, c: 5 }, 90_000).session;
    const v = questionViews(s, set([2, 3, 5, 1, null]));
    expect(v.map(x => x.no)).toEqual(['1', '2', '3', '4', '5']);
    expect(v[0]).toMatchObject({ answer: 2, changes: 1, correct: true, inLimitCorrect: true, overtime: false });
    expect(v[1]).toMatchObject({ answer: 4, correct: false, flag: 'guess' });
    expect(v[2]).toMatchObject({ answer: 5, correct: true, inLimitAnswer: null, inLimitCorrect: false, overtime: true });
    expect(v[3]).toMatchObject({ answer: null, correct: false, sectionIdx: 1 });
    expect(v[4]).toMatchObject({ key: null, correct: null });
  });
  it('정답 키가 없으면 correct는 null', () => {
    expect(questionViews(soft2(), set(null)).every(x => x.correct === null && x.inLimitCorrect === null)).toBe(true);
  });
  it('번호 방식', () => {
    expect(questionViews(soft2(), set(null, { startNo: 1, mode: 'perSection' })).map(x => x.no)).toEqual(['1', '2', '3', '1', '2']);
    expect(questionViews(soft2(), set(null, { startNo: 21, mode: 'continuous' })).map(x => x.no)).toEqual(['21', '22', '23', '24', '25']);
  });
});
