import React from 'react';
import type { DiffResult, DiffEntry } from '../types';

const KIND_META: Record<DiffEntry['kind'], { label: string; icon: string }> = {
  added: { label: '新增', icon: '＋' },
  removed: { label: '移除', icon: '－' },
  replaced: { label: '替换', icon: '⇄' },
  quantity: { label: '数量', icon: '×' },
  modification: { label: '特制', icon: '✦' },
};

export default function DiffView({ diff }: { diff: DiffResult }) {
  if (!diff.entries.length) {
    return <p className="muted small">这两个版本内容一致，没有任何差异。</p>;
  }
  return (
    <div>
      <div className="diff-summary">{diff.summary}</div>
      {diff.entries.map((e, i) => {
        const m = KIND_META[e.kind];
        return (
          <div className="diff-entry" key={i}>
            <span className={`badge ${e.kind}`}>
              {m.icon} {m.label}
            </span>
            <span className="d-text">{e.detail}</span>
          </div>
        );
      })}
    </div>
  );
}
