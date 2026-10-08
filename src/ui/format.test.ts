import { describe, expect, it } from 'vitest';
import { formatClock, formatDateTime, formatOver, formatSec } from './format';

describe('format helpers', () => {
  it('formats clocks and clamps negative values', () => {
    expect(formatClock(75_000)).toBe('1:15');
    expect(formatClock(75_999)).toBe('1:15');
    expect(formatClock(3_600_000)).toBe('1:00:00');
    expect(formatClock(-1)).toBe('0:00');
  });

  it('formats overruns and seconds', () => {
    expect(formatOver(5_000)).toBe('+0:05');
    expect(formatOver(3_600_000)).toBe('+60:00');
    expect(formatOver(-1)).toBe('+0:00');
    expect(formatSec(65.9)).toBe('1:05');
    expect(formatSec(-10)).toBe('0:00');
  });

  it('uses locally padded date and time fields', () => {
    const date = new Date(2026, 0, 2, 3, 4);
    expect(formatDateTime(date.getTime())).toBe('01/02 03:04');
  });
});
