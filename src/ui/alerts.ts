import { sectionBounds } from '../domain/events';
import { deadlineOf } from '../domain/timer';
import type { Session } from '../domain/types';

export type AlertKind = 'warn60' | 'deadline' | 'autostart';

/** Alerts crossed since the previous tick, in presentation order. */
export function dueAlerts(s: Session, prevNow: number, now: number): AlertKind[] {
  const crossed = (t: number) => prevNow < t && t <= now;
  const warnings: AlertKind[] = [];
  const deadlines: AlertKind[] = [];
  const starts: AlertKind[] = [];

  sectionBounds(s).forEach((bounds, idx) => {
    if (bounds.start === null || bounds.end !== null) return;
    const deadline = deadlineOf(s, idx, now);
    if (crossed(deadline - 60_000) && now < deadline) warnings.push('warn60');
    if (crossed(deadline) && now - deadline < 5_000) deadlines.push('deadline');
  });

  // advance() may already have closed a section before the UI checks alerts.
  for (const event of s.events) {
    if (event.k === 'sectionEnd' && event.reason === 'deadline'
      && crossed(event.t) && now - event.t < 5_000) {
      deadlines.push('deadline');
    }
    if (event.k === 'sectionStart' && event.auto === true && crossed(event.t)) {
      starts.push('autostart');
    }
  }
  return [...warnings, ...deadlines, ...starts];
}

let audioContext: AudioContext | undefined;

/** Best-effort audio: unsupported or blocked audio must not interrupt a session. */
export function beep(kind: AlertKind): void {
  try {
    if (audioContext === undefined) {
      const AudioContextClass = globalThis.AudioContext
        ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass === undefined) return;
      audioContext = new AudioContextClass();
    }
    const context = audioContext;
    if (context.state === 'suspended') void context.resume().catch(() => {});

    const frequency = kind === 'autostart' ? 440 : 880;
    const duration = kind === 'warn60' ? 0.15 : kind === 'deadline' ? 0.12 : 0.2;
    const firstStart = context.currentTime;
    for (const offset of kind === 'deadline' ? [0, 0.24] : [0]) {
      const start = firstStart + offset;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.005);
      gain.gain.setValueAtTime(0.2, start + duration - 0.01);
      gain.gain.linearRampToValueAtTime(0, start + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => {
        try {
          oscillator.disconnect();
          gain.disconnect();
        } catch {
          // Cleanup is also best-effort if the audio device disappears.
        }
      };
      oscillator.start(start);
      oscillator.stop(start + duration);
    }
  } catch {
    // Audio availability and autoplay policies vary between browsers.
  }
}

const flashTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

export function flash(el: HTMLElement): void {
  const previousTimer = flashTimers.get(el);
  if (previousTimer !== undefined) clearTimeout(previousTimer);
  el.classList.add('apt-flash');
  flashTimers.set(el, setTimeout(() => {
    el.classList.remove('apt-flash');
    flashTimers.delete(el);
  }, 700));
}
