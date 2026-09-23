/**
 * 领域模型：故障、试验、0/1 观测矩阵
 */

/** 单个故障（叶节点必须唯一确定一个故障） */
export interface Fault {
  id: string;
  /** 该故障在每项试验下的 0/1 读数，长度必须等于试验数；null 表示缺项 */
  readings: (0 | 1 | null)[];
}

export interface Test {
  id: string;
  /** 正整数耗时 */
  cost: number | null;
}

export interface ProblemSpec {
  tests: Test[];
  faults: Fault[];
}

export interface ValidationIssue {
  /** 错误层级：error 阻止求解；warning 仅提示（当前用于不可区分组） */
  level: 'error' | 'warning';
  code:
    | 'fault-count'
    | 'test-count'
    | 'duplicate-test-id'
    | 'duplicate-fault-id'
    | 'blank-test-id'
    | 'blank-fault-id'
    | 'invalid-cost'
    | 'missing-reading'
    | 'invalid-reading'
    | 'indistinguishable';
  message: string;
  /** 定位信息（矩阵按 0 基下标，界面可换算为行/列号） */
  location?: {
    faultId?: string;
    faultIndex?: number;
    testId?: string;
    testIndex?: number;
  };
  /** 不可区分组（code === 'indistinguishable' 时） */
  group?: string[];
}

/** 诊断树节点 */
export interface DiagNode {
  kind: 'internal' | 'leaf';
  /** 到达该节点时仍可能的故障下标集合（已排序） */
  candidates: number[];
  /** 到达该节点的累计耗时（仅试验耗时） */
  accumulatedCost: number;
  /** 到达该节点已执行的试验数 */
  accumulatedCount: number;
  /** 内部节点：在该节点执行的试验下标 */
  testIndex?: number;
  /** 读数 0 / 1 分支 */
  children?: [DiagNode, DiagNode];
  /** 叶节点：唯一确定的故障下标 */
  faultIndex?: number;
}

export interface SolveResult {
  tree: DiagNode;
  /** 根节点目标值：最坏累计耗时、最坏试验数、先序签名 */
  worstCost: number;
  worstCount: number;
  signature: number[];
  /** 参与求解的节点数（内部节点 + 叶节点） */
  nodeCount: number;
}
