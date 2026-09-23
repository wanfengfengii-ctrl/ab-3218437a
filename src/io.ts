/**
 * JSON 导入/导出。全部计算保留在本地，不发起任何网络请求。
 *
 * 规范格式：
 * {
 *   "tests":  [{ "id": "T1", "cost": 5 }, ...],
 *   "faults": [{ "id": "F1", "readings": [0, 1, ...] }, ...]
 * }
 */
import type { Fault, ProblemSpec, Test } from './types';

export interface ParseResult {
  spec?: ProblemSpec;
  error?: string;
}

export function parseSpecJson(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { error: `JSON 语法错误：${(e as Error).message}` };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { error: '顶层必须是包含 tests 与 faults 的对象' };
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.tests) || !Array.isArray(obj.faults)) {
    return { error: '必须包含数组字段 "tests" 与 "faults"' };
  }

  const tests: Test[] = obj.tests.map((t, j) => {
    if (typeof t !== 'object' || t === null) {
      return { id: String(j + 1), cost: null };
    }
    const rec = t as Record<string, unknown>;
    const id = rec.id === undefined || rec.id === null ? `T${j + 1}` : String(rec.id);
    let cost: number | null = null;
    if (typeof rec.cost === 'number' && Number.isFinite(rec.cost)) cost = rec.cost;
    else if (typeof rec.cost === 'string' && rec.cost.trim() !== '') {
      const n = Number(rec.cost);
      cost = Number.isFinite(n) ? n : null;
    }
    return { id, cost };
  });

  const faults: Fault[] = obj.faults.map((f, i) => {
    if (typeof f !== 'object' || f === null) {
      return { id: `F${i + 1}`, readings: tests.map(() => null) };
    }
    const rec = f as Record<string, unknown>;
    const id = rec.id === undefined || rec.id === null ? `F${i + 1}` : String(rec.id);
    const readings: (0 | 1 | null)[] = tests.map((_, j) => {
      const v = Array.isArray(rec.readings) ? rec.readings[j] : undefined;
      if (v === 0 || v === '0') return 0;
      if (v === 1 || v === '1') return 1;
      return null;
    });
    return { id, readings };
  });

  return { spec: { tests, faults } };
}

export function stringifySpec(spec: ProblemSpec): string {
  return JSON.stringify(spec, null, 2);
}
