import { describe, it, expect } from 'vitest';
import { parseKey, summarize } from './grading';
import { mkSession } from './testkit';
import { reduce } from './session';
import { questionViews } from './derive';
import type { ProblemSet } from './types';

const set2 = (key: (number | null)[] | null): ProblemSet => ({
  id: 'set1', name: 't', profileId: 'dcat',
  layout: [{ sectionId: 's0', name: 'S0', count: 3 }, { sectionId: 's1', name: 'S1', count: 2 }],
  choices: 5, numbering: { startNo: 1, mode: 'continuous' }, key, ranges: [],
  createdAt: 0, updatedAt: 0, schemaVersion: 1,
});

describe('parseKey', () => {
  it('공백·쉼표·줄바꿈 무시', () => {
    expect(parseKey('31425 21', 7, 5)).toEqual({ key: [3, 1, 4, 2, 5, 2, 1], errors: [], lengthMismatch: false });
    expect(parseKey('3,1\n4', 3, 5).key).toEqual([3, 1, 4]);
  });
  it('0과 -는 정답 모름', () => {
    expect(parseKey('30-1', 4, 5).key).toEqual([3, null, null, 1]);
  });
  it('원문자·전각 숫자', () => {
    expect(parseKey('③①④２', 4, 5).key).toEqual([3, 1, 4, 2]);
  });
  it('선택지 밖 문자는 위치 표시', () => {
    const r = parseKey('3176', 4, 5);
    expect(r.key).toEqual([3, 1, null, null]);
    expect(r.errors).toEqual([{ pos: 2, ch: '7' }, { pos: 3, ch: '6' }]);
  });
  it('길이 불일치', () => {
    expect(parseKey('123', 5, 5)).toEqual({ key: [1, 2, 3, null, null], errors: [], lengthMismatch: true });
    expect(parseKey('123456', 3, 5)).toMatchObject({ key: [1, 2, 3], lengthMismatch: true });
  });
});

describe('summarize', () => {
  it('영역별·전체 집계', () => {
    let s = reduce(mkSession({ policy: 'soft', autoStart: false }), { type: 'startSection' }, 0).session;
    s = reduce(s, { type: 'answer', q: 0, c: 2 }, 10_000).session;
    s = reduce(s, { type: 'answer', q: 1, c: 1 }, 20_000).session;
    s = reduce(s, { type: 'flag', q: 1, on: true }, 21_000).session;
    s = reduce(s, { type: 'answer', q: 2, c: 5 }, 70_000).session;
    s = reduce(s, { type: 'endSection' }, 80_000).session;
    s = reduce(s, { type: 'startSection' }, 90_000).session;
    s = reduce(s, { type: 'answer', q: 3, c: 1 }, 100_000).session;
    s = reduce(s, { type: 'endSection' }, 110_000).session;
    const sum = summarize(questionViews(s, set2([2, 1, 5, 2, null])), s);
    expect(sum).toMatchObject({
      n: 5, graded: 4, correct: 3, inLimitCorrect: 2, answered: 4, unanswered: 1,
      guessed: 1, guessedCorrect: 1, overtimeAnswers: 1, unseenSections: 0,
    });
    expect(sum.sections[0]).toMatchObject({ started: true, n: 3, graded: 3, correct: 3, inLimitCorrect: 2, usedSec: 80, limitSec: 60, overtimeSec: 20 });
    expect(sum.sections[1]).toMatchObject({ started: true, n: 2, graded: 1, correct: 0, unanswered: 1, usedSec: 20, limitSec: 30, overtimeSec: 0 });
  });
  it('시작하지 않은 영역은 합계에서 빼고 unseenSections로 센다', () => {
    let s = reduce(mkSession({ policy: 'soft', autoStart: false }), { type: 'startSection' }, 0).session;
    s = reduce(s, { type: 'finish' }, 10_000).session;
    const sum = summarize(questionViews(s, set2(null)), s);
    expect(sum).toMatchObject({ n: 3, unseenSections: 1 });
    expect(sum.sections[1].started).toBe(false);
  });
});
