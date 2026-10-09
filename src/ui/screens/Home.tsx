import { questionViews } from '../../domain/derive';
import { summarize } from '../../domain/grading';
import { isFutureDocument } from '../../domain/types';
import { unbackedCount } from '../../state/store';
import { formatDateTime } from '../format';
import { useApp } from '../useApp';
import styles from './screens.module.css';

export function Home() {
  const data = useApp(s => s.data);
  const meta = useApp(s => s.meta);
  const go = useApp(s => s.go);
  const startSession = useApp(s => s.startSession);
  const exportNow = useApp(s => s.exportNow);
  const lastSetup = data.settings.lastSetup;
  const sets = new Map(data.sets.map(set => [set.id, set]));
  const readable = data.sessions.filter(s => !isFutureDocument(s));
  const future = data.sessions.filter(isFutureDocument);
  const waiting = readable.filter(s => s.status === 'awaiting_key');
  const recentFirst = (a: typeof data.sessions[number], b: typeof data.sessions[number]) =>
    (b.finishedAt ?? b.createdAt) - (a.finishedAt ?? a.createdAt);
  const results = readable.filter(s => s.status === 'graded').sort(recentFirst).slice(0, 5);
  const external = readable.filter(s => s.status === 'external_done').sort(recentFirst);

  return <main className={styles.screen}>
    <h1>APT 연습</h1>
    <div className={styles.actions}>
      {lastSetup && <button type="button" onClick={() => { void startSession(lastSetup); }}>직전 설정으로 시작</button>}
      <button type="button" onClick={() => go({ name: 'setup' })}>새 세션</button>
      <button type="button" onClick={() => go({ name: 'settings' })}>설정</button>
      <button type="button" onClick={() => go({ name: 'analysis' })}>분석</button>
      <button type="button" onClick={() => { void exportNow(); }}>지금 내보내기</button>
    </div>
    <p className={styles.muted}>저장된 기록 {data.sessions.length}개</p>
    <p data-testid="unbacked" className={styles.summary}>백업 안 된 기록 {unbackedCount(data, meta)}개</p>
    {future.length > 0 && <section className={styles.section}>
      <h2>새 버전 세션</h2>
      <ul className={styles.list}>{future.map(s => <li key={s.id}>
        <button type="button" className={styles.listButton} onClick={() => go({ name: 'runner', sessionId: s.id })}>
          <span>{sets.get(s.setId ?? '')?.name ?? s.label ?? s.id}</span>
          <span className="banner banner--warn">새 버전 데이터</span>
        </button>
      </li>)}</ul>
    </section>}
    {data.sessions.length === 0 && data.sets.length === 0 &&
      <p className={styles.muted}>기록이 없으면 설정에서 백업 파일을 복원할 수 있습니다</p>}
    <section className={styles.section}>
      <h2>채점 대기</h2>
      {waiting.length === 0 ? <p className={styles.muted}>채점 대기 세션이 없습니다</p> :
        <ul className={styles.list}>{waiting.map(s => <li key={s.id}>
          <button className={styles.listButton} type="button" onClick={() => go({ name: 'key', sessionId: s.id })}>
            <span>{sets.get(s.setId ?? '')?.name ?? s.label ?? '문제집'}</span>
            <span className={styles.muted}>{formatDateTime(s.finishedAt ?? s.createdAt)}</span>
          </button>
        </li>)}</ul>}
    </section>
    <section className={styles.section}>
      <h2>최근 결과</h2>
      {results.length === 0 ? <p className={styles.muted}>아직 채점한 결과가 없습니다</p> :
        <ul className={styles.list}>{results.map(s => {
          const set = sets.get(s.setId ?? '');
          const summary = set ? summarize(questionViews(s, set), s) : null;
          return <li key={s.id}>
            <button className={styles.listButton} type="button" onClick={() => go({ name: 'result', sessionId: s.id })}>
              <span>{formatDateTime(s.finishedAt ?? s.createdAt)} · {set?.name ?? s.label ?? '문제집'}</span>
              <span>{summary ? `제한 시간 안 ${summary.inLimitCorrect}/${summary.n} · 전체 ${summary.correct}/${summary.n}` : '문제집을 찾을 수 없습니다'}</span>
            </button>
          </li>;
        })}</ul>}
    </section>
    <section className={styles.section}>
      <h2>외부 모의고사</h2>
      {external.length === 0 ? <p className={styles.muted}>외부 모의고사 기록이 없습니다</p> :
        <ul className={styles.list}>{external.map(s => <li key={s.id}>
          <button className={styles.listButton} type="button" onClick={() => go({ name: 'externalSummary', sessionId: s.id })}>
            <span>{s.label ?? '외부 모의'}</span>
            <span className={styles.muted}>{formatDateTime(s.finishedAt ?? s.createdAt)}</span>
          </button>
        </li>)}</ul>}
    </section>
  </main>;
}
