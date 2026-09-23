import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { ProblemSpec, SolveResult } from './types';
import { validateSpec } from './validation';
import { solveDiagnosisTree } from './solver';
import { parseSpecJson, stringifySpec } from './io';
import { buildReplayPath } from './tree';
import { SAMPLE_BASIC, SAMPLE_COST_VS_COUNT, SAMPLE_INDISTINGUISHABLE, emptySpec } from './samples';
import MatrixEditor from './components/MatrixEditor';
import IssueList from './components/IssueList';
import TreeView, { collectKeys } from './components/TreeView';
import ReplayPanel from './components/ReplayPanel';

export default function App() {
  const [spec, setSpec] = useState<ProblemSpec>(() => structuredClone(SAMPLE_BASIC));
  const [importError, setImportError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [faultIndex, setFaultIndex] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // 校验 + 求解均为纯本地派生；输入变化后旧结果立即失效（memo 重算或置空）
  const issues = useMemo(() => validateSpec(spec), [spec]);
  const result: SolveResult | null = useMemo(() => {
    if (issues.length > 0) return null;
    try {
      return solveDiagnosisTree({
        costs: spec.tests.map((t) => t.cost as number),
        readings: spec.faults.map((f) => f.readings as (0 | 1)[]),
      });
    } catch {
      return null;
    }
  }, [spec, issues]);

  // 新树生成：默认全部展开，回放复位
  useEffect(() => {
    if (result) {
      const keys = new Set<string>();
      collectKeys(result.tree, 'root', keys);
      setExpanded(keys);
    } else {
      setExpanded(new Set());
    }
    setStepIdx(0);
  }, [result]);

  // 故障数变化后夹取回放目标（状态异步修正；派生计算统一用 safeFaultIndex）
  const safeFaultIndex = Math.min(faultIndex, Math.max(0, spec.faults.length - 1));
  useEffect(() => {
    if (faultIndex !== safeFaultIndex) setFaultIndex(safeFaultIndex);
  }, [faultIndex, safeFaultIndex]);

  const steps = useMemo(
    () =>
      result
        ? buildReplayPath(result.tree, safeFaultIndex, spec.faults.map((f) => f.readings))
        : [],
    [result, safeFaultIndex, spec.faults],
  );

  // 回放路径节点键
  const { pathKeys, currentKey } = useMemo(() => {
    const keys = new Set<string>(['root']);
    let k = 'root';
    for (let s = 0; s < Math.min(stepIdx, steps.length); s += 1) {
      k = `${k}/${steps[s].reading}`;
      keys.add(k);
    }
    return { pathKeys: keys, currentKey: k };
  }, [steps, stepIdx]);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const testName = (j: number) => spec.tests[j]?.id.trim() || `试验 #${j + 1}`;
  const faultName = (i: number) => spec.faults[i]?.id.trim() || `故障 #${i + 1}`;

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const r = parseSpecJson(String(reader.result ?? ''));
      if (r.error) {
        setImportError(r.error);
      } else if (r.spec) {
        setSpec(r.spec);
        setImportError(null);
        setImportOpen(false);
        setFaultIndex(0);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const onImportText = () => {
    const r = parseSpecJson(importText);
    if (r.error) setImportError(r.error);
    else if (r.spec) {
      setSpec(r.spec);
      setImportError(null);
      setImportOpen(false);
      setFaultIndex(0);
    }
  };

  const onExport = () => {
    const blob = new Blob([stringifySpec(spec)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagnosis-spec.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadSample = (s: ProblemSpec) => {
    setSpec(structuredClone(s));
    setFaultIndex(0);
    setImportError(null);
  };

  const allKeys = result
    ? (() => {
        const keys = new Set<string>();
        collectKeys(result.tree, 'root', keys);
        return keys;
      })()
    : new Set<string>();

  return (
    <>
      <header className="app-header">
        <h1>🛰 卫星热控单元 · 自适应诊断树合成工作台</h1>
        <p>
          依据上一步读数选择下一项试验；完整本地计算，按「最坏累计耗时 → 最坏试验数 → 先序试验编号序列」字典序求最优自适应诊断策略。
        </p>
      </header>

      <div className="layout">
        {/* 左：输入 */}
        <section>
          <div className="panel">
            <h2>
              故障 / 试验矩阵
              <span className="tag">
                {spec.faults.length} 种故障 · {spec.tests.length} 项试验 · 耗时为正整数
              </span>
            </h2>
            <div className="toolbar">
              <button onClick={() => fileRef.current?.click()}>📥 导入 JSON 文件</button>
              <button onClick={() => setImportOpen((v) => !v)}>粘贴 JSON</button>
              <button onClick={onExport}>📤 导出 JSON</button>
              <button onClick={() => loadSample(SAMPLE_BASIC)}>示例：4×3</button>
              <button onClick={() => loadSample(SAMPLE_COST_VS_COUNT)}>示例：昂贵试验</button>
              <button onClick={() => loadSample(SAMPLE_INDISTINGUISHABLE)}>示例：不可区分</button>
              <button className="danger" onClick={() => loadSample(emptySpec())}>
                清空
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={onFile}
              />
            </div>

            {importOpen && (
              <div style={{ marginBottom: 12 }}>
                <textarea
                  style={{
                    width: '100%',
                    minHeight: 110,
                    background: '#0f1725',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: 8,
                    fontFamily: 'monospace',
                  }}
                  placeholder='{"tests":[{"id":"T1","cost":5},...],"faults":[{"id":"F1","readings":[0,1]},...]}'
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
                <div className="toolbar" style={{ marginBottom: 0, marginTop: 6 }}>
                  <button className="primary" onClick={onImportText}>
                    导入
                  </button>
                  <button onClick={() => setImportOpen(false)}>取消</button>
                </div>
              </div>
            )}
            {importError && <div className="issue error" style={{ marginBottom: 10 }}>✕ {importError}</div>}

            <MatrixEditor spec={spec} issues={issues} onChange={setSpec} />
          </div>

          <div className="panel">
            <h2>校验反馈</h2>
            <IssueList issues={issues} />
          </div>
        </section>

        {/* 右：结果 */}
        <section>
          <div className="panel">
            <h2>
              最优自适应诊断树
              {result && (
                <span className="tag">
                  先序试验序列：[{result.signature.map((t) => testName(t)).join(', ')}]
                </span>
              )}
            </h2>
            {!result ? (
              <div className="empty-state">
                当前输入不满足求解条件（存在错误或不可区分故障组），诊断树已撤下。
                <br />
                请按左侧定位反馈修正，树会在输入合法后立即重新生成。
              </div>
            ) : (
              <>
                <div className="summary-grid">
                  <div className="metric">
                    <div className="v">{result.worstCost}</div>
                    <div className="k">最坏累计耗时</div>
                  </div>
                  <div className="metric">
                    <div className="v">{result.worstCount}</div>
                    <div className="k">最坏试验数</div>
                  </div>
                  <div className="metric">
                    <div className="v">{result.nodeCount}</div>
                    <div className="k">树节点总数</div>
                  </div>
                </div>
                <div className="toolbar">
                  <button onClick={() => setExpanded(new Set(allKeys))}>全部展开</button>
                  <button onClick={() => setExpanded(new Set(['root']))}>全部折叠</button>
                </div>
                <div className="tree">
                  <TreeView
                    node={result.tree}
                    nodeKey="root"
                    testName={testName}
                    faultName={faultName}
                    expanded={expanded}
                    onToggle={toggle}
                    pathKeys={pathKeys}
                    currentKey={currentKey}
                    onPickFault={(i) => {
                      setFaultIndex(i);
                      setStepIdx(0);
                    }}
                    isRoot
                  />
                </div>
              </>
            )}
          </div>

          {result && (
            <div className="panel">
              <h2>
                故障判定回放
                <span className="tag">点选故障，按其真实读数逐步下行</span>
              </h2>
              <ReplayPanel
                spec={spec}
                result={result}
                steps={steps}
                stepIdx={stepIdx}
                faultIndex={safeFaultIndex}
                onSelectFault={(i) => {
                  setFaultIndex(i);
                  setStepIdx(0);
                }}
                onStepChange={setStepIdx}
              />
            </div>
          )}
        </section>
      </div>
    </>
  );
}
