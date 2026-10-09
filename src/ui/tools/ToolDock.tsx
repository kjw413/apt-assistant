import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CALC_INITIAL, keyFromKeyboard, press, type CalcKey, type CalcState } from '../../domain/calculator';
import type { SectionTools } from '../../domain/types';
import { Calculator } from './Calculator';
import { Paint, type PaintHandle } from './Paint';
import { DEFAULT_PEN_WIDTH, PEN_WIDTHS } from './paintStore';
import styles from './tools.module.css';

const PEN_WIDTH_KEY = 'apt-pen-width';

function loadPenWidth(): number {
  try {
    const saved = Number(localStorage.getItem(PEN_WIDTH_KEY));
    return (PEN_WIDTHS as readonly number[]).includes(saved) ? saved : DEFAULT_PEN_WIDTH;
  } catch {
    return DEFAULT_PEN_WIDTH;
  }
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function ToolDock(props: {
  sessionId: string;
  tools: SectionTools;
  calcKeyboard: boolean;
  memo: string;
  onMemo: (text: string) => void;
}) {
  const { sessionId, tools, calcKeyboard, memo, onMemo } = props;
  const [state, setState] = useState<CalcState>(CALC_INITIAL);
  const [selection, setSelection] = useState({ tools, tab: tools.tab });
  const memoRef = useRef<HTMLTextAreaElement>(null);
  const paintRef = useRef<PaintHandle>(null);
  const penMenuRef = useRef<HTMLDivElement>(null);
  const [penWidth, setPenWidth] = useState(loadPenWidth);
  const [penMenu, setPenMenu] = useState(false);

  // A new section is identified by its tools object, including identical defaults.
  if (selection.tools !== tools) {
    setSelection({ tools, tab: tools.tab });
  }
  const tab = tools.allowed[selection.tab]
    ? selection.tab
    : tools.allowed.memo ? 'memo' : 'paint';
  const allLocked = !tools.allowed.memo && !tools.allowed.paint && !tools.allowed.calc;
  const memoVisible = tools.allowed.memo && tab === 'memo';
  const paintVisible = tools.allowed.paint && tab === 'paint';

  useLayoutEffect(() => {
    if (!memoVisible) memoRef.current?.blur();
  }, [memoVisible]);

  useEffect(() => {
    if (!paintVisible) setPenMenu(false);
  }, [paintVisible]);

  useEffect(() => {
    if (!penMenu) return undefined;
    function onOutside(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && penMenuRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-testid="pen-settings"]')) return;
      setPenMenu(false);
    }
    document.addEventListener('pointerdown', onOutside, true);
    return () => document.removeEventListener('pointerdown', onOutside, true);
  }, [penMenu]);

  const choosePen = (width: number) => {
    setPenWidth(width);
    setPenMenu(false);
    try { localStorage.setItem(PEN_WIDTH_KEY, String(width)); } catch { /* 저장 못 해도 이번 세션에는 적용 */ }
  };

  useEffect(() => {
    setState(CALC_INITIAL);
    memoRef.current?.blur();
  }, [sessionId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.target === memoRef.current) {
        if (event.key === 'Escape') {
          event.preventDefault();
          memoRef.current?.blur();
        }
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement && (
        target.closest('input, textarea, select') || target.isContentEditable
      )) return;
      if (!tools.allowed.calc || !calcKeyboard) return;
      const key = keyFromKeyboard(event);
      if (key === null) return;
      event.preventDefault();
      setState(current => press(current, key));
    }
    function onPointerDown(event: PointerEvent) {
      const textarea = memoRef.current;
      if (textarea && document.activeElement === textarea && event.target !== textarea) {
        textarea.blur();
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [tools.allowed.calc, calcKeyboard]);

  const onPress = (key: CalcKey) => {
    if (tools.allowed.calc) setState(current => press(current, key));
  };

  return (
    <section className={styles.dock} data-locked={allLocked} aria-label="도구 패널">
      <div className={styles.tabPanel} hidden={!tools.allowed.memo && !tools.allowed.paint}>
        <div className={styles.toolHeader}>
          <div className={styles.tabs} role="tablist" aria-label="메모와 그림판">
            <button
              type="button" tabIndex={-1} role="tab" data-testid="tab-memo"
              hidden={!tools.allowed.memo} aria-selected={tab === 'memo'}
              onMouseDown={event => event.preventDefault()}
              onClick={() => setSelection(current => ({ ...current, tab: 'memo' }))}
            >메모장</button>
            <button
              type="button" tabIndex={-1} role="tab" data-testid="tab-paint"
              hidden={!tools.allowed.paint} aria-selected={tab === 'paint'}
              onMouseDown={event => event.preventDefault()}
              onClick={() => setSelection(current => ({ ...current, tab: 'paint' }))}
            >그림판</button>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button" tabIndex={-1} className={styles.gearButton} data-testid="pen-settings"
              hidden={!paintVisible} aria-label="펜 설정" aria-expanded={penMenu}
              onMouseDown={event => event.preventDefault()}
              onClick={() => setPenMenu(open => !open)}
            ><GearIcon /></button>
            <button
              type="button" tabIndex={-1} className={styles.headerClear}
              onMouseDown={event => event.preventDefault()}
              onClick={() => tab === 'memo' ? onMemo('') : paintRef.current?.clear()}
            >삭제</button>
            {penMenu && paintVisible && (
              <div ref={penMenuRef} className={styles.penMenu} role="group" aria-label="펜 굵기">
                <span className={styles.penMenuTitle}>펜 굵기</span>
                {PEN_WIDTHS.map(width => (
                  <button
                    key={width} type="button" tabIndex={-1} data-testid={`pen-width-${width}`}
                    className={styles.penWidth} aria-label={`굵기 ${width}`} aria-pressed={penWidth === width}
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => choosePen(width)}
                  ><i style={{ width: width + 3, height: width + 3 }} /></button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className={styles.tabContent} data-tab={tab}>
          <div className={styles.memoPanel} role="tabpanel" aria-label="메모" hidden={!memoVisible}>
            <textarea
              ref={memoRef} className={styles.memo} data-testid="memo" aria-label="메모"
              value={memo} onChange={event => onMemo(event.target.value)}
              placeholder="메모…" spellCheck={false}
            />
          </div>
          <div className={styles.paintHost} role="tabpanel" aria-label="그림판" hidden={!paintVisible}>
            <Paint ref={paintRef} sessionId={sessionId} active={paintVisible} penWidth={penWidth} />
          </div>
        </div>
      </div>
      <div className={styles.calculator} hidden={!tools.allowed.calc}>
        <div className={styles.toolHeader}>
          <span className={styles.inputTarget}>계산기</span>
        </div>
        <Calculator state={state} onPress={onPress} />
      </div>
      <p className={styles.lock} data-testid="tool-lock" hidden={!allLocked}>
        이 영역은 계산기·메모·그림판을 쓸 수 없습니다
      </p>
    </section>
  );
}
