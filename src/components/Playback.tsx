import { useMemo } from 'react';
import { traceFault, type DiagNode, type PlaybackStep } from '../lib/solver';
import type { ValidModel } from '../lib/validate';

interface PlaybackProps {
  root: DiagNode;
  model: ValidModel;
  selectedFault: number | null;
  onSelectFault: (fi: number | null) => void;
  /** 当前回放步数（已执行的步数），由 App 提升状态以联动树高亮 */
  stepPos: number;
  onStepPos: (n: number) => void;
}

function namesOf(mask: number, model: ValidModel): string {
  const out: string[] = [];
  for (let f = 0; f < model.faults.length; f++) {
    if (mask & (1 << f)) out.push(model.faults[f]!.name);
  }
  return out.join('、');
}

/** 取回放路径上前 pos 步经过的内部节点与当前节点 */
export function pathNodes(root: DiagNode, faultIndex: number, pos: number) {
  const visited = new Set<DiagNode>();
  let cur: DiagNode = root;
  const bit = 1 << faultIndex;
  let i = 0;
  while (cur.kind === 'internal') {
    visited.add(cur);
    if (i === pos) break;
    cur = (cur.one!.candidateMask & bit) !== 0 ? cur.one! : cur.zero!;
    i += 1;
  }
  return { visited, current: cur };
}

export default function Playback({
  root,
  model,
  selectedFault,
  onSelectFault,
  stepPos,
  onStepPos,
}: PlaybackProps) {
  const steps: PlaybackStep[] = useMemo(
    () => (selectedFault === null ? [] : traceFault(root, selectedFault, model.tests.map((t) => t.cost))),
    [root, selectedFault, model],
  );

  const total = steps.length;
  const pos = Math.min(stepPos, total);

  if (selectedFault === null) {
    return (
      <div className="playback">
        <h3>逐步回放</h3>
        <p className="dim">在下方选择一个故障，沿诊断树逐步回放试验、读数、剩余候选与累计耗时。</p>
        <div className="fault-picker">
          {model.faults.map((f) => (
            <button key={f.index} type="button" className="fault-btn" onClick={() => onSelectFault(f.index)}>
              {f.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const shown = steps.slice(0, pos);

  return (
    <div className="playback">
      <h3>
        逐步回放
        <button type="button" className="reset-btn" onClick={() => onSelectFault(null)}>
          重新选择故障
        </button>
      </h3>
      <div className="fault-picker">
        {model.faults.map((f) => (
          <button
            key={f.index}
            type="button"
            className={`fault-btn ${f.index === selectedFault ? 'active' : ''}`}
            onClick={() => onSelectFault(f.index)}
          >
            {f.name}
          </button>
        ))}
      </div>

      <div className="step-controls">
        <button type="button" onClick={() => onStepPos(0)} disabled={pos === 0}>
          ⏮ 起点
        </button>
        <button type="button" onClick={() => onStepPos(Math.max(0, pos - 1))} disabled={pos === 0}>
          ◀ 上一步
        </button>
        <button type="button" onClick={() => onStepPos(Math.min(total, pos + 1))} disabled={pos === total}>
          下一步 ▶
        </button>
        <button type="button" onClick={() => onStepPos(total)} disabled={pos === total}>
          终点 ⏭
        </button>
        <span className="dim">
          第 {pos}/{total} 步
        </span>
      </div>

      <ol className="step-list">
        {shown.map((s) => (
          <li key={s.stepNo} className="step-item">
            <div className="step-head">
              <span className="step-no">#{s.stepNo}</span>
              <strong>{model.tests[s.testIndex]!.id}</strong>
              <span className="dim">耗时 +{model.tests[s.testIndex]!.cost}</span>
              <span className={`reading-badge r-${s.reading}`}>读数 {s.reading}</span>
            </div>
            <div className="step-body">
              <div>
                剩余候选（{popcount(s.afterMask)}）：{namesOf(s.afterMask, model)}
              </div>
              <div className="cum">累计耗时：{s.cumulativeCost}</div>
            </div>
          </li>
        ))}
        {pos === 0 && <li className="dim step-pending">尚未执行试验，候选为全部 {model.faults.length} 种故障。</li>}
        {pos === total && (
          <li className="step-item diagnosed">
            ✅ 确诊：<strong>{model.faults[selectedFault]!.name}</strong>，总试验 {total} 项，累计耗时{' '}
            {steps[total - 1]?.cumulativeCost ?? 0}。
          </li>
        )}
      </ol>
    </div>
  );
}

function popcount(mask: number): number {
  let c = 0;
  while (mask) {
    mask &= mask - 1;
    c += 1;
  }
  return c;
}
