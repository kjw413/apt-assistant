function nonNegativeSeconds(value: number): number {
  return Math.max(0, Math.floor(value));
}

function minuteSecond(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function formatClock(ms: number): string {
  const seconds = nonNegativeSeconds(ms / 1_000);
  if (seconds < 3_600) return minuteSecond(seconds);
  const hours = Math.floor(seconds / 3_600);
  const remaining = seconds % 3_600;
  return `${hours}:${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
}

export function formatOver(ms: number): string {
  return `+${minuteSecond(nonNegativeSeconds(ms / 1_000))}`;
}

export function formatDateTime(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatSec(sec: number): string {
  return minuteSecond(nonNegativeSeconds(sec));
}
