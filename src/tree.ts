import type { DiagNode } from './types';

export interface ReplayStep {
  /** 执行试验前所在节点 */
  from: DiagNode;
  testIndex: number;
  /** 该故障在本试验上的真实读数 */
  reading: 0 | 1;
  /** 执行后到达的节点（即剩余候选所在节点） */
  to: DiagNode;
}

/** 沿指定故障的真实读数从根走到叶，得到逐步回放序列 */
export function buildReplayPath(
  tree: DiagNode,
  faultIndex: number,
  readings: (0 | 1 | null)[][],
): ReplayStep[] {
  const steps: ReplayStep[] = [];
  let node = tree;
  while (node.kind === 'internal') {
    const t = node.testIndex as number;
    const r = readings[faultIndex][t];
    if (r !== 0 && r !== 1) break; // 理论上不会发生：求解前已校验完整
    const next = (node.children as [DiagNode, DiagNode])[r];
    steps.push({ from: node, testIndex: t, reading: r, to: next });
    node = next;
  }
  return steps;
}
