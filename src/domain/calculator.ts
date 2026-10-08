// 즉시 실행형 계산기(Windows 표준 계산기처럼 연산자 우선순위가 없다). spec §9.1.
export type CalcKey =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | '00' | '.' | '+' | '-' | '*' | '/' | '=' | 'C' | 'BS' | 'SQRT';

type Op = '+' | '-' | '*' | '/';

export interface CalcState {
  display: string; // 입력 중이면 친 그대로, 아니면 결과 표시 문자열
  val: number; // 지금 표시값의 수치(결과는 15자리 정규화 값)
  acc: number | null;
  op: Op | null;
  entering: boolean; // 숫자를 치는 중
  fresh: boolean; // 직전 연산자 뒤에 피연산자가 생겼다(숫자 입력이나 √)
  lastOp: Op | null; // = 반복용
  lastOperand: number | null;
  expr: string;
  error: boolean;
}

export const CALC_INITIAL: CalcState = Object.freeze({
  display: '0', val: 0, acc: null, op: null, entering: false, fresh: false,
  lastOp: null, lastOperand: null, expr: '', error: false,
});

const SYM: Record<Op, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };
const MAX_DIGITS = 12;

/** 저장값 정규화: 이진 부동소수 잡음(17번째 자리 근처)을 지운다. */
function norm(x: number): number {
  return Number(x.toPrecision(15));
}

export function formatCalcNumber(n: number): string {
  if (!Number.isFinite(n)) return '오류';
  const r = Number(n.toPrecision(12));
  const a = Math.abs(r);
  if (a !== 0 && (a >= 1e12 || a < 1e-6)) return r.toExponential(6).replace(/\.?0+e/, 'e');
  return String(r);
}

function errorState(): CalcState {
  return { ...CALC_INITIAL, display: '오류', error: true };
}

function apply(a: number, op: Op, b: number): number | null {
  let r: number;
  switch (op) {
    case '+': r = a + b; break;
    case '-': r = a - b; break;
    case '*': r = a * b; break;
    case '/':
      if (b === 0) return null;
      r = a / b;
      break;
  }
  return Number.isFinite(r) ? norm(r) : null;
}

function showResult(s: CalcState, v: number, patch: Partial<CalcState>): CalcState {
  return { ...s, val: v, display: formatCalcNumber(v), entering: false, fresh: false, ...patch };
}

function inputDigits(s: CalcState, digits: '00' | string): CalcState {
  let d = s.entering ? s.display : '0';
  for (const ch of digits) {
    if (d === '0') { d = ch; continue; }
    if (d.replace(/[^0-9]/g, '').length >= MAX_DIGITS) break;
    d += ch;
  }
  return { ...s, display: d, val: parseFloat(d), entering: true, fresh: true };
}

function inputDot(s: CalcState): CalcState {
  if (!s.entering) return { ...s, display: '0.', val: 0, entering: true, fresh: true };
  if (s.display.includes('.')) return s;
  return { ...s, display: s.display + '.' };
}

function backspace(s: CalcState): CalcState {
  if (!s.entering) return s;
  let d = s.display.slice(0, -1);
  if (d === '' || d === '-') d = '0';
  return { ...s, display: d, val: parseFloat(d) };
}

function sqrt(s: CalcState): CalcState {
  const v = s.val;
  if (v < 0) return errorState();
  const r = norm(Math.sqrt(v));
  const inner = `√(${formatCalcNumber(v)})`;
  const expr = s.op !== null && s.acc !== null ? `${formatCalcNumber(s.acc)} ${SYM[s.op]} ${inner}` : inner;
  return { ...showResult(s, r, { expr }), fresh: true };
}

function operator(s: CalcState, op: Op): CalcState {
  let acc: number;
  if (s.op !== null && s.acc !== null && s.fresh) {
    const r = apply(s.acc, s.op, s.val);
    if (r === null) return errorState();
    acc = r;
  } else if (s.op !== null && s.acc !== null) {
    acc = s.acc; // 연산자 교체
  } else {
    acc = norm(s.val);
  }
  return showResult(s, acc, { acc, op, expr: `${formatCalcNumber(acc)} ${SYM[op]}` });
}

function equals(s: CalcState): CalcState {
  if (s.op !== null && s.acc !== null) {
    const operand = s.val;
    const r = apply(s.acc, s.op, operand);
    if (r === null) return errorState();
    return showResult(s, r, {
      acc: r, op: null, lastOp: s.op, lastOperand: operand,
      expr: `${formatCalcNumber(s.acc)} ${SYM[s.op]} ${formatCalcNumber(operand)} =`,
    });
  }
  if (s.lastOp !== null && s.lastOperand !== null) {
    const a = s.val;
    const r = apply(a, s.lastOp, s.lastOperand);
    if (r === null) return errorState();
    return showResult(s, r, {
      acc: r, expr: `${formatCalcNumber(a)} ${SYM[s.lastOp]} ${formatCalcNumber(s.lastOperand)} =`,
    });
  }
  return showResult(s, s.val, { expr: `${formatCalcNumber(s.val)} =` });
}

function isDigit(k: CalcKey): boolean {
  return k.length === 1 && k >= '0' && k <= '9';
}

export function press(s: CalcState, k: CalcKey): CalcState {
  if (k === 'C') return CALC_INITIAL;
  if (s.error) {
    if (k === 'BS') return CALC_INITIAL;
    if (isDigit(k) || k === '00' || k === '.') return press(CALC_INITIAL, k);
    return s; // 오류 중 연산자·=·√ 무시
  }
  if (isDigit(k) || k === '00') return inputDigits(s, k);
  switch (k) {
    case '.': return inputDot(s);
    case 'BS': return backspace(s);
    case 'SQRT': return sqrt(s);
    case '=': return equals(s);
    default: return operator(s, k as Op);
  }
}

export function view(s: CalcState): { main: string; expr: string } {
  return { main: s.error ? '오류' : s.display, expr: s.expr };
}

export function keyFromKeyboard(e: { key: string }): CalcKey | null {
  const k = e.key;
  if (k.length === 1 && k >= '0' && k <= '9') return k as CalcKey;
  switch (k) {
    case '.': case '+': case '-': case '*': case '/': return k;
    case 'Enter': case '=': return '=';
    case 'Backspace': return 'BS';
    case 'Escape': case 'Delete': return 'C';
    default: return null;
  }
}
