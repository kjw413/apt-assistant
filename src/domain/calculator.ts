// 수식 입력형 계산기. = 전에는 입력한 수식을 그대로 보이고, =를 누르면 결과를 보이며 위에 수식 기록을 남긴다.
// 계산은 일반 수식 순서(× ÷ 먼저)를 따른다.
export type CalcKey =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | '00' | '.' | '+' | '-' | '*' | '/' | '=' | 'C' | 'BS' | 'SQRT';

type Op = '+' | '-' | '*' | '/';
type Token = { kind: 'num'; text: string } | { kind: 'op'; op: Op };

export interface CalcState {
  tokens: readonly Token[]; // 입력 중인 수식
  history: string; // 직전에 계산한 수식(위 줄)
  result: number | null; // 직전 결과(수식을 새로 입력하기 전까지 표시)
  error: boolean;
}

export const CALC_INITIAL: CalcState = Object.freeze({ tokens: [], history: '', result: null, error: false });

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

function exprText(tokens: readonly Token[]): string {
  return tokens.map(t => (t.kind === 'num' ? t.text : SYM[t.op])).join('');
}

function evaluate(tokens: readonly Token[]): number | null {
  // 곱셈·나눗셈을 먼저 묶고, 나머지는 부호를 붙여 더한다.
  const terms: number[] = [];
  let pending: Op = '+';
  for (const t of tokens) {
    if (t.kind === 'op') { pending = t.op; continue; }
    const n = Number(t.text);
    if (!Number.isFinite(n)) return null;
    if (pending === '*' || pending === '/') {
      const prev = terms.pop() ?? 0;
      if (pending === '/' && n === 0) return null;
      terms.push(norm(pending === '*' ? prev * n : prev / n));
    } else {
      terms.push(pending === '-' ? -n : n);
    }
  }
  let sum = 0;
  for (const term of terms) sum = norm(sum + term);
  return Number.isFinite(sum) ? sum : null;
}

const isDigit = (k: CalcKey) => k.length === 1 && k >= '0' && k <= '9';
const lastOf = (tokens: readonly Token[]) => tokens[tokens.length - 1];

/** 결과가 떠 있는 상태(새 수식 입력 전). */
const showingResult = (s: CalcState) => s.tokens.length === 0 && s.result !== null;

function withTokens(s: CalcState, tokens: Token[]): CalcState {
  return { ...s, tokens, result: null };
}

function inputDigits(s: CalcState, digits: string): CalcState {
  const tokens = showingResult(s) ? [] : [...s.tokens];
  const last = lastOf(tokens);
  let text = last?.kind === 'num' ? last.text : '';
  for (const ch of digits) {
    if (text === '' || text === '0') { text = ch; continue; }
    if (text.replace(/[^0-9]/g, '').length >= MAX_DIGITS) break;
    text += ch;
  }
  if (last?.kind === 'num') tokens[tokens.length - 1] = { kind: 'num', text };
  else tokens.push({ kind: 'num', text });
  return withTokens(s, tokens);
}

function inputDot(s: CalcState): CalcState {
  const tokens = showingResult(s) ? [] : [...s.tokens];
  const last = lastOf(tokens);
  if (last?.kind === 'num') {
    if (last.text.includes('.')) return s;
    tokens[tokens.length - 1] = { kind: 'num', text: last.text + '.' };
  } else {
    tokens.push({ kind: 'num', text: '0.' });
  }
  return withTokens(s, tokens);
}

function operator(s: CalcState, op: Op): CalcState {
  if (showingResult(s)) {
    return withTokens(s, [{ kind: 'num', text: formatCalcNumber(s.result as number) }, { kind: 'op', op }]);
  }
  const tokens = [...s.tokens];
  const last = lastOf(tokens);
  if (!last) tokens.push({ kind: 'num', text: '0' }, { kind: 'op', op });
  else if (last.kind === 'op') tokens[tokens.length - 1] = { kind: 'op', op };
  else tokens.push({ kind: 'op', op });
  return withTokens(s, tokens);
}

function sqrt(s: CalcState): CalcState {
  if (showingResult(s)) {
    const v = s.result as number;
    if (v < 0) return { ...CALC_INITIAL, error: true, history: s.history };
    return withTokens(s, [{ kind: 'num', text: formatCalcNumber(norm(Math.sqrt(v))) }]);
  }
  const last = lastOf(s.tokens);
  if (last?.kind !== 'num') return s;
  const v = Number(last.text);
  if (v < 0) return { ...CALC_INITIAL, error: true, history: s.history };
  const tokens = [...s.tokens];
  tokens[tokens.length - 1] = { kind: 'num', text: formatCalcNumber(norm(Math.sqrt(v))) };
  return withTokens(s, tokens);
}

function backspace(s: CalcState): CalcState {
  const last = lastOf(s.tokens);
  if (!last) return s;
  const tokens = s.tokens.slice(0, -1);
  if (last.kind === 'num' && last.text.length > 1) tokens.push({ kind: 'num', text: last.text.slice(0, -1) });
  return { ...s, tokens };
}

function equals(s: CalcState): CalcState {
  let tokens = [...s.tokens];
  while (tokens.length && lastOf(tokens).kind === 'op') tokens = tokens.slice(0, -1);
  if (!tokens.length) return s;
  const history = exprText(tokens);
  const r = evaluate(tokens);
  if (r === null) return { ...CALC_INITIAL, error: true, history };
  return { tokens: [], history, result: r, error: false };
}

export function press(s: CalcState, k: CalcKey): CalcState {
  if (k === 'C') return CALC_INITIAL;
  if (s.error) {
    if (isDigit(k) || k === '00' || k === '.') return press(CALC_INITIAL, k);
    return s; // 오류 중 연산자·=·√·⌫ 무시
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
  const main = s.error ? '오류'
    : s.tokens.length ? exprText(s.tokens)
      : s.result !== null ? formatCalcNumber(s.result) : '0';
  return { main, expr: s.history };
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
