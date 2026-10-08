import { describe, it, expect } from 'vitest';
import { CALC_INITIAL, press, view, keyFromKeyboard, type CalcKey } from './calculator';

function run(keys: string) {
  let s = CALC_INITIAL;
  for (const k of keys.split(' ').filter(Boolean)) s = press(s, k as CalcKey);
  return view(s);
}
const main = (keys: string) => run(keys).main;

describe('계산기(즉시 실행형)', () => {
  it.each([
    ['0 . 1 + 0 . 2 =', '0.3'],
    ['0 . 1 + 0 . 2 - 0 . 3 =', '0'],
    ['1 . 1 * 1 . 1 - 1 . 2 1 =', '0'],
    ['2 + 3 * 4 =', '20'],
    ['9 SQRT', '3'],
    ['1 6 + 9 SQRT =', '19'],
    ['9 + SQRT =', '12'],
    ['5 * =', '25'],
    ['5 + =', '10'],
    ['5 + * 3 =', '15'],
    ['5 + 3 = =', '11'],
    ['5 + 3 = * 2 =', '16'],
    ['5 + 3 = 2 =', '5'],
    ['1 / 3 * 3 =', '1'],
    ['. 5 + . 5 =', '1'],
    ['1 00', '100'],
    ['00', '0'],
    ['0 0 7', '7'],
    ['1 2 3 BS', '12'],
    ['5 BS', '0'],
    ['7 + 8 C', '0'],
    ['8 - 9 =', '-1'],
    ['5 / 0 =', '오류'],
    ['4 - 9 = SQRT', '오류'],
    ['5 / 0 = 7', '7'],
    ['5 / 0 = + 3 =', '3'],
    ['5 / 0 = C', '0'],
    ['9 9 9 9 9 9 * 9 9 9 9 9 9 * 9 9 9 9 9 9 =', '9.99997e+17'],
  ])('%s → %s', (keys, expected) => {
    expect(main(keys)).toBe(expected);
  });

  it('숫자 입력은 12자리까지', () => {
    expect(main('1 2 3 4 5 6 7 8 9 0 1 2 3 4')).toBe('123456789012');
  });
  it('소수점은 한 번만', () => {
    expect(main('1 . 2 . 3')).toBe('1.23');
  });
  it('식 표시', () => {
    expect(run('1 2 *').expr).toBe('12 ×');
    expect(run('1 2 * 3 =').expr).toBe('12 × 3 =');
    expect(run('7 + 8 C').expr).toBe('');
  });
  it('키보드 대응', () => {
    expect(keyFromKeyboard({ key: '7' })).toBe('7');
    expect(keyFromKeyboard({ key: 'Enter' })).toBe('=');
    expect(keyFromKeyboard({ key: 'Backspace' })).toBe('BS');
    expect(keyFromKeyboard({ key: 'Escape' })).toBe('C');
    expect(keyFromKeyboard({ key: '*' })).toBe('*');
    expect(keyFromKeyboard({ key: 'a' })).toBeNull();
  });
});
