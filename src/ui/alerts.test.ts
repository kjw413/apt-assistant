import { describe, it, expect } from 'vitest';
import { dueAlerts } from './alerts';
import { mkSession } from '../domain/testkit';
import { advance } from '../domain/session';

describe('dueAlerts', () => {
  const s = advance(mkSession({ parts: [{ count: 3, limitSec: 600 }] }), 15_000);   // deadline 615s
  it('60초 전 알림은 한 번', () => {
    expect(dueAlerts(s, 554_000, 555_000)).toEqual(['warn60']);
    expect(dueAlerts(s, 555_000, 556_000)).toEqual([]);
  });
  it('마감 알림은 마감 직후에만', () => {
    const ended = advance(s, 615_100);
    expect(dueAlerts(ended, 614_900, 615_100)).toContain('deadline');
    expect(dueAlerts(advance(s, 700_000), 554_000, 700_000)).not.toContain('deadline');
    expect(dueAlerts(advance(s, 700_000), 554_000, 700_000)).not.toContain('warn60');
  });
  it('자동 시작 알림', () => {
    const b = mkSession({ parts: [{ count: 3, limitSec: 600 }] });
    expect(dueAlerts(advance(b, 15_000), 14_900, 15_000)).toEqual(['autostart']);
  });
});
