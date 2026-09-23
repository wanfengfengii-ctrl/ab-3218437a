import { describe, expect, it } from 'vitest';
import { solveDiagnosisTree } from './solver';
import type { DiagNode } from './types';

/** 收集叶节点对应故障，验证唯一且全覆盖 */
function leaves(node: DiagNode): number[] {
  if (node.kind === 'leaf') return [node.faultIndex as number];
  const [a, b] = node.children as [DiagNode, DiagNode];
  return [...leaves(a), ...leaves(b)];
}

/** 沿真实读数走树，计算每个故障的路径代价/深度，并核对叶节点一致 */
function walkAll(tree: DiagNode, readings: (0 | 1)[][], costs: number[]) {
  const result: { fault: number; cost: number; depth: number; leaf: number }[] = [];
  readings.forEach((vec, fault) => {
    let node = tree;
    let cost = 0;
    let depth = 0;
    while (node.kind === 'internal') {
      const t = node.testIndex as number;
      cost += costs[t];
      depth += 1;
      node = (node.children as [DiagNode, DiagNode])[vec[t]];
    }
    result.push({ fault, cost, depth, leaf: node.faultIndex as number });
  });
  return result;
}

function lexCmp(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

/**
 * 精确 oracle：对每个候选集保留 (代价, 深度, 先序签名) 全部 Pareto 最优方案，
 * 组合后在根上依次取最小代价、最小深度、签名最小。
 * 仅用于小规模随机对拍（3–5 故障、2–4 试验）。
 */
interface OracleOpt {
  cost: number;
  depth: number;
  sig: number[];
}
function oracleSolve(costs: number[], readings: (0 | 1)[][]): OracleOpt {
  const n = readings.length;
  const m = costs.length;
  const memo = new Map<string, OracleOpt[]>();

  const build = (set: number[]): OracleOpt[] => {
    const key = set.join(',');
    const hit = memo.get(key);
    if (hit) return hit;
    if (set.length === 1) return [{ cost: 0, depth: 0, sig: [] }];

    const cands: OracleOpt[] = [];
    const seen = new Set<string>();
    for (let t = 0; t < m; t += 1) {
      const s0 = set.filter((i) => readings[i][t] === 0);
      const s1 = set.filter((i) => readings[i][t] === 1);
      if (s0.length === 0 || s1.length === 0) continue;
      for (const a of build(s0)) {
        for (const b of build(s1)) {
          const sig = [t, ...a.sig, ...b.sig];
          const k = sig.join('.');
          if (seen.has(k)) continue;
          seen.add(k);
          cands.push({ cost: costs[t] + Math.max(a.cost, b.cost), depth: 1 + Math.max(a.depth, b.depth), sig });
        }
      }
    }
    const keep: OracleOpt[] = [];
    for (const x of cands) {
      let dominated = false;
      for (const y of cands) {
        if (x === y) continue;
        if (
          y.cost <= x.cost &&
          y.depth <= x.depth &&
          lexCmp(y.sig, x.sig) <= 0 &&
          (y.cost < x.cost || y.depth < x.depth || lexCmp(y.sig, x.sig) < 0)
        ) {
          dominated = true;
          break;
        }
      }
      if (!dominated) keep.push(x);
    }
    memo.set(key, keep);
    return keep;
  };

  const all = build(Array.from({ length: n }, (_, i) => i));
  const bestCost = Math.min(...all.map((o) => o.cost));
  const l1 = all.filter((o) => o.cost === bestCost);
  const bestDepth = Math.min(...l1.map((o) => o.depth));
  return l1
    .filter((o) => o.depth === bestDepth)
    .reduce((acc, o) => (lexCmp(o.sig, acc.sig) < 0 ? o : acc));
}

// 简单确定性随机
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('solveDiagnosisTree — 基本正确性', () => {
  it('3 故障 2 试验：平局时先序签名取最小（根取 T1）', () => {
    // F1=00, F2=01, F3=10；两个根的最坏代价均为 2、深度均为 2
    const res = solveDiagnosisTree({
      costs: [1, 1],
      readings: [
        [0, 0],
        [0, 1],
        [1, 0],
      ],
    });
    expect(res.worstCost).toBe(2);
    expect(res.worstCount).toBe(2);
    expect(res.tree.kind).toBe('internal');
    expect(res.tree.testIndex).toBe(0);
    expect(res.signature).toEqual([0, 1]);
  });

  it('slack 分支也取字典序最小：余量分支使用编号更小但更贵的试验', () => {
    // 全局最优签名 [T1,T2,T3,T1]，朴素“每子集独立最优”会错选为 [T1,T2,T3,T3]
    const costs = [9, 6, 1];
    const readings: (0 | 1)[][] = [
      [0, 1, 1],
      [1, 0, 0],
      [0, 0, 1],
      [0, 1, 0],
      [1, 1, 1],
    ];
    const res = solveDiagnosisTree({ costs, readings });
    expect(res.signature).toEqual([0, 1, 2, 1]);
    // 与精确 oracle 一致
    const o = oracleSolve(costs, readings);
    expect(res.worstCost).toBe(o.cost);
    expect(res.worstCount).toBe(o.depth);
    expect(compareArr(res.signature, o.sig)).toBe(0);
  });

  it('叶节点唯一确定全部故障，且每个故障沿真实读数到达对应叶', () => {
    const costs = [5, 2, 3];
    const readings: (0 | 1)[][] = [
      [0, 0, 0],
      [0, 1, 1],
      [1, 0, 1],
      [1, 1, 0],
    ];
    const res = solveDiagnosisTree({ costs, readings });
    const got = leaves(res.tree).sort((a, b) => a - b);
    expect(got).toEqual([0, 1, 2, 3]);
    const paths = walkAll(res.tree, readings, costs);
    for (const p of paths) {
      expect(p.leaf).toBe(p.fault);
      expect(p.cost).toBeLessThanOrEqual(res.worstCost);
      expect(p.depth).toBeLessThanOrEqual(res.worstCount);
    }
    // 至少一个故障达到最坏代价
    expect(Math.max(...paths.map((p) => p.cost))).toBe(res.worstCost);
  });

  it('昂贵试验即便一次可分，也因累计耗时更大而不当选根', () => {
    // T1 昂贵（100）且在根上近乎两分；便宜试验组合最坏代价仅 2
    const res = solveDiagnosisTree({
      costs: [100, 1, 1, 1],
      readings: [
        [0, 0, 0, 0],
        [0, 1, 0, 1],
        [1, 0, 0, 1],
        [1, 1, 1, 0],
      ],
    });
    expect(res.worstCost).toBe(2);
    expect(res.tree.testIndex).not.toBe(0);
  });

  it('候选集无法分裂时抛出（不可区分故障）', () => {
    expect(() =>
      solveDiagnosisTree({
        costs: [1, 2],
        readings: [
          [0, 1],
          [0, 1],
          [1, 0],
        ],
      }),
    ).toThrow(/无法/);
  });

  it('节点记录到达累计耗时与试验数，子节点正确累加', () => {
    const costs = [5, 2];
    const readings: (0 | 1)[][] = [
      [0, 0],
      [0, 1],
      [1, 0],
    ];
    const { tree } = solveDiagnosisTree({ costs, readings });
    expect(tree.accumulatedCost).toBe(0);
    const [z, o] = tree.children as [DiagNode, DiagNode];
    // 两子节点都先执行根试验
    expect(z.accumulatedCost).toBe(costs[tree.testIndex as number]);
    expect(o.accumulatedCost).toBe(costs[tree.testIndex as number]);
    expect(z.accumulatedCount).toBe(1);
  });
});

describe('solveDiagnosisTree — 精确 oracle 随机对拍', () => {
  it('在大量随机小矩阵上同时最优最坏耗时、最坏深度且签名字典序最小', () => {
    const rng = makeRng(20260923);
    let checked = 0;
    for (let iter = 0; iter < 300; iter += 1) {
      const nf = 3 + Math.floor(rng() * 2); // 3..4（oracle 全量枚举的稳定规模）
      const nt = 2 + Math.floor(rng() * 2); // 2..3
      const costs = Array.from({ length: nt }, () => 1 + Math.floor(rng() * 4));
      const readings: (0 | 1)[][] = [];
      const seen = new Set<string>();
      for (let i = 0; i < nf; i += 1) {
        let vec = '';
        let bits: (0 | 1)[] = [];
        do {
          bits = Array.from({ length: nt }, () => (rng() < 0.5 ? 0 : 1));
          vec = bits.join('');
        } while (seen.has(vec));
        seen.add(vec);
        readings.push(bits);
      }
      const o = oracleSolve(costs, readings);
      const res = solveDiagnosisTree({ costs, readings });
      expect(res.worstCost).toBe(o.cost);
      expect(res.worstCount).toBe(o.depth);
      expect(compareArr(res.signature, o.sig)).toBe(0);

      // 树合法：每叶唯一且沿真实读数到达
      const ls = leaves(res.tree).sort((a, b) => a - b);
      expect(ls).toEqual(Array.from({ length: nf }, (_, i) => i));
      for (const p of walkAll(res.tree, readings, costs)) {
        expect(p.leaf).toBe(p.fault);
      }
      checked += 1;
    }
    expect(checked).toBe(300);
  });
});

function compareArr(a: readonly number[], b: readonly number[]): number {
  return lexCmp(a, b);
}
