/**
 * 输入校验：数量约束、重复编号、空编号、非正耗时、矩阵缺项/非法读数、不可区分故障组
 */
import type { ProblemSpec, ValidationIssue } from './types';

export const FAULT_MIN = 3;
export const FAULT_MAX = 14;
export const TEST_MIN = 2;
export const TEST_MAX = 20;

export function validateSpec(spec: ProblemSpec): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { tests, faults } = spec;

  if (faults.length < FAULT_MIN || faults.length > FAULT_MAX) {
    issues.push({
      level: 'error',
      code: 'fault-count',
      message: `故障数量必须在 ${FAULT_MIN}–${FAULT_MAX} 种之间（当前 ${faults.length} 种）`,
    });
  }
  if (tests.length < TEST_MIN || tests.length > TEST_MAX) {
    issues.push({
      level: 'error',
      code: 'test-count',
      message: `试验数量必须在 ${TEST_MIN}–${TEST_MAX} 项之间（当前 ${tests.length} 项）`,
    });
  }

  // —— 试验编号与耗时 ——
  const testIdCount = new Map<string, number[]>();
  tests.forEach((t, j) => {
    const id = t.id.trim();
    if (!id) {
      issues.push({
        level: 'error',
        code: 'blank-test-id',
        message: `第 ${j + 1} 项试验的编号为空`,
        location: { testIndex: j },
      });
    } else {
      const arr = testIdCount.get(id) ?? [];
      arr.push(j);
      testIdCount.set(id, arr);
    }
    if (t.cost === null || !Number.isFinite(t.cost)) {
      issues.push({
        level: 'error',
        code: 'invalid-cost',
        message: `试验 “${id || `#${j + 1}`}” 的耗时缺失，必须填写正整数`,
        location: { testId: id || undefined, testIndex: j },
      });
    } else if (!Number.isInteger(t.cost) || t.cost <= 0) {
      issues.push({
        level: 'error',
        code: 'invalid-cost',
        message: `试验 “${id || `#${j + 1}`}” 的耗时 ${t.cost} 非法，必须为正整数`,
        location: { testId: id || undefined, testIndex: j },
      });
    }
  });
  for (const [id, arr] of testIdCount) {
    if (arr.length > 1) {
      issues.push({
        level: 'error',
        code: 'duplicate-test-id',
        message: `试验编号 “${id}” 重复，出现于第 ${arr.map((j) => j + 1).join('、')} 项`,
        location: { testId: id, testIndex: arr[0] },
      });
    }
  }

  // —— 故障编号 ——
  const faultIdCount = new Map<string, number[]>();
  faults.forEach((f, i) => {
    const id = f.id.trim();
    if (!id) {
      issues.push({
        level: 'error',
        code: 'blank-fault-id',
        message: `第 ${i + 1} 行故障的编号为空`,
        location: { faultIndex: i },
      });
    } else {
      const arr = faultIdCount.get(id) ?? [];
      arr.push(i);
      faultIdCount.set(id, arr);
    }
  });
  for (const [id, arr] of faultIdCount) {
    if (arr.length > 1) {
      issues.push({
        level: 'error',
        code: 'duplicate-fault-id',
        message: `故障编号 “${id}” 重复，出现于第 ${arr.map((i) => i + 1).join('、')} 行`,
        location: { faultId: id, faultIndex: arr[0] },
      });
    }
  }

  // —— 读数矩阵 ——
  let matrixComplete = faults.length > 0 && tests.length > 0;
  faults.forEach((f, i) => {
    for (let j = 0; j < tests.length; j += 1) {
      const v = f.readings[j];
      if (v === null || v === undefined) {
        matrixComplete = false;
        issues.push({
          level: 'error',
          code: 'missing-reading',
          message: `故障 “${f.id.trim() || `#${i + 1}`}” 在试验 “${tests[j]?.id.trim() || `#${j + 1}`}” 下的读数缺项`,
          location: {
            faultId: f.id.trim() || undefined,
            faultIndex: i,
            testId: tests[j]?.id.trim() || undefined,
            testIndex: j,
          },
        });
      } else if (v !== 0 && v !== 1) {
        matrixComplete = false;
        issues.push({
          level: 'error',
          code: 'invalid-reading',
          message: `故障 “${f.id.trim() || `#${i + 1}`}” 在试验 “${tests[j]?.id.trim() || `#${j + 1}`}” 下的读数 ${String(v)} 非法，只允许 0 或 1`,
          location: {
            faultId: f.id.trim() || undefined,
            faultIndex: i,
            testId: tests[j]?.id.trim() || undefined,
            testIndex: j,
          },
        });
      }
    }
  });

  // —— 不可区分故障组：完整读数向量完全相同 ——
  const structuralErrors = issues.some((x) => x.level === 'error');
  if (!structuralErrors && matrixComplete) {
    const groups = new Map<string, number[]>();
    faults.forEach((f, i) => {
      const sig = f.readings.join('');
      const arr = groups.get(sig) ?? [];
      arr.push(i);
      groups.set(sig, arr);
    });
    for (const arr of groups.values()) {
      if (arr.length > 1) {
        const ids = arr.map((i) => faults[i].id.trim());
        issues.push({
          level: 'warning',
          code: 'indistinguishable',
          message: `不可区分故障组：${ids.join('、')} 的完整读数完全相同，任何试验序列都无法区分`,
          group: ids,
          location: { faultIndex: arr[0] },
        });
      }
    }
  }

  return issues;
}

/** 是否存在阻止求解的问题（错误，或不可区分组） */
export function isSolvable(issues: ValidationIssue[]): boolean {
  return issues.length === 0;
}
