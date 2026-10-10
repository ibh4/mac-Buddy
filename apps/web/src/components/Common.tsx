import React from 'react';
import { EmptyArt, ErrorArt, OfflineArt } from './Illustration';

export function Spinner() {
  return <div className="spinner" />;
}

export function Loading({ text = '加载中…' }: { text?: string }) {
  return (
    <div className="state">
      <Spinner />
      <p className="muted">{text}</p>
    </div>
  );
}

export function Empty({ title, desc, children }: { title: string; desc?: string; children?: React.ReactNode }) {
  return (
    <div className="state">
      <EmptyArt />
      <h3>{title}</h3>
      {desc && <p className="muted">{desc}</p>}
      <div style={{ marginTop: 14 }}>{children}</div>
    </div>
  );
}

export function ErrorState({ title = '出错了', desc, onRetry }: { title?: string; desc?: string; onRetry?: () => void }) {
  return (
    <div className="state">
      <ErrorArt />
      <h3>{title}</h3>
      {desc && <p className="muted">{desc}</p>}
      {onRetry && (
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  );
}

export function Offline({ desc, onRetry }: { desc?: string; onRetry?: () => void }) {
  return (
    <div className="state">
      <OfflineArt />
      <h3>网络未连接</h3>
      <p className="muted">{desc || '请检查本地后端是否已启动（npm run dev:server）。'}</p>
      {onRetry && (
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={onRetry}>
          重新连接
        </button>
      )}
    </div>
  );
}

export function Toast({ message }: { message: string }) {
  return <div className="toast">{message}</div>;
}

export function formatYuan(n: number): string {
  return '¥' + (Math.round(n * 100) / 100).toFixed(2);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
