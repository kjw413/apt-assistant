import { useMemo, useState } from 'react';
import { aggregate, familyRows, toCells, verdicts, type Cell, type Condition, type FamilyRow } from '../../domain/analytics';
import { questionViews } from '../../domain/derive';
import { summarize } from '../../domain/grading';
import { effectiveProfile } from '../../domain/profiles';
import { isFutureDocument } from '../../domain/types';
import { formatDateTime, formatSec } from '../format';
import { useApp } from '../useApp';
import styles from './analysis.module.css';

type Source = 'all' | 'tool' | 'import';
type ConditionFilter = 'all' | Condition;
type Recent = 'all' | '1' | '3' | '5' | '10';
const pct = (x: number | null) => x === null ? '—' : `${Math.round(x * 100)}%`;
const ratio = (x: number | null) => x === null ? '—' : `${Number(x.toFixed(1))}초`;

function stopFocus(event: React.MouseEvent<HTMLButtonElement>) { event.preventDefault(); }

function selectedCells(cells: Cell[], profileId: string, firstOnly: boolean, source: Source, condition: ConditionFilter, recent: Recent, dates: Map<string, number>) {
  let selected = cells.filter(c => c.profileId === profileId && (!firstOnly || c.firstAttempt)
    && (source === 'all' || c.source === source) && (condition === 'all' || c.condition === condition));
  if (recent !== 'all') {
    const ids = [...new Set(selected.map(c => c.recordId))].sort((a, b) => (dates.get(b) ?? 0) - (dates.get(a) ?? 0)).slice(0, Number(recent));
    selected = selected.filter(c => ids.includes(c.recordId));
  }
  return selected;
}

function VerdictCard({ testId, title, rows, warning }: { testId: string; title: string; rows: FamilyRow[]; warning?: (row: FamilyRow) => string | null }) {
  return <section className={styles.card}><h3>{title}</h3><ul data-testid={testId}>{rows.map(row => <li key={row.familyId}>{row.familyId} · {row.expectedWrong.toFixed(2)}{warning?.(row) ? ` · ${warning(row)}` : ''}</li>)}</ul></section>;
}

function Scatter({ rows }: { rows: FamilyRow[] }) {
  const timed = rows.filter(r => r.timeRatio !== null);
  const x = (v: number) => 42 + Math.min(2, v) / 2 * 230;
  const y = (v: number) => 170 - Math.max(0, Math.min(1, v)) * 135;
  return <svg data-testid="scatter" className={styles.scatter} viewBox="0 0 300 205" role="img" aria-label="시간 비율과 보정 정답률 산점도">
    <line x1="42" y1={y(.2)} x2="272" y2={y(.2)} data-testid="scatter-chance-line" className={styles.baseline} />
    <line x1={x(1)} y1="20" x2={x(1)} y2="170" data-testid="scatter-pace-line" className={styles.baseline} />
    <line x1="42" y1="170" x2="272" y2="170" className={styles.axis} /><line x1="42" y1="20" x2="42" y2="170" className={styles.axis} />
    <text x="48" y="34">강점</text><text x="180" y="34">속도 훈련</text><text x="48" y="162">공부</text><text x="180" y="162">뒤로·찍기</text>
    <text x="38" y="186">0</text><text x={x(1) - 8} y="186">1.0</text><text x="250" y="186">2.0</text><text x="8" y={y(.2) + 4}>0.2</text><text x="8" y="26">1.0</text>
    {timed.map(row => <circle key={row.familyId} cx={x(row.timeRatio!)} cy={y(row.pTilde)} r={Math.max(4, Math.sqrt(row.w) * 32)} className={row.timedN < 4 ? styles.lowDot : styles.dot}><title>{`${row.familyId} ${row.correct}/${row.n}, 시간 비율 ${row.timeRatio!.toFixed(2)}`}</title></circle>)}
    {!timed.length && <text x="105" y="105">시간 데이터 없음</text>}
  </svg>;
}

export function Analysis() {
  const data = useApp(s => s.data); const go = useApp(s => s.go);
  const [profileId, setProfileId] = useState('dcat'); const [firstOnly, setFirstOnly] = useState(true);
  const [source, setSource] = useState<Source>('all'); const [condition, setCondition] = useState<ConditionFilter>('all'); const [recent, setRecent] = useState<Recent>('all');
  const [open, setOpen] = useState<string | null>(null);
  const profiles = useMemo(() => ['dcat', 'lg-wayfit', ...data.profiles.map(p => p.id)].filter((x, i, a) => a.indexOf(x) === i), [data.profiles]);
  const dates = useMemo(() => new Map([...data.sessions.map(s => [s.id, s.finishedAt ?? s.createdAt] as const), ...data.imports.map(i => [i.id, i.capturedAt] as const)]), [data]);
  const all = useMemo(() => toCells(data), [data]);
  const cells = useMemo(() => selectedCells(all, profileId, firstOnly, source, condition, recent, dates), [all, profileId, firstOnly, source, condition, recent, dates]);
  const baseFilter = { profileId, firstOnly: false };
  const families = useMemo(() => familyRows(cells, baseFilter), [cells, profileId]);
  const decisions = useMemo(() => verdicts(cells, baseFilter), [cells, profileId]);
  const sections = aggregate(cells, 'section', baseFilter);
  const profile = effectiveProfile(profileId, data.profiles);
  const records = [...new Set(cells.map(c => c.recordId))].sort((a, b) => (dates.get(b) ?? 0) - (dates.get(a) ?? 0));
  const totalTimed = cells.reduce((n, c) => n + c.timedN, 0), totalN = cells.reduce((n, c) => n + c.n, 0);
  const change = (fn: () => void) => { setOpen(null); fn(); };
  const detail = (familyId: string) => {
    const leaves = aggregate(cells.filter(c => c.familyId === familyId), 'family', baseFilter);
    const qs = data.sessions.filter(s => s.status === 'graded' && !isFutureDocument(s) && s.setId)
      .flatMap(s => { const set = data.sets.find(x => x.id === s.setId); return set ? questionViews(s, set).filter(v => (set.ranges.find(r => v.q >= r.from && v.q <= r.to)?.familyId ?? set.defaultFamilyId ?? '미분류') === familyId).map(v => `${set.name} ${v.no}번`) : []; });
    const imported = data.imports.filter(i => i.status === 'confirmed').flatMap(i => (i.rows ?? []).filter(r => r.family === familyId).map(r => `${i.header?.date ?? formatDateTime(i.capturedAt)} ${r.qFrom + 1}~${r.qTo + 1}번 ${r.correct}/${r.total} (개별 답 미확인)`));
    return <tr data-testid={`family-detail-${familyId}`} className={styles.detail}><td colSpan={8}><strong>세부</strong> {leaves.map(l => `${l.id ?? familyId} ${l.correct}/${l.n}`).join(' · ')}<br /><strong>문항</strong> {[...qs, ...imported].join(' · ') || '기록 없음'}</td></tr>;
  };
  return <main className={styles.screen}><h1>누적 분석</h1>
    <div className={styles.filters}>
      <label>프로필<select value={profileId} onChange={e => change(() => setProfileId(e.target.value))}>{profiles.map(id => <option key={id} value={id}>{effectiveProfile(id, data.profiles).name}</option>)}</select></label>
      <label>출처<select value={source} onChange={e => change(() => setSource(e.target.value as Source))}><option value="all">전체</option><option value="tool">도구</option><option value="import">가져오기</option></select></label>
      <label>조건<select value={condition} onChange={e => change(() => setCondition(e.target.value as ConditionFilter))}>{(['all', 'full', 'section', 'drill', 'external', 'external-overtime'] as const).map(v => <option key={v} value={v}>{v === 'all' ? '전체' : v}</option>)}</select></label>
      <label>최근 N회<select value={recent} onChange={e => change(() => setRecent(e.target.value as Recent))}>{(['all', '1', '3', '5', '10'] as const).map(v => <option key={v} value={v}>{v === 'all' ? '전체' : v}</option>)}</select></label>
      <label className={styles.check}><input type="checkbox" checked={firstOnly} onChange={e => change(() => setFirstOnly(e.target.checked))} />첫 풀이만</label>
    </div>
    {!records.length ? <p>분석할 기록이 없습니다</p> : <>
      <section><h2>회차</h2><table className={styles.table}><thead><tr><th>날짜</th><th>출처</th><th>조건</th><th>시간 내/전체</th><th>영역별</th><th>초과</th></tr></thead><tbody>{records.map(id => {
        const session = data.sessions.find(s => s.id === id), imported = data.imports.find(i => i.id === id), rc = cells.filter(c => c.recordId === id), n = rc.reduce((x, c) => x + c.n, 0), correct = rc.reduce((x, c) => x + c.correct, 0), inLimit = rc.every(c => c.inLimitCorrect === null) ? null : rc.reduce((x, c) => x + (c.inLimitCorrect ?? 0), 0);
        const parts = aggregate(rc, 'section', { profileId, firstOnly: false });
        const overtime = imported?.overtime ? `초과 ${Math.round((imported.header?.usedMin ?? 0) / Math.max(1, imported.header?.limitMin ?? 1) * 100)}%` : '—';
        return <tr key={id}><td data-label="날짜">{imported?.header?.date ?? formatDateTime(session?.finishedAt ?? session?.createdAt ?? imported?.capturedAt ?? 0)}</td><td data-label="출처">{imported ? '가져오기' : '도구'}</td><td data-label="조건">{rc[0]?.condition}</td><td data-label="시간 내/전체">{imported?.overtime ? `—(${overtime})` : `${inLimit ?? '—'}/${n}`} · {correct}/{n}</td><td data-label="영역별">{parts.map(p => <span key={p.id} className={styles.bar}><i style={{ width: `${(p.p ?? 0) * 100}%` }} />{pct(p.p)}</span>)}</td><td data-label="초과">{overtime}</td></tr>;
      })}</tbody></table></section>
      <section><h2>영역</h2><table className={styles.table}><thead><tr><th>영역</th><th>x/n</th><th>시간 내</th><th>중앙값 / 페이스</th><th>미응답</th><th>초과</th><th>속도 손실</th></tr></thead><tbody>{sections.map(row => { const def = profile.sections.find(x => x.id === row.id); const selected = cells.filter(c => c.sectionId === row.id); const unanswered = row.answered === null ? '—' : row.n - row.answered; const overtime = selected.filter(c => c.source === 'tool').reduce((n, c) => n + Math.max(0, c.n - (c.inLimitCorrect ?? c.n)), 0); const loss = selected.filter(c => c.source === 'tool' && c.condition !== 'full').reduce((n, c) => n + (c.correct - (c.inLimitCorrect ?? c.correct)), 0); return <tr key={row.id}><th>{def?.name ?? '미지정'}</th><td>{row.correct}/{row.n}</td><td>{row.inLimitCorrect === null ? '—' : `${row.inLimitCorrect}/${row.inLimitN}`}</td><td>{ratio(row.medianSec)} / {def?.seconds && def.questions ? `${Math.round(def.seconds / def.questions)}초` : '—'} · {row.timedN}</td><td>{unanswered}</td><td>{overtime || '—'}</td><td>{loss || '—'}</td></tr>; })}</tbody></table></section>
      <section><h2>가족</h2><p className={styles.coverage}>시간 데이터 {totalTimed}/{totalN}문항</p><table aria-label="가족별 분석" data-testid="family-table" className={styles.table}><thead><tr><th>가족</th><th>w</th><th>x/n</th><th>p̃</th><th>중앙값 초</th><th>찍음 맞힘</th><th>기대 오답</th><th>판정</th></tr></thead><tbody>{families.map(row => <>{<tr key={row.familyId} className={row.n < 5 ? styles.lowSample : undefined}><th><button type="button" aria-expanded={open === row.familyId} aria-controls={`family-detail-${row.familyId}`} onMouseDown={stopFocus} onClick={() => setOpen(open === row.familyId ? null : row.familyId)}>{row.familyId}</button></th><td>{row.w.toFixed(3)}</td><td>{row.correct}/{row.n}</td><td>{row.n < 5 ? '표본 부족' : pct(row.pTilde)}</td><td>{ratio(row.medianSec)} · {row.timedN}</td><td>{row.guessedCorrect === null ? '—' : `${row.guessedCorrect}/${row.guessedN}`}</td><td>{row.expectedWrong.toFixed(2)}</td><td>{row.verdict.join(', ') || '—'}</td></tr>}{open === row.familyId && detail(row.familyId)}</>)}</tbody></table></section>
      <section><h2>시간과 보정 정답률</h2><Scatter rows={families} /></section>
      <div className={styles.cards}><VerdictCard testId="verdict-study" title="공부 Top3" rows={decisions.study} warning={r => r.overtimePossible ? '시간 교란 가능' : null} /><VerdictCard testId="verdict-speed" title="속도 훈련" rows={decisions.speed} /><VerdictCard testId="verdict-defer" title="뒤로" rows={decisions.defer} /><VerdictCard testId="verdict-guess" title="찍기 후보" rows={decisions.guess} warning={r => r.guessRuleUnconfirmed ? '감점 없음(미확인)' : null} /></div>
    </>}
    <button type="button" onMouseDown={stopFocus} onClick={() => go({ name: 'home' })}>홈으로</button>
  </main>;
}
