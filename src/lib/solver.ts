import type { ValidModel } from './validate';

/**
 * 自适应诊断树综合器（精确最优）。
 *
 * 模型：
 *   - 内部节点执行一项试验 t（耗时 w_t），按读数 0/1 进入两个子树；
 *   - 叶节点唯一对应一种故障；
 *   - 树的代价 = 从根到叶的最坏累计耗时；试验数 = 最深叶的试验个数。
 *
 * 动态规划（故障数 n ≤ 14，用位掩码表示候选集 S）：
 *   g_S[d] = 在「最多 d 层试验」的限制下，子树 S 可达的最小最坏代价上界；
 *            不可行时为 +∞。
 *   递推（k = |S| ≥ 2）：
 *     g_S[0] = ∞
 *     g_S[d] = min over 能分裂 S 的试验 t:
 *                w_t + max( g_{S0}[d-1], g_{S1}[d-1] )
 *   叶（|S|=1）：g_S[0] = 0。
 *   全局：C*(S) = g_S[k-1]，L*(S) = 使 g_S[d] = C* 的最小 d。
 *
 * 同值建树按先序字典序：节点记试验编号，0 子树先于 1 子树。
 * 先序序列首位即根试验，故在满足 (深度 ≤ d, 代价 ≤ C) 的试验中，
 * 直接取编号最小者，再分别对 0/1 子树独立取字典序最小即可。
 */

export interface DiagNode {
  kind: 'leaf' | 'internal';
  candidateMask: number;
  /** 叶节点：故障下标 */
  faultIndex?: number;
  /** 内部节点：试验下标 */
  testIndex?: number;
  zero?: DiagNode;
  one?: DiagNode;
}

export interface SolveSuccess {
  ok: true;
  root: DiagNode;
  worstCost: number;
  worstTests: number;
}

export interface SolveFailure {
  ok: false;
  message: string;
  /** 相同完整读数的不可区分故障组（成员为故障下标） */
  groups: number[][];
}

export type SolveResult = SolveSuccess | SolveFailure;

const INF = Number.POSITIVE_INFINITY;

function popcount(x: number): number {
  let c = 0;
  while (x) {
    x &= x - 1;
    c += 1;
  }
  return c;
}

export function solve(model: ValidModel): SolveResult {
  const n = model.faults.length;
  const m = model.tests.length;
  const w = model.tests.map((t) => t.cost);

  // 每项试验下读数为 1 的故障集合
  const onesMask = model.tests.map((t) => {
    let mask = 0;
    for (let f = 0; f < n; f++) if (t.readings[f] === 1) mask |= 1 << f;
    return mask;
  });

  const size = 1 << n;
  /** g[mask][d]，长度为 |mask| */
  const g: number[][] = new Array(size);
  g[0] = [];

  // 按子集大小递增；mask 数值递增不保证子集在前，故按 popcount 分桶
  const byPop: number[][] = Array.from({ length: n + 1 }, () => []);
  for (let mask = 1; mask < size; mask++) byPop[popcount(mask)]!.push(mask);

  const gAt = (mask: number, d: number): number => {
    const arr = g[mask]!;
    return arr[Math.min(d, arr.length - 1)]!;
  };

  // 单故障：叶
  for (const mask of byPop[1]!) g[mask] = [0];

  for (let k = 2; k <= n; k++) {
    for (const S of byPop[k]!) {
      const arr = new Array<number>(k).fill(INF); // arr[0] = ∞
      for (let d = 1; d < k; d++) {
        let best = INF;
        for (let t = 0; t < m; t++) {
          const s0 = S & ~onesMask[t]!;
          const s1 = S & onesMask[t]!;
          if (s0 === 0 || s1 === 0) continue; // 不能分裂 S
          const need = w[t]! + Math.max(gAt(s0, d - 1), gAt(s1, d - 1));
          if (need < best) best = need;
        }
        arr[d] = best;
      }
      g[S] = arr;
    }
  }

  const full = size - 1;
  const Cstar = g[full]![n - 1]!;
  if (!Number.isFinite(Cstar)) {
    return {
      ok: false,
      message: '存在完整读数相同的故障，任何试验序列都无法区分，诊断树不存在。',
      groups: indistinguishableGroups(model),
    };
  }

  // L*：g 单调不增，首个等于 C* 的下标
  let Lstar = 0;
  while (g[full]![Lstar] !== Cstar) Lstar += 1;

  const build = (S: number, d: number, C: number): DiagNode => {
    if (S & (S - 1)) {
      // 多候选：在 (深度 ≤ d, 代价 ≤ C) 可行的试验中取编号最小
      let chosen = -1;
      for (let t = 0; t < m; t++) {
        const s0 = S & ~onesMask[t]!;
        const s1 = S & onesMask[t]!;
        if (s0 === 0 || s1 === 0) continue;
        const cap = C - w[t]!;
        if (cap < 0) continue;
        if (gAt(s0, d - 1) <= cap && gAt(s1, d - 1) <= cap) {
          chosen = t;
          break; // 编号升序，首个即字典序最优根
        }
      }
      // 不变式：调用方保证可行
      const t = chosen;
      const s0 = S & ~onesMask[t]!;
      const s1 = S & onesMask[t]!;
      return {
        kind: 'internal',
        candidateMask: S,
        testIndex: t,
        zero: build(s0, d - 1, C - w[t]!),
        one: build(s1, d - 1, C - w[t]!),
      };
    }
    return { kind: 'leaf', candidateMask: S, faultIndex: ctz(S) };
  };

  return {
    ok: true,
    root: build(full, Lstar, Cstar),
    worstCost: Cstar,
    worstTests: Lstar,
  };
}

function ctz(x: number): number {
  let i = 0;
  while (((x >> i) & 1) === 0) i += 1;
  return i;
}

export function indistinguishableGroups(model: ValidModel): number[][] {
  const sig = new Map<string, number[]>();
  model.faults.forEach((_, fi) => {
    const key = model.tests.map((t) => t.readings[fi]).join('');
    const arr = sig.get(key) ?? [];
    arr.push(fi);
    sig.set(key, arr);
  });
  return [...sig.values()].filter((arr) => arr.length > 1);
}

// ---------- 树的遍历与回放 ----------

export interface PlaybackStep {
  testIndex: number;
  reading: 0 | 1;
  /** 试验前候选集 */
  beforeMask: number;
  /** 试验后候选集 */
  afterMask: number;
  /** 本步后累计耗时 */
  cumulativeCost: number;
  /** 第几步（1 基） */
  stepNo: number;
}

/** 沿指定故障从根回放，逐步给出试验、读数、剩余候选与累计耗时 */
export function traceFault(root: DiagNode, faultIndex: number, costs: number[]): PlaybackStep[] {
  const steps: PlaybackStep[] = [];
  let node = root;
  let cumulative = 0;
  let stepNo = 0;
  const bit = 1 << faultIndex;
  while (node.kind === 'internal') {
    const t = node.testIndex!;
    // 故障落在哪个子树的候选集中，即该步读数
    const goesOne = (node.one!.candidateMask & bit) !== 0;
    const r: 0 | 1 = goesOne ? 1 : 0;
    cumulative += costs[t]!;
    stepNo += 1;
    steps.push({
      testIndex: t,
      reading: r,
      beforeMask: node.candidateMask,
      afterMask: goesOne ? node.one!.candidateMask : node.zero!.candidateMask,
      cumulativeCost: cumulative,
      stepNo,
    });
    node = goesOne ? node.one! : node.zero!;
  }
  return steps;
}

export interface TreeStats {
  nodeCount: number;
  leafCount: number;
}

export function treeStats(root: DiagNode): TreeStats {
  let nodeCount = 0;
  let leafCount = 0;
  const walk = (nd: DiagNode): void => {
    nodeCount += 1;
    if (nd.kind === 'leaf') {
      leafCount += 1;
      return;
    }
    walk(nd.zero!);
    walk(nd.one!);
  };
  walk(root);
  return { nodeCount, leafCount };
}

/** 先序序列（仅内部节点的试验下标），用于测试与展示 */
export function preorderTests(root: DiagNode): number[] {
  const out: number[] = [];
  const walk = (nd: DiagNode): void => {
    if (nd.kind === 'leaf') return;
    out.push(nd.testIndex!);
    walk(nd.zero!);
    walk(nd.one!);
  };
  walk(root);
  return out;
}
