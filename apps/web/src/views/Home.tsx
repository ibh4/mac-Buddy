import React from 'react';
import { ComboArt } from '../components/Illustration';
import { PlateIcon, KnobIcon, DiceIcon, CalendarIcon, FootprintIcon } from '../components/EntryIcons';

export type HomeNav = 'my' | 'history' | 'adjust' | 'random' | 'sign' | 'footprint';

export default function Home({ onNavigate }: { onNavigate: (v: HomeNav) => void }) {
  const entries: { key: HomeNav; title: string; desc: string; Icon: (p: { size?: number }) => JSX.Element }[] = [
    { key: 'my', title: '就吃老样子', desc: '直接复用保存好的固定餐单，一步核价再下单。', Icon: PlateIcon },
    { key: 'adjust', title: '今天微微调', desc: '默认最多改一处，锁定不想动的那几样。', Icon: KnobIcon },
    { key: 'random', title: '随机来一份', desc: '没想法就抽一份，可定预算、人数、近期不重复。', Icon: DiceIcon },
    { key: 'sign', title: '今日食签', desc: '当日一签，结果仍可改、可核价（不涉及运势）。', Icon: CalendarIcon },
  ];

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-text">
          <h1>
            老样子，微微调；<br />
            <span className="hl">没想法，抽一签。</span>
          </h1>
          <p className="sub">记住你喜欢的那一餐，每次只改你想改的。</p>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => onNavigate('my')}>
              选一份老样子
            </button>
            <button className="btn btn-ghost" onClick={() => onNavigate('footprint')}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <FootprintIcon size={18} /> 我的饮食足迹
              </span>
            </button>
          </div>
        </div>
        <div className="hero-art">
          <ComboArt />
        </div>
      </div>

      <h2 className="section-title">四个入口</h2>
      <div className="entry-grid">
        {entries.map((e) => (
          <button key={e.key} className="entry-card" onClick={() => onNavigate(e.key)}>
            <span className="entry-icon">
              <e.Icon size={54} />
            </span>
            <span className="entry-body">
              <b>{e.title}</b>
              <span className="muted small">{e.desc}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="grid" style={{ marginTop: 22 }}>
        <div className="card">
          <h3>我的老样子</h3>
          <p className="muted small">保存固定点餐习惯，命名、加备注、设为常用。历史商品编码只作来源参考。</p>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => onNavigate('my')}>
            去我的老样子
          </button>
        </div>
        <div className="card">
          <h3>看看改了什么</h3>
          <p className="muted small">任意两个版本对比：新增、移除、替换、数量、特制，用文字和图标清楚区分。</p>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => onNavigate('my')}>
            比较版本
          </button>
        </div>
      </div>

      <p className="muted small" style={{ marginTop: 26, lineHeight: 1.7 }}>
        这是基于麦当劳 MCP 的独立开发者作品，<b>非官方产品</b>。演示模式使用虚构餐单，真实模式连接你的麦当劳账户后可见真实订单与报价。
      </p>
    </div>
  );
}
