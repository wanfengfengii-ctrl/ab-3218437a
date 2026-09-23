import type { Issue } from '../lib/validate';
import {
  MAX_FAULTS,
  MAX_TESTS,
  type CellValue,
  type WorkModel,
} from '../lib/model';

interface EditorProps {
  work: WorkModel;
  onChange: (next: WorkModel) => void;
  issues: Issue[];
}

export default function Editor({ work, onChange, issues }: EditorProps) {
  const faultErrorAt = new Map<number, Set<string>>();
  const testErrorAt = new Map<number, Set<string>>();
  const cellMissing = new Set<string>();
  for (const is of issues) {
    if (is.level !== 'error') continue;
    if (is.faultIndex !== undefined && is.testIndex !== undefined) {
      cellMissing.add(`${is.testIndex}:${is.faultIndex}`);
    } else if (is.faultIndex !== undefined) {
      const s = faultErrorAt.get(is.faultIndex) ?? new Set<string>();
      s.add(is.kind);
      faultErrorAt.set(is.faultIndex, s);
    } else if (is.testIndex !== undefined) {
      const s = testErrorAt.get(is.testIndex) ?? new Set<string>();
      s.add(is.kind);
      testErrorAt.set(is.testIndex, s);
    }
  }

  const update = (patch: Partial<WorkModel>) => onChange({ ...work, ...patch });

  const renameFault = (fi: number, name: string) => {
    const faults = work.faults.slice();
    faults[fi] = name;
    update({ faults });
  };

  const renameTest = (ti: number, id: string) => {
    const tests = work.tests.slice();
    tests[ti] = { ...tests[ti]!, id };
    update({ tests });
  };

  const setCost = (ti: number, costText: string) => {
    const tests = work.tests.slice();
    tests[ti] = { ...tests[ti]!, costText };
    update({ tests });
  };

  const setCell = (ti: number, fi: number, v: CellValue) => {
    const tests = work.tests.slice();
    const readings = tests[ti]!.readings.slice();
    readings[fi] = v;
    tests[ti] = { ...tests[ti]!, readings };
    update({ tests });
  };

  const addFault = () => {
    if (work.faults.length >= MAX_FAULTS) return;
    const faults = [...work.faults, `F${work.faults.length + 1}`];
    const tests = work.tests.map((t) => ({ ...t, readings: [...t.readings, 0 as CellValue] }));
    update({ faults, tests });
  };

  const removeFault = (fi: number) => {
    const faults = work.faults.filter((_, i) => i !== fi);
    const tests = work.tests.map((t) => ({
      ...t,
      readings: t.readings.filter((_, i) => i !== fi),
    }));
    update({ faults, tests });
  };

  const addTest = () => {
    if (work.tests.length >= MAX_TESTS) return;
    const ti = work.tests.length;
    update({
      tests: [
        ...work.tests,
        {
          id: `T${ti + 1}`,
          costText: '1',
          readings: work.faults.map(() => 0 as CellValue),
        },
      ],
    });
  };

  const removeTest = (ti: number) => {
    update({ tests: work.tests.filter((_, i) => i !== ti) });
  };

  return (
    <div className="editor-wrap">
      <div className="editor-toolbar">
        <button type="button" onClick={addFault} disabled={work.faults.length >= MAX_FAULTS}>
          ＋ 故障
        </button>
        <button type="button" onClick={addTest} disabled={work.tests.length >= MAX_TESTS}>
          ＋ 试验
        </button>
        <span className="dim">
          {work.faults.length} 故障 · {work.tests.length} 试验（读数点选循环 0→1→空）
        </span>
      </div>

      <div className="table-scroll">
        <table className="matrix">
          <thead>
            <tr>
              <th className="corner">
                试验 ＼ 故障
              </th>
              {work.faults.map((name, fi) => (
                <th key={fi} className={faultErrorAt.has(fi) ? 'fault-head bad' : 'fault-head'}>
                  <input
                    className={faultErrorAt.has(fi) ? 'bad-input' : ''}
                    value={name}
                    onChange={(e) => renameFault(fi, e.target.value)}
                    aria-label={`故障 ${fi + 1} 编号`}
                  />
                  <button
                    type="button"
                    className="mini-del"
                    title="删除该故障"
                    onClick={() => removeFault(fi)}
                  >
                    ✕
                  </button>
                </th>
              ))}
              <th className="cost-head">耗时</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {work.tests.map((t, ti) => (
              <tr key={ti}>
                <th className="test-head">
                  <input
                    className={testErrorAt.has(ti) ? 'bad-input' : ''}
                    value={t.id}
                    onChange={(e) => renameTest(ti, e.target.value)}
                    aria-label={`试验 ${ti + 1} 编号`}
                  />
                </th>
                {work.faults.map((_, fi) => {
                  const v = t.readings[fi] ?? '';
                  const missing = cellMissing.has(`${ti}:${fi}`);
                  return (
                    <td key={fi} className={missing ? 'cell-bad' : ''}>
                      <button
                        type="button"
                        className={`cell-btn v-${v === '' ? 'empty' : v}`}
                        title={missing ? '读数缺项，点击补录' : '点击切换 0 / 1 / 空'}
                        onClick={() => setCell(ti, fi, v === 0 ? 1 : v === 1 ? '' : 0)}
                      >
                        {v === '' ? '—' : v}
                      </button>
                    </td>
                  );
                })}
                <td className="cost-cell">
                  <input
                    className={`cost-input ${testErrorAt.has(ti) ? 'bad-input' : ''}`}
                    value={t.costText}
                    inputMode="numeric"
                    onChange={(e) => setCost(ti, e.target.value)}
                    aria-label={`试验 ${t.id} 耗时`}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="mini-del"
                    title="删除该试验"
                    onClick={() => removeTest(ti)}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
