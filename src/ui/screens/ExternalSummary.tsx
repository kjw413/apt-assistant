import { summarize } from '../../domain/grading';
import { formatDateTime, formatSec } from '../format';
import { useApp } from '../useApp';
import styles from './screens.module.css';

export function ExternalSummary({ sessionId }: { sessionId: string }) {
  const session = useApp(s => s.data.sessions.find(x => x.id === sessionId));
  const confirmExternal = useApp(s => s.confirmExternal);
  const go = useApp(s => s.go);
  if (!session) return <main className={styles.screen}>
    <p className={styles.error} role="alert">세션을 찾을 수 없습니다</p>
    <button type="button" onClick={() => go({ name: 'home' })}>홈으로</button>
  </main>;
  const summary = summarize([], session);

  return <main className={styles.screen}>
    <h1>외부 모의 요약</h1>
    <p>{session.label ?? '외부 모의'}</p>
    <p className={styles.muted}>{formatDateTime(session.finishedAt ?? session.createdAt)}</p>
    <table className={styles.table}>
      <thead><tr><th scope="col">영역</th><th scope="col">사용/제한</th><th scope="col">초과</th></tr></thead>
      <tbody>{summary.sections.map(section => <tr key={section.idx}>
        <th scope="row">{section.name}{!section.started && <span className={styles.muted}> · 미응시</span>}</th>
        <td>{section.started ? formatSec(section.usedSec) : '—'} / {formatSec(section.limitSec)}</td>
        <td>{section.started ? formatSec(section.overtimeSec) : '—'}</td>
      </tr>)}</tbody>
    </table>
    <div className={styles.actions}>
      {session.status === 'external_done' && <button type="button" tabIndex={-1}
        onMouseDown={e => e.preventDefault()}
        onClick={() => go({ name: 'externalKey', sessionId })}>채점 입력</button>}
      <button type="button" onClick={() => { void confirmExternal(session.id); }}>확인</button>
    </div>
  </main>;
}
