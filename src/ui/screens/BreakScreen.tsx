import { formatMmSs } from '../../domain/profiles';
import type { SectionPlan } from '../../domain/types';

export function BreakScreen(props: {
  plan: SectionPlan;
  idx: number;
  total: number;
  rangeLabel: string;
  autoStartAt?: number;
  now: number;
  onStart: () => void;
}) {
  const { plan, idx, total, rangeLabel, autoStartAt, now, onStart } = props;
  const allowedTools = [
    { allowed: plan.tools.allowed.calc, label: '계산기' },
    { allowed: plan.tools.allowed.memo, label: '메모' },
    { allowed: plan.tools.allowed.paint, label: '그림판' },
  ].filter(tool => tool.allowed).map(tool => tool.label);
  const toolsLabel = allowedTools.length === 0
    ? '도구 사용 불가'
    : `${allowedTools.join('·')} 사용 가능`;
  const automatic = autoStartAt != null;

  return (
    <div className="break-screen">
      <h2>다음 영역: {plan.name}</h2>
      <p>{idx + 1}/{total}</p>
      <p>{rangeLabel}</p>
      <p>제한 시간 {formatMmSs(plan.limitSec)}</p>
      <p>문항당 기준 시간 {Math.round(plan.paceSec)}초</p>
      <p>{toolsLabel}</p>
      {automatic && (
        <p>자동 시작까지 {Math.max(0, Math.ceil((autoStartAt - now) / 1000))}초</p>
      )}
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={event => event.preventDefault()}
        onClick={onStart}
      >
        {automatic ? '지금 시작' : '시작'}
      </button>
    </div>
  );
}
