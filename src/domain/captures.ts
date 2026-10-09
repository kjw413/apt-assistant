// ShareX 파일 이름의 시각으로 세션 문항과 캡처를 연결한다(spec §18).
import { sectionBounds } from './events';
import { pauseIntervals } from './timer';
import type { Session } from './types';

export interface CaptureFile {
  name: string;
  t: number;
}

export interface CaptureLink {
  q: number;
  t: number;
  file: string;
}

/** ShareX 파일 이름에 든 로컬 시각을 읽는다. 존재하지 않는 날짜·시각은 null이다. */
export function parseCaptureTime(fileName: string): number | null {
  const match = /(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/.exec(fileName);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return null;
  const date = new Date(year, month - 1, day, hour, minute, second);
  if (
    date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day ||
    date.getHours() !== hour || date.getMinutes() !== minute || date.getSeconds() !== second
  ) return null;
  return date.getTime();
}

/** 세션 창 안의 파일을 영역과 문항 순서대로 연결한다. */
export function matchCaptures(
  session: Session,
  files: CaptureFile[],
  shifts: Record<number, number> = {},
): CaptureLink[] {
  const bounds = sectionBounds(session);
  const firstStart = bounds.find(b => b.start !== null)?.start;
  if (firstStart == null || session.finishedAt === undefined) return [];
  const windowStart = firstStart - 5_000;
  const windowEnd = session.finishedAt + 5_000;
  const bySection: CaptureFile[][] = session.plan.map(() => []);

  for (const file of files) {
    if (file.t < windowStart || file.t > windowEnd) continue;
    const idx = bounds.findIndex(b => b.start !== null && b.end !== null && file.t >= b.start && file.t <= b.end);
    if (idx !== -1) bySection[idx].push(file);
  }

  const links: CaptureLink[] = [];
  bySection.forEach((sectionFiles, idx) => {
    const plan = session.plan[idx];
    const shift = shifts[idx] ?? 0;
    const questionStart = Math.max(plan.qFrom, plan.qFrom + Math.max(0, shift));
    const fileStart = Math.max(0, -shift);
    const ordered = [...sectionFiles].sort((a, b) => a.t - b.t || a.name.localeCompare(b.name));
    for (let i = 0; i < ordered.length && questionStart + i <= plan.qTo; i++) {
      const file = ordered[fileStart + i];
      if (!file) break;
      links.push({ q: questionStart + i, t: file.t, file: file.name });
    }
  });
  return links.sort((a, b) => a.q - b.q);
}

function overlapMs(start: number, end: number, intervals: [number, number][]): number {
  return intervals.reduce((total, [from, to]) => total + Math.max(0, Math.min(end, to) - Math.max(start, from)), 0);
}

/** 연결된 문항의 캡처 기준 소요 시간(초, 소수 1자리)이다. */
export function captureLaps(session: Session, captures = session.captures ?? []): Map<number, number> {
  const out = new Map<number, number>();
  const bounds = sectionBounds(session);
  session.plan.forEach((plan, idx) => {
    const end = bounds[idx]?.end;
    if (end === null || end === undefined) return;
    const ordered = captures
      .filter(capture => capture.q >= plan.qFrom && capture.q <= plan.qTo)
      .slice()
      .sort((a, b) => a.t - b.t || a.q - b.q);
    const pauses = pauseIntervals(session, idx, end);
    ordered.forEach((capture, captureIdx) => {
      const next = ordered[captureIdx + 1]?.t ?? end;
      const activeMs = Math.max(0, next - capture.t - overlapMs(capture.t, next, pauses));
      out.set(capture.q, Math.round(activeMs / 100) / 10);
    });
  });
  return out;
}
