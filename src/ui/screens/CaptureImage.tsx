import { useEffect, useRef, useState } from 'react';
import { readCaptureFile } from '../captureFiles';
import { useApp } from '../useApp';
import styles from './screens.module.css';

export function CaptureImage({ name }: { name: string }) {
  const handle = useApp(s => s.captureDir);
  const files = useApp(s => s.captureFiles);
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setUrl(null); return; }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  useEffect(() => () => { request.current++; }, []);
  const show = async () => {
    const id = ++request.current;
    setFile(null); setOpen(true); setLoading(true);
    const image = await readCaptureFile(name, files, handle);
    if (id === request.current) { setFile(image); setLoading(false); }
  };
  const close = () => { request.current++; setOpen(false); setFile(null); };
  return <>
    <button type="button" onClick={() => { void show(); }}>보기</button>
    <dialog ref={dialog} className={styles.captureDialog} aria-label="캡처 이미지" onCancel={close} onClose={close}>
      <p>{name}</p>
      {loading ? <p role="status">읽는 중…</p> : file ? url && <img src={url} alt={name} onError={() => setFile(null)} /> : <p role="status">파일 없음</p>}
      <button type="button" onClick={close}>닫기</button>
    </dialog>
  </>;
}
