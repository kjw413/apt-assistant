// 저장소 구현. kv 키: settings, meta, memo:<sessionId>, alive:<sessionId>(spec §6.4).
import type { AptDb } from './db';
import { normalizeAllData } from '../domain/backup';
import { DEFAULT_SETTINGS } from '../domain/profiles';
import type { AllData, ExamProfile, ImportRecord, ProblemSet, Session, Settings, Taxonomy } from '../domain/types';

type Ranges = ProblemSet['ranges'];

export interface Meta {
  lastBackupAt: number | null;
}

export interface Loaded {
  data: AllData;
  meta: Meta;
  alive: Record<string, number>;
  templates: Record<string, Ranges>;
}

export interface Repo {
  loadAll(): Promise<Loaded>;
  saveSession(s: Session): Promise<void>;
  saveSet(p: ProblemSet): Promise<void>;
  saveProfileOverride(p: ExamProfile): Promise<void>;
  deleteProfileOverride(id: string): Promise<void>;
  saveImport(i: ImportRecord): Promise<void>;
  deleteImport(id: string): Promise<void>;
  saveTaxonomy(t: Taxonomy): Promise<void>;
  saveTemplate(profileId: string, ranges: Ranges): Promise<void>;
  saveMemo(sessionId: string, text: string): Promise<void>;
  saveSettings(s: Settings): Promise<void>;
  saveMeta(m: Meta): Promise<void>;
  saveAlive(sessionId: string, at: number): Promise<void>;
  replaceAll(d: AllData): Promise<void>;
  requestPersist(): Promise<boolean>;
}

export function createDexieRepo(db: AptDb): Repo {
  const tables = () => [db.profiles, db.sets, db.sessions, db.imports, db.taxonomy, db.aliases, db.kv];

  return {
    async loadAll() {
      const [profiles, sets, sessions, imports, taxonomy, aliases, kv] = await db.transaction('r', tables(), () =>
        Promise.all([
          db.profiles.toArray(), db.sets.toArray(), db.sessions.toArray(), db.imports.toArray(),
          db.taxonomy.toArray(), db.aliases.toArray(), db.kv.toArray(),
        ]),
      );
      const memos: Record<string, string> = {};
      const alive: Record<string, number> = {};
      const templates: Record<string, Ranges> = {};
      let settings: Settings = { ...DEFAULT_SETTINGS };
      let meta: Meta = { lastBackupAt: null };
      for (const row of kv) {
        if (row.key === 'settings') settings = { ...DEFAULT_SETTINGS, ...(row.value as Partial<Settings>) };
        else if (row.key === 'meta') meta = { lastBackupAt: null, ...(row.value as Partial<Meta>) };
        else if (row.key.startsWith('memo:')) memos[row.key.slice(5)] = String(row.value ?? '');
        else if (row.key.startsWith('alive:')) alive[row.key.slice(6)] = Number(row.value);
        else if (row.key.startsWith('template:')) templates[row.key.slice(9)] = row.value as Ranges;
      }
      return { data: { profiles, sets, sessions, memos, imports, taxonomy, aliases, settings }, meta, alive, templates };
    },
    async saveSession(s) {
      await db.sessions.put(s);
    },
    async saveSet(p) {
      await db.sets.put(p);
    },
    async saveProfileOverride(p) {
      await db.profiles.put(p);
    },
    async deleteProfileOverride(id) {
      await db.profiles.delete(id);
    },
    async saveImport(i) {
      await db.imports.put(i);
    },
    async deleteImport(id) {
      await db.imports.delete(id);
    },
    async saveTaxonomy(t) {
      await db.taxonomy.put(t);
    },
    async saveTemplate(profileId, ranges) {
      await db.kv.put({ key: `template:${profileId}`, value: ranges });
    },
    async saveMemo(sessionId, text) {
      await db.kv.put({ key: `memo:${sessionId}`, value: text });
    },
    async saveSettings(s) {
      await db.kv.put({ key: 'settings', value: s });
    },
    async saveMeta(m) {
      await db.kv.put({ key: 'meta', value: m });
    },
    async saveAlive(sessionId, at) {
      await db.kv.put({ key: `alive:${sessionId}`, value: at });
    },
    async replaceAll(d) {
      const data = normalizeAllData(d);
      await db.transaction('rw', tables(), async () => {
        await Promise.all([
          db.profiles.clear(), db.sets.clear(), db.sessions.clear(),
          db.imports.clear(), db.taxonomy.clear(), db.aliases.clear(),
        ]);
        const kvKeys = await db.kv.toCollection().primaryKeys();
        await db.kv.bulkDelete(kvKeys.filter(k => k === 'settings' || String(k).startsWith('memo:')));
        await db.profiles.bulkPut(data.profiles);
        await db.sets.bulkPut(data.sets);
        await db.sessions.bulkPut(data.sessions);
        await db.imports.bulkPut(data.imports);
        await db.taxonomy.bulkPut(data.taxonomy);
        await db.aliases.bulkPut(data.aliases);
        await db.kv.bulkPut([
          { key: 'settings', value: data.settings },
          ...Object.entries(data.memos).map(([id, text]) => ({ key: `memo:${id}`, value: text })),
        ]);
      });
    },
    async requestPersist() {
      try {
        return (await navigator.storage?.persist?.()) ?? false;
      } catch {
        return false;
      }
    },
  };
}
