import { useMemo, useState } from 'react';
import type { DiagNode } from '../lib/solver';
import type { ValidModel } from '../lib/validate';

interface TreeViewProps {
  root: DiagNode;
  model: ValidModel;
  /** 回放高亮：选中的故障下标 */
  highlightFault: number | null;
  /** 回放到第几步后经过的内部节点集合（key 为节点对象引用） */
  visitedNodes: Set<DiagNode>;
  /** 当前所在节点（回放指针） */
  currentNode: DiagNode | null;
}

function maskNames(mask: number, model: ValidModel): string {
  const names: string[] = [];
  for (let f = 0; f < model.faults.length; f++) {
    if (mask & (1 << f)) names.push(model.faults[f]!.name);
  }
  return names.join('、');
}

function maskCount(mask: number): number {
  let c = 0;
  while (mask) {
    mask &= mask - 1;
    c += 1;
  }
  return c;
}

interface NodeViewProps {
  node: DiagNode;
  model: ValidModel;
  edge?: 0 | 1;
  highlightFault: number | null;
  visitedNodes: Set<DiagNode>;
  currentNode: DiagNode | null;
  depth: number;
  collapsed: Set<DiagNode>;
  toggle: (n: DiagNode) => void;
}

function NodeView(props: NodeViewProps) {
  const { node, model, edge, highlightFault, visitedNodes, currentNode, depth, collapsed, toggle } = props;
  const onPath = visitedNodes.has(node);
  const isCurrent = currentNode === node;
  const isLeafHit =
    node.kind === 'leaf' && highlightFault !== null && node.faultIndex === highlightFault;

  if (node.kind === 'leaf') {
    return (
      <div className={`tree-row leaf ${isLeafHit ? 'hit' : ''}`} style={{ marginLeft: depth * 22 }}>
        <span className="edge-tag leaf-edge">叶</span>
        <span className="leaf-label">
          {model.faults[node.faultIndex!]!.name}
        </span>
        {isLeafHit && <span className="hit-badge">◀ 确诊</span>}
      </div>
    );
  }

  const t = model.tests[node.testIndex!]!;
  const isCollapsed = collapsed.has(node);
  const branch = (child: DiagNode, reading: 0 | 1) => (
    <div key={reading} className="branch">
      <div
        className={`tree-row edge-row ${onPath ? 'on-path' : ''}`}
        style={{ marginLeft: (depth + 1) * 22 }}
      >
        <span className={`edge-tag r-${reading}`}>读数 {reading}</span>
      </div>
      <NodeView
        node={child}
        model={model}
        edge={reading}
        highlightFault={highlightFault}
        visitedNodes={visitedNodes}
        currentNode={currentNode}
        depth={depth + 1}
        collapsed={collapsed}
        toggle={toggle}
      />
    </div>
  );

  return (
    <div className={`branch-root ${isCurrent ? 'current' : ''} ${onPath ? 'on-path-wrap' : ''}`}>
      <div className="tree-row internal" style={{ marginLeft: depth * 22 }}>
        <button type="button" className="twist" onClick={() => toggle(node)} title={isCollapsed ? '展开' : '收起'}>
          {isCollapsed ? '▸' : '▾'}
        </button>
        {edge !== undefined && <span className={`edge-tag r-${edge}`}>{edge}</span>}
        <span className="node-test">
          <strong>{t.id}</strong>
          <span className="dim">（耗时 {t.cost}）</span>
        </span>
        <span className="cand-chip" title={maskNames(node.candidateMask, model)}>
          候选 {maskCount(node.candidateMask)}：{maskNames(node.candidateMask, model)}
        </span>
      </div>
      {!isCollapsed && (
        <>
          {branch(node.zero!, 0)}
          {branch(node.one!, 1)}
        </>
      )}
    </div>
  );
}

export default function TreeView({ root, model, highlightFault, visitedNodes, currentNode }: TreeViewProps) {
  const [collapsed, setCollapsed] = useState<Set<DiagNode>>(new Set());
  const internalCount = useMemo(() => {
    let c = 0;
    const walk = (n: DiagNode): void => {
      if (n.kind === 'internal') {
        c += 1;
        walk(n.zero!);
        walk(n.one!);
      }
    };
    walk(root);
    return c;
  }, [root]);

  const toggle = (n: DiagNode) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => {
    const next = new Set<DiagNode>();
    const walk = (n: DiagNode): void => {
      if (n.kind === 'internal') {
        next.add(n);
        walk(n.zero!);
        walk(n.one!);
      }
    };
    walk(root);
    next.delete(root);
    setCollapsed(next);
  };

  return (
    <div className="tree-panel">
      <div className="tree-controls">
        <button type="button" onClick={expandAll}>全部展开</button>
        <button type="button" onClick={collapseAll}>全部收起</button>
        <span className="dim">{internalCount} 个内部节点</span>
      </div>
      <div className="tree-body">
        <NodeView
          node={root}
          model={model}
          highlightFault={highlightFault}
          visitedNodes={visitedNodes}
          currentNode={currentNode}
          depth={0}
          collapsed={collapsed}
          toggle={toggle}
        />
      </div>
    </div>
  );
}
