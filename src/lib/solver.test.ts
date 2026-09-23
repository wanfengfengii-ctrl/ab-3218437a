import { describe, expect, it } from 'vitest';
import { preorderTests, solve, traceFault, treeStats, type DiagNode } from './solver';
import { validateWork, type ValidModel } from './validate';
import { emptyModel, type WorkModel } from './model';
import { exportModel, parseImport } from './jsonio';

function makeModel(
  faults: string[],
  tests: { id: string; cost: number; readings: number[] }[],
): ValidModel {
  const work: WorkModel = {
    faults,
    tests: tests.map((t) => ({
      id: t.id,
      costText: String(t.cost),
      readings: t.readings.map((r) => (r === 0 || r === 1 ? r : ('' as const))),
    })),
  };
  const { model, issues } = validateWork(work);
  if (!model) throw new Error(issues.map((i) => i.message).join('; '));
  return model;
}

/** 手工构造：3 故障，T1 把 F1 与 {F2,F3} 分开，T2 区分 F2/F3，等耗时 */
function classicModel(): ValidModel {
  return makeModel(['F1', 'F2', 'F3'], [
    { id: 'T1', cost: 1, readings: [0, 1, 1] },
    { id: 'T2', cost: 1, readings: [0, 0, 1] },
  ]);
}

describe('solver 基本最优性', () => {
  it('叶节点唯一确定故障且指标正确', () => {
    const res = solve(classicModel());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.worstCost).toBe(2);
    expect(res.worstTests).toBe(2);
    const { leafCount } = treeStats(res.root);
    expect(leafCount).toBe(3);
    // 先序：根 T1，0 支为 F1 叶，1 支 T2
    expect(preorderTests(res.root)).toEqual([0, 1]);
  });

  it('每个内部节点都使用能真正分裂候选集的试验', () => {
    const res = solve(classicModel());
    if (!res.ok) throw new Error('应可解');
    const check = (nd: DiagNode): void => {
      if (nd.kind === 'leaf') return;
      expect(nd.zero!.candidateMask).not.toBe(0);
      expect(nd.one!.candidateMask).not.toBe(0);
      expect(nd.zero!.candidateMask & nd.one!.candidateMask).toBe(0);
      check(nd.zero!);
      check(nd.one!);
    };
    check(res.root);
  });

  it('优先最小化最坏耗时而非试验数：昂贵但冗余的试验永不使用', () => {
    // 4 故障。T1（贵 10）的读数向量与便宜的 T3 完全相同；
    // T2/T3（各耗时 1）已能唯一区分全部故障，最优最坏耗时 2、2 项。
    const m = makeModel(['F1', 'F2', 'F3', 'F4'], [
      { id: 'T1', cost: 10, readings: [0, 0, 1, 1] },
      { id: 'T2', cost: 1, readings: [0, 1, 0, 1] },
      { id: 'T3', cost: 1, readings: [0, 0, 1, 1] },
    ]);
    const res = solve(m);
    if (!res.ok) throw new Error('应可解');
    expect(res.worstCost).toBe(2);
    expect(res.worstTests).toBe(2);
    // 编号最小的可行根是 T2（下标 1），且全树不出现昂贵的 T1（下标 0）
    expect(res.root.testIndex).toBe(1);
    expect(preorderTests(res.root)).not.toContain(0);
  });

  it('不可区分故障时报告失败并给出分组', () => {
    const m = makeModel(['F1', 'F2', 'F3'], [
      { id: 'T1', cost: 1, readings: [0, 1, 1] },
      { id: 'T2', cost: 1, readings: [0, 0, 0] },
    ]);
    const res = solve(m);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.groups).toEqual([[1, 2]]);
  });
});

describe('回放', () => {
  it('沿故障回放给出试验、读数、剩余候选与累计耗时', () => {
    const m = classicModel();
    const res = solve(m);
    if (!res.ok) throw new Error('应可解');
    const steps = traceFault(res.root, 2, m.tests.map((t) => t.cost));
    expect(steps).toHaveLength(2);
    expect(steps[0]!.testIndex).toBe(0);
    expect(steps[0]!.reading).toBe(1);
    expect(steps[1]!.testIndex).toBe(1);
    expect(steps[1]!.reading).toBe(1);
    expect(steps[1]!.afterMask).toBe(1 << 2);
    expect(steps[1]!.cumulativeCost).toBe(2);

    const s1 = traceFault(res.root, 0, [1, 1]);
    expect(s1).toHaveLength(1);
    expect(s1[0]!.reading).toBe(0);
    expect(s1[0]!.afterMask).toBe(1);
  });
});

// ---------- 暴力对拍 ----------

interface BruteOption {
  c: number;
  l: number;
  pre: number[];
}

function bruteSolve(m: ValidModel): { c: number; l: number; pre: number[] } {
  const n = m.faults.length;
  const w = m.tests.map((t) => t.cost);
  const ones = m.tests.map((t) => {
    let mask = 0;
    for (let f = 0; f < n; f++) if (t.readings[f] === 1) mask |= 1 << f;
    return mask;
  });

  const memo = new Map<number, BruteOption[]>();

  const rec = (S: number): BruteOption[] => {
    const cached = memo.get(S);
    if (cached) return cached;
    if (!(S & (S - 1))) {
      const leaf = [{ c: 0, l: 0, pre: [] }];
      memo.set(S, leaf);
      return leaf;
    }
    const opts: BruteOption[] = [];
    for (let t = 0; t < m.tests.length; t++) {
      const s0 = S & ~ones[t]!;
      const s1 = S & ones[t]!;
      if (!s0 || !s1) continue;
      for (const a of rec(s0)) {
        for (const b of rec(s1)) {
          opts.push({
            c: w[t]! + Math.max(a.c, b.c),
            l: 1 + Math.max(a.l, b.l),
            pre: [t, ...a.pre, ...b.pre],
          });
        }
      }
    }
    memo.set(S, opts);
    return opts;
  };

  const opts = rec((1 << n) - 1);
  let bestC = Infinity;
  let bestL = Infinity;
  for (const o of opts) {
    if (o.c < bestC || (o.c === bestC && o.l < bestL)) {
      bestC = o.c;
      bestL = o.l;
    }
  }
  const lexMin = (a: number[], b: number[]): number[] => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] ?? Infinity;
      const y = b[i] ?? Infinity;
      if (x !== y) return x < y ? a : b;
    }
    return a;
  };
  let bestPre: number[] | null = null;
  for (const o of opts) {
    if (o.c === bestC && o.l === bestL) {
      bestPre = bestPre === null ? o.pre : lexMin(bestPre, o.pre);
    }
  }
  if (bestPre === null) throw new Error('no option');
  return { c: bestC, l: bestL, pre: bestPre };
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('与暴力枚举对拍（随机模型）', () => {
  it('最优代价、试验数、先序字典序全部一致', () => {
    const rand = mulberry32(20260923);
    for (let trial = 0; trial < 300; trial++) {
      const n = 3 + Math.floor(rand() * 4); // 3..6 故障
      const k = 2 + Math.floor(rand() * 4); // 2..5 试验
      const faults = Array.from({ length: n }, (_, i) => `F${i}`);
      const tests = Array.from({ length: k }, (_, ti) => ({
        id: `T${ti}`,
        cost: 1 + Math.floor(rand() * 12),
        readings: faults.map(() => (rand() < 0.5 ? 0 : 1) as 0 | 1),
      }));
      const m = makeModel(faults, tests);

      // 先检查是否两两可区分
      const sigs = new Set(faults.map((_, fi) => tests.map((t) => t.readings[fi]).join('')));
      const res = solve(m);
      if (sigs.size !== n) {
        expect(res.ok).toBe(false);
        continue;
      }
      if (!res.ok) throw new Error('应可解');
      const brute = bruteSolve(m);
      expect(res.worstCost).toBe(brute.c);
      expect(res.worstTests).toBe(brute.l);
      expect(preorderTests(res.root)).toEqual(brute.pre);
    }
  });
});

describe('校验定位', () => {
  it('重复编号、矩阵缺项、非正耗时均被定位', () => {
    const work = emptyModel(3, 2);
    work.faults[1] = 'F1'; // 与 F1 重复
    work.tests[0]!.id = 'X';
    work.tests[1]!.id = 'X'; // 试验编号重复
    work.tests[0]!.costText = '0'; // 非正
    work.tests[1]!.costText = '-3';
    work.tests[0]!.readings[2] = ''; // 缺项
    const { issues, model } = validateWork(work);
    expect(model).toBeNull();
    const kinds = issues.map((i) => i.kind);
    expect(kinds).toContain('fault-id-duplicate');
    expect(kinds).toContain('test-id-duplicate');
    expect(kinds).toContain('cost-invalid');
    expect(kinds).toContain('cell-missing');
    const dup = issues.find((i) => i.kind === 'fault-id-duplicate' && i.faultIndex === 1);
    expect(dup?.faultIndex).toBe(1);
    const miss = issues.find((i) => i.kind === 'cell-missing');
    expect(miss?.testIndex).toBe(0);
    expect(miss?.faultIndex).toBe(2);
  });

  it('相同完整读数的故障列为不可区分组（warning）', () => {
    const work: WorkModel = {
      faults: ['A', 'B', 'C'],
      tests: [
        { id: 't1', costText: '2', readings: [0, 1, 1] },
        { id: 't2', costText: '3', readings: [1, 0, 0] },
      ],
    };
    const { issues, model } = validateWork(work);
    expect(model).not.toBeNull();
    const w = issues.filter((i) => i.kind === 'indistinguishable');
    expect(w).toHaveLength(1);
    expect(w[0]!.group).toEqual([1, 2]);
  });
});

describe('JSON 导入导出', () => {
  it('往返一致', () => {
    const work = emptyModel(3, 2);
    work.tests[0]!.readings = [1, 0, 1];
    const text = exportModel(work);
    const parsed = parseImport(text);
    expect(parsed.error).toBeUndefined();
    expect(parsed.work).toEqual(work);
  });

  it('对象形 readings 与 cost 数字均可导入', () => {
    const text = JSON.stringify({
      faults: ['A', 'B', 'C'],
      tests: [
        { id: 'p', cost: 7, readings: { A: 0, B: 1, C: 1 } },
        { id: 'q', cost: 1, readings: [1, 0, 1] },
      ],
    });
    const parsed = parseImport(text);
    expect(parsed.error).toBeUndefined();
    expect(parsed.work!.tests[0]!.costText).toBe('7');
    expect(parsed.work!.tests[0]!.readings).toEqual([0, 1, 1]);
  });

  it('非法 JSON 报错且带路径', () => {
    expect(parseImport('{bad').error?.message).toContain('JSON');
    expect(parseImport('{"faults":[]}').error?.path).toBe('$.tests');
  });
});
