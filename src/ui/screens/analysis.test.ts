import 'fake-indexeddb/auto';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AptDb } from '../../data/db';
import { createDexieRepo } from '../../data/repo';
import { effectiveProfile, makePlan, makeSetLayout } from '../../domain/profiles';
import type { ProblemSet, Session } from '../../domain/types';
import type { Screen } from '../../state/store';
import { createAppStore } from '../../state/store';
import { App } from '../App';
import { AppProvider } from '../useApp';

let nextId = 0;

async function analysisFixture() {
  const db = new AptDb(`analysis-ui-${++nextId}`);
  const store = createAppStore({
    repo: createDexieRepo(db), now: () => 1_000_000,
    download: () => {}, acquireLock: async () => 'acquired',
  });
  await store.getState().boot();
  const render = (children: ReactNode) => renderToStaticMarkup(createElement(AppProvider,
    { store: { ...store, getInitialState: store.getState }, children }));
  const renderAnalysis = () => {
    (store as unknown as { setState(next: { screen: unknown }): void }).setState({
      screen: { name: 'analysis' } as unknown as Screen,
    });
    return render(createElement(App));
  };
  return { db, store, render, renderAnalysis };
}

describe('P4 분석 UI', () => {
  it('홈에 분석 진입 버튼이 있고 analysis 라우트가 분석 화면을 렌더링한다', async () => {
    const t = await analysisFixture();
    try {
      expect(t.render(createElement(App))).toMatch(/<button[^>]*>분석<\/button>/);
      expect(t.renderAnalysis()).toContain('누적 분석');
    } finally { await t.db.delete(); }
  });

  it('시드 분석은 보정 점수, 가족 표, 시간 커버리지와 판정 카드를 표시한다', async () => {
    const t = await analysisFixture();
    try {
      const html = t.renderAnalysis();
      const familyTable = html.match(/<table[^>]*aria-label="가족별 분석"[\s\S]*?<\/table>/)?.[0] ?? '';
      expect(html).toContain('0/6');
      expect(html).toContain('8%');
      expect(familyTable).toContain('aria-label="가족별 분석"');
      const firstFamily = familyTable.match(/<tbody>\s*(<tr\b[^>]*>[\s\S]*?<\/tr>)/)?.[1] ?? '';
      expect(firstFamily).toContain('전개도');
      expect(html).toContain('시간 데이터 0/75문항');
      expect(html).toContain('초과 128%');
      expect(html).toContain('data-testid="scatter"');
      expect(html).toContain('data-testid="scatter-chance-line"');
      expect(html).toContain('data-testid="scatter-pace-line"');
      expect(html).toContain('data-testid="verdict-study"');
      expect(html).toContain('data-testid="verdict-speed"');
      expect(html).toContain('data-testid="verdict-defer"');
      expect(html).toContain('data-testid="verdict-guess"');
      expect(html).toContain('시간 데이터 없음');
      expect(html).toContain('시간 교란 가능');
    } finally { await t.db.delete(); }
  });

  it('표본이 작은 가족도 x/n을 보이고 퍼센트 없이 회색으로 표시한다', async () => {
    const t = await analysisFixture();
    try {
      const html = t.renderAnalysis();
      const solid = [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)]
        .map(match => match[0]).find(row => row.includes('입체도형')) ?? '';
      expect(solid).toContain('2/2');
      expect(solid).not.toContain('%');
      expect(solid).toMatch(/class="[^"]*lowSample[^"]*"/);
    } finally { await t.db.delete(); }
  });

  it('필터는 명시된 기본값과 선택지를 제공한다', async () => {
    const t = await analysisFixture();
    try {
      const html = t.renderAnalysis();
      expect(html).toMatch(/<label[^>]*>프로필/);
      expect(html).toMatch(/<label[^>]*>출처/);
      expect(html).toMatch(/<option value="all"[^>]*>전체<\/option>/);
      expect(html).toContain('<option value="tool">도구</option>');
      expect(html).toContain('<option value="import">가져오기</option>');
      expect(html).toMatch(/<label[^>]*>조건/);
      for (const value of ['all', 'full', 'section', 'drill', 'external', 'external-overtime']) {
        expect(html).toContain(`value="${value}"`);
      }
      expect(html).toMatch(/<label[^>]*>최근 N회/);
      for (const value of ['all', '1', '3', '5', '10']) expect(html).toContain(`value="${value}"`);
      expect(html).toMatch(/<input[^>]*checked=""[^>]*type="checkbox"|<input[^>]*type="checkbox"[^>]*checked=""/);
      expect(html).toContain('첫 풀이만');
    } finally { await t.db.delete(); }
  });

  it('첫 풀이의 유효한 시간만 산점도와 속도 훈련에 쓰고 재풀이는 기본으로 제외한다', async () => {
    const t = await analysisFixture();
    try {
      const profile = effectiveProfile('dcat', []);
      const set: ProblemSet = {
        id: 'timed-set', name: '시간 표본', profileId: 'dcat',
        layout: makeSetLayout(profile, 'full', {}), choices: 5,
        numbering: { startNo: 1, mode: 'continuous' }, key: Array(75).fill(1),
        ranges: [{ from: 0, to: 3, familyId: '명제추리' }],
        createdAt: 0, updatedAt: 0, schemaVersion: 1,
      };
      const session: Session = {
        id: 'timed-first', setId: set.id, profileId: 'dcat', scope: 'full',
        mode: 'omr', policy: 'soft', autoStart: false, attempt: 1,
        plan: makePlan(profile, set, 'full'), status: 'graded',
        events: [
          { k: 'sectionStart', s: 0, t: 0 },
          ...Array.from({ length: 4 }, (_, q) => ({ k: 'answer' as const, q, c: 1, t: (q + 1) * 90_000 })),
          { k: 'sectionEnd', s: 0, reason: 'manual', t: 360_000 },
        ],
        createdAt: 0, finishedAt: 360_000, appVersion: '0.1.0', schemaVersion: 1,
      };
      t.store.setState(state => ({ data: { ...state.data, imports: [], sets: [set],
        sessions: [session, { ...session, id: 'timed-retry', attempt: 2 }] } }));
      const html = t.renderAnalysis();
      expect(html).toContain('시간 데이터 4/75문항');
      const scatter = html.match(/<svg\b[^>]*>[\s\S]*?<\/svg>/)?.[0] ?? '';
      expect(scatter).toContain('<circle');
      expect(scatter).toContain('명제추리');
      const speed = html.match(/data-testid="verdict-speed"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? '';
      expect(speed).toContain('명제추리');
      expect(html).not.toContain('시간 데이터 없음');
    } finally { await t.db.delete(); }
  });
});
