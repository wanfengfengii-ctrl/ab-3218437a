/**
 * 编辑期数据模型：所有字段均以字符串/可空形式保存，便于在非法输入下仍能定位反馈。
 * 通过 validateWork 收敛为求解器使用的 ValidModel。
 */

/** 单个试验读数：0 / 1，空串表示矩阵缺项 */
export type CellValue = 0 | 1 | '';

export interface WorkTest {
  id: string;
  /** 耗时文本，正整数由校验环节解析 */
  costText: string;
  readings: CellValue[];
}

export interface WorkModel {
  faults: string[];
  tests: WorkTest[];
}

export const MIN_FAULTS = 3;
export const MAX_FAULTS = 14;
export const MIN_TESTS = 2;
export const MAX_TESTS = 20;

export function createEmptyCell(): CellValue {
  return 0;
}

/** 初始示例尺寸 */
export function emptyModel(faultCount = 3, testCount = 2): WorkModel {
  return {
    faults: Array.from({ length: faultCount }, (_, i) => `F${i + 1}`),
    tests: Array.from({ length: testCount }, (_, ti) => ({
      id: `T${ti + 1}`,
      costText: '1',
      readings: Array.from({ length: faultCount }, () => 0 as CellValue),
    })),
  };
}
