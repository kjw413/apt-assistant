import { Fragment, useMemo, useState } from 'react';
import { aggregate, familyRows, toCells, verdicts, type Cell, type Condition, type FamilyRow, type Verdict } from '../../domain/analytics';
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

const SOURCE_LABEL: Record<Source, string> = { all: '전체', tool: '툴에서 푼 기록', import: '가져온 기록' };
const CONDITION_LABEL: Record<ConditionFilter, string> = {
  all: '전체', full: '전체 모의고사', section: '영역별 연습', drill: '드릴',
  external: '외부 모의고사', 'external-overtime': '외부 모의고사(시간 초과)',
};
const RECENT_LABEL: Record<Recent, string> = { all: '전체 기간', 1: '최근 1회', 3: '최근 3회', 5: '최근 5회', 10: '최근 10회' };
const VERDICT_LABEL: Record<Verdict, string> = { 공부: '먼저 공부', '속도 훈련': '속도 훈련', 뒤로: '뒤로 미루기', '찍기 후보': '찍기 후보' };

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
const sec = (x: number | null) => (x === null ? '—' : `${Math.round(x)}초`);
const lost = (x: number) => `${x.toFixed(1)}문항`;
const recordKey = (source: Exclude<Source, 'all'>, id: string) => `${source}:${id}`;
const dotDate = (iso: string) => iso.replace(/-/g, '.');
const NONE = '기록 없음';

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

function VerdictCard({ testId, title, hint, empty, rows, detail, warning }: {
  testId: string; title: string; hint: string; empty: string; rows: FamilyRow[];
  detail: (row: FamilyRow) => string; warning?: (row: FamilyRow) => string | null;
}) {
  return <section className={styles.card}>
    <h3>{title}</h3>
    <p className={styles.hint}>{hint}</p>
    <ul data-testid={testId} className={styles.verdictList}>{rows.map(row => {
      const warn = warning?.(row);
      return <li key={row.familyId}><b>{row.familyId}</b> <span>{detail(row)}</span>{warn && <small className={styles.warnChip}>{warn}</small>}</li>;
    })}</ul>
    {!rows.length && <p className={styles.empty}>{empty}</p>}
  </section>;
}

function Scatter({ rows }: { rows: FamilyRow[] }) {
  const timed = rows.filter(r => r.timeRatio !== null);
  const maxRatio = Math.max(2, ...timed.map(r => r.timeRatio!));
  const x = (v: number) => 42 + v / maxRatio * 230;
  const y = (v: number) => 170 - Math.max(0, Math.min(1, v)) * 135;
  return <svg data-testid="scatter" className={styles.scatter} viewBox="0 0 300 205" role="img" aria-label="유형별 풀이 속도와 정답률">
    <line x1="42" y1={y(.2)} x2="272" y2={y(.2)} data-testid="scatter-chance-line" className={styles.baseline} />
    <line x1={x(1)} y1="20" x2={x(1)} y2="170" data-testid="scatter-pace-line" className={styles.baseline} />
    <line x1="42" y1="170" x2="272" y2="170" className={styles.axis} /><line x1="42" y1="20" x2="42" y2="170" className={styles.axis} />
    <text x="4" y="13">정답률</text><text x="168" y="202">느림 → (기준 시간 대비)</text>
    <text x={Math.max(44, x(1) - 64)} y="34">강점</text><text x={x(1) + 6} y="34">속도 훈련</text>
    <text x={Math.max(44, x(1) - 64)} y="162">공부</text><text x={x(1) + 6} y="162">뒤로·찍기</text>
    <text x="38" y="186">0</text><text x={x(1) - 10} y="186">기준</text><text x="248" y="186">×{maxRatio.toFixed(1)}</text>
    <text x="6" y={y(.2) + 4}>20%</text><text x="4" y="26">100%</text>
    {timed.map(row => <circle key={row.familyId} cx={x(row.timeRatio!)} cy={y(row.pTilde)} r={Math.max(4, Math.sqrt(row.w) * 32)} className={row.n < 5 ? styles.lowDot : styles.dot}><title>{`${row.familyId} ${row.correct}/${row.n}, 기준 시간의 ${row.timeRatio!.toFixed(1)}배`}</title></circle>)}
    {!timed.length && <g><rect x="52" y="86" width="196" height="22" rx="4" className={styles.emptyRect} /><text x="150" y="101" textAnchor="middle">풀이 시간 기록이 없어 아직 그릴 수 없습니다</text></g>}
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
  const toggle = (familyId: string) => setOpen(open === familyId ? null : familyId);

  const detail = (row: FamilyRow) => {
    const familyId = row.familyId;
    const familyCells = cells.filter(c => c.familyId === familyId);
    const leaves = new Map<string, { correct: number; n: number }>();
    for (const c of familyCells) {
      const leaf = c.leafId ?? '세부 유형 없음';
      const total = leaves.get(leaf) ?? { correct: 0, n: 0 };
      total.correct += c.correct; total.n += c.n; leaves.set(leaf, total);
    }
    const toolIds = new Set(familyCells.filter(c => c.source === 'tool').map(c => c.recordId));
    const importIds = new Set(familyCells.filter(c => c.source === 'import').map(c => c.recordId));
    const qs = data.sessions.filter(s => toolIds.has(s.id) && s.status === 'graded' && !isFutureDocument(s) && s.setId)
      .flatMap(s => { const set = data.sets.find(x => x.id === s.setId); return set ? questionViews(s, set).filter(v => (set.ranges.find(r => v.q >= r.from && v.q <= r.to)?.familyId ?? set.defaultFamilyId ?? '미분류') === familyId).map(v => `${set.name} ${v.no}번`) : []; });
    const imported = data.imports.filter(i => importIds.has(i.id) && i.status === 'confirmed').flatMap(i => (i.rows ?? []).filter(r => r.family === familyId).map(r => `${dotDate(i.header?.date ?? '')} ${r.qFrom + 1}~${r.qTo + 1}번 ${r.correct}/${r.total}`));
    return <tr id={`family-detail-${familyId}`} data-testid={`family-detail-${familyId}`} className={styles.detail}><td colSpan={4}>
      <dl className={styles.detailList}>
        <div><dt>문항당 시간</dt><dd>{sec(row.medianSec)} <small>(기준 {sec(row.paceSec)} · 시간 기록 {row.timedN}문항)</small></dd></div>
        <div><dt>실전 출제 비중</dt><dd>약 {Math.round(row.w * 100)}%</dd></div>
        <div><dt>세부 유형</dt><dd>{[...leaves].map(([leaf, total]) => `${leaf} ${total.correct}/${total.n}`).join(' · ')}</dd></div>
        <div><dt>푼 문항</dt><dd>{[...qs, ...imported].join(' · ') || '기록 없음'}{imported.length > 0 && <small> (가져온 기록은 문항별 정오를 알 수 없음)</small>}</dd></div>
      </dl>
    </td></tr>;
  };

  return <main className={styles.screen}>
    <header className={styles.head}>
      <h1>누적 분석</h1>
      <button type="button" tabIndex={-1} onMouseDown={stopFocus} onClick={() => go({ name: 'home' })}>홈으로</button>
    </header>
    <p className={styles.lead}>지금까지 푼 기록을 모아, 먼저 공부할 유형과 실전에서 풀 순서를 알려 줍니다.</p>

    <div className={styles.filters}>
      <label>시험<select value={profileId} onChange={e => change(() => setProfileId(e.target.value))}>{profiles.map(id => <option key={id} value={id}>{effectiveProfile(id, data.profiles).name}</option>)}</select></label>
      <label>기록 종류<select value={source} onChange={e => change(() => setSource(e.target.value as Source))}>{(['all', 'tool', 'import'] as const).map(v => <option key={v} value={v}>{SOURCE_LABEL[v]}</option>)}</select></label>
      <label>응시 방식<select value={condition} onChange={e => change(() => setCondition(e.target.value as ConditionFilter))}>{(['all', 'full', 'section', 'drill', 'external', 'external-overtime'] as const).map(v => <option key={v} value={v}>{CONDITION_LABEL[v]}</option>)}</select></label>
      <label>기간<select value={recent} onChange={e => change(() => setRecent(e.target.value as Recent))}>{(['all', '1', '3', '5', '10'] as const).map(v => <option key={v} value={v}>{RECENT_LABEL[v]}</option>)}</select></label>
      <label className={styles.check}><input type="checkbox" checked={firstOnly} onChange={e => change(() => setFirstOnly(e.target.checked))} />처음 푼 기록만<small>같은 문제집을 다시 푼 기록은 점수가 부풀려져 뺍니다</small></label>
    </div>

    {!records.length && <p className={styles.emptyBox}>분석할 기록이 없습니다. 세션을 채점하거나 외부 모의고사 채점을 입력하면 여기에 쌓입니다.</p>}

    <section className={styles.block}>
      <h2>지금 할 일</h2>
      <div className={styles.cards}>
        <VerdictCard testId="verdict-study" title="먼저 공부할 유형" hint="실전 한 번에 가장 많이 틀릴 것으로 예상되는 순서"
          empty="기록이 더 쌓이면 알려 줍니다" rows={decisions.study} detail={r => `예상 실점 ${lost(r.expectedWrong)}`}
          warning={r => (r.overtimePossible ? '시간 초과 기록 포함' : null)} />
        <VerdictCard testId="verdict-speed" title="속도를 올릴 유형" hint="정답률은 괜찮은데 기준 시간보다 1.3배 이상 오래 걸림"
          empty="풀이 시간 기록이 유형별 4문항 이상 쌓이면 판정합니다" rows={decisions.speed}
          detail={r => `문항당 ${sec(r.medianSec)} (기준 ${sec(r.paceSec)})`} />
        <VerdictCard testId="verdict-defer" title="실전에서 나중에 풀 유형" hint="같은 시간에 얻는 점수가 영역 평균보다 크게 낮음"
          empty="풀이 시간 기록이 유형별 4문항 이상 쌓이면 판정합니다" rows={decisions.defer}
          detail={r => `정답률 ${pct(r.pTilde)} · 문항당 ${sec(r.medianSec)}`} />
        <VerdictCard testId="verdict-guess" title="시간이 없으면 찍을 유형" hint="정답률이 찍기 수준(20%) 근처"
          empty="해당 유형이 없습니다" rows={decisions.guess} detail={r => `정답률 ${pct(r.pTilde)}`}
          warning={r => (r.guessRuleUnconfirmed ? '오답 감점이 없다고 가정' : null)} />
      </div>
    </section>

    <section className={styles.block}>
      <h2>회차별 기록</h2>
      <table aria-label="회차별 기록" className={styles.cardTable}><tbody>{records.map(record => {
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
        const title = imported
          ? `${imported.source === 'passsidae' ? '합격시대 ' : ''}${imported.header?.round ? `${imported.header.round}회 모의고사` : '가져온 기록'}`
          : set?.name ?? session?.label ?? '툴 기록';
        const when = imported ? dotDate(imported.header?.date ?? formatDateTime(imported.capturedAt)) : formatDateTime(session?.finishedAt ?? session?.createdAt ?? 0);
        const overtimeText = imported
          ? (imported.header?.usedMin && imported.header.limitMin ? `${imported.header.usedMin}분 / ${imported.header.limitMin}분${imported.overtime && importRatio !== null ? ` (초과 ${importRatio}%)` : ''}` : '—')
          : summary && summary.overtimeSec > 0 ? `${formatSec(summary.overtimeSec)} 초과` : '없음';
        return <tr key={record}>
          <th>
            <span className={styles.recordTitle}>{title}</span>
            <span className={styles.recordMeta}>{when} · {imported ? '가져온 기록' : '툴 기록'} · {CONDITION_LABEL[rc[0]?.condition ?? 'all']}</span>
          </th>
          <td data-label="점수"><b>{correct}/{n}</b> {n > 0 && `(${pct(correct / n)})`}</td>
          <td data-label="제한 시간 안 점수">{imported?.overtime ? '계산 불가 (시간 초과 기록)' : inLimit === null ? '—' : `${inLimit}/${n}`}</td>
          <td data-label={imported ? '소요 시간' : '시간 초과'}>{overtimeText}</td>
          <td data-label="영역별 정답" className={styles.wide}>{parts.map(p => <span key={p.id} className={`${styles.bar} ${p.n < 5 ? styles.lowSample : ''}`}>
            <span className={styles.barName}>{profile.sections.find(s => s.id === p.id)?.name ?? '영역 없음'}</span>
            <span className={styles.barTrack}><i style={{ width: `${(p.p ?? 0) * 100}%` }} /></span>
            <span className={styles.barValue}>{p.correct}/{p.n}</span>
          </span>)}</td>
        </tr>;
      })}</tbody></table>
    </section>

    <section className={styles.block}>
      <h2>영역별 성적</h2>
      <table aria-label="영역별 성적" className={styles.cardTable}><tbody>{sections.map(row => {
        const def = profile.sections.find(x => x.id === row.id);
        const selected = cells.filter(c => c.sectionId === row.id);
        const unanswered = row.answered === null ? null : row.answeredN - row.answered;
        const selectedIds = new Set(selected.filter(c => c.source === 'tool').map(c => c.recordId));
        const viewsBySession = data.sessions.filter(s => selectedIds.has(s.id) && s.mode === 'omr' && s.status === 'graded' && s.setId)
          .flatMap(s => questionViews(s, data.sets.find(set => set.id === s.setId)!)
            .filter(v => s.plan[v.sectionIdx].sectionId === row.id).map(view => ({ view, session: s })));
        const timingKnown = viewsBySession.length > 0;
        const overtime = viewsBySession.filter(({ view }) => view.overtime).length;
        const loss = viewsBySession.filter(({ session }) => session.mode === 'omr' && session.policy === 'soft')
          .reduce((sum, { view }) => sum + Number(view.correct === true) - Number(view.inLimitCorrect === true), 0);
        const weightedPace = selected.reduce((sum, c) => sum + c.paceSec * c.n, 0) / Math.max(1, selected.reduce((sum, c) => sum + c.n, 0));
        return <tr key={row.id} className={row.n < 5 ? styles.lowSample : undefined}>
          <th><span className={styles.recordTitle}>{def?.name ?? '영역 없음'}</span>
            <span className={styles.recordMeta}>{row.correct}/{row.n}{row.n >= 5 && ` · ${pct(row.p)}`}</span></th>
          <td data-label="제한 시간 안 정답">{row.inLimitCorrect === null ? NONE : `${row.inLimitCorrect}/${row.inLimitN}`}</td>
          <td data-label="문항당 시간">{row.medianSec === null ? NONE : sec(row.medianSec)} <small>(기준 {sec(weightedPace)})</small></td>
          <td data-label="미응답">{unanswered === null ? NONE : `${unanswered}문항`}{unanswered !== null && row.answeredN < row.n && <small> (응답 기록 {row.answeredN}문항 기준)</small>}</td>
          <td data-label="시간 초과 답">{timingKnown ? overtime : NONE}</td>
          <td data-label="시간 부족으로 놓친 점수">{timingKnown ? loss : NONE}</td>
        </tr>;
      })}</tbody></table>
    </section>

    <section className={styles.block}>
      <h2>유형별 성적</h2>
      <p className={styles.hint}>문항이 적은 유형은 영역 평균 쪽으로 보정한 정답률을 씁니다. 5문항 미만이면 회색으로 표시합니다. 풀이 시간 기록 {totalTimed}/{totalN}문항</p>
      <table aria-label="유형별 성적" data-testid="family-table" className={styles.compactTable}>
        <thead><tr><th>유형</th><th>맞힘</th><th>정답률</th><th>예상 실점</th></tr></thead>
        <tbody>{families.map(row => <Fragment key={row.familyId}>
          <tr className={row.n < 5 ? styles.lowSample : undefined} onClick={() => toggle(row.familyId)}>
            <th><button type="button" tabIndex={-1} aria-expanded={open === row.familyId} aria-controls={`family-detail-${row.familyId}`} onMouseDown={stopFocus}
              onClick={event => { event.stopPropagation(); toggle(row.familyId); }}>{open === row.familyId ? '▾' : '▸'} {row.familyId}</button>
              {row.verdict.length > 0 && <span className={styles.chips}>{row.verdict.map(v => <small key={v} className={styles.chip}>{VERDICT_LABEL[v]}</small>)}</span>}</th>
            <td>{row.correct}/{row.n}</td>
            <td>{row.n < 5 ? '표본 부족' : pct(row.pTilde)}</td>
            <td>{lost(row.expectedWrong)}</td>
          </tr>
          {open === row.familyId && detail(row)}
        </Fragment>)}</tbody>
      </table>
    </section>

    <section className={styles.block}>
      <h2>유형 지도</h2>
      <p className={styles.hint}>오른쪽일수록 느리고 위쪽일수록 정확합니다. 점이 클수록 실전에 많이 나옵니다.</p>
      <Scatter rows={families} />
    </section>
  </main>;
}
