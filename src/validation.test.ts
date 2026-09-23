import { describe, expect, it } from 'vitest';
import { validateSpec } from './validation';
import type { ProblemSpec } from './types';
import { parseSpecJson } from './io';

const valid = (): ProblemSpec => ({
  tests: [
    { id: 'T1', cost: 5 },
    { id: 'T2', cost: 2 },
  ],
  faults: [
    { id: 'F1', readings: [0, 0] },
    { id: 'F2', readings: [0, 1] },
    { id: 'F3', readings: [1, 0] },
  ],
});

describe('validateSpec', () => {
  it('合法输入无问题', () => {
    expect(validateSpec(valid())).toEqual([]);
  });

  it('故障/试验数量越界', () => {
    const s = valid();
    s.faults = s.faults.slice(0, 2);
    expect(validateSpec(s).some((i) => i.code === 'fault-count')).toBe(true);
    const s2 = valid();
    s2.tests = [s2.tests[0]];
    expect(validateSpec(s2).some((i) => i.code === 'test-count')).toBe(true);
  });

  it('重复编号定位到具体试验/故障', () => {
    const s = valid();
    s.tests[1].id = 'T1';
    const issues = validateSpec(s);
    const dup = issues.find((i) => i.code === 'duplicate-test-id');
    expect(dup?.message).toContain('T1');
    expect(dup?.location?.testIndex).toBe(0);
    const s3 = valid();
    s3.faults[2].id = 'F1';
    expect(validateSpec(s3).some((i) => i.code === 'duplicate-fault-id')).toBe(true);
  });

  it('空编号报错', () => {
    const s = valid();
    s.tests[0].id = '  ';
    s.faults[1].id = '';
    const issues = validateSpec(s);
    expect(issues.some((i) => i.code === 'blank-test-id')).toBe(true);
    expect(issues.some((i) => i.code === 'blank-fault-id')).toBe(true);
  });

  it('非正/非整数/缺失耗时定位到试验', () => {
    const s0 = valid();
    s0.tests[0].cost = 0;
    expect(validateSpec(s0).find((i) => i.code === 'invalid-cost')?.location?.testIndex).toBe(0);
    const s1 = valid();
    s1.tests[1].cost = -3;
    expect(validateSpec(s1).some((i) => i.code === 'invalid-cost')).toBe(true);
    const s2 = valid();
    s2.tests[1].cost = 2.5;
    expect(validateSpec(s2).some((i) => i.code === 'invalid-cost')).toBe(true);
    const s3 = valid();
    s3.tests[0].cost = null;
    expect(validateSpec(s3).some((i) => i.code === 'invalid-cost')).toBe(true);
  });

  it('矩阵缺项与非法读数定位到行列', () => {
    const s = valid();
    s.faults[0].readings[1] = null;
    const miss = validateSpec(s).find((i) => i.code === 'missing-reading');
    expect(miss?.location).toMatchObject({ faultIndex: 0, testIndex: 1 });
    const s2 = valid();
    // 直接构造非法值场景（类型层面放宽）
    s2.faults[1].readings[0] = 2 as unknown as 0 | 1 | null;
    expect(validateSpec(s2).some((i) => i.code === 'invalid-reading')).toBe(true);
  });

  it('完整读数相同的故障归为不可区分组', () => {
    const s = valid();
    s.faults[2].readings = [0, 1]; // 与 F2 相同
    const issues = validateSpec(s);
    const ind = issues.find((i) => i.code === 'indistinguishable');
    expect(ind?.level).toBe('warning');
    expect(ind?.group?.sort()).toEqual(['F2', 'F3']);
  });

  it('矩阵存在缺项时不做不可区分分组', () => {
    const s = valid();
    s.faults[0].readings[0] = null;
    expect(validateSpec(s).some((i) => i.code === 'indistinguishable')).toBe(false);
  });
});

describe('parseSpecJson', () => {
  it('解析合法 JSON', () => {
    const r = parseSpecJson(
      JSON.stringify({
        tests: [{ id: 'a', cost: 3 }],
        faults: [{ id: 'x', readings: [0] }],
      }),
    );
    expect(r.error).toBeUndefined();
    expect(r.spec?.tests[0].cost).toBe(3);
    expect(r.spec?.faults[0].readings[0]).toBe(0);
  });

  it('语法错误给出提示', () => {
    expect(parseSpecJson('{bad').error).toMatch(/JSON/);
  });

  it('结构错误给出提示', () => {
    expect(parseSpecJson('[]').error).toBeTruthy();
    expect(parseSpecJson('{"tests":[]}').error).toBeTruthy();
  });

  it('缺读数映射为 null 交由校验反馈', () => {
    const r = parseSpecJson(JSON.stringify({ tests: [{ id: 't', cost: 1 }], faults: [{ id: 'f' }] }));
    expect(r.spec?.faults[0].readings[0]).toBeNull();
  });
});
