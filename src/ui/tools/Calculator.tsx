import { view, type CalcKey, type CalcState } from '../../domain/calculator';
import styles from './tools.module.css';

const KEYS: readonly { key: CalcKey; label: string; name?: string }[] = [
  { key: 'C', label: 'C', name: '계산 지우기' },
  { key: 'BS', label: '⌫', name: '한 자리 지우기' },
  { key: '/', label: '÷', name: '나누기' },
  { key: 'SQRT', label: '√', name: '제곱근' },
  { key: '7', label: '7' }, { key: '8', label: '8' }, { key: '9', label: '9' },
  { key: '*', label: '×', name: '곱하기' },
  { key: '4', label: '4' }, { key: '5', label: '5' }, { key: '6', label: '6' },
  { key: '-', label: '−', name: '빼기' },
  { key: '1', label: '1' }, { key: '2', label: '2' }, { key: '3', label: '3' },
  { key: '+', label: '+', name: '더하기' },
  { key: '0', label: '0' }, { key: '00', label: '00' }, { key: '.', label: '.' },
  { key: '=', label: '=', name: '계산 결과' },
];

export function Calculator(props: { state: CalcState; onPress: (key: CalcKey) => void }) {
  const result = view(props.state);
  return (
    <>
      <div className={styles.calcReadout}>
        <div className={styles.calcExpr} data-testid="calc-expr" title={result.expr}>
          {result.expr}
        </div>
        <output className={styles.calcDisplay} data-testid="calc-display" aria-label="계산기 표시">
          {result.main}
        </output>
      </div>
      <div className={styles.keypad} aria-label="계산기 키패드">
        {KEYS.map(({ key, label, name }) => (
          <button
            key={key}
            type="button"
            tabIndex={-1}
            className={key === '=' ? styles.equalsKey : styles.calcKey}
            data-testid={`calc-key-${key}`}
            aria-label={name ?? label}
            onMouseDown={event => event.preventDefault()}
            onClick={() => props.onPress(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
