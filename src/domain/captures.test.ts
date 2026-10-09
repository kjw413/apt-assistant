import { describe, expect, it } from 'vitest';
import { captureLaps, matchCaptures, parseCaptureTime } from './captures';
import { mkSession } from './testkit';
import type { Session } from './types';
import { toCells } from './analytics';
import { emptyAllData } from './backup';

function completedTwoSections(): Session {
  return {
    ...mkSession({ parts: [{ count: 3, limitSec: 60 }, { count: 2, limitSec: 30 }] }),
    events: [
      { k: 'sectionStart' as const, s: 0, t: 10_000 },
      { k: 'sectionEnd' as const, s: 0, reason: 'manual' as const, t: 70_000 },
      { k: 'sectionStart' as const, s: 1, t: 80_000 },
      { k: 'sectionEnd' as const, s: 1, reason: 'manual' as const, t: 110_000 },
      { k: 'finish' as const, t: 110_000 },
    ],
    finishedAt: 110_000,
  };
}

describe('parseCaptureTime', () => {
  it('reads ShareX names as local timestamps and rejects invalid dates', () => {
    const expected = new Date(2026, 9, 9, 14, 32, 5).getTime();
    expect(parseCaptureTime('AladinEbook_2026-10-09_14-32-05.png')).toBe(expected);
    expect(parseCaptureTime('2026-02-30_14-32-05.png')).toBeNull();
    expect(parseCaptureTime('no-date.png')).toBeNull();
    expect(parseCaptureTime('2024-02-29_23-59-59.png')).toBe(new Date(2024, 1, 29, 23, 59, 59).getTime());
    for (const name of ['2026-13-01_14-32-05.png', '2026-10-09_24-32-05.png', '2026-10-09_14-60-05.png', '2026-10-09_14-32-60.png']) {
      expect(parseCaptureTime(name)).toBeNull();
    }
  });
});

describe('matchCaptures', () => {
  it('filters the session window, assigns strict section boundaries, and ignores extras', () => {
    const s = completedTwoSections();
    const files = [
      { name: 'before.png', t: 4_999 }, { name: 'first.png', t: 10_000 },
      { name: 'middle.png', t: 20_000 }, { name: 'section-end.png', t: 70_000 },
      { name: 'break.png', t: 75_000 }, { name: 'second.png', t: 80_000 },
      { name: 'after.png', t: 115_001 },
    ];
    expect(matchCaptures(s, files)).toEqual([
      { q: 0, t: 10_000, file: 'first.png' }, { q: 1, t: 20_000, file: 'middle.png' },
      { q: 2, t: 70_000, file: 'section-end.png' }, { q: 3, t: 80_000, file: 'second.png' },
    ]);
  });

  it('applies section shifts without mutating its inputs', () => {
    const s = completedTwoSections();
    const files = [
      { name: 'a', t: 11_000 }, { name: 'b', t: 12_000 }, { name: 'c', t: 13_000 },
      { name: 'd', t: 81_000 }, { name: 'e', t: 82_000 },
    ];
    const original = structuredClone(files);
    expect(matchCaptures(s, files, { 0: 1, 1: -1 })).toEqual([
      { q: 1, t: 11_000, file: 'a' }, { q: 2, t: 12_000, file: 'b' },
      { q: 3, t: 82_000, file: 'e' },
    ]);
    expect(files).toEqual(original);
  });
  it('sorts files, ignores extras and files in the tolerance window outside sections', () => {
    const s = completedTwoSections();
    expect(matchCaptures(s, [
      { name: 'extra', t: 40_000 }, { name: 'last', t: 30_000 }, { name: 'first', t: 10_000 },
      { name: 'second', t: 20_000 }, { name: 'pre', t: 5_000 }, { name: 'post', t: 115_000 },
    ])).toEqual([
      { q: 0, t: 10_000, file: 'first' }, { q: 1, t: 20_000, file: 'second' }, { q: 2, t: 30_000, file: 'last' },
    ]);
    expect(matchCaptures({ ...s, finishedAt: undefined }, [{ name: 'first', t: 10_000 }])).toEqual([]);
  });
});

describe('captureLaps', () => {
  it('uses the next capture or section end and subtracts pauses', () => {
    const s = completedTwoSections();
    s.events.splice(1, 0,
      { k: 'pause' as const, t: 25_000 }, { k: 'resume' as const, t: 35_000 },
    );
    s.captures = [
      { q: 0, t: 20_000, file: 'a.png' }, { q: 1, t: 50_000, file: 'b.png' },
      { q: 3, t: 90_000, file: 'c.png' },
    ];
    expect([...captureLaps(s)]).toEqual([[0, 20], [1, 20], [3, 20]]);
  });
  it('subtracts overlapping pause ranges once and propagates capture times to analytics', () => {
    const s = completedTwoSections();
    s.status = 'graded';
    s.events.splice(1, 0,
      { k: 'pauseRange', t: 25_000, from: 25_000, to: 35_000 },
      { k: 'pauseRange', t: 30_000, from: 30_000, to: 40_000 },
    );
    s.captures = [{ q: 0, t: 20_000, file: 'a' }, { q: 1, t: 50_000, file: 'b' }];
    expect([...captureLaps(s)]).toEqual([[0, 15], [1, 20]]);
    const cells = toCells({ ...emptyAllData(), sessions: [s], sets: [{
      id: 'set1', name: 'capture', profileId: 'dcat', layout: [], choices: 5,
      numbering: { startNo: 1, mode: 'continuous' }, key: [1, 2, 3, 4, 5], ranges: [],
      createdAt: 0, updatedAt: 0, schemaVersion: 1,
    }] });
    expect(cells[0]).toMatchObject({ timedN: 2, timeSec: 35, times: [15, 20] });
    const externalCells = toCells({ ...emptyAllData(), sessions: [{ ...s, mode: 'external', externalAnswers: [1, 2, 3, 4, 5] }], sets: [{
      id: 'set1', name: 'capture', profileId: 'dcat', layout: [], choices: 5,
      numbering: { startNo: 1, mode: 'continuous' }, key: [1, 2, 3, 4, 5], ranges: [],
      createdAt: 0, updatedAt: 0, schemaVersion: 1,
    }] });
    expect(externalCells[0]).toMatchObject({ timedN: 2, timeSec: 35, times: [15, 20] });
  });
});
