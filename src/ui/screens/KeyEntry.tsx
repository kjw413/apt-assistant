import { useId, useState } from 'react';
import { questionViews } from '../../domain/derive';
import { parseKey } from '../../domain/grading';
import type { ProblemSet, Session } from '../../domain/types';
import { useApp, useAppStore } from '../useApp';
import styles from './screens.module.css';

export function KeyEntry({ sessionId }: { sessionId: string }) {
  const session = useApp(s => s.data.sessions.find(x => x.id === sessionId));
  const set = useApp(s => s.data.sets.find(x => x.id === session?.setId));
  const go = useApp(s => s.go);
  if (!session || !set) return <div className={styles.screen}>
    <p role="alert">세션 또는 문제 세트를 찾을 수 없습니다.</p>
    <button type="button" onClick={() => go({ name: 'home' })}>홈으로</button>
  </div>;
  return <KeyEditor key={`${session.id}:${set.id}`} session={session} set={set} />;
}

function KeyEditor({ session, set }: { session: Session; set: ProblemSet }) {
  const store = useAppStore();
  const inputId = useId();
  const helpId = useId();
  const [text, setText] = useState(() => set.key?.map(x => x ?? 0).join('') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qCount = set.layout.reduce((n, part) => n + part.count, 0);
  const parsed = parseKey(text, qCount, set.choices);
  const views = questionViews(session, { ...set, key: parsed.key });
  const invalidPositions = new Set(parsed.errors.map(x => x.pos));
  const entered = [...text.normalize('NFKC').replace(/[\s,]/g, '')].length;

  async function finish(save: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (save) {
        await store.getState().saveKey(set.id, parsed.key);
        if (store.getState().saveError) return;
        if (session.status === 'graded') store.getState().go({ name: 'result', sessionId: session.id });
        else await store.getState().completeGrading(session.id);
      } else await store.getState().gradeLater(session.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '저장하지 못했습니다');
    } finally { setBusy(false); }
  }

  return <div className={styles.screen}>
    <h1>정답 입력</h1>
    <p>{set.name}</p>
    <div className={styles.field}>
      <label htmlFor={inputId}>정답</label>
      <textarea id={inputId} value={text} rows={4} spellCheck={false}
        aria-describedby={helpId} aria-invalid={parsed.errors.length > 0}
        disabled={busy} onChange={e => setText(e.target.value)} />
      <p id={helpId} className={styles.muted}>1~{set.choices}를 이어 입력하세요. 공백·쉼표·줄바꿈은 무시합니다. 0 또는 -는 채점에서 제외합니다.</p>
    </div>
    {parsed.errors.length > 0 && <div className={styles.error} role="alert">
      <p>잘못된 정답 위치</p>
      <ul>{parsed.errors.map(x => <li key={x.pos}>{x.pos + 1}번째: ‘{x.ch}’ (1~{set.choices}, 0 또는 -를 입력하세요)</li>)}</ul>
    </div>}
    {parsed.lengthMismatch && <p className={styles.notice} role="status">정답 길이가 문항 수와 다릅니다: 입력 {entered}개 / 문항 {qCount}개. 부족한 정답은 채점에서 제외합니다.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.actions}>
      <button type="button" disabled={busy || parsed.errors.length > 0} onClick={() => { void finish(true); }}>채점 저장</button>
      {session.status !== 'graded' && <button type="button" disabled={busy} onClick={() => { void finish(false); }}>나중에 채점</button>}
    </div>
    <section className={styles.section} aria-label="채점 미리보기">
      <h2>미리보기</h2>
      {session.plan.map((part, idx) => {
        const sectionViews = views.filter(v => v.sectionIdx === idx);
        return <section key={idx} className={styles.section}>
          <h3>{part.name}</h3>
          {Array.from({ length: Math.ceil(sectionViews.length / 5) }, (_, group) =>
            <table key={group} className={`${styles.table} ${styles.previewTable}`}>
              <caption className={styles.muted}>{group * 5 + 1}~{Math.min(group * 5 + 5, sectionViews.length)}번째 문항</caption>
              <thead><tr><th scope="col">번호</th><th scope="col">내 답</th><th scope="col">정답</th><th scope="col">○/×</th></tr></thead>
              <tbody>{sectionViews.slice(group * 5, group * 5 + 5).map(v =>
                <tr key={v.q} className={invalidPositions.has(v.q) ? styles.error : undefined}>
                  <th scope="row">{v.no}</th><td>{v.answer ?? '—'}</td>
                  <td>{invalidPositions.has(v.q) ? '오류' : v.key ?? '—'}</td>
                  <td>{v.correct === null ? '—' : v.correct ? '○' : '×'}</td>
                </tr>)}</tbody>
            </table>)}
        </section>;
      })}
    </section>
  </div>;
}
