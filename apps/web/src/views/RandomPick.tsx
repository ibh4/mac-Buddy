import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Loading, ErrorState, Empty, formatYuan } from '../components/Common';
import { DiceIcon } from '../components/EntryIcons';
import type { SavedMeal, RandomResult } from '../types';

const MODES: { key: 'fromSaved' | 'keepMain' | 'new'; title: string; desc: string }[] = [
  { key: 'fromSaved', title: '从老样子里随机', desc: '在你保存过的餐单里抽一份。' },
  { key: 'keepMain', title: '保留主角，随机配角', desc: '主食不动，换掉饮料或小食。' },
  { key: 'new', title: '试试新组合', desc: '按当前门店菜单现搭一份新的。' },
];

const NOVELTY: { key: 'familiar' | 'slight' | 'more'; label: string }[] = [
  { key: 'familiar', label: '熟悉一点' },
  { key: 'slight', label: '一点新鲜' },
  { key: 'more', label: '更新鲜' },
];

/**
 * 随机来一份。
 * - 候选集合由后端基于门店菜单确定性构建；“换一个”只推进种子，不重复拉取菜单；
 * - 相同条件 + 相同种子可复现；存在其他候选时不会立即重复上一份；
 * - 结果只是推荐草稿，绝不下单；金额以核价（真实模式走 calculate-price）为准。
 */
export default function RandomPick({
  showToast,
  onNavigate,
}: {
  showToast: (m: string) => void;
  onNavigate: (v: 'my' | 'history' | 'footprint') => void;
}) {
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [mode, setMode] = useState<'fromSaved' | 'keepMain' | 'new'>('keepMain');
  const [baseMealId, setBaseMealId] = useState<string>('');
  const [budgetCap, setBudgetCap] = useState(0); // 0 = 不限
  const [peopleCount, setPeopleCount] = useState(1);
  const [novelty, setNovelty] = useState<'familiar' | 'slight' | 'more'>('slight');
  const [avoidRecent, setAvoidRecent] = useState(true);
  const [keep, setKeep] = useState<string[]>([]);
  const [exclude, setExclude] = useState<string[]>([]);

  const [seedNonce, setSeedNonce] = useState(0);
  const [result, setResult] = useState<RandomResult | null>(null);
  const [prevPickId, setPrevPickId] = useState<string | undefined>(undefined);
  const [picking, setPicking] = useState(false);
  const [price, setPrice] = useState<{ amount: number; demo: boolean; priceUnavailable?: boolean; priceMessage?: string } | null>(null);
  const [pricing, setPricing] = useState(false);
  const [saving, setSaving] = useState(false);

  const base = meals.find((m) => m.id === baseMealId) || meals[0] || null;
  const storeCode = base?.storeCode || '';
  const orderType = base?.orderType || 1;
  const beType = base?.beType || 1;

  const load = async () => {
    try {
      setLoading(true);
      setErr(null);
      const ms = await api.savedMeals();
      setMeals(ms);
      if (ms.length) setBaseMealId(ms[0].id);
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const pick = async (nonce: number) => {
    if (!storeCode) {
      setErr('所选餐单没有门店信息，请先在餐单里选择门店，或先保存一份带门店的餐单。');
      return;
    }
    try {
      setPicking(true);
      setErr(null);
      setPrice(null);
      const r = await api.random({
        mode,
        storeCode,
        orderType,
        beType,
        localAnonId: 'local-user',
        locks: keep,
        budgetCap: budgetCap > 0 ? budgetCap : undefined,
        peopleCount,
        excludeCodes: exclude,
        novelty,
        baseMealId: mode === 'keepMain' ? base?.id : undefined,
        seedNonce: nonce,
        prevPickId: prevPickId,
        avoidRecent,
      });
      setResult(r);
      setSeedNonce(nonce);
      if (r.picked) setPrevPickId(r.picked.id);
      // 最终金额以核价为准（真实模式走 calculate-price）
      if (r.picked) {
        setPricing(true);
        const p = await api.pricePreview(r.picked.items, storeCode, orderType, beType).catch(() => null);
        setPrice(p);
        setPricing(false);
      }
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setPicking(false);
    }
  };

  const reroll = () => pick(seedNonce + 1);

  const saveAsTemplate = async () => {
    if (!result?.picked || !base) return;
    try {
      setSaving(true);
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const name = `随机来一份 · ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      await api.createTemplate(
        name,
        '由「随机来一份」生成（可继续微调）',
        false,
        { storeCode, storeName: base.storeName, orderType, beType, items: result.picked.items }
      );
      showToast('已保存为新餐单');
      onNavigate('my');
    } catch (e: any) {
      showToast(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (list: string[], setList: (v: string[]) => void, code: string) => {
    setList(list.includes(code) ? list.filter((c) => c !== code) : [...list, code]);
  };

  if (loading) return <Loading />;
  if (err) return <ErrorState desc={err} onRetry={load} />;

  const picked = result?.picked || null;

  return (
    <div className="page page-narrow">
      <div className="row" style={{ gap: 12, marginBottom: 6 }}>
        <DiceIcon size={40} />
        <div>
          <h2 style={{ margin: 0 }}>随机来一份</h2>
          <p className="muted small" style={{ margin: 2 }}>
            没想法的时候，让它在当前门店菜单里抽一份。结果只是推荐草稿，不会自动下单。
          </p>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="field">
          <label>抽法</label>
          <div className="quick-row">
            {MODES.map((m) => (
              <button
                key={m.key}
                className={`chip-btn ${mode === m.key ? 'lock-chip on' : ''}`}
                onClick={() => {
                  setMode(m.key);
                  setResult(null);
                  setSeedNonce(0);
                  setPrevPickId(undefined);
                }}
                title={m.desc}
              >
                {m.title}
              </button>
            ))}
          </div>
          <p className="muted small" style={{ marginTop: 6 }}>
            {MODES.find((m) => m.key === mode)?.desc}
          </p>
        </div>

        {mode === 'keepMain' && meals.length > 0 && (
          <div className="field">
            <label>以哪一份为基础</label>
            <select className="select" value={baseMealId} onChange={(e) => setBaseMealId(e.target.value)}>
              {meals.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {mode === 'fromSaved' && meals.length === 0 && (
          <div className="banner info">你还没有保存的餐单，先去保存一份，或改用「试试新组合」。</div>
        )}

        <div className="row" style={{ gap: 16, alignItems: 'flex-end' }}>
          <div className="field" style={{ marginBottom: 0, minWidth: 120 }}>
            <label>预算上限</label>
            <select className="select" value={budgetCap} onChange={(e) => setBudgetCap(Number(e.target.value))}>
              <option value={0}>不限</option>
              {[20, 30, 40, 50, 60, 80].map((n) => (
                <option key={n} value={n}>
                  {n} 元
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0, minWidth: 110 }}>
            <label>几人份</label>
            <select className="select" value={peopleCount} onChange={(e) => setPeopleCount(Number(e.target.value))}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n} 人
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>熟悉度</label>
            <div className="quick-row">
              {NOVELTY.map((n) => (
                <button
                  key={n.key}
                  className={`chip-btn ${novelty === n.key ? 'lock-chip on' : ''}`}
                  onClick={() => setNovelty(n.key)}
                >
                  {n.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
          <label>
            <input type="checkbox" checked={avoidRecent} onChange={(e) => setAvoidRecent(e.target.checked)} />{' '}
            近期出现过的尽量不重复
          </label>
        </div>

        {base && mode !== 'new' && (
          <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
            <label>必须保留 / 不要出现（点餐品切换）</label>
            <div className="quick-row">
              {base.items.map((it) => {
                const k = keep.includes(it.productCode);
                const x = exclude.includes(it.productCode);
                return (
                  <button
                    key={it.productCode}
                    className={`chip-btn ${k ? 'lock-chip on' : ''}`}
                    style={x ? { textDecoration: 'line-through', opacity: 0.55 } : undefined}
                    onClick={() => {
                      if (k) {
                        setKeep(keep.filter((c) => c !== it.productCode));
                        setExclude([...exclude, it.productCode]);
                      } else if (x) {
                        setExclude(exclude.filter((c) => c !== it.productCode));
                      } else {
                        setKeep([...keep, it.productCode]);
                      }
                      setResult(null);
                    }}
                  >
                    {k ? '🔒 ' : x ? '🚫 ' : ''}
                    {it.productName}
                  </button>
                );
              })}
            </div>
            <p className="muted small" style={{ marginTop: 6 }}>
              点一次＝必须保留，再点＝不要出现，第三次取消。
            </p>
          </div>
        )}

        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" onClick={() => pick(0)} disabled={picking}>
            {picking ? '抽取中…' : '抽一份'}
          </button>
          {result && (
            <button className="btn btn-ghost" onClick={reroll} disabled={picking || (result.candidates.length < 2)}>
              换一个
            </button>
          )}
          {result && <span className="muted small">候选 {result.candidates.length} 份 · 种子 {result.seedUsed}</span>}
        </div>
      </div>

      {result && !picked && (
        <div className="banner warn" style={{ marginTop: 16 }}>
          当前条件下没有可抽的组合。可以放宽预算上限、减少“不要出现”的商品，或换个抽法试试。
        </div>
      )}

      {picked && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="plan-head">
            <span className={`tag ${picked.source === 'saved' ? '' : 'pink'}`}>
              {picked.source === 'saved' ? '来自你的老样子' : picked.source === 'variation' ? '保留主角换配角' : '新搭配'}
            </span>
            <span className="plan-total">
              {pricing ? '核价中…' : price && !price.priceUnavailable ? formatYuan(price.amount) : `约 ${formatYuan(picked.total)}`}
            </span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{picked.reason}</div>
          <div className="stack">
            {picked.items.map((it) => (
              <div key={it.productCode} className="draft-item">
                <span className="name">{it.productName}</span>
                <span className="muted small">×{it.quantity}</span>
              </div>
            ))}
          </div>
          {price?.priceUnavailable && (
            <div className="banner warn" style={{ marginTop: 12 }}>
              {price.priceMessage || '当前商品暂无法核价'}
              。界面显示的是按菜单单价估算的金额，请以门店实际为准。
            </div>
          )}
          {!price && !pricing && (
            <p className="muted small" style={{ marginTop: 10 }}>
              上方金额是按菜单单价的估算，保存后可到餐单里正式核价。
            </p>
          )}
          <div className="bottom-bar">
            <button className="btn btn-ghost" onClick={reroll} disabled={picking || (result?.candidates.length ?? 0) < 2}>
              换一个
            </button>
            <button className="btn btn-primary btn-block" onClick={saveAsTemplate} disabled={saving}>
              {saving ? '保存中…' : '存为新餐单'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
