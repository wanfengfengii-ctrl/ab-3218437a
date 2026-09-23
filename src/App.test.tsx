import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import App from './App';

/**
 * 以服务端静态渲染方式冒烟整个工作台：
 * 默认载入合法示例，应直接出现最优树指标与回放面板。
 */
describe('App 工作台渲染冒烟', () => {
  it('合法示例初始即渲染诊断树与回放面板（本地派生结果）', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('最优自适应诊断树');
    expect(html).toContain('最坏累计耗时');
    expect(html).toContain('最坏试验数');
    expect(html).toContain('故障判定回放');
    // 示例故障名应出现在叶节点与回放选择中
    expect(html).toContain('F1-加热器断路');
    expect(html).toContain('F4-隔热层失效');
    // 不应出现“树已撤下”的空状态
    expect(html).not.toContain('诊断树已撤下');
  });

  it('页面包含本地计算与导入入口', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('导入 JSON 文件');
    expect(html).toContain('粘贴 JSON');
    expect(html).toContain('导出 JSON');
    expect(html).toContain('校验反馈');
  });
});
