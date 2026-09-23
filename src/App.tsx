import { useMemo, useRef, useState } from 'react';
import Editor from './components/Editor';
import TreeView from './components/TreeView';
import Playback, { pathNodes } from './components/Playback';
import { emptyModel, type WorkModel } from './lib/model';
import { validateWork, type Issue } from './lib/validate';
import { solve, type DiagNode } from './lib/solver';
import { exportModel, parseImport } from './lib/jsonio';
import { sampleModel } from './lib/sample';

type ComputeState =
  | { phase: 'invalid'; issues: Issue[] }
  | { phase: 'unsolvable'; issues: Issue[]; message: string; groups: number[][] }
  | { phase: 'ready'; issues: Issue[]; model: NonNullable<ReturnType<typeof validateWork>['model']>; result: Extract<ReturnType<typeof solve>, { ok: true }> };

export default function App() {
  const [work, setWork] = useState<WorkModel>(() => sampleModel());
  const [selectedFault, setSelectedFault] = useState<number | null>(null);
  const [stepPos, setStepPos] = useState(0);
  const [ioMessage, setIoMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 更新模型即同步撤下旧树并复位回放，避免用旧选择访问新树造成越界。
  const updateWork = (next: WorkModel) => {
    setWork(next);
    setSelectedFault(null);
    setStepPos(0);
  };

  // 校验 + 综合均为同步本地计算：输入一变，结果立即重算，
  // 不会残留旧树（无效或不可解时直接不展示树）。
  const state: ComputeState = useMemo(() => {
    const { issues, model } = validateWork(work);
    if (!model) return { phase: 'invalid', issues };
    const result = solve(model);
    if (!result.ok) return { phase: 'unsolvable', issues, message: result.message, groups: result.groups };
    return { phase: 'ready', issues, model, result };
  }, [work]);

  const errors = state.issues.filter((i) => i.level === 'error');
  const warnings = state.issues.filter((i) => i.level === 'warning');

  const onImportFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseImport(text);
    if (parsed.error) {
      setIoMessage({ kind: 'err', text: `导入失败${parsed.error.path ? `（${parsed.error.path}）` : ''}：${parsed.error.message}` });
      return;
    }
    updateWork(parsed.work!);
    setIoMessage({ kind: 'ok', text: `已导入：${parsed.work!.faults.length} 种故障、${parsed.work!.tests.length} 项试验。` });
  };

  const onExport = () => {
    const blob = new Blob([exportModel(work)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagnostic-model.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const highlight =
    state.phase === 'ready' && selectedFault !== null
      ? pathNodes(state.result.root, selectedFault, stepPos)
      : { visited: new Set<DiagNode>(), current: null as DiagNode | null };

  return (
    <div className="app">
      <header className="app-header">
        <h1>卫星热控单元 · 自适应诊断树综合工作台</h1>
        <p className="subtitle">
          按故障读数自适应决定下一项试验，精确最小化最坏累计耗时，其次最小化最坏试验数；全部计算仅在本地浏览器完成。
        </p>
        <div className="header-actions">
          <button type="button" onClick={() => fileRef.current?.click()}>导入 JSON</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImportFile(f);
              e.target.value = '';
            }}
          />
          <button type="button" onClick={onExport}>导出 JSON</button>
          <button type="button" onClick={() => updateWork(sampleModel())}>载入示例</button>
          <button type="button" onClick={() => updateWork(emptyModel(3, 2))}>清空重建</button>
        </div>
        {ioMessage && (
          <div className={`io-msg ${ioMessage.kind}`} onClick={() => setIoMessage(null)}>
            {ioMessage.text}（点击关闭）
          </div>
        )}
      </header>

      <section className="card">
        <h2>① 故障 / 试验 / 读数矩阵</h2>
        <Editor work={work} onChange={updateWork} issues={state.issues} />
      </section>

      {errors.length > 0 && (
        <section className="card issues-card">
          <h2>② 输入问题（{errors.length}）— 修正前不生成诊断树</h2>
          <ul className="issue-list">
            {errors.map((is, i) => (
              <li key={i} className="issue error">
                <span className="issue-icon">✕</span>
                <div>
                  <span className="issue-msg">{is.message}</span>
                  <span className="issue-loc">
                    {is.faultIndex !== undefined && `故障行 #${is.faultIndex + 1}`}
                    {is.faultIndex !== undefined && is.testIndex !== undefined && ' / '}
                    {is.testIndex !== undefined && `试验列 #${is.testIndex + 1}`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {state.phase === 'unsolvable' && (
        <section className="card issues-card">
          <h2>② 诊断树不存在</h2>
          <p className="issue-msg">{state.message}</p>
          <div className="groups">
            {state.groups.map((g, gi) => (
              <div key={gi} className="group-box">
                <span className="group-title">不可区分组 {gi + 1}：</span>
                {g.map((fi) => (
                  <span key={fi} className="group-member">{work.faults[fi]}</span>
                ))}
                <span className="dim">（{g.length} 种故障的完整读数向量完全相同）</span>
              </div>
            ))}
          </div>
          {warnings.length > 0 && errors.length === 0 && (
            <ul className="issue-list">
              {warnings.map((is, i) => (
                <li key={i} className="issue warning">
                  <span className="issue-icon">⚠</span>
                  <span className="issue-msg">{is.message}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {state.phase === 'ready' && (
        <>
          <section className="card metrics-card">
            <h2>② 综合结果</h2>
            <div className="metrics">
              <div className="metric">
                <span className="metric-value">{state.result.worstCost}</span>
                <span className="metric-label">最小最坏累计耗时</span>
              </div>
              <div className="metric">
                <span className="metric-value">{state.result.worstTests}</span>
                <span className="metric-label">该代价下最小最坏试验数</span>
              </div>
              <div className="metric metric-text">
                <span className="metric-label">
                  同值按先序序列（节点试验编号，0 支先于 1 支）字典序最小建树；每个内部节点仅使用能真正分裂当前候选集的试验。
                </span>
              </div>
            </div>
            {warnings.length > 0 && (
              <ul className="issue-list">
                {warnings.map((is, i) => (
                  <li key={i} className="issue warning">
                    <span className="issue-icon">⚠</span>
                    <span className="issue-msg">{is.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2>③ 诊断树（可展开）</h2>
            <TreeView
              root={state.result.root}
              model={state.model}
              highlightFault={selectedFault}
              visitedNodes={highlight.visited}
              currentNode={highlight.current}
            />
          </section>

          <section className="card">
            <h2>④ 故障回放</h2>
            <Playback
              root={state.result.root}
              model={state.model}
              selectedFault={selectedFault}
              onSelectFault={(fi) => {
                setSelectedFault(fi);
                setStepPos(0);
              }}
              stepPos={stepPos}
              onStepPos={setStepPos}
            />
          </section>
        </>
      )}

      <footer className="app-footer">
        纯前端实现 · 无网络请求 · 故障 3–14 种、试验 2–20 项 · 读数仅限 0/1
      </footer>
    </div>
  );
}
