import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { AptDb } from './db';
import { createDexieRepo } from './repo';
import { mkSession } from '../domain/testkit';
import { emptyAllData } from '../domain/backup';
import { effectiveProfile } from '../domain/profiles';
import { buildDcatTemplate, buildSeedImport, buildSeedTaxonomy } from '../domain/seed';

let n = 0;
const fresh = () => createDexieRepo(new AptDb(`repo-test-${++n}`));

describe('repo', () => {
  it('captureDir kv survives data replacement and stays outside exported data', async () => {
    const repo = fresh();
    const handle = { name: 'ShareX' };
    await repo.setKv('captureDir', handle);
    await repo.replaceAll(emptyAllData());
    expect(await repo.getKv('captureDir')).toEqual(handle);
    expect(JSON.stringify((await repo.loadAll()).data)).not.toContain('ShareX');
  });
  it('imports, taxonomy and per-profile templates round-trip; deleting an import preserves the rest', async () => {
    const repo = fresh();
    const record = { ...buildSeedImport(123), extra: 'preserve' };
    const taxonomy = { ...buildSeedTaxonomy(), extra: 'preserve' };
    const ranges = buildDcatTemplate();
    await repo.saveImport(record);
    await repo.saveTaxonomy(taxonomy);
    await repo.saveTemplate('dcat', ranges);
    await repo.saveTemplate('lg-wayfit', []);
    const loaded = await repo.loadAll();
    expect(loaded.data.imports).toEqual([record]);
    expect(loaded.data.taxonomy).toEqual([taxonomy]);
    expect(loaded.templates).toEqual({ dcat: ranges, 'lg-wayfit': [] });
    await repo.deleteImport(record.id);
    const after = await repo.loadAll();
    expect(after.data.imports).toEqual([]);
    expect(after.data.taxonomy).toEqual([taxonomy]);
    expect(after.templates).toEqual(loaded.templates);
  });

  it('빈 DB는 기본값', async () => {
    const l = await fresh().loadAll();
    expect(l.data.sessions).toEqual([]);
    expect(l.data.settings).toEqual({ autoBackupDownload: true, sound: true, flash: true });
    expect(l.meta).toEqual({ lastBackupAt: null });
    expect(l.alive).toEqual({});
  });
  it('세션·메모·생존 기록·meta 왕복', async () => {
    const repo = fresh();
    await repo.saveSession(mkSession());
    await repo.saveMemo('S', '12×3');
    await repo.saveAlive('S', 777);
    await repo.saveMeta({ lastBackupAt: 5 });
    const l = await repo.loadAll();
    expect(l.data.sessions.map(s => s.id)).toEqual(['S']);
    expect(l.data.memos).toEqual({ S: '12×3' });
    expect(l.alive).toEqual({ S: 777 });
    expect(l.meta).toEqual({ lastBackupAt: 5 });
  });
  it('메모 저장과 세션 저장은 서로 덮어쓰지 않는다', async () => {
    const repo = fresh();
    const s = mkSession();
    await repo.saveSession(s);
    await repo.saveMemo(s.id, 'm');
    await repo.saveSession({ ...s, events: [{ t: 1, k: 'sectionStart', s: 0 }] });
    const l = await repo.loadAll();
    expect(l.data.memos[s.id]).toBe('m');
    expect(l.data.sessions[0].events).toHaveLength(1);
  });
  it('프로필 수정본 저장·삭제', async () => {
    const repo = fresh();
    const p = effectiveProfile('dcat', []);
    p.breakSec = 30;
    await repo.saveProfileOverride(p);
    expect((await repo.loadAll()).data.profiles[0].breakSec).toBe(30);
    await repo.deleteProfileOverride('dcat');
    expect((await repo.loadAll()).data.profiles).toEqual([]);
  });
  it('replaceAll: 전체 교체, meta는 유지', async () => {
    const repo = fresh();
    await repo.saveSession(mkSession());
    await repo.saveMeta({ lastBackupAt: 9 });
    await repo.replaceAll({ ...emptyAllData(), memos: { X: 'x' } });
    const l = await repo.loadAll();
    expect(l.data.sessions).toEqual([]);
    expect(l.data.memos).toEqual({ X: 'x' });
    expect(l.meta.lastBackupAt).toBe(9);
  });
  it('replaceAll 중간 실패 시 원본 유지', async () => {
    const repo = fresh();
    await repo.saveSession(mkSession());
    const bad = { ...emptyAllData(), sessions: [{ ...mkSession(), id: 'X', bad: () => 1 } as never] };
    await expect(repo.replaceAll(bad)).rejects.toThrow();
    expect((await repo.loadAll()).data.sessions.map(s => s.id)).toEqual(['S']);
  });
  it('template replacement rolls back with the rest of the data when a template write fails', async () => {
    const repo = fresh();
    await repo.saveSession(mkSession());
    await repo.saveTemplate('dcat', []);
    await repo.saveTemplate('obsolete', []);
    const before = await repo.loadAll();
    const bad = { ...emptyAllData(), templates: { dcat: [{ from: 0, to: 1, familyId: 'A', bad: () => 1 }] } };
    await expect(repo.replaceAll(bad)).rejects.toThrow();
    expect(await repo.loadAll()).toEqual(before);
  });
});
