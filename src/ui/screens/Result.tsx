import { useState } from 'react';
import { questionViews } from '../../domain/derive';
import { summarize } from '../../domain/grading';
import type { QuestionView } from '../../domain/types';
import { formatDateTime, formatSec } from '../format';
import { useApp } from '../useApp';
import styles from './screens.module.css';

type SortColumn = 'q' | 'answer' | 'key' | 'correct' | 'overtime' | 'timeSec' | 'changes';
const columns: { key: SortColumn; label: string }[] = [
  { key: 'q', label: '번호' }, { key: 'answer', label: '내 답' },
  { key: 'key', label: '정답' }, { key: 'correct', label: '○×' },
  { key: 'overtime', label: '초과' },
  { key: 'timeSec', label: '초' }, { key: 'changes', label: '변경' },
];
const seconds = (value: number | null) => value === null ? '—' : `${Number(value.toFixed(1))}초`;

function compare(a: QuestionView, b: QuestionView, column: SortColumn, descending: boolean): number {
  const x = a[column];
  const y = b[column];
  // Unknown values stay at the end in either direction.
  if (x === null || y === null) return x === y ? a.q - b.q : x === null ? 1 : -1;
  const difference = Number(x) - Number(y);
  return (descending ? -difference : difference) || a.q - b.q;
}

export function Result({ sessionId }: { sessionId: string }) {
  const session = useApp(s => s.data.sessions.find(x => x.id === sessionId));
  const set = useApp(s => s.data.sets.find(x => x.id === session?.setId));
  const go = useApp(s => s.go);
  const [sort, setSort] = useState<{ column: SortColumn; descending: boolean }>({ column: 'q', descending: false });
  if (!session || !set) return <div className={styles.screen}>
    <p role="alert">세션 또는 문제 세트를 찾을 수 없습니다.</p>
    <button type="button" onClick={() => go({ name: 'home' })}>홈으로</button>
  </div>;
  const views = questionViews(session, set);
  const summary = summarize(views, session);
  const started = new Set(summary.sections.filter(x => x.started).map(x => x.idx));
  const guessedWrong = views.filter(v => started.has(v.sectionIdx) && v.flag === 'guess' && v.correct === false).length;
  const guessedExcluded = summary.guessed - summary.guessedCorrect - guessedWrong;
  const sorted = [...views].sort((a, b) => compare(a, b, sort.column, sort.descending));

  return <div className={styles.screen}>
    <h1>결과</h1>
    <p>{set.name} · {session.attempt}회차</p>
    <p className={styles.muted}>{formatDateTime(session.finishedAt ?? session.createdAt)}</p>
    <div className={styles.scoreCards}>
      <div className={styles.scoreCard}><span>시간 내 점수</span><strong data-testid="score-inlimit">{summary.inLimitCorrect}/{summary.n}</strong></div>
      <div className={styles.scoreCard}><span>전체 점수</span><strong data-testid="score-total">{summary.correct}/{summary.n}</strong></div>
    </div>
    <dl className={styles.metrics}>
      <div><dt>사용 / 제한</dt><dd>{formatSec(summary.usedSec)} / {formatSec(summary.limitSec)}</dd></div>
      <div><dt>초과 합계</dt><dd>{formatSec(summary.overtimeSec)}</dd></div>
      <div><dt>미응답</dt><dd>{summary.unanswered}</dd></div>
      {summary.guessed > 0 && <div><dt>찍음</dt><dd>{summary.guessed} (맞음 {summary.guessedCorrect} / 틀림 {guessedWrong}){guessedExcluded > 0 && ` · 채점 제외 ${guessedExcluded}`}</dd></div>}
    </dl>
    {summary.graded < summary.n && <p className={styles.notice}>채점 제외 {summary.n - summary.graded}</p>}
    {summary.unseenSections > 0 && <p className={styles.notice}>미응시 영역 {summary.unseenSections}</p>}
    <section className={styles.section}>
      <h2>영역별 결과</h2>
      <table className={`${styles.table} ${styles.sectionTable}`}>
        <thead><tr><th scope="col">영역</th><th scope="col">정답/문항</th><th scope="col">정답률</th><th scope="col">시간 내 정답</th><th scope="col">사용/제한</th><th scope="col">중앙값 초 / 페이스</th><th scope="col">미응답</th>{summary.guessed > 0 && <th scope="col">찍음</th>}<th scope="col">초과</th></tr></thead>
        <tbody>{summary.sections.map(part => <tr key={part.idx}>
          <th scope="row">{part.name}{!part.started && <span className={styles.muted}> · 미응시</span>}</th>
          <td data-label="정답/문항">{part.started ? `${part.correct}/${part.n}` : '—'}</td>
          <td data-label="정답률">{part.started && part.n > 0 ? `${Math.round(part.correct / part.n * 100)}%` : '—'}</td>
          <td data-label="시간 내 정답">{part.started ? `${part.inLimitCorrect}/${part.n}` : '—'}</td>
          <td data-label="사용/제한">{part.started ? formatSec(part.usedSec) : '—'} / {formatSec(part.limitSec)}</td>
          <td data-label="중앙값 / 페이스">{seconds(part.medianLapSec)} / {seconds(part.paceSec)}</td>
          <td data-label="미응답">{part.started ? part.unanswered : '—'}</td>
          {summary.guessed > 0 && <td data-label="찍음">{part.started ? part.guessed : '—'}</td>}
          <td data-label="초과">{part.started ? formatSec(part.overtimeSec) : '—'}</td>
        </tr>)}</tbody>
      </table>
    </section>
    <details className={styles.section}>
      <summary>문항별 결과</summary>
      <p className={styles.muted}>열 이름을 누르면 정렬합니다. 한 번 더 누르면 순서를 바꿉니다.</p>
      <table className={`${styles.table} ${styles.questionTable}`}>
        <thead><tr>{columns.map(column => <th key={column.key} scope="col"
          aria-sort={sort.column === column.key ? sort.descending ? 'descending' : 'ascending' : 'none'}>
          <button type="button" onClick={() => setSort(previous => ({ column: column.key, descending: previous.column === column.key && !previous.descending }))}>
            {column.label}{sort.column === column.key && <span aria-hidden="true">{sort.descending ? ' ↓' : ' ↑'}</span>}
          </button>
        </th>)}</tr></thead>
        <tbody>{sorted.map(v => <tr key={v.q}>
          <th scope="row">{v.no}{!started.has(v.sectionIdx) && <span className={styles.muted}> 미응시</span>}</th>
          <td>{v.answer ?? '—'}</td><td>{v.key ?? '—'}</td>
          <td>{!started.has(v.sectionIdx) || v.correct === null ? '—' : v.correct ? '○' : '×'}</td>
          <td>{v.overtime ? '초과' : '—'}</td><td>{v.timeSec === null ? '—' : Number(v.timeSec.toFixed(1))}</td><td>{v.changes}</td>
        </tr>)}</tbody>
      </table>
    </details>
    <div className={styles.actions}>
      <button type="button" onClick={() => go({ name: 'key', sessionId })}>정답 수정</button>
      <button type="button" onClick={() => go({ name: 'home' })}>홈으로</button>
    </div>
  </div>;
}
