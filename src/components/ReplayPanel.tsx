import type { ProblemSpec, SolveResult } from '../types';
import type { ReplayStep } from '../tree';

interface Props {
  spec: ProblemSpec;
  result: SolveResult;
  steps: ReplayStep[];
  stepIdx: number;
  faultIndex: number;
  onSelectFault: (i: number) => void;
  onStepChange: (v: number) => void;
}

export default function ReplayPanel({
  spec,
  result,
  steps,
  stepIdx,
  faultIndex,
  onSelectFault,
  onStepChange,
}: Props) {
  const { tests, faults } = spec;
  const idx = Math.min(stepIdx, steps.length);
  const currentNode = idx === 0 ? result.tree : steps[idx - 1].to;
  const finished = idx === steps.length;
  const step = idx > 0 ? steps[idx - 1] : null;

  return (
    <div>
      <div className="replay-controls">
        <label>
          目标故障：
          <select
            value={faultIndex}
            onChange={(e) => onSelectFault(Number(e.target.value))}
            aria-label="选择要回放的故障"
          >
            {faults.map((f, i) => (
              <option key={i} value={i}>
                {f.id.trim() || `故障 #${i + 1}`}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => onStepChange(0)} disabled={idx === 0}>
          ⏮ 起点
        </button>
        <button onClick={() => onStepChange(Math.max(0, idx - 1))} disabled={idx === 0}>
          ◀ 上一步
        </button>
        <button className="primary" onClick={() => onStepChange(Math.min(steps.length, idx + 1))} disabled={finished}>
          下一步 ▶
        </button>
        <button onClick={() => onStepChange(steps.length)} disabled={finished}>
          ⏭ 直达判定
        </button>
        <span className="muted">
          第 {idx} / {steps.length} 步
        </span>
      </div>

      <div className="progress">
        {steps.map((s, k) => (
          <div
            key={k}
            className={`dot ${k < idx ? 'done' : ''} ${k === idx ? 'current' : ''}`}
            title={`第 ${k + 1} 步：试验 ${tests[s.testIndex].id}，读数 ${s.reading}`}
          />
        ))}
      </div>

      <div className="step-info">
        {idx === 0 ? (
          <p style={{ margin: 0 }}>
            起点：尚未执行任何试验，候选集包含全部 <strong>{faults.length}</strong> 种故障，累计耗时 0。
          </p>
        ) : finished ? (
          <p style={{ margin: 0 }}>
            判定完成：唯一剩余故障为{' '}
            <strong style={{ color: 'var(--ok)' }}>
              “{faults[currentNode.faultIndex as number].id.trim()}”
            </strong>
            。
          </p>
        ) : (
          <p style={{ margin: 0 }}>
            刚执行试验 <strong>{tests[step!.testIndex].id}</strong>，该故障的真实读数为{' '}
            <span className={`badge b${step!.reading}`}>{step!.reading}</span>，沿读数 {step!.reading}{' '}
            分支继续。
          </p>
        )}
        <table>
          <tbody>
            <tr>
              <th>剩余候选故障</th>
              <td>{currentNode.candidates.map((i) => faults[i].id.trim() || `#${i + 1}`).join('、')}</td>
            </tr>
            <tr>
              <th>剩余候选数</th>
              <td>{currentNode.candidates.length}</td>
            </tr>
            <tr>
              <th>累计耗时</th>
              <td>{currentNode.accumulatedCost}</td>
            </tr>
            <tr>
              <th>已执行试验数</th>
              <td>{currentNode.accumulatedCount}</td>
            </tr>
            {step && (
              <tr>
                <th>上一步试验 / 读数</th>
                <td>
                  {tests[step.testIndex].id}（耗时 {tests[step.testIndex].cost}） → 读数{' '}
                  <span className={`badge b${step.reading}`}>{step.reading}</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="hint">
          回放读数取自矩阵中该故障的真实 0/1 列；累计耗时只累加实际执行过的试验耗时。
        </div>
      </div>
    </div>
  );
}
