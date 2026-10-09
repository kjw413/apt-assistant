import { describe, it, expect } from 'vitest';
import { CALC_INITIAL, press, view, keyFromKeyboard, type CalcKey } from './calculator';

function run(keys: string) {
  let s = CALC_INITIAL;
  for (const k of keys.split(' ').filter(Boolean)) s = press(s, k as CalcKey);
  return view(s);
}
const main = (keys: string) => run(keys).main;
const expr = (keys: string) => run(keys).expr;

describe('계산기: 수식 입력과 결과 표시', () => {
  it('= 전에는 입력한 수식을 그대로 보여 준다', () => {
    expect(run('1 + 2 + 3 +')).toEqual({ main: '1+2+3+', expr: '' });
  });
  it('=를 누르면 결과를 보이고 위에 수식 기록을 남긴다', () => {
    expect(run('1 + 2 + 3 =')).toEqual({ main: '6', expr: '1+2+3' });
  });
  it('기호는 − × ÷ 로 보인다', () => {
    expect(main('8 - 2 * 3 / 1')).toBe('8−2×3÷1');
  });
  it('새 수식을 입력하는 동안 직전 기록은 위에 남는다', () => {
    expect(run('5 + 3 = 2')).toEqual({ main: '2', expr: '5+3' });
  });
  it('결과 뒤에 연산자를 누르면 결과에 이어서 계산한다', () => {
    expect(run('5 + 3 = + 2')).toEqual({ main: '8+2', expr: '5+3' });
    expect(run('5 + 3 = + 2 =')).toEqual({ main: '10', expr: '8+2' });
  });
  it('C는 수식과 기록을 모두 지운다', () => {
    expect(run('7 + 8 = 1 C')).toEqual({ main: '0', expr: '' });
  });
});

describe('계산기: 계산 규칙', () => {
  it.each([
    ['2 + 3 * 4 =', '14'],
    ['1 0 - 4 / 2 =', '8'],
    ['0 . 1 + 0 . 2 =', '0.3'],
    ['0 . 1 + 0 . 2 - 0 . 3 =', '0'],
    ['1 . 1 * 1 . 1 - 1 . 2 1 =', '0'],
    ['1 / 3 * 3 =', '1'],
    ['. 5 + . 5 =', '1'],
    ['8 - 9 =', '-1'],
    ['8 - 9 = + 2 =', '1'],
    ['5 + * 3 =', '15'],
    ['1 + 2 + =', '3'],
    ['+ 5 =', '5'],
    ['5 + 3 = =', '8'],
    ['9 SQRT', '3'],
    ['1 6 + 9 SQRT =', '19'],
    ['4 - 9 = SQRT', '오류'],
    ['5 / 0 =', '오류'],
    ['5 / 0 = 7', '7'],
    ['5 / 0 = + 3', '3'],
    ['5 / 0 = C', '0'],
    ['9 9 9 9 9 9 * 9 9 9 9 9 9 * 9 9 9 9 9 9 =', '9.99997e+17'],
  ])('%s → %s', (keys, expected) => {
    expect(main(keys)).toBe(expected);
  });
  it('연산자를 연달아 누르면 마지막 것으로 바뀐다', () => {
    expect(main('5 + *')).toBe('5×');
    expect(expr('5 + * 3 =')).toBe('5×3');
  });
  it('√는 마지막 숫자에 바로 적용된다', () => {
    expect(main('1 6 + 9 SQRT')).toBe('16+3');
  });
  it('0으로 나누면 기록에 그 수식을 남긴다', () => {
    expect(run('5 / 0 =')).toEqual({ main: '오류', expr: '5÷0' });
  });
});

describe('계산기: 숫자 입력', () => {
  it.each([
    ['1 00', '100'],
    ['00', '0'],
    ['0 0 7', '7'],
    ['1 . 2 . 3', '1.23'],
    ['1 2 3 BS', '12'],
    ['5 BS', '0'],
    ['1 + BS', '1'],
    ['1 + 2 = BS', '3'],
  ])('%s → %s', (keys, expected) => {
    expect(main(keys)).toBe(expected);
  });
  it('숫자 하나는 12자리까지', () => {
    expect(main('1 2 3 4 5 6 7 8 9 0 1 2 3 4')).toBe('123456789012');
  });
  it('입력이 없으면 0을 보인다', () => {
    expect(run('')).toEqual({ main: '0', expr: '' });
  });
});

describe('키보드 대응', () => {
  it('키 이름을 계산기 키로 바꾼다', () => {
    expect(keyFromKeyboard({ key: '7' })).toBe('7');
    expect(keyFromKeyboard({ key: 'Enter' })).toBe('=');
    expect(keyFromKeyboard({ key: 'Backspace' })).toBe('BS');
    expect(keyFromKeyboard({ key: 'Escape' })).toBe('C');
    expect(keyFromKeyboard({ key: '*' })).toBe('*');
    expect(keyFromKeyboard({ key: 'a' })).toBeNull();
  });
});
