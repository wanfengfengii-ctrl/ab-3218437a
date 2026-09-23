/**
 * 自适应诊断树求解器（自顶向下预算 DP，保证全局字典序最优）
 *
 * 优化目标依次为：
 *   1) 根到叶的最坏累计耗时最小
 *   2) 在 1) 的前提下最坏试验数最小
 *   3) 再平局时，「节点记试验编号、按 0 后 1 展开」的先序序列字典序最小
 *
 * 关键点：第 3 条是整棵树的全局先序序列比较，某个不决定全局最坏值的“余量
 * 分支”允许使用自身代价更高但编号更小的试验（只要不突破根预算）。因此不能像
 * 朴素做法那样让每个候选集独立取自身最优，而要带预算自顶向下选择：
 *
 *   C(S)            无预算约束时 S 的最小最坏耗时（标量 DP）
 *   H(S)            无约束时 S 的最小最坏深度（仅用于剪枝的下界）
 *   D(S, Bc)        耗时预算 Bc 下 S 的最小最坏深度（标量 DP）
 *   L(S, Bc, Bd)    预算 (Bc, Bd) 内字典序最小的方案
 *
 * L 中按试验编号从小到大枚举能将 S 分裂为非空 0/1 两侧的试验 t，第一个使
 * 两个子问题 L(·, Bc-c_t, Bd-1) 同时可行的 t 即字典序最优：根编号最小后，
 * 0 子树签名、1 子树签名分别位于签名的独立区间，可取各自最小。
 *
 * 故障数 ≤ 14，候选集用 14 位位掩码表示。
 */

import type { DiagNode, SolveResult } from './types';

export interface SolveInput {
  /** 每项试验的正整数耗时 */
  costs: number[];
  /** readings[故障下标][试验下标] ∈ {0,1}；各故障向量两两不同 */
  readings: (0 | 1)[][];
}

interface LexChoice {
  /** 本子树实际达到的最坏耗时 / 深度 */
  cost: number;
  depth: number;
  /** 先序试验编号序列 */
  signature: number[];
  test: number;
  zero: LexChoice | null;
  one: LexChoice | null;
  mask: number;
  leaf: boolean;
}

const isSingle = (x: number): boolean => (x & (x - 1)) === 0;

export function solveDiagnosisTree(input: SolveInput): SolveResult {
  const { costs, readings } = input;
  const n = readings.length;
  const m = costs.length;

  // 预计算每项试验的 0/1 故障掩码
  const zeroMask = new Array<number>(m).fill(0);
  const oneMask = new Array<number>(m).fill(0);
  for (let t = 0; t < m; t += 1) {
    for (let i = 0; i < n; i += 1) {
      if (readings[i][t] === 1) oneMask[t] |= 1 << i;
      else zeroMask[t] |= 1 << i;
    }
  }

  // —— C(S)：无约束最小最坏耗时 ——
  const cMemo = new Map<number, number>();
  const C = (s: number): number => {
    const hit = cMemo.get(s);
    if (hit !== undefined) return hit;
    if (isSingle(s)) {
      cMemo.set(s, 0);
      return 0;
    }
    let best = Infinity;
    for (let t = 0; t < m; t += 1) {
      const s0 = s & zeroMask[t];
      const s1 = s & oneMask[t];
      if (!s0 || !s1) continue;
      const v = costs[t] + Math.max(C(s0), C(s1));
      if (v < best) best = v;
    }
    cMemo.set(s, best);
    return best;
  };

  // —— H(S)：无约束最小最坏深度（下界，用于剪枝） ——
  const hMemo = new Map<number, number>();
  const H = (s: number): number => {
    const hit = hMemo.get(s);
    if (hit !== undefined) return hit;
    if (isSingle(s)) {
      hMemo.set(s, 0);
      return 0;
    }
    let best = Infinity;
    for (let t = 0; t < m; t += 1) {
      const s0 = s & zeroMask[t];
      const s1 = s & oneMask[t];
      if (!s0 || !s1) continue;
      const v = 1 + Math.max(H(s0), H(s1));
      if (v < best) best = v;
    }
    hMemo.set(s, best);
    return best;
  };

  // —— D(S, Bc)：耗时预算内最小最坏深度 ——
  const dMemo = new Map<string, number>();
  const D = (s: number, bc: number): number => {
    if (isSingle(s)) return 0;
    const key = `${s}|${bc}`;
    const hit = dMemo.get(key);
    if (hit !== undefined) return hit;
    let best = Infinity;
    for (let t = 0; t < m; t += 1) {
      if (costs[t] > bc) continue;
      const s0 = s & zeroMask[t];
      const s1 = s & oneMask[t];
      if (!s0 || !s1) continue;
      const nb = bc - costs[t];
      const d0 = D(s0, nb);
      if (!Number.isFinite(d0)) continue;
      const d1 = D(s1, nb);
      if (!Number.isFinite(d1)) continue;
      const v = 1 + Math.max(d0, d1);
      if (v < best) best = v;
    }
    dMemo.set(key, best);
    return best;
  };

  // —— L(S, Bc, Bd)：预算内先序字典序最小方案 ——
  const lMemo = new Map<string, LexChoice | null>();
  const L = (s: number, bc: number, bd: number): LexChoice | null => {
    if (isSingle(s)) {
      return { cost: 0, depth: 0, signature: [], test: -1, zero: null, one: null, mask: s, leaf: true };
    }
    if (bc <= 0 || bd <= 0) return null;
    const key = `${s}|${bc}|${bd}`;
    const cached = lMemo.get(key);
    if (cached !== undefined) return cached;

    // 可行性剪枝：无约束下界都超预算则必不可行
    if (C(s) > bc || H(s) > bd) {
      lMemo.set(key, null);
      return null;
    }
    // 预算内的最小深度仍超过 Bd 则不可行
    if (D(s, bc) > bd) {
      lMemo.set(key, null);
      return null;
    }

    let result: LexChoice | null = null;
    for (let t = 0; t < m && result === null; t += 1) {
      if (costs[t] > bc) continue;
      const s0 = s & zeroMask[t];
      const s1 = s & oneMask[t];
      if (!s0 || !s1) continue;
      const nb = bc - costs[t];
      const nd = bd - 1;
      // 廉价下界先过滤，再递归求字典序方案
      if (C(s0) > nb || C(s1) > nb || H(s0) > nd || H(s1) > nd) continue;
      const c0 = L(s0, nb, nd);
      if (!c0) continue;
      const c1 = L(s1, nb, nd);
      if (!c1) continue;
      result = {
        cost: costs[t] + Math.max(c0.cost, c1.cost),
        depth: 1 + Math.max(c0.depth, c1.depth),
        signature: [t, ...c0.signature, ...c1.signature],
        test: t,
        zero: c0,
        one: c1,
        mask: s,
        leaf: false,
      };
    }
    lMemo.set(key, result);
    return result;
  };

  const rootMask = (1 << n) - 1;
  const worstCost = C(rootMask);
  if (!Number.isFinite(worstCost)) {
    throw new Error('候选集无法被任何试验分裂（存在不可区分故障）');
  }
  const worstCount = D(rootMask, worstCost);
  const rootChoice = L(rootMask, worstCost, worstCount);
  if (!rootChoice) {
    // 理论不可达：C/D 已给出可行最优值
    throw new Error('内部错误：预算内未找到与最优值一致的方案');
  }

  // 由 LexChoice 重建可展示的诊断树，并传播到达累计值
  let nodeCount = 0;
  const build = (
    c: LexChoice,
    accCost: number,
    accCount: number,
  ): DiagNode => {
    nodeCount += 1;
    const candidates: number[] = [];
    for (let i = 0; i < n; i += 1) if (c.mask & (1 << i)) candidates.push(i);

    if (c.leaf) {
      return {
        kind: 'leaf',
        candidates,
        accumulatedCost: accCost,
        accumulatedCount: accCount,
        faultIndex: candidates[0],
      };
    }
    const t = c.test;
    const node: DiagNode = {
      kind: 'internal',
      candidates,
      accumulatedCost: accCost,
      accumulatedCount: accCount,
      testIndex: t,
      children: [
        build(c.zero as LexChoice, accCost + costs[t], accCount + 1),
        build(c.one as LexChoice, accCost + costs[t], accCount + 1),
      ],
    };
    return node;
  };

  const tree = build(rootChoice, 0, 0);

  return {
    tree,
    worstCost,
    worstCount,
    signature: rootChoice.signature,
    nodeCount,
  };
}
