import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CALC_INITIAL, keyFromKeyboard, press, type CalcKey, type CalcState } from '../../domain/calculator';
import type { SectionTools } from '../../domain/types';
import { Calculator } from './Calculator';
import { Paint } from './Paint';
import styles from './tools.module.css';

export function ToolDock(props: {
  sessionId: string;
  tools: SectionTools;
  calcKeyboard: boolean;
  memo: string;
  onMemo: (text: string) => void;
}) {
  const { sessionId, tools, calcKeyboard, memo, onMemo } = props;
  const [state, setState] = useState<CalcState>(CALC_INITIAL);
  const [selection, setSelection] = useState({ tools, tab: tools.tab, calc: tools.calc });
  const [memoFocused, setMemoFocused] = useState(false);
  const memoRef = useRef<HTMLTextAreaElement>(null);

  // A new section is identified by its tools object, including identical defaults.
  if (selection.tools !== tools) {
    setSelection({ tools, tab: tools.tab, calc: tools.calc });
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
        <div className={styles.tabs} role="tablist" aria-label="메모와 그림판">
          <button
            type="button" tabIndex={-1} role="tab" data-testid="tab-memo"
            hidden={!tools.allowed.memo} aria-selected={tab === 'memo'}
            onMouseDown={event => event.preventDefault()}
            onClick={() => setSelection(current => ({ ...current, tab: 'memo' }))}
          >메모</button>
          <button
            type="button" tabIndex={-1} role="tab" data-testid="tab-paint"
            hidden={!tools.allowed.paint} aria-selected={tab === 'paint'}
            onMouseDown={event => event.preventDefault()}
            onClick={() => setSelection(current => ({ ...current, tab: 'paint' }))}
          >그림판</button>
        </div>
        <div className={styles.tabContent}>
          <div className={styles.memoPanel} role="tabpanel" aria-label="메모" hidden={!memoVisible}>
            <textarea
              ref={memoRef} className={styles.memo} data-testid="memo" aria-label="메모"
              value={memo} onChange={event => onMemo(event.target.value)}
              onFocus={() => setMemoFocused(true)} onBlur={() => setMemoFocused(false)}
              placeholder="여기에 메모하세요" spellCheck={false}
            />
            <button
              type="button" tabIndex={-1} className={styles.memoClear}
              onMouseDown={event => event.preventDefault()} onClick={() => onMemo('')}
            >지우기</button>
          </div>
          <div className={styles.paintHost} role="tabpanel" aria-label="그림판" hidden={!paintVisible}>
            <Paint sessionId={sessionId} active={paintVisible} />
          </div>
        </div>
      </div>
      <div className={styles.calculator} hidden={!tools.allowed.calc} data-folded={selection.calc === 'collapsed'}>
        <span className={styles.inputTarget}>{memoFocused ? '⌨ 메모' : '⌨ 계산기'}</span>
        <button
          type="button" tabIndex={-1} data-testid="calc-toggle" className={styles.calcToggle}
          aria-label={selection.calc === 'open' ? '계산기 접기' : '계산기 펼치기'}
          aria-expanded={selection.calc === 'open'}
          onMouseDown={event => event.preventDefault()}
          onClick={() => setSelection(current => ({ ...current, calc: current.calc === 'open' ? 'collapsed' : 'open' }))}
        >{selection.calc === 'open' ? '접기' : '펼치기'}</button>
        <Calculator state={state} onPress={onPress} />
      </div>
      <p className={styles.lock} data-testid="tool-lock" hidden={!allLocked}>
        이 영역은 계산기·메모·그림판을 쓸 수 없습니다
      </p>
    </section>
  );
}
