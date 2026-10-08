import { BUILTIN_PROFILES, effectiveProfile } from '../../domain/profiles';
import type { ExamProfile, ProblemSet, SessionScope, SetupDraft } from '../../domain/types';

export function compatibleSets(
  sets: ProblemSet[], profile: ExamProfile, scope: SessionScope, sectionIdx: number | null, drillCount: number,
): ProblemSet[] {
  const sectionId = sectionIdx === null ? null : profile.sections[sectionIdx]?.id;
  return sets.filter(set => {
    if (set.profileId !== profile.id) return false;
    if (scope === 'full') return set.layout.length === profile.sections.length && set.layout.every((part, i) =>
      part.sectionId === profile.sections[i].id && part.count === profile.sections[i].questions);
    if (scope === 'section' && sectionId == null) return false;
    return set.layout.length === 1 && set.layout[0].sectionId === sectionId
      && (scope !== 'drill' || set.layout[0].count >= drillCount);
  });
}

export interface SetupValues extends Omit<SetupDraft, 'scope' | 'mode' | 'drillCount' | 'drillSeconds' | 'startNo' | 'setId'> {
  scope: SetupDraft['scope'] | 'external';
  drillCount: string;
  drillSeconds: string;
  startNo: string;
  setId: string;
}

/** Keep empty and invalid input distinct from zero. */
export function parseSeconds(text: string): number {
  const value = text.trim();
  const seconds = /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(seconds) ? seconds : NaN;
}

export function parseProfileTime(text: string): number {
  const value = text.trim();
  if (!value.includes(':')) return parseSeconds(value);
  const match = /^(\d+):([0-5]\d)$/.exec(value);
  if (!match) return NaN;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return Number.isSafeInteger(seconds) ? seconds : NaN;
}

export function initialSetup(last: SetupDraft | undefined, profiles: ExamProfile[], sets: ProblemSet[]): SetupValues {
  const profileId = BUILTIN_PROFILES.some(p => p.id === last?.profileId) ? last!.profileId : 'dcat';
  const profile = effectiveProfile(profileId, profiles);
  const scope = last?.mode === 'external' ? 'external' : last?.scope ?? 'full';
  const sectionIdx = last?.sectionIdx != null && Number.isInteger(last.sectionIdx) && profile.sections[last.sectionIdx]
    ? last.sectionIdx : scope === 'section' ? 0 : null;
  return {
    profileId, scope, policy: last?.policy ?? (scope === 'drill' ? 'soft' : 'hard'), sectionIdx,
    drillCount: String(last?.drillCount ?? 10), drillSeconds: last?.drillSeconds == null ? '' : String(last.drillSeconds),
    setId: sets.find(s => s.id === last?.setId && s.profileId === profileId)?.id ?? '',
    newSetName: last?.newSetName ?? '', startNo: String(last?.startNo ?? 1),
    numberingMode: last?.numberingMode ?? 'continuous', label: last?.label ?? '',
  };
}

export function changeScope(values: SetupValues, scope: SetupValues['scope']): SetupValues {
  return { ...values, scope, policy: scope === 'drill' ? 'soft' : 'hard', sectionIdx: scope === 'section' ? values.sectionIdx ?? 0 : values.sectionIdx };
}

export function buildSetupDraft(values: SetupValues): SetupDraft {
  const external = values.scope === 'external';
  return {
    profileId: values.profileId, scope: values.scope === 'external' ? 'full' : values.scope,
    mode: external ? 'external' : 'omr', policy: values.policy,
    sectionIdx: values.scope === 'section' ? values.sectionIdx ?? 0 : values.scope === 'drill' ? values.sectionIdx : null,
    drillCount: Number.isFinite(parseSeconds(values.drillCount)) ? parseSeconds(values.drillCount) : 10,
    drillSeconds: Number.isFinite(parseSeconds(values.drillSeconds)) ? parseSeconds(values.drillSeconds) : null,
    setId: external ? null : values.setId || null, newSetName: values.newSetName,
    startNo: Number.isFinite(parseSeconds(values.startNo)) ? parseSeconds(values.startNo) : 1,
    numberingMode: values.numberingMode, label: values.label,
  };
}
