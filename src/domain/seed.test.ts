import { describe, expect, it } from 'vitest';
import { buildDcatTemplate, buildSeedImport, buildSeedTaxonomy, PASSSIDAE_DCAT_R1, splitPath } from './seed';

const families = {
  명제추리: [5, 6], 단문독해: [5, 6], 글의구조: [5, 8], 어휘어법: [10, 13],
  어휘추리: [2, 2], 수열: [2, 2], 응용수리: [4, 7], 자료해석: [5, 10],
  '수/문자추리': [0, 1], 입체도형: [2, 2], 전개도: [0, 6], 평면도형: [1, 4], 도형추리: [5, 8],
};

describe('DCAT 1회 시드', () => {
  it('부록 A의 헤더, 42행, 전체 합계 46/75', () => {
    expect(PASSSIDAE_DCAT_R1.header).toEqual({
      round: 1, date: '2026-10-08', rank: 40, takers: 101, usedMin: 83,
      limitMin: 65, score: 61.2, scoreMax: 100, correct: 46, total: 75,
    });
    expect(PASSSIDAE_DCAT_R1.rows).toHaveLength(42);
    expect(PASSSIDAE_DCAT_R1.rows.reduce((x, r) => x + r.correct, 0)).toBe(46);
    expect(PASSSIDAE_DCAT_R1.rows.reduce((x, r) => x + r.total, 0)).toBe(75);
  });

  it('위치로 영역을 매핑하고 영역·가족 합계가 일치한다', () => {
    const record = buildSeedImport(1234);
    expect(record).toMatchObject({ id: 'seed-passsidae-dcat-r1', profileId: 'dcat',
      capturedAt: 1234, status: 'confirmed', overtime: true, schemaVersion: 1 });
    const sums = (by: 'sectionId' | 'family') => Object.fromEntries(
      [...new Set(record.rows!.map(r => r[by]))].map(id => {
        const rows = record.rows!.filter(r => r[by] === id);
        return [id, [rows.reduce((x, r) => x + r.correct, 0), rows.reduce((x, r) => x + r.total, 0)]];
      }),
    );
    expect(sums('sectionId')).toEqual({ 'verbal-logic': [15, 20], 'verbal-expression': [12, 15],
      numerical: [11, 20], spatial: [2, 10], figure: [6, 10] });
    expect(sums('family')).toEqual(families);
    let q = 0;
    record.rows!.forEach(r => {
      expect(r.qFrom).toBe(q);
      expect(r.qTo).toBe(q + r.total - 1);
      expect(r.mapped).toBe('position');
      q += r.total;
    });
  });

  it('13가족, 중복 없는 가족별 세부, 두 영역에 걸친 평면도형 힌트', () => {
    const taxonomy = buildSeedTaxonomy();
    expect(taxonomy.profileId).toBe('dcat');
    expect(taxonomy.families.map(f => f.id)).toEqual(Object.keys(families));
    expect(taxonomy.families.every(f => f.name === f.id)).toBe(true);
    expect(taxonomy.families.find(f => f.id === '평면도형')!.sectionHint).toEqual(['spatial', 'figure']);
    const leaves = taxonomy.leaves.map(l => `${l.familyId}:${l.id}`);
    expect(new Set(leaves).size).toBe(leaves.length);
    expect(taxonomy.leaves.every(l => l.id === l.name && l.name !== '')).toBe(true);
  });

  it('기본 틀이 표 순서대로 0~74를 정확히 한 번 덮고 세부 이름을 유지한다', () => {
    const ranges = buildDcatTemplate();
    expect(ranges).toHaveLength(42);
    expect(ranges.flatMap(r => Array.from({ length: r.to - r.from + 1 }, (_, i) => r.from + i)))
      .toEqual(Array.from({ length: 75 }, (_, i) => i));
    expect(ranges[30]).toMatchObject({ from: 55, to: 56, familyId: '입체도형', leafId: '[단면도]-[3×3×3큐브] (두산)' });
    const copy = buildSeedImport(0);
    copy.rows![0].correct = 0;
    expect(buildSeedImport(0).rows![0].correct).toBe(2);
    ranges[0].familyId = '변경';
    expect(buildDcatTemplate()[0].familyId).toBe('명제추리');
  });
});

describe('splitPath', () => {
  it('대분류와 가족을 떼고 세부의 대괄호 구분자를 보존한다', () => {
    expect(splitPath('12. 공간지각 - 입체도형 - [단면도]-[3×3×3큐브] (두산)')).toEqual({
      category: '12. 공간지각', family: '입체도형', leaf: '[단면도]-[3×3×3큐브] (두산)',
    });
  });
  it('가족 끝 괄호를 제거하며 세부 괄호는 보존한다', () => {
    expect(splitPath('2. 수리능력 - 자료해석(그래프) - 자료계산(그래프)')).toEqual({
      category: '2. 수리능력', family: '자료해석', leaf: '자료계산(그래프)',
    });
    expect(splitPath('１１． 추리 — 도형추리(보기(중첩)) – 규칙(A-B)')).toEqual({
      category: '11. 추리', family: '도형추리', leaf: '규칙(A-B)',
    });
  });
  it('접두 없는 행은 category가 없고, 잎이 없으면 빈 문자열', () => {
    expect(splitPath('응용수리-거리/시간/속력')).toEqual({ family: '응용수리', leaf: '거리/시간/속력' });
    expect(splitPath('2. 수리능력 - 수열')).toEqual({ category: '2. 수리능력', family: '수열', leaf: '' });
  });
});
