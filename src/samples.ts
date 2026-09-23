import type { ProblemSpec } from './types';

/** 内置示例 A：4 种故障、3 项试验，耗时不同，存在多级平局 */
export const SAMPLE_BASIC: ProblemSpec = {
  tests: [
    { id: 'T1', cost: 5 },
    { id: 'T2', cost: 2 },
    { id: 'T3', cost: 3 },
  ],
  faults: [
    { id: 'F1-加热器断路', readings: [0, 0, 0] },
    { id: 'F2-控温仪漂移', readings: [0, 1, 1] },
    { id: 'F3-管路泄漏', readings: [1, 0, 1] },
    { id: 'F4-隔热层失效', readings: [1, 1, 0] },
  ],
};

/** 内置示例 B：含不可区分故障组（F2/F3 完整读数相同） */
export const SAMPLE_INDISTINGUISHABLE: ProblemSpec = {
  tests: [
    { id: 'T1', cost: 4 },
    { id: 'T2', cost: 1 },
  ],
  faults: [
    { id: 'F1', readings: [0, 0] },
    { id: 'F2', readings: [1, 0] },
    { id: 'F3', readings: [1, 0] },
  ],
};

/** 示例 C：4 种故障、4 项试验；根上昂贵试验被便宜组合以更小最坏耗时击败 */
export const SAMPLE_COST_VS_COUNT: ProblemSpec = {
  tests: [
    { id: 'T1-真空罐', cost: 100 },
    { id: 'T2-红外测温', cost: 1 },
    { id: 'T3-流量回路', cost: 1 },
    { id: 'T4-通电自检', cost: 1 },
  ],
  faults: [
    { id: 'F1', readings: [0, 0, 0, 0] },
    { id: 'F2', readings: [0, 1, 0, 1] },
    { id: 'F3', readings: [1, 0, 0, 1] },
    { id: 'F4', readings: [1, 1, 1, 0] },
  ],
};

export function emptySpec(): ProblemSpec {
  return {
    tests: [
      { id: 'T1', cost: null },
      { id: 'T2', cost: null },
    ],
    faults: [
      { id: 'F1', readings: [null, null] },
      { id: 'F2', readings: [null, null] },
      { id: 'F3', readings: [null, null] },
    ],
  };
}
