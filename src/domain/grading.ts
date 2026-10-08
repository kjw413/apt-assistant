// 정답 키 파싱과 세션 요약(spec §10, §8.7).
import type { QuestionView, SectionSummary, Session, SessionSummary } from './types';
import { lastEventT, sectionBounds } from './events';
import { deadlineOf, pauseIntervals } from './timer';

/** 원문자·전각 숫자는 NFKC로 숫자가 된다. 공백·쉼표·줄바꿈은 무시하고 문자 하나가 한 문항이다. */
export function parseKey(
  input: string,
  qCount: number,
  choices: number,
): { key: (number | null)[]; errors: { pos: number; ch: string }[]; lengthMismatch: boolean } {
  const chars = [...input.normalize('NFKC').replace(/[\s,]/g, '')];
  const key: (number | null)[] = [];
  const errors: { pos: number; ch: string }[] = [];
  for (let i = 0; i < Math.min(chars.length, qCount); i++) {
    const ch = chars[i];
    if (ch === '0' || ch === '-') {
      key.push(null);
    } else if (/^[1-9]$/.test(ch) && Number(ch) <= choices) {
      key.push(Number(ch));
    } else {
      key.push(null);
      errors.push({ pos: i, ch });
    }
  }
  while (key.length < qCount) key.push(null);
  return { key, errors, lengthMismatch: chars.length !== qCount };
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const a = [...xs].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

export function summarize(views: QuestionView[], s: Session): SessionSummary {
  const bounds = sectionBounds(s);
  const sections: SectionSummary[] = s.plan.map((p, idx) => {
    const b = bounds[idx];
    const started = b.start !== null;
    const vs = views.filter(v => v.sectionIdx === idx);
    let usedSec = 0;
    let overtimeSec = 0;
    if (started) {
      const end = b.end ?? lastEventT(s);
      const paused = pauseIntervals(s, idx, end).reduce((acc, [x, z]) => acc + Math.max(0, Math.min(z, end) - x), 0);
      usedSec = Math.round((end - (b.start as number) - paused) / 1000);
      overtimeSec = Math.round(Math.max(0, end - deadlineOf(s, idx, end)) / 1000);
    }
    return {
      idx,
      name: p.name,
      started,
      n: vs.length,
      graded: vs.filter(v => v.correct !== null).length,
      correct: vs.filter(v => v.correct === true).length,
      inLimitCorrect: vs.filter(v => v.inLimitCorrect === true).length,
      unanswered: vs.filter(v => v.answer === null).length,
      guessed: vs.filter(v => v.flag === 'guess').length,
      usedSec,
      limitSec: p.limitSec,
      overtimeSec,
      medianLapSec: median(vs.map(v => v.timeSec).filter((x): x is number => x !== null)),
      paceSec: p.paceSec,
    };
  });

  const startedIdx = new Set(sections.filter(x => x.started).map(x => x.idx));
  const sv = views.filter(v => startedIdx.has(v.sectionIdx));
  const st = sections.filter(x => x.started);
  return {
    n: sv.length,
    graded: sv.filter(v => v.correct !== null).length,
    correct: sv.filter(v => v.correct === true).length,
    inLimitCorrect: sv.filter(v => v.inLimitCorrect === true).length,
    answered: sv.filter(v => v.answer !== null).length,
    unanswered: sv.filter(v => v.answer === null).length,
    guessed: sv.filter(v => v.flag === 'guess').length,
    guessedCorrect: sv.filter(v => v.flag === 'guess' && v.correct === true).length,
    overtimeAnswers: sv.filter(v => v.overtime).length,
    usedSec: st.reduce((a, x) => a + x.usedSec, 0),
    limitSec: st.reduce((a, x) => a + x.limitSec, 0),
    overtimeSec: st.reduce((a, x) => a + x.overtimeSec, 0),
    unseenSections: sections.length - st.length,
    sections,
  };
}
