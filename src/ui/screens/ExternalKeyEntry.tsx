import { useId, useState } from 'react';
import { parseKey } from '../../domain/grading';
import { effectiveProfile, makeSetLayout } from '../../domain/profiles';
import type { Session } from '../../domain/types';
import { useApp, useAppStore } from '../useApp';
import styles from './screens.module.css';

export function ExternalKeyEntry({ sessionId }: { sessionId: string }) {
  const session = useApp(s => s.data.sessions.find(x => x.id === sessionId));
  const go = useApp(s => s.go);
  if (!session || session.mode !== 'external' || !['external_done', 'graded'].includes(session.status)) {
    return <main className={styles.screen}>
      <p className={styles.error} role="alert">종료한 외부 모의 세션을 선택하세요</p>
      <button type="button" onClick={() => go({ name: 'home' })}>홈으로</button>
    </main>;
  }
  return <ExternalEditor key={session.id} session={session} />;
}

function ExternalEditor({ session }: { session: Session }) {
  const store = useAppStore();
  const profiles = useApp(s => s.data.profiles);
  const set = useApp(s => s.data.sets.find(x => x.id === session.setId));
  const profile = effectiveProfile(session.profileId, profiles);
  const layout = makeSetLayout(profile, 'full', {});
  const count = layout.reduce((n, part) => n + part.count, 0);
  const id = useId();
  const [answersText, setAnswersText] = useState(() => session.externalAnswers?.map(x => x ?? 0).join('') ?? '');
  const [keyText, setKeyText] = useState(() => set?.key?.map(x => x ?? 0).join('') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answers = parseKey(answersText, count, profile.choices);
  const key = parseKey(keyText, count, profile.choices);
  const invalid = answers.lengthMismatch || key.lengthMismatch || answers.errors.length > 0 || key.errors.length > 0;
  const invalidAnswers = new Set(answers.errors.map(x => x.pos));
  const invalidKeys = new Set(key.errors.map(x => x.pos));
  const entered = (text: string) => [...text.normalize('NFKC').replace(/[\s,]/g, '')].length;

  async function save() {
    if (busy || invalid) return;
    setBusy(true);
    setError(null);
    try {
      const result = await store.getState().gradeExternal(session.id, answersText, keyText);
      if (!result.ok) setError(result.reason);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '저장하지 못했습니다');
    } finally { setBusy(false); }
  }

  return <main className={styles.screen}>
    <h1>외부 모의 채점 입력</h1>
    <p>{session.label ?? '외부 모의'}</p>
    <p id={`${id}-help`} className={styles.muted}>1~{profile.choices}를 이어 입력하세요. 원문자·전각 숫자도 읽습니다. 공백·쉼표·줄바꿈은 무시합니다. 내 답의 0 또는 -는 미응답, 정답의 0 또는 -는 채점 제외입니다.</p>
    {([
      { label: '내 답', name: 'answers', text: answersText, update: setAnswersText, parsed: answers },
      { label: '정답', name: 'key', text: keyText, update: setKeyText, parsed: key },
    ] as const).map(input => <div key={input.name} className={styles.field}>
      <label htmlFor={`${id}-${input.name}`}>{input.label}</label>
      <textarea id={`${id}-${input.name}`} rows={4} spellCheck={false} value={input.text}
        disabled={busy} aria-describedby={`${id}-help ${id}-${input.name}-length`}
        aria-invalid={input.parsed.lengthMismatch || input.parsed.errors.length > 0}
        onChange={e => { input.update(e.target.value); setError(null); }} />
      <p id={`${id}-${input.name}-length`} className={input.parsed.lengthMismatch ? styles.error : styles.muted}
        role={input.parsed.lengthMismatch ? 'alert' : 'status'}>
        {input.label}: 입력 {entered(input.text)}개 / 문항 {count}개{input.parsed.lengthMismatch && ' — 길이가 문항 수와 다릅니다'}
      </p>
      {input.parsed.errors.length > 0 && <div className={styles.error} role="alert">
        {input.parsed.errors.map(x => <p key={x.pos}>{input.label} {x.pos + 1}번째: ‘{x.ch}’ — 1~{profile.choices}, 0 또는 -를 입력하세요</p>)}
      </div>}
    </div>)}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.actions}>
      <button type="button" tabIndex={-1} onMouseDown={e => e.preventDefault()}
        disabled={busy || invalid} onClick={() => { void save(); }}>채점 저장</button>
      <button type="button" tabIndex={-1} onMouseDown={e => e.preventDefault()} disabled={busy}
        onClick={() => store.getState().go({ name: session.status === 'graded' ? 'result' : 'externalSummary', sessionId: session.id })}>돌아가기</button>
    </div>
    <section className={styles.section} aria-label="채점 미리보기">
      <h2>미리보기</h2>
      <table className={`${styles.table} ${styles.previewTable}`}>
        <thead><tr><th scope="col">번호</th><th scope="col">내 답</th><th scope="col">정답</th><th scope="col">○×</th></tr></thead>
        <tbody>{answers.key.map((answer, q) => {
          const badAnswer = invalidAnswers.has(q);
          const badKey = invalidKeys.has(q);
          return <tr key={q} data-testid={`external-preview-row-${q}`}>
            <th scope="row">{q + 1}</th><td>{badAnswer ? '오류' : answer ?? '—'}</td>
            <td>{badKey ? '오류' : key.key[q] ?? '—'}</td>
            <td>{badAnswer || badKey || key.key[q] === null ? '—' : answer === key.key[q] ? '○' : '×'}</td>
          </tr>;
        })}</tbody>
      </table>
    </section>
  </main>;
}
