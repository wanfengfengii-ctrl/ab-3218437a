import type { ValidationIssue } from '../types';

interface Props {
  issues: ValidationIssue[];
}

/** 校验反馈：错误阻止求解；警告列出不可区分故障组 */
export default function IssueList({ issues }: Props) {
  if (issues.length === 0) {
    return (
      <div className="issue ok" style={{ border: '1px solid #2c6a4f', background: '#12251c', color: '#9be7c4' }}>
        ✓ 输入完整合法，所有故障两两可区分，诊断树已更新。
      </div>
    );
  }
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');

  const locText = (i: ValidationIssue): string | null => {
    const loc = i.location;
    if (!loc) return null;
    const parts: string[] = [];
    if (loc.faultIndex !== undefined) parts.push(`故障行 #${loc.faultIndex + 1}`);
    if (loc.testIndex !== undefined) parts.push(`试验列 #${loc.testIndex + 1}`);
    return parts.length ? `定位：${parts.join('，')}` : null;
  };

  return (
    <ul className="issue-list">
      {errors.map((i, k) => (
        <li key={`e${k}`} className="issue error">
          <span>✕ {i.message}</span>
          {locText(i) && <span className="loc">{locText(i)}</span>}
        </li>
      ))}
      {warnings.map((i, k) => (
        <li key={`w${k}`} className="issue warning">
          <span>⚠ {i.message}</span>
          {i.group && <span className="loc">不可区分组：{'{' + i.group.join(', ') + '}'}</span>}
        </li>
      ))}
    </ul>
  );
}
