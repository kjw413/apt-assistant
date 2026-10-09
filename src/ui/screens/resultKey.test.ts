import 'fake-indexeddb/auto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AptDb } from '../../data/db';
import { createDexieRepo } from '../../data/repo';
import { createAppStore } from '../../state/store';
import { AppProvider } from '../useApp';
import { KeyEntry } from './KeyEntry';
import { Result } from './Result';

let n = 0;
async function gradedSession(guessed = false) {
  const repo = createDexieRepo(new AptDb(`result-key-test-${++n}`));
  const downloads: string[] = [];
  const store = createAppStore({ repo, now: () => 1_000_000,
    download: name => downloads.push(name), acquireLock: async () => 'acquired' });
  await store.getState().boot();
  const id = (await store.getState().startSession({
    profileId: 'dcat', scope: 'drill', mode: 'omr', policy: 'soft', sectionIdx: 0,
    drillCount: 3, drillSeconds: 180, setId: null, newSetName: '키 수정', startNo: 1,
    numberingMode: 'continuous', label: '',
  }))!;
  await store.getState().act(id, { type: 'startSection' });
  for (const [q, c] of [1, 2, 4].entries()) await store.getState().act(id, { type: 'answer', q, c });
  if (guessed) await store.getState().act(id, { type: 'flag', q: 0, on: true });
  await store.getState().act(id, { type: 'finish' });
  const setId = store.getState().data.sessions[0].setId!;
  await store.getState().saveKey(setId, [1, 2, 3]);
  await store.getState().completeGrading(id);
  const render = (component: typeof Result | typeof KeyEntry) => renderToStaticMarkup(
    createElement(AppProvider, { store: { ...store, getInitialState: store.getState }, children: createElement(component, { sessionId: id }) }),
  );
  return { store, repo, downloads, id, setId, render };
}

describe('answer key correction', () => {
  it('Result hides obsolete flag UI when no legacy guesses exist', async () => {
    const t = await gradedSession();
    const html = t.render(Result);
    expect(html).not.toContain('⚑');
    expect(html).not.toContain('찍음');
  });
  it('Result retains aggregate legacy guess stats without a question flag column', async () => {
    const t = await gradedSession(true);
    const html = t.render(Result);
    expect(html).toContain('찍음');
    expect(html).not.toContain('⚑');
  });
  it('graded Result offers 정답 수정', async () => {
    const t = await gradedSession();
    expect(t.render(Result)).toMatch(/<button[^>]*>정답 수정<\/button>/);
  });
  it('graded KeyEntry prefills saved key and hides 나중에 채점', async () => {
    const t = await gradedSession();
    const html = t.render(KeyEntry);
    expect(html).toMatch(/<textarea[^>]*>123<\/textarea>/);
    expect(html).not.toContain('나중에 채점');
  });
  it('editing 123 to 124 updates score and persists without another grading or backup', async () => {
    const t = await gradedSession();
    expect(t.render(Result)).toMatch(/data-testid="score-total">2\/3/);
    const before = structuredClone(t.store.getState().data.sessions[0]);
    t.store.getState().go({ name: 'key', sessionId: t.id });
    await t.store.getState().saveKey(t.setId, [1, 2, 4]);
    t.store.getState().go({ name: 'result', sessionId: t.id });
    expect(t.render(Result)).toMatch(/data-testid="score-total">3\/3/);
    const loaded = await t.repo.loadAll();
    expect(loaded.data.sets[0].key).toEqual([1, 2, 4]);
    expect(loaded.data.sessions[0]).toEqual(before);
    expect(t.downloads).toHaveLength(1);
  });
});
