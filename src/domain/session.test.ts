import { describe, it, expect } from 'vitest';
import { mkSession } from './testkit';
import { reduce } from './session';
import { currentAnswers, currentFlags } from './events';

function running(policy: 'hard' | 'soft' = 'soft', mode: 'omr' | 'external' = 'omr') {
  return reduce(mkSession({ policy, mode, autoStart: false }), { type: 'startSection' }, 1_000).session;
}

describe('답·해제', () => {
  it('같은 답을 다시 누르면 같은 객체', () => {
    const s1 = reduce(running(), { type: 'answer', q: 0, c: 3 }, 2_000).session;
    expect(reduce(s1, { type: 'answer', q: 0, c: 3 }, 3_000).session).toBe(s1);
  });
  it('다른 답은 바꾼다', () => {
    let s = reduce(running(), { type: 'answer', q: 0, c: 3 }, 2_000).session;
    s = reduce(s, { type: 'answer', q: 0, c: 4 }, 3_000).session;
    expect(currentAnswers(s).get(0)).toBe(4);
  });
  it('clear로 지우고, 답이 없으면 같은 객체', () => {
    let s = reduce(running(), { type: 'answer', q: 1, c: 2 }, 2_000).session;
    s = reduce(s, { type: 'clear', q: 1 }, 3_000).session;
    expect(currentAnswers(s).has(1)).toBe(false);
    expect(reduce(s, { type: 'clear', q: 1 }, 4_000).session).toBe(s);
  });
  it('현재 영역 밖 문항, 선택지 밖 답은 ignored', () => {
    const s = running();
    expect(reduce(s, { type: 'answer', q: 3, c: 1 }, 2_000)).toEqual({ session: s, notice: 'ignored' });
    expect(reduce(s, { type: 'answer', q: 0, c: 6 }, 2_000).notice).toBe('ignored');
    expect(reduce(s, { type: 'answer', q: 0, c: 0 }, 2_000).notice).toBe('ignored');
  });
  it('쉬는 시간 중 답은 locked, 일시정지 중 답은 paused', () => {
    expect(reduce(mkSession({ autoStart: false }), { type: 'answer', q: 0, c: 1 }, 1_000).notice).toBe('locked');
    const p = reduce(running('soft'), { type: 'pause' }, 2_000).session;
    expect(reduce(p, { type: 'answer', q: 0, c: 1 }, 3_000).notice).toBe('paused');
  });
});

describe('⚑', () => {
  it('답 없이 켜면 skip, 나중에 답하면 해제', () => {
    let s = reduce(running(), { type: 'flag', q: 0, on: true }, 2_000).session;
    expect(s.events.at(-1)).toMatchObject({ k: 'flag', q: 0, on: true, kind: 'skip' });
    expect(currentFlags(s).get(0)).toBe('skip');
    s = reduce(s, { type: 'answer', q: 0, c: 2 }, 3_000).session;
    expect(currentFlags(s).has(0)).toBe(false);
  });
  it('답한 뒤 켜면 guess, 답을 바꿔도 유지', () => {
    let s = reduce(running(), { type: 'answer', q: 1, c: 5 }, 2_000).session;
    s = reduce(s, { type: 'flag', q: 1, on: true }, 3_000).session;
    s = reduce(s, { type: 'answer', q: 1, c: 4 }, 4_000).session;
    expect(currentFlags(s).get(1)).toBe('guess');
  });
  it('켜진 ⚑를 다시 켜면 같은 객체, 끄면 해제', () => {
    let s = reduce(running(), { type: 'flag', q: 2, on: true }, 2_000).session;
    expect(reduce(s, { type: 'flag', q: 2, on: true }, 3_000).session).toBe(s);
    s = reduce(s, { type: 'flag', q: 2, on: false }, 4_000).session;
    expect(currentFlags(s).has(2)).toBe(false);
  });
});

describe('영역·세션 종료', () => {
  it('마지막 영역 수동 종료 → finish, awaiting_key', () => {
    let s = reduce(running('soft'), { type: 'endSection' }, 5_000).session;
    s = reduce(s, { type: 'startSection' }, 6_000).session;
    s = reduce(s, { type: 'endSection' }, 7_000).session;
    expect(s.status).toBe('awaiting_key');
    expect(s.events.at(-1)).toEqual({ t: 7_000, k: 'finish' });
  });
  it('외부 모의 → external_done', () => {
    let s = reduce(running('soft', 'external'), { type: 'endSection' }, 5_000).session;
    s = reduce(s, { type: 'startSection' }, 6_000).session;
    s = reduce(s, { type: 'endSection' }, 7_000).session;
    expect(s.status).toBe('external_done');
  });
  it('finish: 진행 중 영역을 닫고 남은 영역은 미응시', () => {
    const s = reduce(running('soft'), { type: 'finish' }, 5_000).session;
    expect(s.status).toBe('awaiting_key');
    expect(s.events.map(e => e.k)).toEqual(['sectionStart', 'sectionEnd', 'finish']);
  });
  it('abandon 뒤 동작은 ignored', () => {
    const s = reduce(running(), { type: 'abandon' }, 5_000).session;
    expect(s.status).toBe('abandoned');
    expect(reduce(s, { type: 'answer', q: 0, c: 1 }, 6_000)).toEqual({ session: s, notice: 'ignored' });
  });
  it('일시정지 중에도 영역 종료 가능', () => {
    let s = reduce(running('soft'), { type: 'pause' }, 2_000).session;
    s = reduce(s, { type: 'endSection' }, 3_000).session;
    expect(s.events.at(-1)).toMatchObject({ k: 'sectionEnd', s: 0, reason: 'manual' });
  });
});

describe('createSession', () => {
  it('초기 상태', () => {
    expect(mkSession({ autoStart: false, createdAt: 123 })).toMatchObject({
      status: 'in_progress', events: [], autoStart: false, createdAt: 123, schemaVersion: 1, appVersion: '0.1.0',
    });
  });
});
