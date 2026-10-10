import React, { useEffect, useState, useCallback } from 'react';
import { api } from './api';
import type { StatusResp, Prefs } from './types';
import Order from './views/Order';
import MyTemplates from './views/MyTemplates';
import TemplateDetail from './views/TemplateDetail';
import Taste from './views/Taste';
import Settings from './views/Settings';
import HistoryOrders from './views/HistoryOrders';
import Footprint from './views/Footprint';
import MicroAdjust from './views/MicroAdjust';
import PrefDrawer from './components/PrefDrawer';
import { Offline, Toast } from './components/Common';

// 主导航只保留三件事：点一餐 / 我的老样子 / 我的口味。
// 连接设置放在右上角；预算、能量参考值、不要出现的商品收进「偏好设置」抽屉。
// 「最近订单」不再占主导航位，改为“我的老样子”里的二级入口，功能不丢。
type View = {
  name: 'order' | 'micro' | 'my' | 'detail' | 'taste' | 'settings' | 'footprint' | 'history';
  templateId?: string;
};

export default function App() {
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [offline, setOffline] = useState(false);
  const [view, setView] = useState<View>({ name: 'order' });
  const [toast, setToast] = useState<string | null>(null);
  const [prefOpen, setPrefOpen] = useState(false);

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const s = await api.status();
      setStatus(s);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  const loadPrefs = useCallback(async () => {
    try {
      setPrefs(await api.getPrefs());
    } catch {
      /* 偏好失败不阻断主流程 */
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadPrefs();
  }, [loadStatus, loadPrefs]);

  const navigate = (v: View) => {
    setView(v);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="app-bg">
      <header className="header">
        <div className="brand" onClick={() => navigate({ name: 'order' })} role="button" tabIndex={0}>
          <span className="dot" />
          <span className="brand-text">
            Mac-Buddy
            <em>麦麦搭子</em>
          </span>
        </div>
        <nav className="nav">
          <a className={view.name === 'order' ? 'active' : ''} onClick={() => navigate({ name: 'order' })}>
            点一餐
          </a>
          <a className={view.name === 'my' || view.name === 'detail' ? 'active' : ''} onClick={() => navigate({ name: 'my' })}>
            我的老样子
          </a>
          <a className={view.name === 'taste' ? 'active' : ''} onClick={() => navigate({ name: 'taste' })}>
            我的口味
          </a>
        </nav>
        <div className="header-right">
          {status && <span className={`mode-badge ${status.mode}`}>{status.mode === 'demo' ? '演示' : '真实'}</span>}
          <button className="btn btn-ghost btn-sm" onClick={() => navigate({ name: 'settings' })}>
            连接设置
          </button>
        </div>
      </header>

      {offline && !status ? (
        <Offline desc="无法连接本地后端。请先启动服务：npm run dev（或先 npm run dev:server）。" onRetry={loadStatus} />
      ) : (
        (() => {
          switch (view.name) {
            case 'order':
              return (
                <Order
                  status={status}
                  prefs={prefs}
                  showToast={showToast}
                  onOpenPrefs={() => setPrefOpen(true)}
                  onOpenMicro={() => navigate({ name: 'micro' })}
                />
              );
            case 'micro':
              return <MicroAdjust showToast={showToast} onNavigate={(v) => navigate({ name: v })} />;
            case 'my':
              return (
                <MyTemplates
                  status={status}
                  onOpen={(id) => navigate({ name: 'detail', templateId: id })}
                  onNavigate={(v) => navigate({ name: v === 'history' ? 'history' : 'my' })}
                  onChanged={loadStatus}
                  showToast={showToast}
                />
              );
            case 'detail':
              return view.templateId ? (
                <TemplateDetail
                  templateId={view.templateId}
                  status={status}
                  onBack={() => navigate({ name: 'my' })}
                  onChanged={loadStatus}
                  showToast={showToast}
                />
              ) : null;
            case 'history':
              return (
                <HistoryOrders
                  onImported={(id) => navigate({ name: 'detail', templateId: id })}
                  onNavigate={() => navigate({ name: 'my' })}
                  showToast={showToast}
                />
              );
            case 'taste':
              return <Taste showToast={showToast} />;
            case 'footprint':
              return <Footprint showToast={showToast} />;
            case 'settings':
              return <Settings status={status} />;
            default:
              return null;
          }
        })()
      )}

      <footer className="foot">
        这是基于麦当劳 MCP 的独立开发者作品，<b>非官方产品</b>。演示模式使用虚构餐单，不产生真实订单或支付链接。
      </footer>

      <PrefDrawer open={prefOpen} onClose={() => setPrefOpen(false)} prefs={prefs} onSaved={setPrefs} />
      {toast && <Toast message={toast} />}
    </div>
  );
}
