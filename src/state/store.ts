import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Meta, Repo } from '../data/repo';
import { backupFileName, buildBackup, emptyAllData, normalizeAllData, validateBackup } from '../domain/backup';
import { lastEventT } from '../domain/events';
import { parseKey } from '../domain/grading';
import { buildDcatTemplate, buildSeedImport, buildSeedTaxonomy } from '../domain/seed';
import { defaultDrillSeconds, effectiveProfile, makePlan, makeSetLayout, validateProfileEdit } from '../domain/profiles';
import { advance, catchUpAfterGap, createSession, isGap, reduce, type SessionAction } from '../domain/session';
import { isFutureDocument, SCHEMA_VERSION, type AllData, type ExamProfile, type ProblemSet, type Session, type Settings, type SetupDraft, type Taxonomy } from '../domain/types';
import { compatibleSets } from '../ui/screens/setupLogic';

export type Screen =
  | { name: 'home' } | { name: 'setup' } | { name: 'settings' } | { name: 'blocked' }
  | { name: 'runner'; sessionId: string } | { name: 'key'; sessionId: string }
  | { name: 'externalKey'; sessionId: string }
  | { name: 'analysis' }
  | { name: 'result'; sessionId: string } | { name: 'externalSummary'; sessionId: string };
export interface AppState {
  ready: boolean; bootError: string | null; screen: Screen; data: AllData; meta: Meta;
  templates: Record<string, ProblemSet['ranges']>;
  lockWarning: boolean; persisted: boolean | null; saveError: string | null; toast: string | null;
}
export interface AppActions {
  boot(): Promise<void>;
  go(screen: Screen): void;
  startSession(draft: SetupDraft): Promise<string | null>;
  act(sessionId: string, action: SessionAction): Promise<string | undefined>;
  tick(): Promise<void>;
  setMemo(sessionId: string, text: string): void;
  flushMemos(): Promise<void>;
  saveKey(setId: string, key: (number | null)[]): Promise<void>;
  gradeExternal(sessionId: string, answersText: string, keyText: string): Promise<{ ok: true } | { ok: false; reason: string }>;
  saveRanges(setId: string, ranges: ProblemSet['ranges']): Promise<void>;
  saveTemplateFromSet(setId: string): Promise<void>;
  addFamily(profileId: string, name: string): Promise<void>;
  deleteImport(id: string): Promise<void>;
  completeGrading(sessionId: string): Promise<void>;
  gradeLater(sessionId: string): Promise<void>;
  confirmExternal(sessionId: string): Promise<void>;
  saveProfile(p: ExamProfile): Promise<{ ok: true } | { ok: false; errors: { path: string; msg: string }[] }>;
  resetProfile(id: string): Promise<void>;
  saveSettings(patch: Partial<Settings>): Promise<void>;
  exportNow(): Promise<void>;
  restore(text: string): Promise<{ ok: boolean; reason?: string }>;
}
export interface Deps {
  repo: Repo; now: () => number;
  download: (filename: string, text: string) => void;
  acquireLock: () => Promise<'acquired' | 'busy' | 'unsupported'>;
}

function activeSession(data: AllData): Session | undefined {
  return data.sessions.reduce<Session | undefined>((latest, s) =>
    !isFutureDocument(s) && s.status === 'in_progress' && (!latest || s.createdAt > latest.createdAt) ? s : latest, undefined);
}

function sessionScreen(s: Session): Screen {
  if (s.status === 'in_progress') return { name: 'runner', sessionId: s.id };
  if (s.status === 'awaiting_key') return { name: 'key', sessionId: s.id };
  if (s.status === 'external_done') return { name: 'externalSummary', sessionId: s.id };
  return { name: 'home' };
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function localDateTime(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function unbackedCount(data: AllData, meta: Meta): number {
  const at = meta.lastBackupAt;
  if (at === null) return data.sessions.length + data.sets.length;
  return data.sessions.filter(s => Math.max(s.createdAt, s.finishedAt ?? 0, lastEventT(s)) > at).length
    + data.sets.filter(s => s.updatedAt > at).length;
}

export function createAppStore(deps: Deps): StoreApi<AppState & AppActions> {
  const { repo } = deps;
  let blocked = false;
  let starting = false;
  let restoring = false;
  let booting: Promise<void> | null = null;
  let heldLock: 'acquired' | 'unsupported' | null = null;
  let lastTickAt: number | null = null;
  let lastAliveAt: number | null = null;
  let saveQueue: Promise<void> = Promise.resolve();
  type Write = () => Promise<void>;
  const pendingWrites = new Map<string, Write>();
  const memoTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const pendingMemos = new Set<string>();
  const backupConfirmations = new Map<string, Promise<void>>();

  return createStore<AppState & AppActions>()((set, get) => {
    const writable = () => get().ready && !blocked && !restoring && get().screen.name !== 'blocked';
    const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

    // Failed writes stay pending. Each queued call reads current state, not an old snapshot.
    function save(...writes: [string, Write][]): Promise<boolean> {
      for (const [key, write] of writes) pendingWrites.set(key, write);
      const result = saveQueue.then(async () => {
        for (const [key, write] of [...pendingWrites]) {
          try {
            await write();
            if (pendingWrites.get(key) === write) pendingWrites.delete(key);
          } catch (error) {
            set({ saveError: errorMessage(error) });
            return false;
          }
        }
        if (pendingWrites.size === 0) set({ saveError: null });
        return true;
      });
      saveQueue = result.then(() => {});
      return result;
    }

    function sessionWrite(id: string): [string, Write] {
      return [`session:${id}`, async () => {
        const s = get().data.sessions.find(s => s.id === id);
        if (s) await repo.saveSession(s);
      }];
    }

    function setWrite(id: string): [string, Write] {
      return [`set:${id}`, async () => {
        const s = get().data.sets.find(s => s.id === id);
        if (s) await repo.saveSet(s);
      }];
    }

    function profileWrite(id: string): [string, Write] {
      return [`profile:${id}`, async () => {
        const p = get().data.profiles.find(p => p.id === id);
        if (p) await repo.saveProfileOverride(p);
        else await repo.deleteProfileOverride(id);
      }];
    }

    function taxonomyWrite(id: string): [string, Write] {
      return [`taxonomy:${id}`, async () => {
        const taxonomy = get().data.taxonomy.find(t => t.profileId === id);
        if (taxonomy) await repo.saveTaxonomy(taxonomy);
      }];
    }

    function templateWrite(id: string): [string, Write] {
      return [`template:${id}`, () => repo.saveTemplate(id, get().templates[id] ?? [])];
    }

    async function seed(): Promise<void> {
      if (get().data.settings.seeded) {
        // Old backups can have the seed marker without the v0.2 template.
        if (get().templates.dcat === undefined) {
          set(state => ({ templates: { ...state.templates, dcat: buildDcatTemplate() } }));
          if (!await save(templateWrite('dcat'))) throw new Error(get().saveError ?? '초기 틀을 저장하지 못했습니다');
        }
        return;
      }
      const record = buildSeedImport(deps.now());
      const taxonomy = buildSeedTaxonomy();
      const original = get().data.taxonomy.find(t => t.profileId === 'dcat');
      // An interrupted first boot or existing user taxonomy must not lose edits.
      const merged: Taxonomy = original ? {
        ...original,
        families: [...original.families, ...taxonomy.families.filter(f => !original.families.some(x => x.id === f.id))],
        leaves: [...original.leaves, ...taxonomy.leaves.filter(l => !original.leaves.some(x => x.id === l.id && x.familyId === l.familyId))],
      } : taxonomy;
      set(state => ({
        data: {
          ...state.data,
          imports: state.data.imports.some(i => i.id === record.id) ? state.data.imports : [...state.data.imports, record],
          taxonomy: original ? state.data.taxonomy.map(t => t.profileId === 'dcat' ? merged : t) : [...state.data.taxonomy, merged],
        },
        templates: { ...state.templates, dcat: state.templates.dcat ?? buildDcatTemplate() },
      }));
      const existing = get().data.imports.find(i => i.id === record.id)!;
      if (!await save(
        ...(!isFutureDocument(existing) ? [[`import:${record.id}`, () => repo.saveImport(existing)] as [string, Write]] : []),
        taxonomyWrite('dcat'), templateWrite('dcat'),
      )) throw new Error(get().saveError ?? '초기 기록을 저장하지 못했습니다');
      // The marker is written last so a failed seed can be retried on boot.
      set(state => ({ data: { ...state.data, settings: { ...state.data.settings, seeded: true } } }));
      if (!await save(['settings', () => repo.saveSettings(get().data.settings)])) {
        throw new Error(get().saveError ?? '초기 기록을 저장하지 못했습니다');
      }
    }

    function updateSession(s: Session): void {
      set(state => ({ data: { ...state.data, sessions: state.data.sessions.map(x => x.id === s.id ? s : x) } }));
    }

    function navigateStatus(before: Session, after: Session): void {
      if (before.status !== after.status) set({ screen: sessionScreen(after) });
    }

    async function recoverActive(data: AllData, alive: Record<string, number>, now: number): Promise<void> {
      const s = activeSession(data);
      lastTickAt = now;
      lastAliveAt = s ? (alive[s.id] ?? now) : null;
      if (!s) {
        set({ screen: { name: 'home' } });
        return;
      }
      const lastSeen = alive[s.id] ?? lastEventT(s);
      const gap = isGap(lastSeen, now);
      const caughtUp = gap ? catchUpAfterGap(s, lastSeen, now, 'closed') : s;
      if (gap) set({ toast: '창이 닫힌 동안의 공백을 반영했습니다' });
      const next = advance(caughtUp, now);
      if (next !== s) {
        updateSession(next);
        if (!await save(sessionWrite(s.id))) throw new Error(get().saveError ?? '세션 복구를 저장하지 못했습니다');
      }
      set({ screen: sessionScreen(next) });
    }

    function memoWrite(id: string): [string, Write] {
      const timer = memoTimers.get(id);
      if (timer !== undefined) clearTimeout(timer);
      memoTimers.delete(id);
      pendingMemos.delete(id);
      return [`memo:${id}`, () => repo.saveMemo(id, get().data.memos[id] ?? '')];
    }

    function flushMemos(): Promise<boolean> {
      return save(...[...pendingMemos].map(memoWrite));
    }

    async function downloadBackup(): Promise<boolean> {
      const now = deps.now();
      try {
        const text = JSON.stringify(buildBackup({ ...get().data, templates: get().templates }, now));
        deps.download(backupFileName(now), text);
      } catch (error) {
        set({ saveError: errorMessage(error) });
        return false;
      }
      set(state => ({ meta: { ...state.meta, lastBackupAt: now } }));
      return save(['meta', () => repo.saveMeta(get().meta)]);
    }

    function autoBackup(id: string): Promise<void> {
      if (!get().data.settings.autoBackupDownload) return Promise.resolve();
      const confirmed = backupConfirmations.get(id);
      if (confirmed) return confirmed;
      // The first confirmation owns the download, including concurrent clicks.
      const confirmation = downloadBackup().then(saved => {
        if (!saved) backupConfirmations.delete(id);
      });
      backupConfirmations.set(id, confirmation);
      return confirmation;
    }

    return {
      ready: false, bootError: null, screen: { name: 'home' }, data: emptyAllData(), meta: { lastBackupAt: null }, templates: {},
      lockWarning: false, persisted: null, saveError: null, toast: null,

      boot() {
        if (booting) return booting;
        if (get().ready) return Promise.resolve();
        set({ bootError: null });
        booting = (async () => {
          try {
            const lock = heldLock ?? await deps.acquireLock();
            if (lock === 'busy') {
              blocked = true;
              set({ ready: true, screen: { name: 'blocked' } });
              return;
            }
            heldLock = lock;
            set({ lockWarning: lock === 'unsupported' });
            const persisted = await repo.requestPersist();
            set({ persisted });
            const loaded = await repo.loadAll();
            const data = normalizeAllData(loaded.data);
            set({ data, meta: { ...loaded.meta }, templates: structuredClone(loaded.templates) });
            await seed();
            await recoverActive(get().data, loaded.alive, deps.now());
            set({ ready: true });
          } catch (error) {
            set({ bootError: errorMessage(error), ready: false });
          } finally {
            booting = null;
          }
        })();
        return booting;
      },

      go(screen) {
        if ('sessionId' in screen && get().data.sessions.some(s => s.id === screen.sessionId && isFutureDocument(s))) {
          set({ toast: '새 버전 데이터는 열 수 없습니다' });
          return;
        }
        if (!writable() || (activeSession(get().data) && screen.name !== 'runner')) return;
        set({ screen });
      },

      async startSession(draft) {
        if (!writable() || starting || activeSession(get().data)) return null;
        starting = true;
        try {
          const now = deps.now();
          const profile = effectiveProfile(draft.profileId, get().data.profiles);
          if (isFutureDocument(profile)) return null;
          const external = draft.mode === 'external';
          const scope = external ? 'full' : draft.scope;
          let problemSet: ProblemSet | null = null;
          let createdSet = false;
          if (!external) {
            if (draft.setId) {
              problemSet = get().data.sets.find(s => s.id === draft.setId) ?? null;
              if (!problemSet) throw new Error('문제 세트를 찾을 수 없습니다');
              if (isFutureDocument(problemSet)) return null;
              if (!compatibleSets([problemSet], profile, scope, draft.sectionIdx, draft.drillCount).length) {
                set({ toast: '선택한 세트가 이 범위와 맞지 않습니다' });
                return null;
              }
            } else {
              problemSet = {
                id: newId(), name: draft.newSetName.trim() || `${scope === 'drill' ? '드릴' : profile.name} ${localDateTime(now)}`,
                profileId: profile.id,
                layout: makeSetLayout(profile, scope, { sectionIdx: draft.sectionIdx, drillCount: draft.drillCount }),
                choices: profile.choices, numbering: { startNo: draft.startNo, mode: draft.numberingMode },
                key: null, ranges: profile.id === 'dcat' && scope === 'full' ? structuredClone(get().templates.dcat ?? []) : [],
                createdAt: now, updatedAt: now, schemaVersion: SCHEMA_VERSION,
              };
              createdSet = true;
            }
          }
          const plan = external ? makePlan(profile, null, 'full', { external: true })
            : makePlan(profile, problemSet, scope, {
              sectionIdx: draft.sectionIdx,
              ...(scope === 'drill' ? { drill: {
                sectionIdx: draft.sectionIdx, count: draft.drillCount,
                seconds: draft.drillSeconds ?? defaultDrillSeconds(profile, draft.sectionIdx, draft.drillCount),
              } } : {}),
            });
          const s = createSession({
            id: newId(), profileId: profile.id, setId: problemSet?.id ?? null,
            ...(external ? { label: draft.label.trim() || `외부 모의 ${localDateTime(now)}` } : {}),
            scope, mode: draft.mode, policy: draft.policy, autoStart: profile.autoStart,
            attempt: external ? 1 : get().data.sessions.filter(s => s.setId === problemSet!.id).length + 1,
            plan, now,
          });
          set(state => ({
            data: {
              ...state.data, sets: createdSet ? [...state.data.sets, problemSet!] : state.data.sets,
              sessions: [...state.data.sessions, s], settings: { ...state.data.settings, lastSetup: structuredClone(draft) },
            }, screen: { name: 'runner', sessionId: s.id },
          }));
          lastTickAt = now;
          lastAliveAt = now;
          await save(
            ...(createdSet ? [setWrite(problemSet!.id)] : []),
            sessionWrite(s.id), ['settings', () => repo.saveSettings(get().data.settings)],
          );
          return s.id;
        } finally {
          starting = false;
        }
      },

      async act(id, action) {
        if (!writable()) return;
        const s = get().data.sessions.find(s => s.id === id);
        if (!s || isFutureDocument(s)) return;
        const { session, notice } = reduce(s, action, deps.now());
        if (session !== s) {
          updateSession(session);
          navigateStatus(s, session);
          await save(sessionWrite(id));
        }
        return notice;
      },

      async tick() {
        if (!writable()) return;
        const s = activeSession(get().data);
        if (!s) return;
        const now = deps.now();
        const gap = lastTickAt !== null && isGap(lastTickAt, now);
        const caughtUp = gap
          ? catchUpAfterGap(s, lastTickAt!, now, 'sleep') : s;
        if (gap) set({ toast: '절전 동안의 공백을 반영했습니다' });
        const next = advance(caughtUp, now);
        lastTickAt = now;
        const writes: [string, Write][] = [];
        if (next !== s) {
          updateSession(next);
          navigateStatus(s, next);
          writes.push(sessionWrite(s.id));
        }
        if (get().screen.name === 'runner' && (lastAliveAt === null || now - lastAliveAt >= 5_000)) {
          lastAliveAt = now;
          writes.push([`alive:${s.id}`, () => repo.saveAlive(s.id, now)]);
        }
        if (writes.length) await save(...writes);
      },

      setMemo(id, text) {
        if (!writable()) return;
        if (get().data.sessions.some(s => s.id === id && isFutureDocument(s))) return;
        set(state => ({ data: { ...state.data, memos: { ...state.data.memos, [id]: text } } }));
        const timer = memoTimers.get(id);
        if (timer !== undefined) clearTimeout(timer);
        pendingMemos.add(id);
        memoTimers.set(id, setTimeout(() => { void save(memoWrite(id)); }, 1_000));
      },

      async flushMemos() {
        if (writable()) await flushMemos();
      },

      async saveKey(id, key) {
        if (!writable()) return;
        const original = get().data.sets.find(s => s.id === id);
        if (!original || isFutureDocument(original)) return;
        const updated = { ...original, key: [...key], updatedAt: deps.now() };
        set(state => ({ data: { ...state.data, sets: state.data.sets.map(s => s.id === id ? updated : s) } }));
        await save(setWrite(id));
      },

      async completeGrading(id) {
        if (!writable()) return;
        const s = get().data.sessions.find(s => s.id === id);
        if (!s || isFutureDocument(s) || (s.status !== 'awaiting_key' && s.status !== 'graded')) return;
        updateSession({ ...s, status: 'graded' });
        if (!await save(sessionWrite(id))) return;
        await autoBackup(id);
        set({ screen: { name: 'result', sessionId: id } });
      },

      async gradeExternal(id, answersText, keyText) {
        if (!writable()) return { ok: false, reason: '지금은 저장할 수 없습니다' };
        const s = get().data.sessions.find(s => s.id === id);
        if (!s || isFutureDocument(s) || s.mode !== 'external' || (s.status !== 'external_done' && s.status !== 'graded')) {
          return { ok: false, reason: '종료한 외부 모의 세션을 선택하세요' };
        }
        const profile = effectiveProfile(s.profileId, get().data.profiles);
        if (isFutureDocument(profile)) return { ok: false, reason: '새 버전 데이터는 고칠 수 없습니다' };
        const layout = makeSetLayout(profile, 'full', {});
        const count = layout.reduce((sum, part) => sum + part.count, 0);
        const answers = parseKey(answersText, count, profile.choices);
        const key = parseKey(keyText, count, profile.choices);
        for (const [label, parsed] of [['내 답', answers], ['정답', key]] as const) {
          if (parsed.lengthMismatch) return { ok: false, reason: `${label}은 ${count}문항이어야 합니다` };
          if (parsed.errors.length) return { ok: false, reason: `${label} ${parsed.errors[0].pos + 1}번의 문자가 올바르지 않습니다` };
        }
        const original = s.setId ? get().data.sets.find(ps => ps.id === s.setId) : undefined;
        if (s.setId && (!original || isFutureDocument(original))) {
          return { ok: false, reason: '문제 세트를 고칠 수 없습니다' };
        }
        const now = deps.now();
        const ps: ProblemSet = original ? { ...original, key: key.key, updatedAt: now } : {
          id: newId(), name: s.label ?? `외부 모의 ${localDateTime(s.createdAt)}`, profileId: profile.id,
          layout, choices: profile.choices, numbering: { startNo: 1, mode: 'continuous' }, key: key.key,
          ranges: profile.id === 'dcat' ? structuredClone(get().templates.dcat ?? []) : [],
          createdAt: now, updatedAt: now, schemaVersion: SCHEMA_VERSION,
        };
        set(state => ({ data: { ...state.data,
          sets: original ? state.data.sets.map(x => x.id === ps.id ? ps : x) : [...state.data.sets, ps],
          sessions: state.data.sessions.map(x => x.id === id ? { ...x, setId: ps.id, externalAnswers: answers.key, status: 'graded' } : x),
        } }));
        if (!await save(setWrite(ps.id), sessionWrite(id))) return { ok: false, reason: get().saveError ?? '저장하지 못했습니다' };
        await autoBackup(id);
        set({ screen: { name: 'result', sessionId: id } });
        return { ok: true };
      },

      async saveRanges(id, ranges) {
        if (!writable()) return;
        const original = get().data.sets.find(s => s.id === id);
        if (!original || isFutureDocument(original)) return;
        const updated = { ...original, ranges: structuredClone(ranges), updatedAt: deps.now() };
        set(state => ({ data: { ...state.data, sets: state.data.sets.map(s => s.id === id ? updated : s) } }));
        await save(setWrite(id));
      },

      async saveTemplateFromSet(id) {
        if (!writable()) return;
        const ps = get().data.sets.find(s => s.id === id);
        if (!ps || isFutureDocument(ps) || ps.profileId !== 'dcat') return;
        set(state => ({ templates: { ...state.templates, dcat: structuredClone(ps.ranges) } }));
        await save(templateWrite('dcat'));
      },

      async addFamily(profileId, name) {
        if (!writable()) return;
        const trimmed = name.trim();
        if (!trimmed) return;
        const original = get().data.taxonomy.find(t => t.profileId === profileId);
        if (original?.families.some(f => f.id === trimmed || f.name === trimmed)) return;
        const taxonomy: Taxonomy = {
          ...original, profileId,
          families: [...(original?.families ?? []), { id: trimmed, name: trimmed, sectionHint: [] }],
          leaves: original?.leaves ?? [],
        };
        set(state => ({ data: { ...state.data, taxonomy: original
          ? state.data.taxonomy.map(t => t.profileId === profileId ? taxonomy : t) : [...state.data.taxonomy, taxonomy] } }));
        await save(taxonomyWrite(profileId));
      },

      async deleteImport(id) {
        if (!writable()) return;
        const original = get().data.imports.find(i => i.id === id);
        if (!original || isFutureDocument(original)) return;
        set(state => ({ data: { ...state.data, imports: state.data.imports.filter(i => i.id !== id) } }));
        await save([`import:${id}`, () => repo.deleteImport(id)]);
      },

      async gradeLater(id) {
        if (get().data.sessions.some(s => s.id === id && isFutureDocument(s))) return;
        if (!writable() || get().data.sessions.find(s => s.id === id)?.status !== 'awaiting_key') return;
        await autoBackup(id);
        set({ screen: { name: 'home' } });
      },

      async confirmExternal(id) {
        if (get().data.sessions.some(s => s.id === id && isFutureDocument(s))) return;
        if (!writable() || get().data.sessions.find(s => s.id === id)?.status !== 'external_done') return;
        await autoBackup(id);
        set({ screen: { name: 'home' } });
      },

      async saveProfile(p) {
        if (!writable()) return { ok: false, errors: [] };
        if (isFutureDocument(p) || get().data.profiles.some(x => x.id === p.id && isFutureDocument(x))) return { ok: false, errors: [] };
        const validation = validateProfileEdit(p);
        if (!validation.ok) return validation;
        const original = get().data.profiles.find(x => x.id === p.id);
        const updated = { ...original, ...p };
        set(state => ({ data: { ...state.data, profiles: original
          ? state.data.profiles.map(x => x.id === p.id ? updated : x) : [...state.data.profiles, updated] } }));
        await save(profileWrite(p.id));
        return { ok: true };
      },

      async resetProfile(id) {
        if (!writable()) return;
        if (get().data.profiles.some(p => p.id === id && isFutureDocument(p))) return;
        set(state => ({ data: { ...state.data, profiles: state.data.profiles.filter(p => p.id !== id) } }));
        await save(profileWrite(id));
      },

      async saveSettings(patch) {
        if (!writable()) return;
        set(state => ({ data: { ...state.data, settings: { ...state.data.settings, ...patch } } }));
        await save(['settings', () => repo.saveSettings(get().data.settings)]);
      },

      async exportNow() {
        if (writable()) await downloadBackup();
      },

      async restore(text) {
        if (!writable()) return { ok: false };
        if (activeSession(get().data)) return { ok: false, reason: '진행 중인 세션을 끝낸 뒤 복원하세요' };
        let parsed: unknown;
        try { parsed = JSON.parse(text); }
        catch { return { ok: false, reason: '백업 파일 형식이 아닙니다' }; }
        const validated = validateBackup(parsed);
        if (!validated.ok) return validated;
        restoring = true;
        try {
          if (!await flushMemos() || !await downloadBackup()) return { ok: false, reason: get().saveError ?? undefined };
          // Drain the queue with actions blocked, so older writes cannot follow the restore.
          await saveQueue;
          await repo.replaceAll(validated.file.data);
          // Keep the imported data in memory even if the following reload fails.
          set({ data: normalizeAllData(validated.file.data), templates: structuredClone(validated.file.data.templates ?? {}) });
          const loaded = await repo.loadAll();
          const data = normalizeAllData(loaded.data);
          const now = deps.now();
          set(state => ({
            data, meta: { ...state.meta, ...loaded.meta, lastBackupAt: now }, templates: structuredClone(loaded.templates),
          }));
          await seed();
          backupConfirmations.clear();
          await recoverActive(get().data, loaded.alive, now);
          if (!await save(['meta', () => repo.saveMeta(get().meta)])) return { ok: false, reason: get().saveError ?? undefined };
          return { ok: true };
        } catch (error) {
          const reason = errorMessage(error);
          set({ saveError: reason });
          return { ok: false, reason };
        } finally {
          restoring = false;
        }
      },
    };
  });
}
