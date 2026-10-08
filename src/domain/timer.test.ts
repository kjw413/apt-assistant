import { describe, it, expect } from 'vitest';
import { mkSession } from './testkit';
import { advance, reduce, catchUpAfterGap, isGap } from './session';
import { phaseOf, deadlineOf, pace } from './timer';
import type { Session } from './types';

const sorted = (s: Session) => s.events.every((e, i, a) => i === 0 || a[i - 1].t <= e.t);
const kinds = (s: Session) => s.events.map(e => `${e.k}${'s' in e ? e.s : ''}@${e.t}`);

describe('쉬는 시간과 자동 시작(실전)', () => {
  it('첫 영역 전 15초 뒤 자동 시작', () => {
    const s = mkSession();
    expect(phaseOf(s, 14_999)).toMatchObject({ idx: 0, phase: 'break', autoStartAt: 15_000 });
    expect(advance(s, 14_999)).toBe(s);
    expect(advance(s, 15_000).events).toEqual([{ t: 15_000, k: 'sectionStart', s: 0, auto: true }]);
  });
  it('breakSec 0이면 즉시 시작', () => {
    const s = mkSession({ parts: [{ count: 2, limitSec: 60, breakSec: 0 }] });
    expect(advance(s, 0).events).toEqual([{ t: 0, k: 'sectionStart', s: 0, auto: true }]);
  });
  it('autoStart 끔이면 시작 버튼으로만', () => {
    const s = mkSession({ autoStart: false });
    expect(advance(s, 100_000)).toBe(s);
    expect(phaseOf(s, 100_000).autoStartAt).toBeUndefined();
    expect(reduce(s, { type: 'startSection' }, 100_000).session.events).toEqual([{ t: 100_000, k: 'sectionStart', s: 0 }]);
  });
  it('연습(soft)은 자동 시작 없음', () => {
    const s = mkSession({ policy: 'soft' });
    expect(advance(s, 100_000)).toBe(s);
  });
});

describe('하드 마감', () => {
  it('틱이 늦어도 마감 시각에 닫고 다음 쉬는 시간', () => {
    let s = advance(mkSession(), 15_000);
    expect(deadlineOf(s, 0, 20_000)).toBe(75_000);
    s = advance(s, 80_000);
    expect(kinds(s)).toEqual(['sectionStart0@15000', 'sectionEnd0@75000']);
    expect(phaseOf(s, 80_000)).toMatchObject({ idx: 1, phase: 'break', autoStartAt: 90_000 });
  });
  it('마감 뒤 답은 locked', () => {
    const s = advance(mkSession(), 15_000);
    const r = reduce(s, { type: 'answer', q: 0, c: 3 }, 75_001);
    expect(r.notice).toBe('locked');
    expect(r.session.events.some(e => e.k === 'answer')).toBe(false);
    expect(r.session.events.some(e => e.k === 'sectionEnd')).toBe(true);
  });
  it('마지막 영역 마감 → finish, 채점 대기', () => {
    let s = advance(mkSession(), 15_000);
    s = advance(s, 1_000_000);
    expect(kinds(s)).toEqual(['sectionStart0@15000', 'sectionEnd0@75000', 'sectionStart1@90000', 'sectionEnd1@120000', 'finish@120000']);
    expect(s.status).toBe('awaiting_key');
    expect(s.finishedAt).toBe(120_000);
    expect(sorted(s)).toBe(true);
  });
  it('외부 모의는 external_done', () => {
    const s = advance(mkSession({ mode: 'external', parts: [{ count: 2, limitSec: 60, breakSec: 0 }] }), 1_000_000);
    expect(s.status).toBe('external_done');
  });
});

describe('공백 따라잡기', () => {
  it('실전: 진행 중 영역만 마감하고 다음 영역은 자동 시작하지 않는다', () => {
    let s = advance(mkSession(), 15_000);
    s = catchUpAfterGap(s, 30_000, 7_200_000, 'closed');
    expect(kinds(s)).toEqual(['sectionStart0@15000', 'sectionEnd0@75000', 'gap@7200000']);
    expect(phaseOf(s, 7_200_000)).toMatchObject({ idx: 1, phase: 'break', autoStartAt: 7_215_000 });
    expect(s.status).toBe('in_progress');
    expect(sorted(s)).toBe(true);
  });
  it('실전: 공백 이전(살아 있던 때)의 자동 시작은 반영', () => {
    const s = catchUpAfterGap(mkSession(), 20_000, 500_000, 'sleep');
    expect(kinds(s)).toEqual(['sectionStart0@15000', 'sectionEnd0@75000', 'gap@500000']);
  });
  it('실전: 공백 끝에 아직 마감 전이면 계속 진행', () => {
    let s = advance(mkSession({ parts: [{ count: 3, limitSec: 600 }, { count: 2, limitSec: 30 }] }), 15_000);
    s = catchUpAfterGap(s, 20_000, 300_000, 'closed');
    expect(phaseOf(s, 300_000)).toMatchObject({ idx: 0, phase: 'running', remainingMs: 315_000 });
  });
  it('연습: 공백은 자동으로 일시정지가 되어 마감이 밀린다', () => {
    let s = reduce(mkSession({ policy: 'soft', parts: [{ count: 3, limitSec: 60 }] }), { type: 'startSection' }, 0).session;
    s = catchUpAfterGap(s, 10_000, 310_000, 'sleep');
    expect(deadlineOf(s, 0, 310_000)).toBe(360_000);
    expect(s.events.some(e => e.k === 'pauseRange')).toBe(true);
  });
  it('공백 기준 120초', () => {
    expect(isGap(0, 120_000)).toBe(false);
    expect(isGap(0, 120_001)).toBe(true);
  });
});

describe('연습 마감과 일시정지', () => {
  it('마감 뒤에도 답을 받고 초과 시간을 보인다', () => {
    const s = reduce(mkSession({ policy: 'soft', parts: [{ count: 3, limitSec: 60 }] }), { type: 'startSection' }, 0).session;
    expect(advance(s, 100_000)).toBe(s);
    expect(phaseOf(s, 100_000)).toMatchObject({ phase: 'running', remainingMs: 0, overtimeMs: 40_000 });
    const r = reduce(s, { type: 'answer', q: 0, c: 2 }, 100_000);
    expect(r.notice).toBeUndefined();
    expect(r.session.events.at(-1)).toEqual({ t: 100_000, k: 'answer', q: 0, c: 2 });
  });
  it('정지만큼 마감이 밀리고 정지 중 남은 시간은 고정', () => {
    let s = reduce(mkSession({ policy: 'soft', parts: [{ count: 3, limitSec: 600 }] }), { type: 'startSection' }, 0).session;
    s = reduce(s, { type: 'pause' }, 100_000).session;
    expect(phaseOf(s, 130_000)).toMatchObject({ phase: 'paused', remainingMs: 500_000 });
    expect(phaseOf(s, 150_000)).toMatchObject({ phase: 'paused', remainingMs: 500_000 });
    s = reduce(s, { type: 'resume' }, 160_000).session;
    expect(deadlineOf(s, 0, 160_000)).toBe(660_000);
  });
  it('마감 뒤 정지는 마감을 늦추지 않는다', () => {
    let s = reduce(mkSession({ policy: 'soft', parts: [{ count: 3, limitSec: 60 }] }), { type: 'startSection' }, 0).session;
    s = reduce(s, { type: 'answer', q: 0, c: 1 }, 180_000).session;
    s = reduce(s, { type: 'pause' }, 190_000).session;
    s = reduce(s, { type: 'resume' }, 490_000).session;
    expect(deadlineOf(s, 0, 500_000)).toBe(60_000);
  });
  it('겹치는 정지는 한 번만 뺀다', () => {
    let s = reduce(mkSession({ policy: 'soft', parts: [{ count: 3, limitSec: 600 }] }), { type: 'startSection' }, 0).session;
    s = reduce(s, { type: 'pause' }, 100_000).session;
    s = reduce(s, { type: 'resume' }, 300_000).session;
    s = catchUpAfterGap(s, 150_000, 400_000, 'sleep');
    expect(deadlineOf(s, 0, 400_000)).toBe(900_000);
  });
  it('실전에서 일시정지는 ignored', () => {
    const s = advance(mkSession(), 15_000);
    const r = reduce(s, { type: 'pause' }, 20_000);
    expect(r.notice).toBe('ignored');
    expect(r.session).toBe(s);
  });
});

describe('시계 역행', () => {
  it('마지막 이벤트 시각으로 고정', () => {
    const s = reduce(mkSession({ policy: 'soft' }), { type: 'startSection' }, 50_000).session;
    const r = reduce(s, { type: 'answer', q: 0, c: 1 }, 40_000);
    expect(r.session.events.at(-1)!.t).toBe(50_000);
    expect(sorted(r.session)).toBe(true);
  });
});

describe('페이스', () => {
  it('기대 = floor(활동 시간 / 페이스), delta = 답한 수 − 기대', () => {
    let s = reduce(mkSession({ policy: 'soft', parts: [{ count: 10, limitSec: 600 }] }), { type: 'startSection' }, 0).session;
    s = reduce(s, { type: 'answer', q: 0, c: 1 }, 50_000).session;
    s = reduce(s, { type: 'answer', q: 1, c: 2 }, 110_000).session;
    expect(pace(s, 185_000)).toEqual({ expected: 3, answered: 2, delta: -1 });
  });
});
