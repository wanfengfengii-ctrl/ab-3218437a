import {
  MAX_FAULTS,
  MAX_TESTS,
  MIN_FAULTS,
  MIN_TESTS,
  type WorkModel,
} from './model';

export interface ValidFault {
  index: number;
  name: string;
}

export interface ValidTest {
  index: number;
  id: string;
  cost: number;
  /** readings[f] ∈ {0,1} */
  readings: number[];
}

export interface ValidModel {
  faults: ValidFault[];
  tests: ValidTest[];
}

export type IssueLevel = 'error' | 'warning';

export interface Issue {
  level: IssueLevel;
  /** 机器可读分类，供 UI 高亮单元格 */
  kind:
    | 'fault-count'
    | 'test-count'
    | 'fault-id-duplicate'
    | 'fault-id-empty'
    | 'test-id-duplicate'
    | 'test-id-empty'
    | 'cost-invalid'
    | 'cell-missing'
    | 'cell-invalid'
    | 'indistinguishable';
  message: string;
  /** 相关定位（0 基下标） */
  faultIndex?: number;
  testIndex?: number;
  /** 不可区分组（warning 时使用），成员为故障下标 */
  group?: number[];
}

const POS_INT_RE = /^\d+$/;

/**
 * 校验编辑模型。
 * error 阻止求解；warning（不可区分故障组）不阻止校验，但会导致问题无解，
 * 因此 indistinguishable 以 warning 形式返回，由求解阶段转成阻断信息。
 */
export function validateWork(work: WorkModel): { issues: Issue[]; model: ValidModel | null } {
  const issues: Issue[] = [];
  const { faults, tests } = work;

  // ---- 尺寸 ----
  if (faults.length < MIN_FAULTS || faults.length > MAX_FAULTS) {
    issues.push({
      level: 'error',
      kind: 'fault-count',
      message: `故障数量需在 ${MIN_FAULTS}–${MAX_FAULTS} 之间，当前为 ${faults.length}。`,
    });
  }
  if (tests.length < MIN_TESTS || tests.length > MAX_TESTS) {
    issues.push({
      level: 'error',
      kind: 'test-count',
      message: `试验数量需在 ${MIN_TESTS}–${MAX_TESTS} 之间，当前为 ${tests.length}。`,
    });
  }

  // ---- 故障编号 ----
  const faultNameCount = new Map<string, number[]>();
  faults.forEach((name, fi) => {
    const key = name.trim();
    if (!key) {
      issues.push({
        level: 'error',
        kind: 'fault-id-empty',
        faultIndex: fi,
        message: `第 ${fi + 1} 个故障编号为空。`,
      });
      return;
    }
    const arr = faultNameCount.get(key) ?? [];
    arr.push(fi);
    faultNameCount.set(key, arr);
  });
  for (const [name, arr] of faultNameCount) {
    if (arr.length > 1) {
      for (const fi of arr) {
        issues.push({
          level: 'error',
          kind: 'fault-id-duplicate',
          faultIndex: fi,
          message: `故障编号“${name}”重复（行 ${arr.map((i) => i + 1).join('、')}）。`,
        });
      }
    }
  }

  // ---- 试验编号与耗时 ----
  const testIdCount = new Map<string, number[]>();
  tests.forEach((t, ti) => {
    const key = t.id.trim();
    if (!key) {
      issues.push({
        level: 'error',
        kind: 'test-id-empty',
        testIndex: ti,
        message: `第 ${ti + 1} 项试验编号为空。`,
      });
    } else {
      const arr = testIdCount.get(key) ?? [];
      arr.push(ti);
      testIdCount.set(key, arr);
    }

    const costRaw = t.costText.trim();
    if (!POS_INT_RE.test(costRaw) || Number(costRaw) < 1) {
      issues.push({
        level: 'error',
        kind: 'cost-invalid',
        testIndex: ti,
        message: costRaw === ''
          ? `试验“${t.id || ti + 1}”的耗时缺失，须为正整数。`
          : `试验“${t.id || ti + 1}”的耗时“${t.costText}”不是正整数。`,
      });
    }
  });
  for (const [id, arr] of testIdCount) {
    if (arr.length > 1) {
      for (const ti of arr) {
        issues.push({
          level: 'error',
          kind: 'test-id-duplicate',
          testIndex: ti,
          message: `试验编号“${id}”重复（列 ${arr.map((i) => i + 1).join('、')}）。`,
        });
      }
    }
  }

  // ---- 读数矩阵 ----
  tests.forEach((t, ti) => {
    faults.forEach((_, fi) => {
      const v = t.readings[fi];
      if (v === undefined || v === '') {
        issues.push({
          level: 'error',
          kind: 'cell-missing',
          testIndex: ti,
          faultIndex: fi,
          message: `故障“${faults[fi] || fi + 1}”在试验“${t.id || ti + 1}”下的读数缺失。`,
        });
      } else if (v !== 0 && v !== 1) {
        issues.push({
          level: 'error',
          kind: 'cell-invalid',
          testIndex: ti,
          faultIndex: fi,
          message: `故障“${faults[fi] || fi + 1}”×试验“${t.id || ti + 1}”读数为“${v}”，只允许 0/1。`,
        });
      }
    });
  });

  const hardErrors = issues.filter((i) => i.level === 'error');
  if (hardErrors.length > 0) {
    return { issues, model: null };
  }

  const model: ValidModel = {
    faults: faults.map((name, index) => ({ index, name: name.trim() })),
    tests: tests.map((t, index) => ({
      index,
      id: t.id.trim(),
      cost: Number(t.costText.trim()),
      readings: t.readings.map((v) => (v === '' ? 0 : (v as number))),
    })),
  };

  // ---- 不可区分故障（完整读数向量相同）----
  const sig = new Map<string, number[]>();
  model.faults.forEach((_, fi) => {
    const key = model.tests.map((t) => t.readings[fi]).join('');
    const arr = sig.get(key) ?? [];
    arr.push(fi);
    sig.set(key, arr);
  });
  for (const arr of sig.values()) {
    if (arr.length > 1) {
      issues.push({
        level: 'warning',
        kind: 'indistinguishable',
        group: arr,
        message: `故障 ${arr.map((fi) => `“${model.faults[fi]!.name}”`).join('、')} 的全部试验读数相同，无法相互区分。`,
      });
    }
  }

  return { issues, model };
}
