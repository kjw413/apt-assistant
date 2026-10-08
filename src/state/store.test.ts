import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { createAppStore } from './store';
import { AptDb } from '../data/db';
import { createDexieRepo, type Repo } from '../data/repo';
import type { SetupDraft } from '../domain/types';
import { buildBackup } from '../domain/backup';

let n = 0;
function setup(lock: 'acquired' | 'busy' | 'unsupported' = 'acquired', repo?: Repo) {
  const r = repo ?? createDexieRepo(new AptDb(`store-test-${++n}`));
  let now = 1_000_000;
  const downloads: string[] = [];
  const store = createAppStore({
    repo: r, now: () => now, download: name => downloads.push(name), acquireLock: async () => lock,
  });
  return { store, repo: r, downloads, setNow: (t: number) => { now = t; } };
}
const draft = (o: Partial<SetupDraft> = {}): SetupDraft => ({
  profileId: 'dcat', scope: 'drill', mode: 'omr', policy: 'soft', sectionIdx: 2, drillCount: 3, drillSeconds: 180,
  setId: null, newSetName: '', startNo: 1, numberingMode: 'continuous', label: '', ...o,
});

describe('store', () => {
  it('boot failure exposes bootError, blocks writes and can retry with the held lock', async () => {
    const repo = createDexieRepo(new AptDb(`store-test-${++n}`));
    let loads = 0;
    let locks = 0;
    const unreliable = { ...repo, loadAll: async () => {
      if (++loads === 1) throw new Error('DB temporarily unavailable');
      return repo.loadAll();
    } };
    const store = createAppStore({
      repo: unreliable, now: () => 1_000_000, download: () => {},
      acquireLock: async () => ++locks === 1 ? 'acquired' : 'busy',
    });
    await store.getState().boot();
    expect(store.getState().bootError).toBe('DB temporarily unavailable');
    expect(store.getState().ready).toBe(false);
    expect(await store.getState().startSession(draft())).toBeNull();
    await store.getState().act('missing', { type: 'finish' });
    await store.getState().saveSettings({ sound: false });
    store.getState().setMemo('missing', 'must not save');
    expect((await repo.loadAll()).data.sessions).toEqual([]);
    expect((await repo.loadAll()).data.settings.sound).toBe(true);
    expect((await repo.loadAll()).data.memos).toEqual({});
    await store.getState().boot();
    expect(store.getState().ready).toBe(true);
    expect(store.getState().bootError).toBeNull();
    expect(store.getState().screen).toEqual({ name: 'home' });
    expect(locks).toBe(1);
    expect(loads).toBe(2);
  });
  it('future-schema in_progress session stays unchanged after boot, tick and act', async () => {
    const source = setup();
    await source.store.getState().boot();
    const id = (await source.store.getState().startSession(draft({ scope: 'full', policy: 'hard' })))!;
    await source.store.getState().act(id, { type: 'startSection' });
    const future = { ...source.store.getState().data.sessions[0], schemaVersion: 2 };
    await source.repo.saveSession(future);
    await source.repo.saveAlive(id, 1_000_000);
    const target = setup('acquired', source.repo);
    target.setNow(10_000_000);
    await target.store.getState().boot();
    expect((await target.repo.loadAll()).data.sessions[0]).toEqual(future);
    expect(target.store.getState().screen).toEqual({ name: 'home' });
    await target.store.getState().tick();
    await target.store.getState().act(id, { type: 'abandon' });
    expect((await target.repo.loadAll()).data.sessions[0]).toEqual(future);
    for (const name of ['runner', 'key'] as const) {
      target.store.getState().go({ name, sessionId: id });
      expect(target.store.getState().screen).toEqual({ name: 'home' });
      expect(target.store.getState().toast).toBe('새 버전 데이터는 열 수 없습니다');
    }
  });
  it('restore recovers a closed gap without auto-starting later sections', async () => {
    const source = setup();
    await source.store.getState().boot();
    const id = (await source.store.getState().startSession(draft({ scope: 'full', policy: 'hard', sectionIdx: null })))!;
    await source.store.getState().act(id, { type: 'startSection' });
    source.setNow(1_060_000);
    await source.store.getState().act(id, { type: 'answer', q: 0, c: 1 });
    const backup = JSON.stringify(buildBackup(source.store.getState().data, 1_060_000));
    const target = setup();
    target.setNow(10_000_000);
    await target.store.getState().boot();
    expect(await target.store.getState().restore(backup)).toEqual({ ok: true });
    await target.store.getState().tick();
    const restored = (await target.repo.loadAll()).data.sessions[0];
    expect(restored.events.filter(e => e.k === 'sectionEnd')).toEqual([
      { t: 2_200_000, k: 'sectionEnd', s: 0, reason: 'deadline' },
    ]);
    expect(restored.events.filter(e => e.k === 'sectionStart')).toHaveLength(1);
    expect(restored.events).toContainEqual({ t: 10_000_000, k: 'gap', from: 1_060_000, to: 10_000_000, cause: 'closed' });
    expect(restored.status).toBe('in_progress');
    expect(target.store.getState().screen).toEqual({ name: 'runner', sessionId: id });
  });
  it('restore rejects incomplete backup and leaves existing data intact', async () => {
    const t = setup();
    await t.store.getState().boot();
    const id = (await t.store.getState().startSession(draft()))!;
    await t.store.getState().act(id, { type: 'abandon' });
    const before = await t.repo.loadAll();
    expect(await t.store.getState().restore('{"format":"apt-backup","schemaVersion":1,"data":{}}'))
      .toEqual({ ok: false, reason: '백업 데이터가 올바르지 않습니다' });
    expect(await t.repo.loadAll()).toEqual(before);
    expect(t.downloads).toEqual([]);
  });
  it.each([
    { scope: 'full' as const, sectionIdx: null },
    { scope: 'section' as const, sectionIdx: 0 },
    { scope: 'drill' as const, sectionIdx: 0 },
    { scope: 'drill' as const, sectionIdx: 2, drillCount: 4 },
  ])('incompatible existing set is refused for %j', async overrides => {
    const t = setup();
    await t.store.getState().boot();
    const id = (await t.store.getState().startSession(draft()))!;
    const setId = t.store.getState().data.sessions[0].setId!;
    await t.store.getState().act(id, { type: 'abandon' });
    const before = (await t.repo.loadAll()).data;
    expect(await t.store.getState().startSession(draft({ ...overrides, setId }))).toBeNull();
    expect(t.store.getState().toast).toBe('선택한 세트가 이 범위와 맞지 않습니다');
    expect((await t.repo.loadAll()).data).toEqual(before);
  });
  it('빈 DB 부팅 → 홈', async () => {
    const { store } = setup();
    await store.getState().boot();
    expect(store.getState().ready).toBe(true);
    expect(store.getState().screen).toEqual({ name: 'home' });
  });
  it('잠금 실패 → 차단 화면, 세션 시작 불가', async () => {
    const { store, repo } = setup('busy');
    await store.getState().boot();
    expect(store.getState().screen).toEqual({ name: 'blocked' });
    expect(await store.getState().startSession(draft())).toBeNull();
    expect((await repo.loadAll()).data.sessions).toEqual([]);
  });
  it('세션 시작 → 드릴 세트 자동 생성, 러너, lastSetup 저장', async () => {
    const { store, repo } = setup();
    await store.getState().boot();
    const id = await store.getState().startSession(draft());
    expect(store.getState().screen).toEqual({ name: 'runner', sessionId: id });
    const l = await repo.loadAll();
    expect(l.data.sessions).toHaveLength(1);
    expect(l.data.sets[0].name).toMatch(/^드릴 /);
    expect(l.data.settings.lastSetup).toMatchObject({ profileId: 'dcat', scope: 'drill' });
  });
  it('시작 두 번 동시 호출 → 세션 1개', async () => {
    const { store, repo } = setup();
    await store.getState().boot();
    const ids = await Promise.all([store.getState().startSession(draft()), store.getState().startSession(draft())]);
    expect(ids.filter(Boolean)).toHaveLength(1);
    expect((await repo.loadAll()).data.sessions).toHaveLength(1);
  });
  it('답은 즉시 저장되고 다시 부팅하면 러너로 이어진다', async () => {
    const t = setup();
    await t.store.getState().boot();
    const id = (await t.store.getState().startSession(draft()))!;
    t.setNow(1_001_000);
    await t.store.getState().act(id, { type: 'startSection' });
    t.setNow(1_005_000);
    await t.store.getState().act(id, { type: 'answer', q: 0, c: 4 });
    const t2 = setup('acquired', t.repo);
    t2.setNow(1_006_000);
    await t2.store.getState().boot();
    expect(t2.store.getState().screen).toEqual({ name: 'runner', sessionId: id });
    const s = t2.store.getState().data.sessions[0];
    expect(s.events.some(e => e.k === 'answer' && e.q === 0 && e.c === 4)).toBe(true);
  });
  it('생존 기록 뒤 120초 넘게 지나 부팅하면 공백(closed) 기록', async () => {
    const t = setup();
    await t.store.getState().boot();
    const id = (await t.store.getState().startSession(draft({ policy: 'hard', scope: 'full', sectionIdx: null })))!;
    await t.repo.saveAlive(id, 1_000_000);
    const t2 = setup('acquired', t.repo);
    t2.setNow(1_600_000);
    await t2.store.getState().boot();
    const s = t2.store.getState().data.sessions.find(x => x.id === id)!;
    expect(s.events.some(e => e.k === 'gap' && e.cause === 'closed')).toBe(true);
  });
  it('메모와 답이 경합하지 않는다', async () => {
    const t = setup();
    await t.store.getState().boot();
    const id = (await t.store.getState().startSession(draft()))!;
    await t.store.getState().act(id, { type: 'startSection' });
    t.store.getState().setMemo(id, '12×3=36');
    await t.store.getState().act(id, { type: 'answer', q: 1, c: 2 });
    await t.store.getState().flushMemos();
    const l = await t.repo.loadAll();
    expect(l.data.memos[id]).toBe('12×3=36');
    expect(l.data.sessions[0].events.some(e => e.k === 'answer')).toBe(true);
  });
  it('진행 중 세션이 있으면 복원 거부', async () => {
    const t = setup();
    await t.store.getState().boot();
    await t.store.getState().startSession(draft());
    const r = await t.store.getState().restore('{"format":"apt-backup","schemaVersion":1,"data":{}}');
    expect(r).toEqual({ ok: false, reason: '진행 중인 세션을 끝낸 뒤 복원하세요' });
    expect((await t.repo.loadAll()).data.sessions).toHaveLength(1);
  });
  it('채점 저장 → graded, 결과 화면, 백업 1회, lastBackupAt', async () => {
    const t = setup();
    await t.store.getState().boot();
    const id = (await t.store.getState().startSession(draft()))!;
    await t.store.getState().act(id, { type: 'startSection' });
    await t.store.getState().act(id, { type: 'finish' });
    expect(t.store.getState().screen).toEqual({ name: 'key', sessionId: id });
    const setId = t.store.getState().data.sessions[0].setId!;
    await t.store.getState().saveKey(setId, [1, 2, 3]);
    await t.store.getState().completeGrading(id);
    expect(t.store.getState().data.sessions[0].status).toBe('graded');
    expect(t.store.getState().screen).toEqual({ name: 'result', sessionId: id });
    expect(t.downloads).toHaveLength(1);
    expect((await t.repo.loadAll()).meta.lastBackupAt).toBe(1_000_000);
  });
});
