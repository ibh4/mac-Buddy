import React, { useState } from 'react';
import type { StatusResp } from '../types';
import { formatDate } from '../components/Common';

export default function Settings({ status }: { status: StatusResp | null }) {
  const [ping, setPing] = useState<{ connected: boolean; serverTime?: string; error?: string } | null>(null);
  const [pinging, setPinging] = useState(false);

  const doPing = async () => {
    setPinging(true);
    try {
      const r = await fetch('/api/mcp/ping').then((x) => x.json());
      setPing({ connected: r.data?.connected, serverTime: r.data?.serverTime, error: r.data?.error });
    } catch (e: any) {
      setPing({ connected: false, error: e.message });
    } finally {
      setPinging(false);
    }
  };

  if (!status) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page page-narrow">
      <div className="section-title">连接设置</div>

      <div className="panel">
        <h2>当前模式</h2>
        <div className="row">
          <span className={`mode-badge ${status.mode}`}>{status.mode === 'demo' ? '演示模式' : '真实模式'}</span>
          <span className="spacer" />
          <button className="btn btn-ghost btn-sm" onClick={doPing} disabled={pinging}>
            {pinging ? '探测中…' : '测试连接'}
          </button>
        </div>
        <div className="divider" />
        <div className="checkout-line"><span>已配置 Token</span><span>{status.realConfigured ? '是' : '否'}</span></div>
        <div className="checkout-line"><span>MCP 已连接</span><span style={{ color: status.connected ? '#2f7d32' : 'var(--text-2)', fontWeight: 700 }}>{status.connected ? '已连接' : '未连接'}</span></div>
        <div className="checkout-line"><span>最近同步</span><span>{status.lastSyncAt ? formatDate(status.lastSyncAt) : '—'}</span></div>
        {status.lastError && <div className="checkout-line"><span>最近错误</span><span style={{ color: 'var(--red)' }}>{status.lastError}</span></div>}
        {ping && (
          <div className={`banner ${ping.connected ? 'ok' : 'warn'}`} style={{ marginTop: 10 }}>
            {ping.connected ? `连接正常${ping.serverTime ? '，服务器时间 ' + ping.serverTime : ''}` : '连接失败：' + (ping.error || '未知')}
          </div>
        )}
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h2>关于 Token 与隐私</h2>
        <ul className="small" style={{ lineHeight: 1.8, paddingLeft: 18 }}>
          <li>Token 只在<b>后端</b>使用（服务端环境变量 <code>MCD_MCP_TOKEN</code>），<b>前端构建产物、日志和版本库均不含 Token</b>。</li>
          <li>演示模式不需要 Token，使用内置虚构餐单，不会产生真实订单或支付链接。</li>
          <li>真实模式请在 <code>server/.env</code> 填入 Token（该文件已被 .gitignore 忽略）。</li>
          <li>后端默认只监听本地地址（127.0.0.1），请勿将带 Token 的服务直接暴露到公网。</li>
        </ul>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h2>使用的 MCP 工具</h2>
        <div className="row">
          {status.tools.map((t) => (<span key={t} className="tag ghost">{t}</span>))}
        </div>
      </div>
    </div>
  );
}
