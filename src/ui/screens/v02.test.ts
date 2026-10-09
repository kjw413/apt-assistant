import 'fake-indexeddb/auto';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AptDb } from '../../data/db';
import { createDexieRepo } from '../../data/repo';
import { createAppStore } from '../../state/store';
import { App } from '../App';
import { AppProvider } from '../useApp';
import { ExternalSummary } from './ExternalSummary';
import { Result } from './Result';
import { paintQuestionRange } from './TypeTagger';

let nextId = 0;
async function external(profileId = 'dcat') {
  const db = new AptDb(`p3-ui-${++nextId}`);
  const store = createAppStore({ repo: createDexieRepo(db), now: () => 1_000_000,
    download: () => {}, acquireLock: async () => 'acquired' });
  await store.getState().boot();
  const id = (await store.getState().startSession({ profileId, scope: 'full', mode: 'external',
    policy: 'soft', sectionIdx: null, drillCount: 3, drillSeconds: 180, setId: null,
    newSetName: '', startNo: 1, numberingMode: 'continuous', label: '외부 채점 테스트' }))!;
  const count = store.getState().data.sessions[0].plan.length;
  for (let i = 0; i < count; i++) {
    await store.getState().act(id, { type: 'startSection' });
    await store.getState().act(id, { type: 'endSection' });
  }
  const render = (children: ReactNode) => renderToStaticMarkup(createElement(AppProvider,
    { store: { ...store, getInitialState: store.getState }, children }));
  return { db, store, id, render };
}

describe('P3 외부 채점과 유형 UI', () => {
  it('외부 요약에 기존 확인과 채점 입력을 함께 표시한다', async () => {
    const t = await external();
    try {
      const html = t.render(createElement(ExternalSummary, { sessionId: t.id }));
      expect(html).toMatch(/<button[^>]*>확인<\/button>/);
      expect(html).toMatch(/<button[^>]*>채점 입력<\/button>/);
    } finally { await t.db.delete(); }
  });

  it('externalKey 라우트에 두 입력, 길이 오류, 비활성 저장, 문항 미리보기를 표시한다', async () => {
    const t = await external();
    try {
      t.store.getState().go({ name: 'externalKey', sessionId: t.id });
      const html = t.render(createElement(App));
      expect(html).toContain('외부 모의 채점 입력');
      expect(html.match(/<textarea/g)).toHaveLength(2);
      expect(html).toContain('내 답');
      expect(html).toContain('정답');
      expect(html).toContain('입력 0개 / 문항 75개');
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>채점 저장<\/button>/);
      expect(html).toContain('external-preview-row-74');
    } finally { await t.db.delete(); }
  });

  it('채점된 DCAT 결과는 시드 가족/세부와 기본 틀 버튼을 표시한다', async () => {
    const t = await external();
    try {
      await t.store.getState().gradeExternal(t.id, '1'.repeat(75), '1'.repeat(75));
      const html = t.render(createElement(Result, { sessionId: t.id }));
      expect(html).toMatch(/data-testid="score-total">75\/75/);
      expect(html).toMatch(/data-testid="tag-row-0"[^>]*>.*?명제추리/);
      expect(html).toContain('참/거짓');
      expect(html).toContain('새 유형');
      expect(html).toContain('세부 유형');
      expect(html).toContain('기본 틀로 저장');
      expect(html).toContain('기본 틀 적용');
    } finally { await t.db.delete(); }
  });

  it('LG 결과는 미분류와 새 유형 입력을 표시하고 DCAT 틀 버튼은 숨긴다', async () => {
    const t = await external('lg-wayfit');
    try {
      await t.store.getState().gradeExternal(t.id, '1'.repeat(80), '1'.repeat(80));
      const html = t.render(createElement(Result, { sessionId: t.id }));
      expect(html).toContain('tag-row-79');
      expect(html).toContain('미분류');
      expect(html).toContain('새 유형');
      expect(html).not.toContain('기본 틀로 저장');
      expect(html).not.toContain('기본 틀 적용');
    } finally { await t.db.delete(); }
  });
});

describe('P3 범위 칠하기', () => {
  it('중간 두 문항만 칠하고 기존 세부와 모르는 필드를 양쪽에 보존한다', () => {
    const original = [{ from: 0, to: 5, familyId: '명제추리', leafId: '명제', extra: 'keep' }];
    const painted = paintQuestionRange(original, 2, 3, { familyId: '단문독해', leafId: '추론하기' });
    expect(painted).toHaveLength(3);
    expect(painted).toEqual(expect.arrayContaining([
      { from: 0, to: 1, familyId: '명제추리', leafId: '명제', extra: 'keep' },
      { from: 2, to: 3, familyId: '단문독해', leafId: '추론하기', extra: 'keep' },
      { from: 4, to: 5, familyId: '명제추리', leafId: '명제', extra: 'keep' },
    ]));
    expect(original).toEqual([{ from: 0, to: 5, familyId: '명제추리', leafId: '명제', extra: 'keep' }]);
  });

  it('역방향 드래그로 여러 범위와 빈 구간을 덮고 이전 세부는 제거한다', () => {
    const painted = paintQuestionRange([
      { from: 0, to: 1, familyId: '명제추리', leafId: '참/거짓' },
      { from: 3, to: 4, familyId: '단문독해', leafId: '내용일치' },
      { from: 6, to: 7, familyId: '도형추리' },
    ], 6, 1, { familyId: '새 가족' });
    expect(Array.from({ length: 8 }, (_, q) => {
      const range = painted.find(x => q >= x.from && q <= x.to);
      return [range?.familyId, range?.leafId ?? null];
    })).toEqual([
      ['명제추리', '참/거짓'], ['새 가족', null], ['새 가족', null], ['새 가족', null],
      ['새 가족', null], ['새 가족', null], ['새 가족', null], ['도형추리', null],
    ]);
  });

  it('미분류 문항도 한 번 클릭해 칠할 수 있다', () => {
    expect(paintQuestionRange([], 0, 0, { familyId: '새 유형' })).toEqual([
      { from: 0, to: 0, familyId: '새 유형' },
    ]);
  });

  it('겹치는 기존 범위에서 칠하지 않은 문항의 첫 범위 우선순위를 유지한다', () => {
    const ranges = [
      { from: 2, to: 5, familyId: '우선 가족' },
      { from: 0, to: 5, familyId: '후순위 가족' },
      { from: 6, to: 7, familyId: '다른 가족' },
    ];
    const painted = paintQuestionRange(ranges, 7, 7, { familyId: '새 유형' });
    expect(painted.find(x => 3 >= x.from && 3 <= x.to)?.familyId).toBe('우선 가족');
    expect(painted.find(x => 7 >= x.from && 7 <= x.to)?.familyId).toBe('새 유형');
  });
});
