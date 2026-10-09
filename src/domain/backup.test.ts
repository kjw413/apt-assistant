import { describe, it, expect } from 'vitest';
import { buildBackup, validateBackup, migrate, normalizeAllData, backupFileName, emptyAllData, type BackupFile } from './backup';
import { mkSession } from './testkit';
import type { AllData } from './types';

const data = (): AllData => ({ ...emptyAllData(), sessions: [mkSession()], memos: { S: '메모' } });

describe('backup', () => {
  it('missing templates normalize to an empty record in old backups', () => {
    const old = data();
    delete (old as unknown as Record<string, unknown>).templates;
    expect(normalizeAllData(old)).toHaveProperty('templates', {});
    expect(buildBackup(old, 0).data).toHaveProperty('templates', {});
    const backup = buildBackup(old, 0);
    delete (backup.data as unknown as Record<string, unknown>).templates;
    const result = validateBackup(backup);
    expect(result.ok && result.file.data).toHaveProperty('templates', {});
  });
  it('왕복', () => {
    const f = buildBackup(data(), Date.UTC(2026, 9, 9, 12, 30));
    expect(f.counts).toEqual({ sessions: 1, sets: 0, imports: 0 });
    const r = validateBackup(JSON.parse(JSON.stringify(f)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.file.data).toEqual(data());
  });
  it.each([
    [null, '형식'],
    ['x', '형식'],
    [{ format: 'other' }, '형식'],
    [{ format: 'apt-backup', schemaVersion: 2, data: {} }, '새 버전'],
    [{ format: 'apt-backup', schemaVersion: 1, data: { sessions: 'x' } }, '데이터'],
    [{ format: 'apt-backup', schemaVersion: 1, data: {} }, '데이터'],
  ])('잘못된 파일 거부 #%#', (x, word) => {
    const r = validateBackup(x);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(word);
  });
  it.each([
    ['profiles', [{ id: 1, sections: [] }]],
    ['sets', [{ id: 1, layout: [] }]],
    ['sessions', [{ id: 1, plan: [], events: [] }]],
    ['sessions', [{ id: 'S', plan: 'x', events: [] }]],
    ['sessions', [{ id: 'S', plan: [], events: 'x' }]],
    ['memos', []],
    ['settings', []],
  ])('필수 데이터의 잘못된 형태를 거부', (key, value) => {
    const f = buildBackup(data(), 0);
    (f.data as unknown as Record<string, unknown>)[key] = value;
    const r = validateBackup(f);
    expect(r).toEqual({ ok: false, reason: '백업 데이터가 올바르지 않습니다' });
  });
  it.each(['profiles', 'sets', 'sessions', 'imports', 'taxonomy', 'aliases', 'memos', 'settings'])(
    '필수 데이터 %s가 없으면 거부',
    (key) => {
      const f = buildBackup(data(), 0);
      delete (f.data as unknown as Record<string, unknown>)[key];
      expect(validateBackup(f)).toEqual({ ok: false, reason: '백업 데이터가 올바르지 않습니다' });
    },
  );
  it('migrate는 빠진 배열을 채우고 멱등', () => {
    const f = buildBackup(data(), 0);
    const partial = { ...f, data: { ...f.data, aliases: undefined } } as unknown as BackupFile;
    const m1 = migrate(partial);
    expect(m1.data.aliases).toEqual([]);
    expect(migrate(m1)).toEqual(m1);
  });
  it('모르는 필드를 보존', () => {
    const f = buildBackup(data(), 0);
    (f.data.sessions[0] as unknown as Record<string, unknown>).futureField = 42;
    const r = validateBackup(JSON.parse(JSON.stringify(f)));
    expect(r.ok && (r.file.data.sessions[0] as unknown as Record<string, unknown>).futureField).toBe(42);
  });
  it('파일 이름은 로컬 시각', () => {
    expect(backupFileName(new Date(2026, 9, 9, 21, 5).getTime())).toBe('apt-backup-20261009-2105.json');
  });
});
