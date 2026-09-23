import type { WorkModel } from './model';

/**
 * 内置示例：卫星热控单元四类故障 × 四项试验（耗时不同）。
 * 读数向量两两不同，可综合出非平凡的自适应诊断树。
 */
export function sampleModel(): WorkModel {
  return {
    faults: ['加热器开路', '温控阀卡滞', '管路泄漏', '传感器漂移'],
    tests: [
      // 红外测温 5；电流检测 2；压力测试 8；指令回采 3
      { id: '红外测温', costText: '5', readings: [1, 1, 0, 0] },
      { id: '电流检测', costText: '2', readings: [0, 1, 1, 0] },
      { id: '压力测试', costText: '8', readings: [0, 0, 1, 0] },
      { id: '指令回采', costText: '3', readings: [1, 0, 0, 1] },
    ],
  };
}
