import 'fake-indexeddb/auto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AptDb } from '../../data/db';
import { createDexieRepo } from '../../data/repo';
import { createAppStore } from '../../state/store';
import type { SetupDraft } from '../../domain/types';
import { AppProvider } from '../useApp';
import { Runner } from './Runner';

const fullDcatSoft: SetupDraft = {
  profileId: 'dcat', scope: 'full', mode: 'omr', policy: 'soft', sectionIdx: null,
  drillCount: 10, drillSeconds: null, setId: null, newSetName: '', startNo: 1,
  numberingMode: 'continuous', label: '',
};

describe('Runner break actions', () => {
  it('OMR 행에는 번호와 선택 버블만 표시한다', async () => {
    const store = createAppStore({
      repo: createDexieRepo(new AptDb('runner-actions-bubbles')),
      now: () => Date.now(),
      download: () => {},
      acquireLock: async () => 'acquired',
    });
    await store.getState().boot();
    const id = (await store.getState().startSession(fullDcatSoft))!;
    await store.getState().act(id, { type: 'startSection' });
    await store.getState().act(id, { type: 'answer', q: 0, c: 2 });
    const html = renderToStaticMarkup(createElement(AppProvider, {
      store: { ...store, getInitialState: store.getState },
      children: createElement(Runner, { sessionId: id }),
    }));
    expect(html).toContain('data-testid="omr-row-0"');
    expect(html).toMatch(/data-testid="bubble-0-2"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/data-testid="bubble-0-4"[^>]*aria-pressed="false"/);
    expect(html).not.toMatch(/data-testid="(?:flag|clear)-/);
  });

  it('renders mouse-only finish and abandon controls during a break', async () => {
    const store = createAppStore({
      repo: createDexieRepo(new AptDb('runner-actions-break')),
      now: () => 1_000_000,
      download: () => {},
      acquireLock: async () => 'acquired',
    });
    await store.getState().boot();
    const id = (await store.getState().startSession(fullDcatSoft))!;
    await store.getState().act(id, { type: 'startSection' });
    await store.getState().act(id, { type: 'endSection' });

    const facade = { ...store, getInitialState: store.getState };
    const html = renderToStaticMarkup(createElement(AppProvider, {
      store: facade,
      children: createElement(Runner, { sessionId: id }),
    }));

    expect(html).toContain('세션 종료');
    expect(html).toContain('중단');
    expect(html).toMatch(/<button type="button" tabindex="-1"[^>]*>세션 종료<\/button>/);
    expect(html).toMatch(/<button type="button" tabindex="-1"[^>]*>중단<\/button>/);
  });
});
