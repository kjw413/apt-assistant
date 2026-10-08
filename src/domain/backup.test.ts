import { describe, it, expect } from 'vitest';
import { buildBackup, validateBackup, migrate, backupFileName, emptyAllData, type BackupFile } from './backup';
import { mkSession } from './testkit';
import type { AllData } from './types';

const data = (): AllData => ({ ...emptyAllData(), sessions: [mkSession()], memos: { S: '메모' } });

describe('backup', () => {
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
  ])('잘못된 파일 거부 #%#', (x, word) => {
    const r = validateBackup(x);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(word);
  });
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
