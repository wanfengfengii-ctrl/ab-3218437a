import type { DiagNode } from '../types';

interface Props {
  node: DiagNode;
  nodeKey: string;
  testName: (j: number) => string;
  faultName: (i: number) => string;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  /** 回放路径上的节点键（含根到叶） */
  pathKeys: Set<string>;
  /** 回放当前停留节点键 */
  currentKey: string | null;
  /** 点击叶节点：选中该故障进入回放 */
  onPickFault?: (faultIndex: number) => void;
  isRoot?: boolean;
}

export default function TreeView(p: Props) {
  const { node, nodeKey, expanded, onToggle, pathKeys, currentKey } = p;
  const onPath = pathKeys.has(nodeKey);
  const isCurrent = currentKey === nodeKey;
  const isOpen = expanded.has(nodeKey);
  const cls =
    'node ' +
    (node.kind === 'leaf' ? 'leaf' : 'internal') +
    (isCurrent ? ' active' : onPath ? ' onpath' : '');

  const candidateText = () =>
    `候选 {${node.candidates.map((i) => p.faultName(i)).join(', ')}} · 累计耗时 ${node.accumulatedCost} · 已做试验 ${node.accumulatedCount}`;

  return (
    <div>
      <span className={cls}>
        {node.kind === 'internal' ? (
          <span className="toggle" onClick={() => onToggle(nodeKey)} title={isOpen ? '折叠' : '展开'}>
            {isOpen ? '▾' : '▸'}
          </span>
        ) : (
          <span className="toggle">·</span>
        )}
        {node.kind === 'internal' ? (
          <span>
            执行试验 <span className="test-name">{p.testName(node.testIndex as number)}</span>
          </span>
        ) : (
          <span
            style={{ cursor: p.onPickFault ? 'pointer' : 'default' }}
            title="点选该故障进行回放"
            onClick={() => p.onPickFault?.(node.faultIndex as number)}
          >
            ✔ 判定为故障 “{p.faultName(node.faultIndex as number)}”
          </span>
        )}
        <span className="candidates">{candidateText()}</span>
      </span>
      {node.kind === 'internal' && isOpen && node.children && (
        <ul>
          {([0, 1] as const).map((b) => (
            <li key={b}>
              <span className={`branch-label b${b}`}>读数={b} →</span>
              <TreeView
                {...p}
                node={node.children![b]}
                nodeKey={`${nodeKey}/${b}`}
                isRoot={false}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 收集树内全部节点键（用于默认全部展开） */
export function collectKeys(node: DiagNode, key: string, out: Set<string>): void {
  out.add(key);
  if (node.children) {
    collectKeys(node.children[0], `${key}/0`, out);
    collectKeys(node.children[1], `${key}/1`, out);
  }
}
