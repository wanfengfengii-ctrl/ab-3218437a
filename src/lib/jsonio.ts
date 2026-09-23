import type { CellValue, WorkModel } from './model';

/**
 * 导入/导出格式（与编辑模型解耦，全部计算保留在本地）：
 * {
 *   "faults": ["F1", ...],
 *   "tests": [
 *     { "id": "T1", "cost": 5, "readings": {"F1": 0, ...} }  // 也接受数组形式
 *   ]
 * }
 * readings 数组形式按 faults 顺序对齐；对象形式按故障编号取值。
 */

export interface SerialError {
  message: string;
  path?: string;
}

export function exportModel(work: WorkModel): string {
  const payload = {
    faults: work.faults,
    tests: work.tests.map((t) => ({
      id: t.id,
      cost: t.costText,
      readings: work.faults.map((_, fi) => t.readings[fi] ?? ''),
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export function parseImport(text: string): { work?: WorkModel; error?: SerialError } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { error: { message: `JSON 解析失败：${(e as Error).message}` } };
  }
  if (typeof raw !== 'object' || raw === null) {
    return { error: { message: '顶层必须是 JSON 对象。', path: '$' } };
  }
  const obj = raw as Record<string, unknown>;

  if (!Array.isArray(obj.faults)) {
    return { error: { message: '缺少 faults 数组。', path: '$.faults' } };
  }
  const faults: string[] = [];
  for (let i = 0; i < obj.faults.length; i++) {
    const v = obj.faults[i];
    if (typeof v !== 'string') {
      return { error: { message: `第 ${i + 1} 个故障编号必须是字符串。`, path: `$.faults[${i}]` } };
    }
    faults.push(v);
  }

  if (!Array.isArray(obj.tests)) {
    return { error: { message: '缺少 tests 数组。', path: '$.tests' } };
  }
  const tests: WorkModel['tests'] = [];
  for (let ti = 0; ti < obj.tests.length; ti++) {
    const entry = obj.tests[ti] as Record<string, unknown> | null;
    if (typeof entry !== 'object' || entry === null) {
      return { error: { message: `第 ${ti + 1} 项试验必须是对象。`, path: `$.tests[${ti}]` } };
    }
    const id = entry.id;
    if (typeof id !== 'string') {
      return { error: { message: `第 ${ti + 1} 项试验缺少字符串 id。`, path: `$.tests[${ti}].id` } };
    }
    const costRaw = entry.cost;
    let costText: string;
    if (typeof costRaw === 'number') {
      costText = String(costRaw);
    } else if (typeof costRaw === 'string') {
      costText = costRaw;
    } else {
      return {
        error: { message: `第 ${ti + 1} 项试验缺少 cost。`, path: `$.tests[${ti}].cost` },
      };
    }
    if (!('readings' in entry)) {
      return {
        error: { message: `第 ${ti + 1} 项试验缺少 readings。`, path: `$.tests[${ti}].readings` },
      };
    }
    const readings: CellValue[] = faults.map(() => '');
    const r = entry.readings;
    if (Array.isArray(r)) {
      faults.forEach((_, fi) => {
        const v = r[fi];
        if (v === 0 || v === 1) readings[fi] = v;
        else if (v === undefined || v === null) readings[fi] = '';
        else readings[fi] = '';
      });
    } else if (typeof r === 'object' && r !== null) {
      const rm = r as Record<string, unknown>;
      faults.forEach((fname, fi) => {
        const v = rm[fname];
        if (v === 0 || v === 1) readings[fi] = v;
      });
    } else {
      return {
        error: {
          message: `第 ${ti + 1} 项试验 readings 必须是数组或对象。`,
          path: `$.tests[${ti}].readings`,
        },
      };
    }
    tests.push({ id, costText, readings });
  }

  return { work: { faults, tests } };
}
