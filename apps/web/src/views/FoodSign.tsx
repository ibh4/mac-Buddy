import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Loading, ErrorState, formatYuan } from '../components/Common';
import { CalendarIcon } from '../components/EntryIcons';
import type { SignResult, SavedMeal } from '../types';

const PERIOD_LABEL: Record<string, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  any: '任意时段',
};

/**
 * 今日食签。
 * 重要：这是基于「你的偏好 + 当前门店真实菜单」的启发式每日推荐，
 * 不使用也不涉及黄历 / 生肖 / 星座 / 八字 / 财运 / 转运等任何运势逻辑。
 * 同一天结果稳定（可缓存），“换一份灵感”只推进抽取种子。
 */
export default function FoodSign({
  showToast,
  onNavigate,
}: {
  showToast: (m: string) => void;
  onNavigate: (v: 'my' | 'history' | 'footprint') => void;
}) {
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [storeCode, setStoreCode] = useState('');
  const [storeName, setStoreName] = useState('');
  const [orderType, setOrderType] = useState(1);
  const [beType, setBeType] = useState(1);
  const [intent, setIntent] = useState<'keep' | 'slight' | 'new'>('slight');
  const [budgetCap, setBudgetCap] = useState(0);

  const [sign, setSign] = useState<SignResult | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [price, setPrice] = useState<{ amount: number; priceUnavailable?: boolean; priceMessage?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setErr(null);
      const ms = await api.savedMeals();
      setMeals(ms);
      if (ms.length && ms[0].storeCode) {
        setStoreCode(ms[0].storeCode);
        setStoreName(ms[0].storeName || '');
        setOrderType(ms[0].orderType || 1);
        setBeType(ms[0].beType || 1);
      }
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const draw = async (n: number, prev?: string) => {
    if (!storeCode) {
      setErr('还没有门店信息：请先保存一份带门店的餐单，或在连接设置里确认门店。');
      return;
    }
    try {
      setLoading(true);
      setErr(null);
      setPrice(null);
      const r = await api.signGenerate({
        storeCode,
        orderType,
        beType,
        localAnonId: 'local-user',
        intent,
        budgetCap: budgetCap > 0 ? budgetCap : undefined,
        seedNonce: n,
        prevPickId: prev,
      });
      setSign(r);
      setNonce(n);
      setFlipped(n > 0 ? true : false);
      if (r.picked) {
        const p = await api.pricePreview(r.picked.items, storeCode, orderType, beType).catch(() => null);
        setPrice(p);
      }
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (storeCode && !sign) draw(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeCode]);

  const picked = sign?.picked || null;

  const saveAsTemplate = async () => {
    if (!picked) return;
    try {
      setSaving(true);
      const m = meals.find((x) => x.storeCode === storeCode) || meals[0];
      await api.createTemplate(
        `今日食签 · ${sign?.dateCN || ''}`,
        '由「今日食签」生成（可继续微调）',
        false,
        { storeCode, storeName: m?.storeName || storeName, orderType, beType, items: picked.items }
      );
      showToast('已保存为新餐单');
      onNavigate('my');
    } catch (e: any) {
      showToast(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !sign) return <Loading />;
  if (err) return <ErrorState desc={err} onRetry={load} />;

  const day = (sign?.dateCN || '').slice(8, 10) || '--';
  const month = (sign?.dateCN || '').slice(0, 7) || '';

  return (
    <div className="page page-narrow">
      <div className="row" style={{ gap: 12, marginBottom: 6 }}>
        <CalendarIcon size={40} />
        <div>
          <h2 style={{ margin: 0 }}>今日食签</h2>
          <p className="muted small" style={{ margin: 2 }}>
            每天给你一签：基于你的偏好与当前门店菜单的启发式推荐。
            <b> 不涉及黄历、星座、运势。</b>
          </p>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="row" style={{ gap: 16, alignItems: 'flex-end' }}>
          <div className="field" style={{ marginBottom: 0, minWidth: 130 }}>
            <label>今天想怎么吃</label>
            <select className="select" value={intent} onChange={(e) => { setIntent(e.target.value as any); setSign(null); setFlipped(false); }}>
              <option value="keep">照旧，别乱改</option>
              <option value="slight">老样子，微微调</option>
              <option value="new">想试试新的</option>
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0, minWidth: 120 }}>
            <label>预算上限</label>
            <select className="select" value={budgetCap} onChange={(e) => { setBudgetCap(Number(e.target.value)); setSign(null); setFlipped(false); }}>
              <option value={0}>不限</option>
              {[20, 30, 40, 50, 60].map((n) => (
                <option key={n} value={n}>{n} 元</option>
              ))}
            </select>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => draw(0)} disabled={loading}>
            重新抽今日一签
          </button>
        </div>
        <p className="muted small" style={{ marginTop: 10 }}>
          当前门店：{storeName || storeCode || '（未选择）'} · 时段：{PERIOD_LABEL[sign?.mealPeriod || 'any']}
          {sign?.cached ? ' · 今日已缓存（同一天结果稳定）' : ''}
        </p>
      </div>

      <div className="flip-wrap" style={{ marginTop: 18 }}>
        <div className={`flip-card ${flipped ? 'flipped' : ''}`}>
          {/* 正面：日历卡 */}
          <div className="flip-face front">
            <div className="sign-month">{month}</div>
            <div className="sign-date">{day}</div>
            <div style={{ marginTop: 14, fontSize: 17, fontWeight: 800 }}>今日食签</div>
            <p className="muted small" style={{ marginTop: 8, maxWidth: 300 }}>
              点下面揭签，看看今天给你的那一餐。同一天结果稳定，换一份也只在你点“换一份灵感”时改变。
            </p>
            <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => setFlipped(true)} disabled={!picked}>
              揭签
            </button>
          </div>

          {/* 背面：签文与餐单 */}
          <div className="flip-face back">
            {picked ? (
              <>
                <div className="sign-yi">{sign?.yiText || '老样子，微微调'}</div>
                <div className="sign-sig">{sign?.signSignature}</div>
                <div style={{ marginTop: 16, textAlign: 'left', width: '100%' }}>
                  {picked.items.map((it) => (
                    <div key={it.productCode} className="draft-item" style={{ marginBottom: 8 }}>
                      <span className="name">{it.productName}</span>
                      <span className="muted small">×{it.quantity}</span>
                    </div>
                  ))}
                </div>
                <div className="row" style={{ marginTop: 10, justifyContent: 'center' }}>
                  <span className="plan-total">
                    {price && !price.priceUnavailable ? formatYuan(price.amount) : `约 ${formatYuan(picked.total)}`}
                  </span>
                </div>
                {price?.priceUnavailable && <div className="small" style={{ color: 'var(--red)', marginTop: 6 }}>{price.priceMessage}</div>}
                <p className="muted small" style={{ marginTop: 8 }}>{picked.reason}</p>
              </>
            ) : (
              <div className="muted">当前条件下没有可抽的组合，换个条件再试试。</div>
            )}
          </div>
        </div>
      </div>

      <div className="bottom-bar">
        <button
          className="btn btn-ghost"
          onClick={() => draw(nonce + 1, sign?.picked?.id)}
          disabled={loading || !sign || sign.candidates.length < 2}
        >
          换一份灵感
        </button>
        <button className="btn btn-primary btn-block" onClick={saveAsTemplate} disabled={!picked || saving}>
          {saving ? '保存中…' : '存为新餐单并继续微调'}
        </button>
      </div>
      <p className="muted small" style={{ marginTop: 10, lineHeight: 1.7 }}>
        食签只是灵感，保存后就是一份普通餐单草稿：你可以继续微微调、正式核价，再决定是否下单。推荐结果本身绝不下单。
      </p>
    </div>
  );
}
