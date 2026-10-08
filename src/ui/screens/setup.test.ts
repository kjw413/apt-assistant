import { describe, expect, it } from 'vitest';
import { effectiveProfile, makeSetLayout, validateProfileEdit } from '../../domain/profiles';
import type { ProblemSet, SetupDraft } from '../../domain/types';
import { buildSetupDraft, changeScope, compatibleSets, initialSetup, parseProfileTime } from './setupLogic';

describe('compatibleSets', () => {
  const profile = effectiveProfile('dcat', []);
  const set = (id: string, layout: ProblemSet['layout'], profileId = 'dcat') => ({ id, layout, profileId } as ProblemSet);
  const full = set('full', makeSetLayout(profile, 'full', {}));
  const section = set('section', makeSetLayout(profile, 'section', { sectionIdx: 2 }));
  const drill = set('drill', makeSetLayout(profile, 'drill', { sectionIdx: 2, drillCount: 5 }));
  const free = set('free', makeSetLayout(profile, 'drill', { drillCount: 5 }));
  const all = [full, section, drill, free, set('other', full.layout, 'lg-wayfit')];
  it('full requires the same ordered section ids and counts', () => {
    const wrongCount = set('wrong-count', full.layout.map((p, i) => ({ ...p, count: p.count + (i === 0 ? 1 : 0) })));
    const reordered = set('reordered', [...full.layout].reverse());
    expect(compatibleSets([...all, wrongCount, reordered], profile, 'full', null, 3)).toEqual([full]);
  });
  it('section requires exactly one part for the chosen section', () => {
    expect(compatibleSets(all, profile, 'section', 2, 3)).toEqual([section, drill]);
    expect(compatibleSets(all, profile, 'section', 0, 3)).toEqual([]);
  });
  it('drill requires a matching single part with enough questions', () => {
    expect(compatibleSets(all, profile, 'drill', 2, 5)).toEqual([section, drill]);
    expect(compatibleSets(all, profile, 'drill', 2, 6)).toEqual([section]);
    expect(compatibleSets(all, profile, 'drill', null, 5)).toEqual([free]);
    expect(compatibleSets(all, profile, 'drill', null, 6)).toEqual([]);
  });
});

describe('프로필 시간 입력', () => {
  it.each([['7:30', 450], ['450', 450], [' 20:00 ', 1200], ['0:10', 10], ['180:00', 10800]])('%s → %i초', (input, seconds) => {
    expect(parseProfileTime(input)).toBe(seconds);
  });
  it.each(['', ' ', '1:60', '1:5', '1:02:03', '-10', '10.5', '1e3', 'abc', '9007199254740992'])('잘못된 형식 %s', input => {
    expect(parseProfileTime(input)).toBeNaN();
  });
  it('파싱 후 도메인 범위 검사: 최소/최대와 경계 밖', () => {
    for (const [input, valid] of [['0:09', false], ['0:10', true], ['180:00', true], ['180:01', false]] as const) {
      const profile = effectiveProfile('dcat', []);
      profile.sections[0].seconds = parseProfileTime(input);
      expect(validateProfileEdit(profile).ok).toBe(valid);
    }
  });
});

describe('SetupDraft 변환', () => {
  const last: SetupDraft = {
    profileId: 'lg-wayfit', scope: 'drill', mode: 'omr', policy: 'hard', sectionIdx: 3,
    drillCount: 12, drillSeconds: null, setId: null, newSetName: '복습', startNo: 21, numberingMode: 'perSection', label: '',
  };
  it('기본값과 마지막 드릴의 사용자 선택을 복원한다', () => {
    expect(buildSetupDraft(initialSetup(undefined, [], []))).toMatchObject({ profileId: 'dcat', scope: 'full', mode: 'omr', policy: 'hard', startNo: 1, drillCount: 10, drillSeconds: null });
    expect(buildSetupDraft(initialSetup(last, [], []))).toEqual(last);
  });
  it('외부 모의를 복원하고 세트 없이 full/external로 전달한다', () => {
    const values = initialSetup({ ...last, scope: 'full', mode: 'external', setId: 'old', label: '외부 2회' }, [], []);
    expect(values.scope).toBe('external');
    expect(buildSetupDraft(values)).toMatchObject({ scope: 'full', mode: 'external', policy: 'hard', setId: null, sectionIdx: null, label: '외부 2회' });
  });
  it('범위 변경마다 기본 정책을 적용하고 section은 0을 요구한다', () => {
    const values = initialSetup(undefined, [], []);
    expect(changeScope(values, 'drill').policy).toBe('soft');
    for (const scope of ['full', 'section', 'external'] as const) expect(changeScope({ ...values, policy: 'soft' }, scope).policy).toBe('hard');
    expect(buildSetupDraft(changeScope(values, 'section')).sectionIdx).toBe(0);
    expect(buildSetupDraft(changeScope(values, 'drill')).sectionIdx).toBeNull();
  });
  it('삭제되거나 다른 프로필의 세트는 새 세트로 되돌린다', () => {
    const otherSet = { id: 'old', profileId: 'dcat' } as ProblemSet;
    expect(initialSetup({ ...last, setId: 'old' }, [], [otherSet]).setId).toBe('');
    expect(initialSetup({ ...last, setId: 'gone' }, [], []).setId).toBe('');
    expect(initialSetup({ ...last, setId: 'old' }, [], [{ ...otherSet, profileId: 'lg-wayfit' }]).setId).toBe('old');
  });
  it('프로필에서 사라진 영역을 복원할 때 안전한 기본값을 사용한다', () => {
    expect(initialSetup({ ...last, scope: 'section', sectionIdx: 4 }, [], []).sectionIdx).toBe(0);
    expect(initialSetup({ ...last, sectionIdx: 4 }, [], []).sectionIdx).toBeNull();
  });
});
