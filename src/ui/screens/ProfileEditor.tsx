import { useId, useRef, useState } from 'react';
import { effectiveProfile, formatMmSs, validateProfileEdit } from '../../domain/profiles';
import type { ToolName } from '../../domain/types';
import { useApp } from '../useApp';
import { parseProfileTime, parseSeconds } from './setupLogic';
import styles from './setup.module.css';

export function ProfileEditor(props: { profileId: string; onClose: () => void }) {
  return <Editor key={props.profileId} {...props} />;
}

function Editor({ profileId, onClose }: { profileId: string; onClose: () => void }) {
  const profiles = useApp(s => s.data.profiles);
  const saveProfile = useApp(s => s.saveProfile);
  const resetProfile = useApp(s => s.resetProfile);
  const [profile, setProfile] = useState(() => effectiveProfile(profileId, profiles));
  const [times, setTimes] = useState(() => profile.sections.map(s => formatMmSs(s.seconds)));
  const [breakSec, setBreakSec] = useState(() => String(profile.breakSec));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const id = useId();

  function clearError(path: string) {
    setErrors(current => {
      const next = { ...current };
      delete next[path];
      return next;
    });
    setError('');
  }

  function toggleTool(index: number, tool: ToolName, checked: boolean) {
    setProfile(current => ({ ...current, sections: current.sections.map((s, i) => i === index
      ? { ...s, tools: { ...s.tools, allowed: { ...s.tools.allowed, [tool]: checked } } } : s) }));
  }

  async function save() {
    if (busyRef.current) return;
    const candidate = { ...profile, breakSec: parseSeconds(breakSec), sections: profile.sections.map((s, i) => ({ ...s, seconds: parseProfileTime(times[i]) })) };
    const validation = validateProfileEdit(candidate);
    const nextErrors: Record<string, string> = {};
    if (!validation.ok) for (const issue of validation.errors) nextErrors[issue.path] = issue.msg;
    times.forEach((time, i) => {
      if (!Number.isFinite(parseProfileTime(time))) nextErrors[`sections.${i}.seconds`] = '분:초(m:ss) 또는 정수 초로 입력하세요';
    });
    setErrors(nextErrors);
    setError('');
    if (Object.keys(nextErrors).length) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await saveProfile(candidate);
      if (result.ok) onClose();
      else {
        setErrors(Object.fromEntries(result.errors.map(issue => [issue.path, issue.msg])));
        if (!result.errors.length) setError('프로필을 저장할 수 없습니다');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '프로필을 저장하지 못했습니다');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function reset() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await resetProfile(profileId);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '기본값으로 되돌리지 못했습니다');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const tools: { key: ToolName; label: string }[] = [
    { key: 'calc', label: '계산기' }, { key: 'memo', label: '메모' }, { key: 'paint', label: '그림판' },
  ];

  return (
    <section className={styles.editor} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{profile.name} 조정</h2>
      <fieldset className={styles.fields} disabled={busy}>
        {profile.sections.map((s, i) => {
          const path = `sections.${i}.seconds`;
          return (
            <div key={s.id} className={styles.sectionRow}>
              <div className={styles.timeField}>
                <label htmlFor={`${id}-time-${i}`}>{s.name} 시간</label>
                <input id={`${id}-time-${i}`} type="text" value={times[i]} onChange={e => {
                  setTimes(current => current.map((time, idx) => idx === i ? e.target.value : time));
                  clearError(path);
                }} aria-invalid={!!errors[path]} aria-describedby={errors[path] ? `${id}-error-${i}` : undefined} />
              </div>
              {errors[path] && <span id={`${id}-error-${i}`} className={styles.error} role="alert">{errors[path]}</span>}
              <div className={styles.tools}>
                {tools.map(tool => <label key={tool.key} className={styles.checkbox}>
                  <input type="checkbox" aria-label={`${s.name} ${tool.label}`} checked={s.tools.allowed[tool.key]} onChange={e => toggleTool(i, tool.key, e.target.checked)} />
                  {tool.label}
                </label>)}
              </div>
            </div>
          );
        })}
        <div className={styles.field}>
          <label htmlFor={`${id}-break`}>쉬는 시간(초)</label>
          <input id={`${id}-break`} type="number" min="0" max="600" step="1" value={breakSec} onChange={e => { setBreakSec(e.target.value); clearError('breakSec'); }} aria-invalid={!!errors.breakSec} aria-describedby={errors.breakSec ? `${id}-break-error` : undefined} />
          {errors.breakSec && <span id={`${id}-break-error`} className={styles.error} role="alert">{errors.breakSec}</span>}
        </div>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={profile.autoStart} onChange={e => setProfile(current => ({ ...current, autoStart: e.target.checked }))} />실전 자동 시작
        </label>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={profile.calcKeyboard} onChange={e => setProfile(current => ({ ...current, calcKeyboard: e.target.checked }))} />계산기 키보드 입력
        </label>
      </fieldset>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions}>
        <button type="button" disabled={busy} onClick={onClose}>취소</button>
        <button type="button" disabled={busy} onClick={() => { void reset(); }}>교재 기본값으로</button>
        <button type="button" className={styles.primary} disabled={busy} onClick={() => { void save(); }}>저장</button>
      </div>
    </section>
  );
}
