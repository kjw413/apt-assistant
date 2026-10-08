import { useId, useRef, useState } from 'react';
import { BUILTIN_PROFILES, defaultDrillSeconds, effectiveProfile, formatTimesSummary } from '../../domain/profiles';
import { useApp } from '../useApp';
import { ProfileEditor } from './ProfileEditor';
import { buildSetupDraft, changeScope, initialSetup, parseSeconds, type SetupValues } from './setupLogic';
import styles from './setup.module.css';

export function Setup() {
  const profiles = useApp(s => s.data.profiles);
  const sets = useApp(s => s.data.sets);
  const sessions = useApp(s => s.data.sessions);
  const lastSetup = useApp(s => s.data.settings.lastSetup);
  const startSession = useApp(s => s.startSession);
  const go = useApp(s => s.go);
  const [values, setValues] = useState(() => initialSetup(lastSetup, profiles, sets));
  const [editing, setEditing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [startError, setStartError] = useState('');
  const startingRef = useRef(false);
  const id = useId();
  const profile = effectiveProfile(values.profileId, profiles);
  const profileOptions = BUILTIN_PROFILES.map(p => effectiveProfile(p.id, profiles));
  const profileSets = sets.filter(s => s.profileId === profile.id).sort((a, b) => b.updatedAt - a.updatedAt);
  const selectedSet = profileSets.find(s => s.id === values.setId);
  const external = values.scope === 'external';
  const drill = values.scope === 'drill';
  const sectionIdx = values.sectionIdx !== null && profile.sections[values.sectionIdx]
    ? values.sectionIdx : values.scope === 'section' ? 0 : null;
  const count = parseSeconds(values.drillCount);
  const autoSeconds = defaultDrillSeconds(profile, sectionIdx, Number.isSafeInteger(count) && count > 0 ? count : 10);

  function update<K extends keyof SetupValues>(key: K, value: SetupValues[K]) {
    setValues(current => ({ ...current, [key]: value }));
    setErrors({});
    setStartError('');
  }

  async function start() {
    if (startingRef.current) return;
    const nextErrors: Record<string, string> = {};
    const positive = (text: string) => Number.isSafeInteger(parseSeconds(text)) && parseSeconds(text) > 0;
    if (drill && !positive(values.drillCount)) nextErrors.drillCount = '문항 수는 1 이상의 정수로 입력하세요';
    if (drill && values.drillSeconds.trim() && !positive(values.drillSeconds)) nextErrors.drillSeconds = '시간은 1 이상의 정수로 입력하세요';
    if (!external && !selectedSet && !positive(values.startNo)) nextErrors.startNo = '시작 번호는 1 이상의 정수로 입력하세요';
    setErrors(nextErrors);
    setStartError('');
    if (Object.keys(nextErrors).length) return;
    startingRef.current = true;
    setStarting(true);
    try {
      const result = await startSession(buildSetupDraft({ ...values, sectionIdx, setId: selectedSet?.id ?? '' }));
      if (result === null) setStartError('세션을 시작할 수 없습니다. 진행 중인 세션이 있는지 확인하세요.');
    } catch (error) {
      setStartError(error instanceof Error ? error.message : '세션을 시작하지 못했습니다');
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  function fieldError(key: string) {
    return errors[key] ? <span id={`${id}-${key}-error`} className={styles.error} role="alert">{errors[key]}</span> : null;
  }

  return (
    <div className={`screen ${styles.setup}`}>
      <h1>새 세션</h1>
      <fieldset className={styles.fields} disabled={starting}>
        <div className={styles.field}>
          <label htmlFor={`${id}-profile`}>프로필</label>
          <select id={`${id}-profile`} value={profile.id} onChange={e => {
            setValues(current => ({ ...current, profileId: e.target.value, sectionIdx: current.scope === 'section' ? 0 : null, setId: '' }));
            setEditing(false);
            setErrors({});
            setStartError('');
          }}>
            {profileOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-scope`}>범위</label>
          <select id={`${id}-scope`} value={values.scope} onChange={e => {
            setValues(current => changeScope(current, e.target.value as SetupValues['scope']));
            setErrors({});
            setStartError('');
          }}>
            <option value="full">전체 모의</option>
            <option value="section">영역 하나</option>
            <option value="drill">자유 드릴</option>
            <option value="external">외부 모의</option>
          </select>
        </div>
        {(values.scope === 'section' || drill) && (
          <div className={styles.field}>
            <label htmlFor={`${id}-section`}>영역</label>
            <select id={`${id}-section`} value={sectionIdx ?? ''} onChange={e => update('sectionIdx', e.target.value === '' ? null : Number(e.target.value))}>
              {drill && <option value="">영역 없음</option>}
              {profile.sections.map((s, i) => <option key={s.id} value={i}>{s.name}</option>)}
            </select>
          </div>
        )}
        {drill && <>
          <div className={styles.field}>
            <label htmlFor={`${id}-count`}>문항 수</label>
            <input id={`${id}-count`} type="number" min="1" step="1" value={values.drillCount} onChange={e => update('drillCount', e.target.value)} aria-invalid={!!errors.drillCount} aria-describedby={errors.drillCount ? `${id}-drillCount-error` : undefined} />
            {fieldError('drillCount')}
          </div>
          <div className={styles.field}>
            <label htmlFor={`${id}-seconds`}>시간(초)</label>
            <input id={`${id}-seconds`} type="number" min="1" step="1" value={values.drillSeconds} onChange={e => update('drillSeconds', e.target.value)} aria-invalid={!!errors.drillSeconds} aria-describedby={`${id}-auto${errors.drillSeconds ? ` ${id}-drillSeconds-error` : ''}`} />
            <span id={`${id}-auto`} className={styles.hint}>자동 {autoSeconds}초</span>
            {fieldError('drillSeconds')}
          </div>
        </>}
        <div className={styles.field}>
          <label htmlFor={`${id}-policy`}>모드</label>
          <select id={`${id}-policy`} value={values.policy} onChange={e => update('policy', e.target.value as SetupValues['policy'])}>
            <option value="hard">실전</option>
            <option value="soft">연습</option>
          </select>
        </div>
        <div className={styles.summary}>
          <p data-testid="times-summary">{formatTimesSummary(profile)}</p>
          <button type="button" aria-expanded={editing} aria-controls={`${id}-editor`} onClick={() => setEditing(current => !current)}>조정</button>
        </div>
        <div id={`${id}-editor`}>
          {editing && <ProfileEditor key={profile.id} profileId={profile.id} onClose={() => setEditing(false)} />}
        </div>
        {external ? (
          <div className={styles.field}>
            <label htmlFor={`${id}-label`}>외부 모의 이름</label>
            <input id={`${id}-label`} type="text" value={values.label} onChange={e => update('label', e.target.value)} />
          </div>
        ) : <>
          <div className={styles.field}>
            <label htmlFor={`${id}-set`}>세트</label>
            <select id={`${id}-set`} value={selectedSet?.id ?? ''} onChange={e => update('setId', e.target.value)}>
              <option value="">새 세트</option>
              {profileSets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {selectedSet && <span className={styles.hint}>{sessions.filter(s => s.setId === selectedSet.id).length + 1}번째 풀이</span>}
          </div>
          {!selectedSet && <>
            <div className={styles.field}>
              <label htmlFor={`${id}-name`}>새 세트 이름</label>
              <input id={`${id}-name`} type="text" value={values.newSetName} onChange={e => update('newSetName', e.target.value)} />
            </div>
            <div className={styles.field}>
              <label htmlFor={`${id}-startNo`}>시작 번호</label>
              <input id={`${id}-startNo`} type="number" min="1" step="1" value={values.startNo} onChange={e => update('startNo', e.target.value)} aria-invalid={!!errors.startNo} aria-describedby={errors.startNo ? `${id}-startNo-error` : undefined} />
              {fieldError('startNo')}
            </div>
            <div className={styles.field}>
              <label htmlFor={`${id}-numbering`}>번호 방식</label>
              <select id={`${id}-numbering`} value={values.numberingMode} onChange={e => update('numberingMode', e.target.value as SetupValues['numberingMode'])}>
                <option value="continuous">이어서</option>
                <option value="perSection">영역마다 1번부터</option>
              </select>
            </div>
          </>}
        </>}
      </fieldset>
      {startError && <p role="alert" className={styles.error}>{startError}</p>}
      <div className={styles.actions}>
        <button type="button" disabled={starting} onClick={() => go({ name: 'home' })}>취소</button>
        <button type="button" className={styles.primary} disabled={starting} aria-busy={starting} onClick={() => { void start(); }}>시작</button>
      </div>
    </div>
  );
}
