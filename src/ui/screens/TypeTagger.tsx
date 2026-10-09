import { useId, useRef, useState, type PointerEvent } from 'react';
import { isFutureDocument, type ProblemSet, type QuestionView } from '../../domain/types';
import { useApp, useAppStore } from '../useApp';
import styles from './screens.module.css';

type Range = ProblemSet['ranges'][number];
type Tag = Pick<Range, 'familyId' | 'leafId'>;

/** Replace just the selected interval; keep the remaining ranges and their fields. */
export function paintQuestionRange(ranges: Range[], from: number, to: number, tag: Tag): Range[] {
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  const result = ranges.flatMap(range => {
    if (range.to < low || range.from > high) return [{ ...range }];
    return [
      ...(range.from < low ? [{ ...range, to: low - 1 }] : []),
      ...(range.to > high ? [{ ...range, from: high + 1 }] : []),
    ];
  });
  let previous: Range | undefined;
  let painted: Range | undefined;
  for (let q = low; q <= high; q++) {
    const original = ranges.find(range => q >= range.from && q <= range.to);
    if (painted && original === previous) painted.to = q;
    else {
      painted = { ...original, from: q, to: q, familyId: tag.familyId };
      delete painted.leafId;
      if (tag.leafId) painted.leafId = tag.leafId;
      result.push(painted);
    }
    previous = original;
  }
  // First matching range wins in both the result view and analytics.
  return result;
}

export function TypeTagger({ setId, views }: { setId: string; views: QuestionView[] }) {
  const store = useAppStore();
  const set = useApp(s => s.data.sets.find(x => x.id === setId));
  const taxonomy = useApp(s => s.data.taxonomy.find(x => x.profileId === set?.profileId));
  const template = useApp(s => s.templates[set?.profileId ?? '']);
  const id = useId();
  const root = useRef<HTMLElement>(null);
  const stroke = useRef<{ pointerId: number; from: number; to: number; tag: Tag } | null>(null);
  const saving = useRef(false);
  const [familyId, setFamilyId] = useState('');
  const [leafId, setLeafId] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<[number, number] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!set) return null;
  const readOnly = isFutureDocument(set);
  const leaves = taxonomy?.leaves.filter(x => x.familyId === familyId) ?? [];

  async function persist(action: () => Promise<void>, success: string) {
    if (saving.current || readOnly) return;
    saving.current = true;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await action();
      if (!store.getState().saveError) setMessage(success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '저장하지 못했습니다');
    } finally { saving.current = false; setBusy(false); }
  }

  function paint(from: number, to: number, tag: Tag) {
    const latest = store.getState().data.sets.find(x => x.id === setId);
    if (!latest || !tag.familyId) return;
    const ranges = paintQuestionRange(latest.ranges, from, to, tag);
    void persist(() => store.getState().saveRanges(setId, ranges), '유형을 저장했습니다');
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const active = stroke.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-tag-q]');
    if (row && root.current?.contains(row)) {
      active.to = Number(row.dataset.tagQ);
      setSelection([Math.min(active.from, active.to), Math.max(active.from, active.to)]);
    }
  }

  async function add() {
    const name = newName.trim();
    if (!set || !name) return;
    await persist(() => store.getState().addFamily(set.profileId, name), '유형을 추가했습니다');
    if (!store.getState().saveError) {
      const added = store.getState().data.taxonomy.find(x => x.profileId === set.profileId)?.families
        .find(x => x.name === name || x.id === name);
      if (added) { setFamilyId(added.id); setLeafId(''); setNewName(''); }
    }
  }

  return <section ref={root} className={styles.section} aria-labelledby={`${id}-heading`}>
    <h2 id={`${id}-heading`}>유형 칠하기</h2>
    <p className={styles.muted}>가족과 세부(선택)를 고르고 문항을 클릭하거나 드래그하세요. 같은 세트의 모든 풀이에 적용됩니다.</p>
    <div className={styles.actions} aria-label="유형 가족">
      {taxonomy?.families.map(family => <button key={family.id} type="button"
        onMouseDown={e => e.preventDefault()} aria-pressed={familyId === family.id} disabled={busy || readOnly}
        style={familyId === family.id ? { borderColor: 'var(--accent)', fontWeight: 700 } : undefined}
        onClick={() => { setFamilyId(family.id); setLeafId(''); }}>{family.name}</button>)}
    </div>
    <div className={styles.field}>
      <label htmlFor={`${id}-new`}>새 유형</label>
      <input id={`${id}-new`} value={newName} disabled={busy || readOnly} onChange={e => setNewName(e.target.value)} />
      <button type="button" onMouseDown={e => e.preventDefault()}
        disabled={busy || readOnly || !newName.trim()} onClick={() => { void add(); }}>유형 추가</button>
    </div>
    <div className={styles.field}>
      <label htmlFor={`${id}-leaf`}>세부 유형</label>
      <select id={`${id}-leaf`} value={leafId} disabled={busy || readOnly || !familyId}
        onChange={e => setLeafId(e.target.value)}>
        <option value="">세부 지정 안 함</option>
        {leaves.map(leaf => <option key={leaf.id} value={leaf.id}>{leaf.name}</option>)}
      </select>
    </div>
    {!familyId && <p className={styles.muted}>칠할 가족을 먼저 고르세요</p>}
    {set.profileId === 'dcat' && <div className={styles.actions}>
      <button type="button" onMouseDown={e => e.preventDefault()} disabled={busy || readOnly}
        onClick={() => { void persist(() => store.getState().saveTemplateFromSet(setId), '기본 틀을 저장했습니다'); }}>기본 틀로 저장</button>
      <button type="button" onMouseDown={e => e.preventDefault()} disabled={busy || readOnly || !template}
        onClick={() => { void persist(() => store.getState().saveRanges(setId, template ?? []), '기본 틀을 적용했습니다'); }}>기본 틀 적용</button>
    </div>}
    {message && <p role="status" className={styles.muted}>{message}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <ul className={styles.list}>
      {views.map(view => {
        const range = set.ranges.find(x => view.q >= x.from && view.q <= x.to);
        const family = range?.familyId ?? set.defaultFamilyId;
        const familyName = taxonomy?.families.find(x => x.id === family)?.name ?? family ?? '미분류';
        const leaf = taxonomy?.leaves.find(x => x.familyId === family && x.id === range?.leafId)?.name ?? range?.leafId;
        const selected = selection && view.q >= selection[0] && view.q <= selection[1];
        return <li key={view.q}>
          <button type="button" className={styles.listButton} data-testid={`tag-row-${view.q}`} data-tag-q={view.q}
            onMouseDown={e => e.preventDefault()} disabled={busy || readOnly || !familyId}
            style={{ touchAction: 'none', userSelect: 'none', ...(selected ? { borderColor: 'var(--accent)' } : {}) }}
            onPointerDown={event => {
              if (event.button !== 0 || !familyId || saving.current) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              stroke.current = { pointerId: event.pointerId, from: view.q, to: view.q,
                tag: { familyId, ...(leafId ? { leafId } : {}) } };
              setSelection([view.q, view.q]);
            }}
            onPointerMove={move}
            onPointerUp={event => {
              move(event);
              const active = stroke.current;
              if (!active || active.pointerId !== event.pointerId) return;
              stroke.current = null;
              setSelection(null);
              paint(active.from, active.to, active.tag);
            }}
            onPointerCancel={() => { stroke.current = null; setSelection(null); }}
            onLostPointerCapture={() => { stroke.current = null; setSelection(null); }}
            onClick={event => { if (event.detail === 0) paint(view.q, view.q, { familyId, ...(leafId ? { leafId } : {}) }); }}>
            <span>{view.no}번 · {familyName}{leaf && ` · ${leaf}`}</span>
            <span className={styles.muted}>내 답 {view.answer ?? '—'} · 정답 {view.key ?? '—'} · {view.correct === null ? '—' : view.correct ? '○' : '×'}</span>
          </button>
        </li>;
      })}
    </ul>
  </section>;
}
