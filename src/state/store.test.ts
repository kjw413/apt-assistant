import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { createAppStore } from './store';
import { AptDb } from '../data/db';
import { createDexieRepo, type Repo } from '../data/repo';
import type { SetupDraft } from '../domain/types';
import { buildBackup, emptyAllData } from '../domain/backup';
import { buildDcatTemplate, buildSeedTaxonomy } from '../domain/seed';
import { questionViews } from '../domain/derive';
import { summarize } from '../domain/grading';
import { mkSession } from '../domain/testkit';

let n = 0;
function setup(lock: 'acquired' | 'busy' | 'unsupported' = 'acquired', repo?: Repo) {
  const r = repo ?? createDexieRepo(new AptDb(`store-test-${++n}`));
  let now = 1_000_000;
  const downloads: string[] = [];
  const backupTexts: string[] = [];
  const store = createAppStore({
    repo: r, now: () => now, download: (name, text) => { downloads.push(name); backupTexts.push(text); }, acquireLock: async () => lock,
  });
  return { store, repo: r, downloads, backupTexts, setNow: (t: number) => { now = t; } };
}
const draft = (o: Partial<SetupDraft> = {}): SetupDraft => ({
  profileId: 'dcat', scope: 'drill', mode: 'omr', policy: 'soft', sectionIdx: 2, drillCount: 3, drillSeconds: 180,
  setId: null, newSetName: '', startNo: 1, numberingMode: 'continuous', label: '', ...o,
});

async function externalDone(t: ReturnType<typeof setup>, profileId = 'dcat') {
  await t.store.getState().boot();
  const id = (await t.store.getState().startSession(draft({ mode: 'external', profileId, label: '외부 모의 2회' })))!;
  const count = t.store.getState().data.sessions.find(s => s.id === id)!.plan.length;
  for (let idx = 0; idx < count; idx++) {
    await t.store.getState().act(id, { type: 'startSection' });
    await t.store.getState().act(id, { type: 'endSection' });
  }
  return id;
}

describe('P2 persistence and actions', () => {
  it('template A is backed up and replaces template B on restore', async () => {
    const t = setup();
    await t.store.getState().boot();
    const id = (await t.store.getState().startSession(draft({ scope: 'full', sectionIdx: null })))!;
    const setId = t.store.getState().data.sessions[0].setId!;
    await t.store.getState().act(id, { type: 'abandon' });
    const a = [{ from: 0, to: 74, familyId: 'A' }];
    const b = [{ from: 0, to: 74, familyId: 'B' }];
    await t.store.getState().saveRanges(setId, a);
    await t.store.getState().saveTemplateFromSet(setId);
    await t.store.getState().exportNow();
    const backup = t.backupTexts.at(-1)!;
    await t.store.getState().saveRanges(setId, b);
    await t.store.getState().saveTemplateFromSet(setId);
    await t.repo.saveTemplate('obsolete', b);
    expect(await t.store.getState().restore(backup)).toEqual({ ok: true });
    expect(t.store.getState().templates).toEqual({ dcat: a });
    expect((await t.repo.loadAll()).templates).toEqual({ dcat: a });
    expect(JSON.parse(backup).data.templates).toEqual({ dcat: a });
  });

  it('restoring a legacy backup into an empty DB seeds the missing DCAT template even when seeded is true', async () => {
    const t = setup();
    const legacy = { ...emptyAllData(), settings: { ...emptyAllData().settings, seeded: true } };
    delete (legacy as unknown as Record<string, unknown>).templates;
    const backup = JSON.parse(JSON.stringify(buildBackup(legacy, 0)));
    delete backup.data.templates;
    await t.repo.replaceAll(backup.data);
    await t.store.getState().boot();
    expect(t.store.getState().templates.dcat).toEqual(buildDcatTemplate());
    expect((await t.repo.loadAll()).templates.dcat).toEqual(buildDcatTemplate());
    expect(t.store.getState().data.imports).toEqual([]);
  });

  it('legacy restore replaces existing templates then immediately seeds missing DCAT without reseeding imports', async () => {
    const t = setup();
    await t.store.getState().boot();
    const id = (await t.store.getState().startSession(draft({ scope: 'full', sectionIdx: null })))!;
    const setId = t.store.getState().data.sessions[0].setId!;
    await t.store.getState().act(id, { type: 'abandon' });
    await t.store.getState().saveRanges(setId, []);
    await t.store.getState().saveTemplateFromSet(setId);
    await t.repo.saveTemplate('obsolete', []);
    const backup = buildBackup({ ...emptyAllData(), settings: { ...emptyAllData().settings, seeded: true } }, 0);
    delete (backup.data as unknown as Record<string, unknown>).templates;
    expect(await t.store.getState().restore(JSON.stringify(backup))).toEqual({ ok: true });
    expect(t.store.getState().templates).toEqual({ dcat: buildDcatTemplate() });
    expect((await t.repo.loadAll()).templates).toEqual({ dcat: buildDcatTemplate() });
    expect(t.store.getState().data.imports).toEqual([]);
  });

  it('external question views use stored answers even without answer events and never infer question times', () => {
    const s = { ...mkSession({ mode: 'external' }), externalAnswers: [2, null, 3, 4, 5] };
    const ps = { id: 'set1', name: 'external', profileId: 'dcat', layout: [], choices: 5,
      numbering: { startNo: 1, mode: 'continuous' as const }, key: [2, 1, 3, 4, 5], ranges: [],
      createdAt: 0, updatedAt: 0, schemaVersion: 1 };
    const views = questionViews(s, ps);
    expect(views.map(v => v.answer)).toEqual([2, null, 3, 4, 5]);
    expect(views.map(v => v.correct)).toEqual([true, false, true, true, true]);
    expect(views.every(v => v.timeSec === null && v.answeredAt === null && v.inLimitAnswer === v.answer)).toBe(true);
  });

  it('seeds once; deleting the first-round import survives reboot', async () => {
    const t = setup();
    await t.store.getState().boot();
    const loaded = await t.repo.loadAll();
    expect(loaded.data.imports).toHaveLength(1);
    expect(loaded.data.imports[0]).toMatchObject({ id: 'seed-passsidae-dcat-r1', status: 'confirmed', overtime: true });
    expect(loaded.data.taxonomy).toEqual([buildSeedTaxonomy()]);
    expect(loaded.templates).toEqual({ dcat: buildDcatTemplate() });
    expect(loaded.data.settings.seeded).toBe(true);
    await t.store.getState().deleteImport('seed-passsidae-dcat-r1');
    const next = setup('acquired', t.repo);
    await next.store.getState().boot();
    expect(next.store.getState().data.imports).toEqual([]);
    expect((await t.repo.loadAll()).data.imports).toEqual([]);
    expect(next.store.getState().data.taxonomy).toEqual(loaded.data.taxonomy);
    expect(next.store.getState().templates).toEqual(loaded.templates);
  });

  it('a failed seed write leaves seeded unset and boot retry completes the seed', async () => {
    const repo = createDexieRepo(new AptDb(`store-test-${++n}`));
    let fail = true;
    const t = setup('acquired', { ...repo, saveTemplate: async (id, ranges) => {
      if (fail) throw new Error('seed write failed');
      await repo.saveTemplate(id, ranges);
    } });
    await t.store.getState().boot();
    expect(t.store.getState().ready).toBe(false);
    expect(t.store.getState().bootError).toBe('seed write failed');
    expect((await repo.loadAll()).data.settings.seeded).toBeUndefined();
    fail = false;
    await t.store.getState().boot();
    expect(t.store.getState().ready).toBe(true);
    expect((await repo.loadAll()).data.imports).toHaveLength(1);
    expect((await repo.loadAll()).data.settings.seeded).toBe(true);
  });

  it('external grading parses both inputs, persists a full set, derives untimed answers and backs up once', async () => {
    const t = setup();
    const id = await externalDone(t);
    t.setNow(1_100_000);
    const answers = '①２30-'.repeat(15);
    const key = '１２③4⑤'.repeat(15);
    const results = await Promise.all([
      t.store.getState().gradeExternal(id, answers, key),
      t.store.getState().gradeExternal(id, answers, key),
    ]);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    const loaded = await t.repo.loadAll();
    expect(loaded.data.sets).toHaveLength(1);
    const s = loaded.data.sessions[0];
    const ps = loaded.data.sets[0];
    expect(s).toMatchObject({ status: 'graded', setId: ps.id, externalAnswers: Array.from({ length: 15 }, () => [1, 2, 3, null, null]).flat() });
    expect(ps).toMatchObject({ name: '외부 모의 2회', profileId: 'dcat', ranges: buildDcatTemplate(), key: Array.from({ length: 15 }, () => [1, 2, 3, 4, 5]).flat(), schemaVersion: 1 });
    expect(ps.layout.map(p => p.count)).toEqual([20, 15, 20, 10, 10]);
    const views = questionViews(s, ps);
    expect(views).toHaveLength(75);
    expect(views.map(v => v.answer)).toEqual(s.externalAnswers);
    expect(views.every(v => v.inLimitAnswer === v.answer && v.timeSec === null && v.answeredAt === null && !v.overtime)).toBe(true);
    expect(summarize(views, s)).toMatchObject({ n: 75, correct: 45, inLimitCorrect: 45, unanswered: 30 });
    expect(t.store.getState().screen).toEqual({ name: 'result', sessionId: id });
    expect(t.downloads).toHaveLength(1);
    expect(loaded.meta.lastBackupAt).toBe(1_100_000);
    const next = setup('acquired', t.repo);
    await next.store.getState().boot();
    expect(next.store.getState().data.sessions[0]).toEqual(s);
  });

  it.each([
    ['1'.repeat(74), '1'.repeat(75)],
    ['1'.repeat(76), '1'.repeat(75)],
    ['1'.repeat(75), '1'.repeat(74)],
    ['1'.repeat(75), '1'.repeat(76)],
    ['x' + '1'.repeat(74), '1'.repeat(75)],
    ['1'.repeat(75), '6' + '1'.repeat(74)],
  ])('external grading refuses length mismatches or invalid characters', async (answers, key) => {
    const t = setup();
    const id = await externalDone(t);
    const before = await t.repo.loadAll();
    const result = await t.store.getState().gradeExternal(id, answers, key);
    expect(result.ok).toBe(false);
    expect(result).toHaveProperty('reason', expect.any(String));
    expect(await t.repo.loadAll()).toEqual(before);
    expect(t.downloads).toEqual([]);
  });

  it('LG external grading expects 80 answers and has no DCAT template', async () => {
    const t = setup();
    const id = await externalDone(t, 'lg-wayfit');
    expect((await t.store.getState().gradeExternal(id, '1'.repeat(75), '1'.repeat(75))).ok).toBe(false);
    await t.store.getState().saveSettings({ autoBackupDownload: false });
    expect(await t.store.getState().gradeExternal(id, '1'.repeat(80), '1'.repeat(80))).toEqual({ ok: true });
    expect((await t.repo.loadAll()).data.sets[0]).toMatchObject({ profileId: 'lg-wayfit', ranges: [] });
    expect(t.downloads).toEqual([]);
  });

  it('ranges persist after reboot and templates are copied only to new DCAT full sets', async () => {
    const t = setup();
    await t.store.getState().boot();
    const id = (await t.store.getState().startSession(draft({ scope: 'full', sectionIdx: null })))!;
    const setId = t.store.getState().data.sessions[0].setId!;
    expect(t.store.getState().data.sets[0].ranges).toEqual(buildDcatTemplate());
    await t.store.getState().act(id, { type: 'abandon' });
    const ranges = [{ from: 0, to: 74, familyId: '자료해석', leafId: '자료계산(표)' }];
    t.setNow(1_001_000);
    await t.store.getState().saveRanges(setId, ranges);
    ranges[0].familyId = 'caller mutation';
    await t.store.getState().saveTemplateFromSet(setId);
    const next = setup('acquired', t.repo);
    await next.store.getState().boot();
    const saved = [{ from: 0, to: 74, familyId: '자료해석', leafId: '자료계산(표)' }];
    expect(next.store.getState().data.sets[0]).toMatchObject({ ranges: saved, updatedAt: 1_001_000 });
    expect(next.store.getState().templates.dcat).toEqual(saved);
    const id2 = (await next.store.getState().startSession(draft({ scope: 'full', sectionIdx: null })))!;
    const set2 = next.store.getState().data.sets[1];
    expect(set2.ranges).toEqual(saved);
    expect(set2.ranges).not.toBe(next.store.getState().templates.dcat);
    expect(set2.ranges[0]).not.toBe(next.store.getState().templates.dcat[0]);
    await next.store.getState().saveRanges(set2.id, []);
    expect(next.store.getState().templates.dcat).toEqual(saved);
    expect(next.store.getState().data.sets[0].ranges).toEqual(saved);
    await next.store.getState().act(id2, { type: 'abandon' });
    for (const overrides of [{ scope: 'section' as const, sectionIdx: 0 }, { scope: 'drill' as const }, { scope: 'full' as const, profileId: 'lg-wayfit', sectionIdx: null }]) {
      const sid = (await next.store.getState().startSession(draft(overrides)))!;
      const ps = next.store.getState().data.sets.at(-1)!;
      expect(ps.ranges).toEqual([]);
      await next.store.getState().act(sid, { type: 'abandon' });
    }
    const externalId = await externalDone(next);
    await next.store.getState().gradeExternal(externalId, '1'.repeat(75), '1'.repeat(75));
    expect(next.store.getState().data.sets.at(-1)!.ranges).toEqual(saved);
  });

  it('adding families preserves existing taxonomy, ignores blank/duplicate names and persists LG taxonomy', async () => {
    const t = setup();
    await t.store.getState().boot();
    await t.store.getState().addFamily('dcat', ' 새 유형 ');
    await t.store.getState().addFamily('dcat', '새 유형');
    await t.store.getState().addFamily('dcat', ' ');
    await t.store.getState().addFamily('lg-wayfit', '새 유형');
    const next = setup('acquired', t.repo);
    await next.store.getState().boot();
    const dcat = next.store.getState().data.taxonomy.find(t => t.profileId === 'dcat')!;
    expect(dcat.families).toEqual([...buildSeedTaxonomy().families, { id: '새 유형', name: '새 유형', sectionHint: [] }]);
    expect(dcat.leaves).toEqual(buildSeedTaxonomy().leaves);
    expect(next.store.getState().data.taxonomy.find(t => t.profileId === 'lg-wayfit')).toEqual({ profileId: 'lg-wayfit', families: [{ id: '새 유형', name: '새 유형', sectionHint: [] }], leaves: [] });
  });
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
