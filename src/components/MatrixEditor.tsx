import type { ChangeEvent } from 'react';
import type { ProblemSpec, ValidationIssue } from '../types';
import { FAULT_MAX, FAULT_MIN, TEST_MAX, TEST_MIN } from '../validation';

interface Props {
  spec: ProblemSpec;
  issues: ValidationIssue[];
  onChange: (next: ProblemSpec) => void;
}

export default function MatrixEditor({ spec, issues, onChange }: Props) {
  const { tests, faults } = spec;

  const badCells = new Set<string>();
  const badTests = new Set<number>();
  const badFaults = new Set<number>();
  for (const is of issues) {
    const loc = is.location;
    if (!loc) continue;
    if (loc.testIndex !== undefined && loc.faultIndex !== undefined) {
      badCells.add(`${loc.faultIndex}:${loc.testIndex}`);
    }
    if (loc.testIndex !== undefined && loc.faultIndex === undefined) badTests.add(loc.testIndex);
    if (loc.faultIndex !== undefined && loc.testIndex === undefined) badFaults.add(loc.faultIndex);
  }

  const setTestId = (j: number, id: string) => {
    const next = tests.slice();
    next[j] = { ...next[j], id };
    onChange({ ...spec, tests: next });
  };
  const setTestCost = (j: number, raw: string) => {
    const cost = raw.trim() === '' ? null : Number(raw);
    const next = tests.slice();
    next[j] = { ...next[j], cost: Number.isFinite(cost as number) ? cost : null };
    onChange({ ...spec, tests: next });
  };
  const setFaultId = (i: number, id: string) => {
    const next = faults.slice();
    next[i] = { ...next[i], id };
    onChange({ ...spec, faults: next });
  };
  const setReading = (i: number, j: number, raw: string) => {
    const val: 0 | 1 | null = raw === '' ? null : raw === '0' ? 0 : 1;
    const next = faults.slice();
    const readings = next[i].readings.slice();
    readings[j] = val;
    next[i] = { ...next[i], readings };
    onChange({ ...spec, faults: next });
  };

  const addTest = () => {
    if (tests.length >= TEST_MAX) return;
    const id = `T${tests.length + 1}`;
    onChange({
      tests: [...tests, { id, cost: null }],
      faults: faults.map((f) => ({ ...f, readings: [...f.readings, null] })),
    });
  };
  const removeTest = (j: number) => {
    if (tests.length <= TEST_MIN) return;
    onChange({
      tests: tests.filter((_, x) => x !== j),
      faults: faults.map((f) => ({ ...f, readings: f.readings.filter((_, x) => x !== j) })),
    });
  };
  const addFault = () => {
    if (faults.length >= FAULT_MAX) return;
    onChange({
      ...spec,
      faults: [...faults, { id: `F${faults.length + 1}`, readings: tests.map(() => null) }],
    });
  };
  const removeFault = (i: number) => {
    if (faults.length <= FAULT_MIN) return;
    onChange({ ...spec, faults: faults.filter((_, x) => x !== i) });
  };

  const costValue = (c: number | null): string => (c === null ? '' : String(c));

  return (
    <div className="matrix-wrap">
      <table className="matrix">
        <thead>
          <tr>
            <th>故障 ＼ 试验</th>
            {tests.map((t, j) => (
              <th key={j}>
                <input
                  type="text"
                  value={t.id}
                  aria-label={`第 ${j + 1} 项试验编号`}
                  className={badTests.has(j) ? 'bad' : ''}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setTestId(j, e.target.value)}
                />
                <div>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    placeholder="耗时"
                    value={costValue(t.cost)}
                    aria-label={`试验 ${t.id} 耗时`}
                    className={badTests.has(j) ? 'bad' : ''}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setTestCost(j, e.target.value)}
                  />
                </div>
                {tests.length > TEST_MIN && (
                  <button
                    className="danger"
                    title="删除该试验"
                    onClick={() => removeTest(j)}
                    style={{ marginTop: 2, padding: '0 6px' }}
                  >
                    ✕
                  </button>
                )}
              </th>
            ))}
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {faults.map((f, i) => (
            <tr key={i}>
              <td>
                <input
                  type="text"
                  value={f.id}
                  aria-label={`第 ${i + 1} 行故障编号`}
                  className={badFaults.has(i) ? 'bad' : ''}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setFaultId(i, e.target.value)}
                />
              </td>
              {tests.map((_, j) => {
                const v = f.readings[j];
                return (
                  <td key={j} className="cell-read">
                    <select
                      aria-label={`故障 ${f.id} 试验 ${tests[j].id} 读数`}
                      className={badCells.has(`${i}:${j}`) ? 'bad' : ''}
                      value={v === null ? '' : String(v)}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                        setReading(i, j, e.target.value)
                      }
                    >
                      <option value="">—</option>
                      <option value="0">0</option>
                      <option value="1">1</option>
                    </select>
                  </td>
                );
              })}
              <td className="row-del">
                {faults.length > FAULT_MIN && (
                  <button className="danger" title="删除该故障" onClick={() => removeFault(i)}>
                    ✕
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="count-controls">
        <button onClick={addTest} disabled={tests.length >= TEST_MAX}>
          ＋ 新增试验（{tests.length}/{TEST_MAX}）
        </button>
        <button onClick={addFault} disabled={faults.length >= FAULT_MAX}>
          ＋ 新增故障（{faults.length}/{FAULT_MAX}）
        </button>
      </div>
    </div>
  );
}
