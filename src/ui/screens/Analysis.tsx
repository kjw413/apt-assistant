import { Fragment, useMemo, useState } from 'react';
import { SHRINK_K, aggregate, familyRows, toCells, verdicts, type Cell, type Condition, type FamilyRow } from '../../domain/analytics';
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
const conditionLabel: Record<ConditionFilter, string> = {
  all: '전체', full: '전체모의', section: '영역', drill: '드릴',
  external: '외부모의', 'external-overtime': '외부모의(시간초과)',
};
const recordKey = (source: Exclude<Source, 'all'>, id: string) => `${source}:${id}`;

function stopFocus(event: React.MouseEvent<HTMLButtonElement>) { event.preventDefault(); }

function selectedCells(cells: Cell[], profileId: string, firstOnly: boolean, source: Source, condition: ConditionFilter, recent: Recent, dates: Map<string, number>) {
  let selected = cells.filter(c => c.profileId === profileId && (!firstOnly || c.firstAttempt)
    && (source === 'all' || c.source === source) && (condition === 'all' || c.condition === condition));
  if (recent !== 'all') {
    const ids = [...new Set(selected.map(c => recordKey(c.source, c.recordId)))]
      .sort((a, b) => (dates.get(b) ?? 0) - (dates.get(a) ?? 0))
      .slice(0, Number(recent));
    selected = selected.filter(c => ids.includes(recordKey(c.source, c.recordId)));
  }
  return selected;
}

function VerdictCard({ testId, title, rows, warning }: { testId: string; title: string; rows: FamilyRow[]; warning?: (row: FamilyRow) => string | null }) {
  return <section className={styles.card}><h3>{title}</h3><ul data-testid={testId}>{rows.map(row => <li key={row.familyId}>{row.familyId} · 기대오답 {row.expectedWrong.toFixed(2)}{warning?.(row) ? ` · ${warning(row)}` : ''}</li>)}</ul></section>;
}

function Scatter({ rows }: { rows: FamilyRow[] }) {
  const timed = rows.filter(r => r.timeRatio !== null);
  const maxRatio = Math.max(2, ...timed.map(r => r.timeRatio!));
  const x = (v: number) => 42 + v / maxRatio * 230;
  const y = (v: number) => 170 - Math.max(0, Math.min(1, v)) * 135;
  return <svg data-testid="scatter" className={styles.scatter} viewBox="0 0 300 205" role="img" aria-label="시간 비율과 보정 정답률 산점도">
    <line x1="42" y1={y(.2)} x2="272" y2={y(.2)} data-testid="scatter-chance-line" className={styles.baseline} />
    <line x1={x(1)} y1="20" x2={x(1)} y2="170" data-testid="scatter-pace-line" className={styles.baseline} />
    <line x1="42" y1="170" x2="272" y2="170" className={styles.axis} /><line x1="42" y1="20" x2="42" y2="170" className={styles.axis} />
    <text x="4" y="13">보정 정답률</text><text x="220" y="202">시간 비율</text>
    <text x={Math.max(44, x(1) - 92)} y="34">강점</text><text x={x(1) + 8} y="34">속도 훈련</text><text x={Math.max(44, x(1) - 92)} y="162">공부</text><text x={x(1) + 8} y="162">뒤로·찍기</text>
    <text x="38" y="186">0</text><text x={x(1) - 8} y="186">1.0</text><text x="250" y="186">{maxRatio.toFixed(1)}</text><text x="8" y={y(.2) + 4}>0.2</text><text x="8" y="26">1.0</text>
    {timed.map(row => <circle key={row.familyId} cx={x(row.timeRatio!)} cy={y(row.pTilde)} r={Math.sqrt(row.w) * 32} className={row.n < 5 ? styles.lowDot : styles.dot}><title>{`${row.familyId} ${row.correct}/${row.n}, 시간 비율 ${row.timeRatio!.toFixed(2)}`}</title></circle>)}
    {!timed.length && <text x="105" y="105">시간 데이터 없음</text>}
  </svg>;
}

export function Analysis() {
  const data = useApp(s => s.data);
  const go = useApp(s => s.go);
  const [profileId, setProfileId] = useState('dcat');
  const [firstOnly, setFirstOnly] = useState(true);
  const [source, setSource] = useState<Source>('all');
  const [condition, setCondition] = useState<ConditionFilter>('all');
  const [recent, setRecent] = useState<Recent>('all');
  const [open, setOpen] = useState<string | null>(null);
  const profiles = useMemo(() => ['dcat', 'lg-wayfit', ...data.profiles.map(p => p.id)].filter((x, i, a) => a.indexOf(x) === i), [data.profiles]);
  const dates = useMemo(() => new Map([
    ...data.sessions.map(s => [recordKey('tool', s.id), s.finishedAt ?? s.createdAt] as const),
    ...data.imports.map(i => [recordKey('import', i.id),
      i.header?.date && !Number.isNaN(Date.parse(i.header.date)) ? Date.parse(i.header.date) : i.capturedAt] as const),
  ]), [data]);
  const all = useMemo(() => toCells(data), [data]);
  const cells = useMemo(() => selectedCells(all, profileId, firstOnly, source, condition, recent, dates), [all, profileId, firstOnly, source, condition, recent, dates]);
  const baseFilter = { profileId, firstOnly: false };
  const families = useMemo(() => familyRows(cells, baseFilter), [cells, profileId]);
  const decisions = useMemo(() => verdicts(cells, baseFilter), [cells, profileId]);
  const sections = aggregate(cells, 'section', baseFilter);
  const profile = effectiveProfile(profileId, data.profiles);
  const records = [...new Set(cells.map(c => recordKey(c.source, c.recordId)))]
    .sort((a, b) => (dates.get(b) ?? 0) - (dates.get(a) ?? 0));
  const totalTimed = cells.reduce((n, c) => n + c.timedN, 0);
  const totalN = cells.reduce((n, c) => n + c.n, 0);
  const change = (fn: () => void) => { setOpen(null); fn(); };
  const detail = (familyId: string) => {
    const familyCells = cells.filter(c => c.familyId === familyId);
    const leaves = new Map<string, { correct: number; n: number }>();
    for (const c of familyCells) { const leaf = c.leafId ?? '세부 미지정'; const total = leaves.get(leaf) ?? { correct: 0, n: 0 }; total.correct += c.correct; total.n += c.n; leaves.set(leaf, total); }
    const toolIds = new Set(familyCells.filter(c => c.source === 'tool').map(c => c.recordId));
    const importIds = new Set(familyCells.filter(c => c.source === 'import').map(c => c.recordId));
    const qs = data.sessions.filter(s => toolIds.has(s.id) && s.status === 'graded' && !isFutureDocument(s) && s.setId)
      .flatMap(s => { const set = data.sets.find(x => x.id === s.setId); return set ? questionViews(s, set).filter(v => (set.ranges.find(r => v.q >= r.from && v.q <= r.to)?.familyId ?? set.defaultFamilyId ?? '미분류') === familyId).map(v => `${set.name} ${v.no}번`) : []; });
    const imported = data.imports.filter(i => importIds.has(i.id) && i.status === 'confirmed').flatMap(i => (i.rows ?? []).filter(r => r.family === familyId).map(r => `${i.header?.date ?? formatDateTime(i.capturedAt)} ${r.qFrom + 1}~${r.qTo + 1}번 ${r.correct}/${r.total} (개별 답 미확인)`));
    return <tr id={`family-detail-${familyId}`} data-testid={`family-detail-${familyId}`} className={styles.detail}><td colSpan={8}><strong>세부</strong> {[...leaves].map(([leaf, total]) => `${leaf} ${total.correct}/${total.n}`).join(' · ')}<br /><strong>문항</strong> {[...qs, ...imported].join(' · ') || '기록 없음'}</td></tr>;
  };
  return <main className={styles.screen}><h1>누적 분석</h1>
    <div className={styles.filters}>
      <label>프로필<select value={profileId} onChange={e => change(() => setProfileId(e.target.value))}>{profiles.map(id => <option key={id} value={id}>{effectiveProfile(id, data.profiles).name}</option>)}</select></label>
      <label>출처<select value={source} onChange={e => change(() => setSource(e.target.value as Source))}><option value="all">전체</option><option value="tool">도구</option><option value="import">가져오기</option></select></label>
      <label>조건<select value={condition} onChange={e => change(() => setCondition(e.target.value as ConditionFilter))}>{(['all', 'full', 'section', 'drill', 'external', 'external-overtime'] as const).map(v => <option key={v} value={v}>{conditionLabel[v]}</option>)}</select></label>
      <label>최근 N회<select value={recent} onChange={e => change(() => setRecent(e.target.value as Recent))}>{(['all', '1', '3', '5', '10'] as const).map(v => <option key={v} value={v}>{v === 'all' ? '전체' : v}</option>)}</select></label>
      <label className={styles.check}><input type="checkbox" checked={firstOnly} onChange={e => change(() => setFirstOnly(e.target.checked))} />첫 풀이만</label>
    </div>
    {!records.length && <p>분석할 기록이 없습니다</p>}
      <section><h2>회차</h2><table className={styles.table}><thead><tr><th>날짜</th><th>출처</th><th>조건</th><th>시간 내/전체</th><th>영역별</th><th>초과</th></tr></thead><tbody>{records.map(record => {
        const separator = record.indexOf(':');
        const recordSource = record.slice(0, separator) as Exclude<Source, 'all'>;
        const id = record.slice(separator + 1);
        const session = recordSource === 'tool' ? data.sessions.find(s => s.id === id) : undefined;
        const imported = recordSource === 'import' ? data.imports.find(i => i.id === id) : undefined;
        const rc = cells.filter(c => c.recordId === id && c.source === recordSource);
        const n = rc.reduce((sum, c) => sum + c.n, 0);
        const correct = rc.reduce((sum, c) => sum + c.correct, 0);
        const inLimit = rc.every(c => c.inLimitCorrect === null) ? null : rc.reduce((sum, c) => sum + (c.inLimitCorrect ?? 0), 0);
        const parts = aggregate(rc, 'section', { profileId, firstOnly: false });
        const set = session?.setId ? data.sets.find(s => s.id === session.setId) : undefined;
        const summary = session && set ? summarize(questionViews(session, set), session) : undefined;
        const importRatio = imported?.header?.usedMin && imported.header.limitMin ? Math.round(imported.header.usedMin / imported.header.limitMin * 100) : null;
        const overtime = imported ? imported.overtime && importRatio !== null ? `초과 ${importRatio}%` : '—' : summary ? formatSec(summary.overtimeSec) : '—';
        const label = imported ? `${imported.header?.round ? `${imported.header.round}회차 · ` : ''}${imported.header?.date ?? '가져오기'}` : set?.name ?? session?.label ?? '도구 기록';
        return <tr key={record}><td data-label="날짜">{imported?.header?.date ?? formatDateTime(session?.finishedAt ?? session?.createdAt ?? imported?.capturedAt ?? 0)}<br />{label}</td><td data-label="출처">{imported ? '가져오기' : '도구'}</td><td data-label="조건">{conditionLabel[rc[0]?.condition ?? 'all']}</td><td data-label="시간 내/전체">{imported?.overtime ? `—(${overtime})` : inLimit === null ? '—' : `${inLimit}/${n}`} · {correct}/{n}</td><td data-label="영역별">{parts.map(p => <span key={p.id} className={`${styles.bar} ${p.n < 5 ? styles.lowSample : ''}`}><i style={{ width: `${(p.p ?? 0) * 100}%` }} /><b>{profile.sections.find(s => s.id === p.id)?.name ?? '미지정'} {p.correct}/{p.n}{p.n >= 5 && ` ${pct(p.p)}`}</b></span>)}</td><td data-label="초과">{overtime}</td></tr>;
      })}</tbody></table></section>
      <section><h2>영역</h2><table aria-label="영역별 분석" className={styles.table}><thead><tr><th>영역</th><th>x/n</th><th>시간 내</th><th>중앙값 / 페이스</th><th>미응답</th><th>초과</th><th>속도 손실</th></tr></thead><tbody>{sections.map(row => {
        const def = profile.sections.find(x => x.id === row.id);
        const selected = cells.filter(c => c.sectionId === row.id);
        const response = row.answered === null ? null : `${row.answeredN}/${row.n}`;
        const unanswered = row.answered === null ? '—' : row.answeredN - row.answered;
        const selectedIds = new Set(selected.filter(c => c.source === 'tool').map(c => c.recordId));
        const viewsBySession = data.sessions.filter(s => selectedIds.has(s.id) && s.mode === 'omr' && s.status === 'graded' && s.setId)
          .flatMap(s => questionViews(s, data.sets.find(set => set.id === s.setId)!)
            .filter(v => s.plan[v.sectionIdx].sectionId === row.id).map(view => ({ view, session: s })));
        const timingKnown = viewsBySession.length > 0;
        const overtime = viewsBySession.filter(({ view }) => view.overtime).length;
        const loss = viewsBySession.filter(({ session }) => session.mode === 'omr' && session.policy === 'soft')
          .reduce((sum, { view }) => sum + Number(view.correct === true) - Number(view.inLimitCorrect === true), 0);
        const weightedPace = selected.reduce((sum, c) => sum + c.paceSec * c.n, 0) / Math.max(1, selected.reduce((sum, c) => sum + c.n, 0));
        return <tr key={row.id} className={row.n < 5 ? styles.lowSample : undefined}><th>{def?.name ?? '미지정'}</th><td data-label="x/n">{row.correct}/{row.n}</td><td data-label="시간 내">{row.inLimitCorrect === null ? '—' : `${row.inLimitCorrect}/${row.inLimitN}`}</td><td data-label="중앙값 / 페이스">{ratio(row.medianSec)} / {ratio(weightedPace)} · {row.timedN}</td><td data-label="미응답">{unanswered}{response && <small> · 응답 데이터 {response}</small>}</td><td data-label="초과">{timingKnown ? overtime : '—'}</td><td data-label="속도 손실">{timingKnown ? loss : '—'}</td></tr>;
      })}</tbody></table></section>
      <section><h2>가족</h2><p className={styles.coverage}>보정 p̃: k={SHRINK_K} · 시간 데이터 {totalTimed}/{totalN}문항</p><table aria-label="가족별 분석" data-testid="family-table" className={styles.table}><thead><tr><th>가족</th><th>w</th><th>x/n</th><th>p̃</th><th>중앙값 초</th><th>찍음 맞힘</th><th>기대 오답</th><th>판정</th></tr></thead><tbody>{families.map(row => <Fragment key={row.familyId}><tr className={row.n < 5 ? styles.lowSample : undefined} onClick={() => setOpen(open === row.familyId ? null : row.familyId)}><th><button type="button" tabIndex={-1} aria-expanded={open === row.familyId} aria-controls={`family-detail-${row.familyId}`} onMouseDown={stopFocus} onClick={event => { event.stopPropagation(); setOpen(open === row.familyId ? null : row.familyId); }}>{row.familyId}</button></th><td data-label="w">{row.w.toFixed(3)}</td><td data-label="x/n">{row.correct}/{row.n}</td><td data-label="p̃">{row.n < 5 ? '표본 부족' : pct(row.pTilde)}</td><td data-label="중앙값 초">{ratio(row.medianSec)} · {row.timedN}</td><td data-label="찍음 맞힘">{row.guessedCorrect === null ? '—' : `${row.guessedCorrect}/${row.guessedN}`}</td><td data-label="기대 오답">기대오답 {row.expectedWrong.toFixed(2)}</td><td data-label="판정">{row.verdict.join(', ') || '—'}</td></tr>{open === row.familyId && detail(row.familyId)}</Fragment>)}</tbody></table></section>
    <section><h2>시간과 보정 정답률</h2><Scatter rows={families} /></section>
    <div className={styles.cards}><VerdictCard testId="verdict-study" title="공부 Top3" rows={decisions.study} warning={r => r.overtimePossible ? '시간 교란 가능' : null} /><VerdictCard testId="verdict-speed" title="속도 훈련" rows={decisions.speed} /><VerdictCard testId="verdict-defer" title="뒤로" rows={decisions.defer} /><VerdictCard testId="verdict-guess" title="찍기 후보" rows={decisions.guess} warning={r => r.guessRuleUnconfirmed ? '감점 없음(미확인)' : null} /></div>
    <button type="button" tabIndex={-1} onMouseDown={stopFocus} onClick={() => go({ name: 'home' })}>홈으로</button>
  </main>;
}
