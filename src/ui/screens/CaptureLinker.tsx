import { useRef, useState } from 'react';
import { matchCaptures } from '../../domain/captures';
import { sectionBounds } from '../../domain/events';
import type { QuestionView, Session } from '../../domain/types';
import { readCaptureDirectory, timedCaptureFiles } from '../captureFiles';
import { useApp } from '../useApp';
import styles from './screens.module.css';

export function CaptureLinker({ session, views }: { session: Session; views: QuestionView[] }) {
  const handle = useApp(s => s.captureDir);
  const selected = useApp(s => s.captureFiles);
  const setCaptureFiles = useApp(s => s.setCaptureFiles);
  const linkCaptures = useApp(s => s.linkCaptures);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>(selected);
  const [shifts, setShifts] = useState<Record<number, number>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const begin = async () => {
    if (busyRef.current) return;
    setOpen(true);
    setNotice(null);
    setShifts({});
    setFiles(selected);
    if (!handle) return;
    busyRef.current = true;
    setBusy(true);
    try { setFiles(await readCaptureDirectory(handle)); }
    catch (error) { setNotice(error instanceof Error ? error.message : '캡처 폴더를 읽지 못했습니다. 파일을 선택하세요'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const candidates = timedCaptureFiles(files);
  const captures = matchCaptures(session, candidates, shifts);
  const bounds = sectionBounds(session);
  const firstStart = Math.min(...bounds.flatMap(b => b.start === null ? [] : [b.start]));
  const counts = session.plan.map((_, idx) => candidates.filter(f =>
    f.t >= firstStart - 5_000 && f.t <= (session.finishedAt ?? -Infinity) + 5_000 &&
    bounds.findIndex(b => b.start !== null && b.end !== null && f.t >= b.start && f.t <= b.end) === idx,
  ).length);
  const save = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if (await linkCaptures(session.id, candidates, shifts)) {
        setOpen(false);
        setNotice('캡처 연결을 저장했습니다');
      } else setNotice('캡처 연결을 저장하지 못했습니다');
    } finally { busyRef.current = false; setBusy(false); }
  };
  return <section className={styles.section}>
    <button type="button" disabled={busy} onClick={() => { void begin(); }}>캡처 연결</button>
    {notice && <p role="status">{notice}</p>}
    {open && <section aria-label="캡처 연결 미리보기" className={styles.capturePreview}>
      <h2>캡처 연결 미리보기</h2>
      {!handle && <p className={styles.muted}>캡처 폴더를 지정하거나 캡처 파일을 선택하세요.</p>}
      <label className={styles.field}>캡처 파일 선택
        <input type="file" accept="image/*" multiple disabled={busy} onChange={event => {
          const chosen = Array.from(event.target.files ?? []);
          setFiles(chosen); setCaptureFiles(chosen); setShifts({}); setNotice(null);
        }} />
      </label>
      {session.plan.map((part, idx) => <section key={idx} data-testid={`capture-preview-${idx}`}>
        <h3>{part.name}</h3>
        <p>파일 {counts[idx]} / 문항 {part.qTo - part.qFrom + 1} · 이동 {shifts[idx] ?? 0}</p>
        <div className={styles.actions}>
          <button type="button" disabled={busy} onClick={() => setShifts(s => ({ ...s, [idx]: (s[idx] ?? 0) + 1 }))}>한 칸 밀기</button>
          <button type="button" disabled={busy} onClick={() => setShifts(s => ({ ...s, [idx]: (s[idx] ?? 0) - 1 }))}>한 칸 당기기</button>
        </div>
        <ul>{captures.filter(c => c.q >= part.qFrom && c.q <= part.qTo).map(c =>
          <li key={c.q}>{views.find(v => v.q === c.q)?.no ?? c.q + 1} → {c.file}</li>,
        )}</ul>
      </section>)}
      <div className={styles.actions}>
        <button type="button" disabled={busy} onClick={() => { void save(); }}>연결 저장</button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)}>취소</button>
      </div>
    </section>}
  </section>;
}
