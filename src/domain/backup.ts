// 백업 파일 형식, 검사, migrate(spec §11.2·§11.4). 모르는 필드는 보존한다.
import { APP_VERSION, SCHEMA_VERSION, type AllData } from './types';
import { DEFAULT_SETTINGS } from './profiles';

export interface BackupFile {
  format: 'apt-backup';
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  counts: { sessions: number; sets: number; imports: number };
  data: AllData;
}

const ARRAY_KEYS = ['profiles', 'sets', 'sessions', 'imports', 'taxonomy', 'aliases'] as const;

const REASON_FORMAT = '백업 파일 형식이 아닙니다';
const REASON_VERSION = '앱보다 새 버전의 백업입니다';
const REASON_DATA = '백업 데이터가 올바르지 않습니다';

export function emptyAllData(): AllData {
  return {
    profiles: [], sets: [], sessions: [], memos: {}, imports: [], taxonomy: [], aliases: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** 빠진 배열·객체만 기본값으로 채운다(모르는 키는 그대로 둔다). */
export function normalizeAllData(d: unknown): AllData {
  const src = isPlainObject(d) ? d : {};
  const base = emptyAllData();
  const out: Record<string, unknown> = { ...src };
  for (const k of ARRAY_KEYS) out[k] = Array.isArray(src[k]) ? src[k] : base[k];
  out.memos = isPlainObject(src.memos) ? src.memos : {};
  out.settings = { ...base.settings, ...(isPlainObject(src.settings) ? src.settings : {}) };
  return out as unknown as AllData;
}

export function buildBackup(all: AllData, now: number, appVersion = APP_VERSION): BackupFile {
  return {
    format: 'apt-backup',
    schemaVersion: SCHEMA_VERSION,
    appVersion,
    exportedAt: new Date(now).toISOString(),
    counts: { sessions: all.sessions.length, sets: all.sets.length, imports: all.imports.length },
    data: structuredClone(all),
  };
}

export function migrate(file: BackupFile): BackupFile {
  return { ...file, data: normalizeAllData(file.data) };
}

export function validateBackup(
  x: unknown,
  appSchemaVersion = SCHEMA_VERSION,
): { ok: true; file: BackupFile } | { ok: false; reason: string } {
  if (!isPlainObject(x) || x.format !== 'apt-backup') return { ok: false, reason: REASON_FORMAT };
  if (typeof x.schemaVersion !== 'number' || !Number.isFinite(x.schemaVersion)) return { ok: false, reason: REASON_FORMAT };
  if (x.schemaVersion > appSchemaVersion) return { ok: false, reason: REASON_VERSION };
  const data = x.data;
  if (!isPlainObject(data)) return { ok: false, reason: REASON_DATA };
  for (const k of ARRAY_KEYS) {
    if (data[k] !== undefined && !Array.isArray(data[k])) return { ok: false, reason: REASON_DATA };
  }
  if (data.memos !== undefined && !isPlainObject(data.memos)) return { ok: false, reason: REASON_DATA };
  return { ok: true, file: migrate(x as unknown as BackupFile) };
}

export function backupFileName(now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `apt-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}
