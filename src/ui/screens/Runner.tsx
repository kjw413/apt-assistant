import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { currentAnswers, lastEventT, sectionBounds } from '../../domain/events';
import { effectiveProfile } from '../../domain/profiles';
import type { SessionAction } from '../../domain/session';
import { pace, phaseOf } from '../../domain/timer';
import { beep, dueAlerts, flash } from '../alerts';
import { ConfirmDialog } from '../ConfirmDialog';
import { formatClock, formatOver } from '../format';
import { ToolDock } from '../tools/ToolDock';
import { useApp, useAppStore } from '../useApp';
import { BreakScreen } from './BreakScreen';
import styles from './runner.module.css';

const mouseOnly = {
  type: 'button' as const,
  tabIndex: -1,
  onMouseDown: (event: MouseEvent<HTMLButtonElement>) => event.preventDefault(),
};
type Confirmation = { kind: 'end' | 'finish' | 'abandon'; idx: number; start: number | null };

export function Runner(props: { sessionId: string }) {
  const { sessionId } = props;
  const store = useAppStore();
  const data = useApp(state => state.data);
  const session = data.sessions.find(item => item.id === sessionId);
  const [clockNow, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    // Skip alerts on mount/reload. tick mutates state before its save promise.
    const initial = store.getState().data.sessions.find(item => item.id === sessionId);
    let previous = Math.max(Date.now(), initial ? lastEventT(initial) : 0);
    let previousSession = initial;
    const refresh = () => {
      const latest = store.getState().data;
      const current = latest.sessions.find(item => item.id === sessionId);
      const now = Math.max(Date.now(), current ? lastEventT(current) : 0);
      if (current) {
        for (const kind of dueAlerts(current, previous, now)) {
          if (latest.settings.sound) beep(kind);
          if (latest.settings.flash && panelRef.current) flash(panelRef.current);
        }
      }
      previous = now;
      setNow(now);
    };
    // main.tsx also ticks the store. Observe its transitions before a final
    // deadline navigates away and unmounts Runner, so that alert is not lost.
    const unsubscribe = store.subscribe(state => {
      const current = state.data.sessions.find(item => item.id === sessionId);
      if (current !== previousSession) {
        previousSession = current;
        refresh();
      }
    });
    const interval = setInterval(() => {
      void store.getState().tick();
      refresh();
    }, 250);
    return () => {
      mounted.current = false;
      unsubscribe();
      clearInterval(interval);
      clearTimeout(noticeTimer.current);
    };
  }, [sessionId, store]);

  const now = Math.max(clockNow, session ? lastEventT(session) : 0);
  const phase = session ? phaseOf(session, now) : null;
  const idx = phase?.idx ?? 0;
  const plan = session?.plan[idx];
  const answers = session ? currentAnswers(session) : new Map<number, number>();
  const questions = plan ? Array.from({ length: plan.qTo - plan.qFrom + 1 }, (_, n) => plan.qFrom + n) : [];
  const nextUnanswered = questions.find(q => !answers.has(q));
  const unanswered = questions.filter(q => !answers.has(q)).length;

  useEffect(() => {
    const list = rowsRef.current;
    if (!list || nextUnanswered === undefined) return;
    const row = list.querySelector<HTMLElement>(`[data-testid="omr-row-${nextUnanswered}"]`);
    if (!row) return;
    const view = list.getBoundingClientRect();
    const bounds = row.getBoundingClientRect();
    // Never pull readers back from earlier rows or scroll to an offscreen row.
    if (bounds.top >= view.top && bounds.bottom <= view.bottom
      && bounds.bottom > view.bottom - bounds.height * 2) {
      list.scrollTo({ top: list.scrollTop + bounds.top - view.top - list.clientHeight / 2 + bounds.height / 2 });
    }
  }, [nextUnanswered, idx, phase?.phase]);

  useEffect(() => {
    setMenuOpen(false);
    setConfirmation(null);
  }, [sessionId, idx, phase?.phase === 'break']);

  // Keep the shared dialog's default cancel focus and apply Runner's button rules.
  useLayoutEffect(() => {
    dialogRef.current?.querySelectorAll('button').forEach(button => { button.tabIndex = -1; });
  }, [confirmation]);

  if (!session || !phase || !plan || phase.phase === 'done') return null;

  const set = data.sets.find(item => item.id === session.setId);
  const profile = effectiveProfile(session.profileId, data.profiles);
  const displayNo = (q: number) => set
    ? set.numbering.startNo + (set.numbering.mode === 'perSection' ? q - plan.qFrom : q)
    : q + 1;
  const rangeLabel = `${displayNo(plan.qFrom)}–${displayNo(plan.qTo)}번`;
  const isLast = idx === session.plan.length - 1;
  const clock = phase.overtimeMs > 0 ? formatOver(phase.overtimeMs) : formatClock(phase.remainingMs);
  const clockClass = phase.overtimeMs > 0 ? styles.overtime : phase.remainingMs <= 60_000 ? styles.warning : '';
  const delta = session.policy === 'soft' ? pace(session, now).delta : 0;
  const allLocked = !plan.tools.allowed.calc && !plan.tools.allowed.memo && !plan.tools.allowed.paint;

  async function act(action: SessionAction) {
    const result = await store.getState().act(sessionId, action);
    if (mounted.current && (result === 'locked' || result === 'paused')) {
      clearTimeout(noticeTimer.current);
      setNotice(result === 'locked' ? '영역 마감' : '일시정지 중');
      noticeTimer.current = setTimeout(() => setNotice(null), 2_000);
    }
  }

  function ask(kind: Confirmation['kind']) {
    setMenuOpen(false);
    setConfirmation({ kind, idx, start: sectionBounds(session!)[idx].start });
  }

  async function confirm() {
    const pending = confirmation;
    setConfirmation(null);
    if (!pending) return;
    if (pending.kind === 'abandon') {
      await act({ type: 'abandon' });
      store.getState().go({ name: 'home' });
      return;
    }
    if (pending.kind === 'finish') {
      await act({ type: 'finish' });
      return;
    }
    const current = store.getState().data.sessions.find(item => item.id === sessionId);
    if (!current) return;
    const currentPhase = phaseOf(current, Math.max(Date.now(), lastEventT(current)));
    if (currentPhase.idx !== pending.idx
      || (currentPhase.phase !== 'running' && currentPhase.phase !== 'paused')
      || sectionBounds(current)[pending.idx].start !== pending.start) return;
    // Do not let advance inside endSection end a newly auto-started section.
    if (current.policy === 'hard' && currentPhase.remainingMs === 0) {
      void store.getState().tick();
      return;
    }
    await act({ type: 'endSection' });
  }

  function scrollToUnanswered() {
    if (nextUnanswered === undefined) return;
    const list = rowsRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-testid="omr-row-${nextUnanswered}"]`);
    if (list && row) {
      list.scrollTo({ top: list.scrollTop + row.getBoundingClientRect().top
        - list.getBoundingClientRect().top - list.clientHeight / 2 + row.offsetHeight / 2 });
    }
  }

  return (
    <div ref={panelRef} className={styles.runner} aria-label="연습 러너">
      {phase.phase === 'break' ? (
        <div className={styles.breakHost}>
          <BreakScreen plan={plan} idx={idx} total={session.plan.length} rangeLabel={rangeLabel}
            autoStartAt={phase.autoStartAt} now={now} onStart={() => { void act({ type: 'startSection' }); }} />
          <button {...mouseOnly} onClick={() => ask('finish')}>세션 종료</button>
          <button {...mouseOnly} onClick={() => ask('abandon')}>중단</button>
        </div>
      ) : (
        <>
          <header className={styles.status}>
            <div className={styles.section} title={plan.name}>
              <span className={styles.sectionName}>{plan.name}</span><span>{idx + 1}/{session.plan.length}</span>
            </div>
            <span data-testid="section-clock" className={`${styles.clock} ${clockClass}`}>{clock}</span>
            <button {...mouseOnly} data-testid="unanswered" onClick={scrollToUnanswered}>미응답 {unanswered}</button>
            {session.policy === 'soft' && (
              <>
                <span className={styles.pace} aria-label={`페이스 ${delta}`}>{delta >= 0 ? `+${delta}` : `−${Math.abs(delta)}`}</span>
                <button {...mouseOnly} aria-label={phase.phase === 'paused' ? '재개' : '일시정지'}
                  onClick={() => { void act({ type: phase.phase === 'paused' ? 'resume' : 'pause' }); }}>
                  {phase.phase === 'paused' ? '▶' : '⏸'}
                </button>
              </>
            )}
            <button {...mouseOnly} onClick={() => ask('end')}>종료</button>
            <div className={styles.menuHost}>
              <button {...mouseOnly} aria-label="더 보기" aria-expanded={menuOpen}
                onClick={() => setMenuOpen(open => !open)}>⋯</button>
              {menuOpen && <div className={styles.menu}><button {...mouseOnly} onClick={() => ask('abandon')}>중단</button></div>}
            </div>
          </header>
          {session.mode === 'external' ? (
            <section className={styles.external} data-testid="external-card">
              <h2>{plan.name}</h2><p>{plan.qFrom + 1}–{plan.qTo + 1}번</p>
              <div className={`${styles.bigClock} ${clockClass}`}>{clock}</div>
            </section>
          ) : (
            <div ref={rowsRef} className={styles.rows} aria-label="답안 마킹">
              {questions.map(q => (
                <div key={q} data-testid={`omr-row-${q}`} data-next={q === nextUnanswered}
                  className={styles.row} style={{ gridTemplateColumns: `32px repeat(${plan.choices}, minmax(0, 1fr))` }}>
                  <span className={styles.number}>{displayNo(q)}</span>
                  {Array.from({ length: plan.choices }, (_, n) => n + 1).map(c => (
                    <button {...mouseOnly} key={c} className={styles.bubble} data-testid={`bubble-${q}-${c}`}
                      aria-label={`${displayNo(q)}번 ${c} 선택`} aria-pressed={answers.get(q) === c}
                      onClick={() => { void act({ type: 'answer', q, c }); }}>{c}</button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <div className={`${styles.toolHost} ${allLocked ? styles.lockedTools : ''}`} hidden={phase.phase === 'break'}>
        <ToolDock sessionId={sessionId} tools={plan.tools} calcKeyboard={profile.calcKeyboard}
          memo={data.memos[sessionId] ?? ''} onMemo={text => store.getState().setMemo(sessionId, text)} />
      </div>
      {notice && <div className={styles.notice} role="status">{notice}</div>}
      <div ref={dialogRef} className={styles.dialogHost} onMouseDown={event => event.preventDefault()}>
        <ConfirmDialog open={confirmation !== null}
          title={confirmation?.kind === 'abandon' ? '세션을 중단할까요?'
            : confirmation?.kind === 'finish' ? '남은 영역은 미응시로 기록하고 끝낼까요?'
              : isLast ? '세션을 끝낼까요?' : '영역을 끝낼까요?'}
          confirmText="확인" onConfirm={() => { void confirm(); }} onCancel={() => setConfirmation(null)} />
      </div>
    </div>
  );
}
