import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { APP_VERSION, SCHEMA_VERSION } from '../../domain/types';
import { validateBackup } from '../../domain/backup';
import { effectiveProfile } from '../../domain/profiles';
import { unbackedCount } from '../../state/store';
import { ConfirmDialog } from '../ConfirmDialog';
import { formatDateTime } from '../format';
import { useApp, useAppStore } from '../useApp';
import { ProfileEditor } from './ProfileEditor';
import { directoryPicker } from '../captureFiles';
import styles from './screens.module.css';

type BackupPreview = { text: string; sessions: number; sets: number; imports: number };
let restoreNotice: string | null = null;

function readPreview(text: string): BackupPreview | { reason: string } {
  try {
    const checked = validateBackup(JSON.parse(text));
    if (!checked.ok) return { reason: checked.reason };
    return { text, sessions: checked.file.data.sessions.length, sets: checked.file.data.sets.length, imports: checked.file.data.imports.length };
  } catch { return { reason: '백업 파일 형식이 아닙니다' }; }
}

export function Settings() {
  const data = useApp(s => s.data);
  const meta = useApp(s => s.meta);
  const persisted = useApp(s => s.persisted);
  const saveSettings = useApp(s => s.saveSettings);
  const exportNow = useApp(s => s.exportNow);
  const restore = useApp(s => s.restore);
  const go = useApp(s => s.go);
  const store = useAppStore();
  const captureDir = useApp(s => s.captureDir);
  const captureFiles = useApp(s => s.captureFiles);
  const setCaptureDir = useApp(s => s.setCaptureDir);
  const setCaptureFiles = useApp(s => s.setCaptureFiles);
  const picker = directoryPicker();
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [estimate, setEstimate] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (restoreNotice !== null) {
      setNotice(restoreNotice);
      restoreNotice = null;
    }
  }, []);

  useEffect(() => {
    const storage = navigator.storage;
    if (!storage?.estimate) return;
    void storage.estimate()
      .then(({ usage, quota }) => setEstimate(`사용 ${usage ?? 0}B / ${quota ?? 0}B`))
      .catch(() => setEstimate('확인할 수 없습니다'));
  }, []);

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    if (busyRef.current) return;
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const next = readPreview(await file.text());
      if ('reason' in next) {
        setNotice(next.reason);
        return;
      }
      setNotice(null);
      setPreview(next);
    } catch { setNotice('백업 파일을 읽지 못했습니다'); }
    finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const restoreBackup = async () => {
    if (!preview || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await restore(preview.text);
      setPreview(null);
      if (!result.ok) {
        setNotice(result.reason ?? '복원하지 못했습니다');
        return;
      }
      if (store.getState().screen.name === 'home') {
        restoreNotice = '복원했습니다';
        setNotice('복원했습니다');
        go({ name: 'settings' });
      }
    } catch {
      setNotice('복원하지 못했습니다');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const currentCounts = `현재: 세션 ${data.sessions.length}, 세트 ${data.sets.length}, 가져오기 ${data.imports.length}`;
  if (profileId) return <ProfileEditor profileId={profileId} onClose={() => setProfileId(null)} />;
  return (
    <main className={styles.screen}>
      <h1>설정·백업</h1>
      <section className={styles.section}>
        <h2>캡처 폴더</h2>
        <p>{captureDir?.name ?? '지정하지 않음'}</p>
        {picker ? <button type="button" onClick={() => {
          void picker().then(setCaptureDir).catch(error => {
            if (!(error instanceof DOMException && error.name === 'AbortError')) setNotice('캡처 폴더를 지정하지 못했습니다');
          });
        }}>폴더 지정</button> : <>
          <p className={styles.muted}>이 환경은 폴더 선택 API를 지원하지 않습니다. 캡처 파일을 선택하세요.</p>
          <label className={styles.field}>캡처 파일 선택
            <input type="file" accept="image/*" multiple onChange={event => setCaptureFiles(Array.from(event.target.files ?? []))} />
          </label>
          <p className={styles.muted}>선택한 파일 {captureFiles.length}개 · 다시 열면 파일을 다시 선택하세요.</p>
        </>}
      </section>
      <section className={styles.section}>
        <h2>백업</h2>
        <div className={styles.actions}>
          <button type="button" onClick={() => { void exportNow(); }}>지금 내보내기</button>
        </div>
        <label className={styles.field}>백업 파일 복원
          <input type="file" accept="application/json,.json" disabled={busy} onChange={event => { void chooseFile(event); }} />
        </label>
        <p className={styles.muted}>미백업 {unbackedCount(data, meta)} · 마지막 백업 {meta.lastBackupAt === null ? '없음' : formatDateTime(meta.lastBackupAt)}</p>
        {notice && <p role={notice === '복원했습니다' ? 'status' : 'alert'} className={notice === '복원했습니다' ? styles.notice : styles.error}>{notice}</p>}
      </section>
      <section className={styles.section}>
        <h2>동작</h2>
        <label className={styles.checkbox}><input type="checkbox" checked={data.settings.autoBackupDownload} onChange={event => { void saveSettings({ autoBackupDownload: event.target.checked }); }} />세션 종료 시 자동 백업</label>
        <label className={styles.checkbox}><input type="checkbox" checked={data.settings.sound} onChange={event => { void saveSettings({ sound: event.target.checked }); }} />소리</label>
        <label className={styles.checkbox}><input type="checkbox" checked={data.settings.flash} onChange={event => { void saveSettings({ flash: event.target.checked }); }} />점멸</label>
      </section>
      <section className={styles.section}>
        <h2>저장소</h2><p>영속 저장: {persisted === true ? '예' : '아니오'}</p>
        {estimate && <p className={styles.muted}>{estimate}</p>}
      </section>
      <section className={styles.section}>
        <h2>프로필</h2>
        {['dcat', 'lg-wayfit'].map(id => <button type="button" className={styles.listButton} key={id} onClick={() => setProfileId(id)}>{effectiveProfile(id, data.profiles).name} 조정</button>)}
      </section>
      <section className={styles.section}><p>앱 버전 {APP_VERSION} · 스키마 {SCHEMA_VERSION}</p></section>
      <button type="button" onClick={() => go({ name: 'home' })}>홈으로</button>
      <ConfirmDialog open={preview !== null} title="백업을 복원할까요?" body={preview ? `${currentCounts}\n가져올 파일: 세션 ${preview.sessions}, 세트 ${preview.sets}, 가져오기 ${preview.imports}` : undefined} confirmText="복원" onCancel={() => setPreview(null)} onConfirm={() => { void restoreBackup(); }} />
    </main>
  );
}
