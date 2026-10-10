import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Loading, ErrorState, Empty } from '../components/Common';
import { PlateIcon, KnobIcon, DiceIcon, CalendarIcon } from '../components/EntryIcons';
import ProductImage from '../components/ProductImage';
import MenuGrid from '../components/MenuGrid';
import EnergyCard from '../components/EnergyCard';
import LighterBar from '../components/LighterBar';
import CouponPanel from '../components/CouponPanel';
import ConfirmSheet from '../components/ConfirmSheet';
import type { SavedMeal, MealItem, MealNutrition, Prefs, RandomResult, SignResult, MenuCatalogItem } from '../types';

// 点一餐：用户不需要读说明，点几个按钮就能看懂这一餐、微调这一餐、确认这一餐。
//
// 路径：老样子 → 选择餐单 → 查看或微调 → 核对（确认后才可能下单）
//  - 三个入口：就吃老样子 / 随机来一份 / 今日食签；
//  - 选中后页面主体变成“这一餐”：商品图+名称、数量 ±、锁定/替换、能量与蛋白质、
//    其他营养折叠、三个“轻一点”按钮、看看优惠、底部合计与“去核对”；
//  - 所有改动都只作用于当前草稿，点“存为新版本”才写版本库；
//  - 确认页独立呈现门店/就餐方式/商品/金额/不确定项，确认后才下单。

type Draft = {
  items: MealItem[];
  baseItems: MealItem[];
  storeCode: string;
  storeName: string;
  orderType: number;
  beType: number;
  templateId?: string;
  title: string;
};

type Stage = 'choose' | 'meal' | 'confirm';

export default function Order({
  showToast,
  status,
  prefs,
  onOpenPrefs,
  onOpenMicro,
}: {
  showToast: (m: string) => void;
  status: { mode: 'demo' | 'real' } | null;
  prefs: Prefs | null;
  onOpenPrefs: () => void;
  onOpenMicro: () => void;
}) {
  const [stage, setStage] = useState<Stage>('choose');
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [stores, setStores] = useState<{ storeCode: string; storeName: string; beTypes?: number[] }[]>([]);
  const [storeCode, setStoreCode] = useState('');
  const [storeName, setStoreName] = useState('');
  const [orderType, setOrderType] = useState(1);
  const [beType, setBeType] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [locks, setLocks] = useState<string[]>([]);
  const [nutrition, setNutrition] = useState<MealNutrition | null>(null);
  const [images, setImages] = useState<Record<string, string>>({});
  const [total, setTotal] = useState<{ amount: number; priceUnavailable?: boolean; message?: string } | null>(null);
  const [replaceFor, setReplaceFor] = useState<string | null>(null);
  const [replaceOpts, setReplaceOpts] = useState<{ productCode: string; productName: string }[]>([]);
  const [budgetCap, setBudgetCap] = useState<number | undefined>(undefined);

  const demo = status?.mode !== 'real';

  // 每个商品的单份营养（用于“鼠标移过产品显示能量框”）
  const nutritionByCode = useMemo(() => {
    const m: Record<string, { energy?: number; protein?: number; matched: boolean }> = {};
    for (const it of nutrition?.items || []) {
      if (!m[it.productCode]) m[it.productCode] = { energy: it.perUnit?.energyKcal, protein: it.perUnit?.protein, matched: it.matched };
    }
    return m;
  }, [nutrition]);

  useEffect(() => {
    const b = localStorage.getItem('mcd.budgetCap');
    if (b) setBudgetCap(Number(b) || undefined);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErr(null);
      const [ms, st] = await Promise.all([
        api.savedMeals().catch(() => [] as SavedMeal[]),
        api.stores(1).catch(() => ({ demo: true, stores: [] as any[] })),
      ]);
      setMeals(ms);
      setStores(st.stores || []);
      if (ms.length && ms[0].storeCode) {
        setStoreCode(ms[0].storeCode);
        setStoreName(ms[0].storeName || ms[0].storeCode);
        setOrderType(ms[0].orderType || 1);
        setBeType(ms[0].beType || 1);
      } else if (st.stores?.length) {
        setStoreCode(st.stores[0].storeCode);
        setStoreName(st.stores[0].storeName);
      }
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 草稿变化：重算营养、合计与图片
  useEffect(() => {
    if (!draft || !draft.items.length) {
      setNutrition(null);
      setTotal(null);
      return;
    }
    let alive = true;
    (async () => {
      const [n, p, img] = await Promise.all([
        api.nutrition(draft.items, draft.storeCode, draft.orderType, draft.beType, prefs?.energyRefKcal).catch(() => null),
        api.pricePreview(draft.items, draft.storeCode, draft.orderType, draft.beType).catch(() => null),
        api
          .productImages(
            draft.items.map((i: MealItem) => i.productCode),
            draft.storeCode,
            draft.orderType,
            draft.beType
          )
          .catch(() => ({ images: {} as Record<string, string>, demo })),
      ]);
      if (!alive) return;
      setNutrition(n);
      setTotal(p ? { amount: p.amount, priceUnavailable: p.priceUnavailable, message: p.priceMessage } : null);
      setImages(img.images || {});
    })();
    return () => {
      alive = false;
    };
  }, [draft, prefs?.energyRefKcal]);

  useEffect(() => {
    if (!draft?.templateId) return;
    api.getLocks(draft.templateId).then(setLocks).catch(() => setLocks([]));
  }, [draft?.templateId]);

  const startDraft = (d: Draft) => {
    setDraft(d);
    setReplaceFor(null);
    setStage('meal');
    window.scrollTo({ top: 0 });
  };

  const applyItems = (items: MealItem[], summary: string) => {
    setDraft((d) => (d ? { ...d, items, title: summary } : d));
  };

  // ---- 三个入口 ----

  const useSaved = (m: SavedMeal) => {
    startDraft({
      items: m.items.map((i) => ({ ...i })),
      baseItems: m.items.map((i) => ({ ...i })),
      storeCode: m.storeCode || storeCode,
      storeName: m.storeName || storeName,
      orderType: m.orderType || orderType,
      beType: m.beType || beType,
      templateId: m.id,
      title: m.name,
    });
  };

  const drawRandom = async () => {
    if (!storeCode) return showToast('先选一家门店');
    setBusy(true);
    try {
      const r: RandomResult = await api.random({
        mode: meals.length ? 'fromSaved' : 'new',
        storeCode,
        orderType,
        beType,
        budgetCap,
        excludeCodes: prefs?.exclusions || [],
        avoidRecent: true,
      });
      const picked: { items: MealItem[] } | undefined = r.picked || (r as any).candidates?.[0];
      if (!picked?.items?.length) return showToast('这一轮没有可推荐的结果');
      startDraft({
        items: picked.items,
        baseItems: picked.items.map((i: MealItem) => ({ ...i })),
        storeCode,
        storeName,
        orderType,
        beType,
        title: '随机来一份',
      });
    } catch (e: any) {
      showToast(e.message || '生成失败');
    } finally {
      setBusy(false);
    }
  };

  const drawSign = async () => {
    if (!storeCode) return showToast('先选一家门店');
    setBusy(true);
    try {
      const r: SignResult = await api.signToday(storeCode, orderType, beType, undefined, 'slight', budgetCap);
      if (!r?.picked) return showToast('今天这一签暂不可用');
      startDraft({
        items: r.picked.items,
        baseItems: r.picked.items.map((i) => ({ ...i })),
        storeCode,
        storeName,
        orderType,
        beType,
        title: '今日食签',
      });
    } catch (e: any) {
      showToast(e.message || '生成失败');
    } finally {
      setBusy(false);
    }
  };

  // ---- 这一餐：数量 / 锁定 / 替换 ----

  const changeQty = (code: string, delta: number) => {
    setDraft((d) =>
      d
        ? {
            ...d,
            items: d.items
              .map((i) => (i.productCode === code ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i))
              .filter((i) => i.quantity > 0),
          }
        : d
    );
  };

  // 清空这一餐的所有商品
  const clearMeal = () => {
    setDraft((d) => (d ? { ...d, items: [] } : d));
  };

  const toggleLock = async (code: string) => {
    if (!draft) return;
    const next = locks.includes(code) ? locks.filter((c) => c !== code) : [...locks, code];
    setLocks(next);
    if (draft.templateId) {
      try {
        await (locks.includes(code) ? api.clearLock(draft.templateId, code) : api.setLock(draft.templateId, code, '用户锁定'));
      } catch {
        /* 锁定是本地偏好，失败不阻断 */
      }
    }
  };

  const openReplace = async (code: string) => {
    if (!draft) return;
    setReplaceFor(code);
    setReplaceOpts([]);
    try {
      const r = await api.tweak({
        items: draft.items,
        storeCode: draft.storeCode,
        orderType: draft.orderType,
        beType: draft.beType,
        locks: locks.filter((c) => c !== code),
        maxChanges: 1,
        budgetCap,
      });
      const opts = new Map<string, { productCode: string; productName: string }>();
      for (const p of r.plans || []) {
        for (const it of p.items) {
          if (!draft.items.some((x) => x.productCode === it.productCode)) {
            opts.set(it.productCode, { productCode: it.productCode, productName: it.productName });
          }
        }
      }
      setReplaceOpts(Array.from(opts.values()).slice(0, 8));
      if (opts.size === 0) showToast('在当前限制下没有可替换的选择');
    } catch (e: any) {
      showToast(e.message || '获取替换候选失败');
    }
  };

  const doReplace = (code: string, to: { productCode: string; productName: string }) => {
    setDraft((d) =>
      d ? { ...d, items: d.items.map((i) => (i.productCode === code ? { ...i, productCode: to.productCode, productName: to.productName } : i)) } : d
    );
    setReplaceFor(null);
    showToast('已替换（还没保存）');
  };

  // 从菜单里挑一件：加入当前草稿（没有草稿就新起一份）
  const pickFromMenu = (m: MenuCatalogItem) => {
    const item: MealItem = { productCode: m.productCode, productName: m.productName, quantity: 1 };
    setDraft((d) =>
      d
        ? { ...d, items: [...d.items.filter((i) => i.productCode !== item.productCode), item] }
        : {
            items: [item],
            baseItems: [],
            storeCode,
            storeName,
            orderType,
            beType,
            title: '自选这一餐',
          }
    );
    setStage('meal');
    showToast(`已加入「${m.productName}」`);
  };

  const saveVersion = async () => {
    if (!draft) return;
    try {
      const { template, version } = await api.createTemplate(
        draft.title || '这一餐',
        '从「点一餐」保存',
        false,
        { storeCode: draft.storeCode, storeName: draft.storeName, orderType: draft.orderType, beType: draft.beType, items: draft.items }
      );
      showToast(`已保存为新版本（${version.id.slice(0, 8)}）`);
      return template;
    } catch (e: any) {
      showToast(e.message || '保存失败');
    }
  };

  if (loading) return <Loading text="正在准备…" />;
  if (err) return <ErrorState desc={err} onRetry={load} />;

  return (
    <div className="page">
      {/* 顶部：一句话 + 门店/就餐方式 */}
      <div className="order-head">
        <div className="oh-text">
          <span className="oh-eyebrow">MAC-BUDDY · 麦麦搭子</span>
          <h1>
            记得你的<span className="hl">老样子</span>，也懂你想换换口味。
          </h1>
          <p className="oh-sub">
            <span className="oh-en">Your taste. Your Buddy.</span>
            <span className="oh-sub-cn">今天吃什么，一起选。</span>
          </p>
          <div className="store-bar">
            <label className="field inline">
              <span>门店</span>
              <select
                value={storeCode}
                onChange={(e) => {
                  const s = stores.find((x) => x.storeCode === e.target.value);
                  setStoreCode(e.target.value);
                  setStoreName(s?.storeName || e.target.value);
                  // 门店变了：回到选择，避免沿用旧门店的草稿
                  setStage('choose');
                  setDraft(null);
                }}
              >
                {stores.length === 0 && storeCode && <option value={storeCode}>{storeName || storeCode}</option>}
                {stores.map((s) => (
                  <option key={s.storeCode} value={s.storeCode}>
                    {s.storeName || s.storeCode}
                  </option>
                ))}
              </select>
            </label>
            <label className="field inline">
              <span>就餐方式</span>
              <select
                value={beType}
                onChange={(e) => {
                  const b = Number(e.target.value);
                  setBeType(b);
                  setOrderType(b === 2 ? 2 : 1);
                  setStage('choose');
                  setDraft(null);
                }}
              >
                <option value={1}>到店自取</option>
                <option value={5}>得来速</option>
                <option value={2}>麦乐送到家</option>
              </select>
            </label>
            <button className="btn btn-ghost btn-sm" onClick={onOpenPrefs}>
              偏好设置
            </button>
          </div>
        </div>
        <div className="oh-art" aria-hidden="true">
          <img className="oh-burger" src="/burger/home-burger.png" alt="" />
          <img className="oh-sticker s-potato1" src="/burger/home-potato.png" alt="" />
          <img className="oh-sticker s-potato2" src="/burger/home-potato.png" alt="" />
          <img className="oh-sticker s-tomato1" src="/burger/home-tomato.png" alt="" />
          <img className="oh-sticker s-tomato2" src="/burger/home-tomato.png" alt="" />
          <img className="oh-sticker s-glass" src="/burger/sticker-glass.svg" alt="" />
          <img className="oh-sticker s-soda" src="/burger/sticker-soda.svg" alt="" />
        </div>
      </div>

      {stage === 'choose' && (
        <>
          <div className="entry-grid four">
            <button className="entry-card" onClick={() => setStage('meal')} disabled={meals.length === 0}>
              <span className="entry-icon">
                <PlateIcon size={54} />
              </span>
              <span className="entry-body">
                <b>老样子</b>
                <span className="muted small">直接复用保存好的那一餐</span>
              </span>
            </button>
            <button className="entry-card" onClick={onOpenMicro}>
              <span className="entry-icon">
                <KnobIcon size={54} />
              </span>
              <span className="entry-body">
                <b>微微调</b>
                <span className="muted small">只改你想改的那一处</span>
              </span>
            </button>
            <button className="entry-card" onClick={drawRandom} disabled={busy}>
              <span className="entry-icon">
                <DiceIcon size={54} />
              </span>
              <span className="entry-body">
                <b>随机一餐</b>
                <span className="muted small">没想法就抽一份</span>
              </span>
            </button>
            <button className="entry-card" onClick={drawSign} disabled={busy}>
              <span className="entry-icon">
                <CalendarIcon size={54} />
              </span>
              <span className="entry-body">
                <b>今日食签</b>
                <span className="muted small">当日一签，结果仍可改</span>
              </span>
            </button>
          </div>

          {meals.length === 0 ? (
            <div className="card" style={{ marginTop: 18 }}>
              <Empty
                title="还没有保存过老样子"
                desc="先去「我的老样子」存一份常点的餐单，回来就能一键复用。"
              />
            </div>
          ) : (
            <div className="card" style={{ marginTop: 18 }}>
              <h3>我的老样子</h3>
              <div className="meal-cards">
                {meals.map((m) => (
                  <button key={m.id} className="meal-card" onClick={() => useSaved(m)}>
                    <ProductImage url={images[m.items[0]?.productCode]} name={m.items[0]?.productName || m.name} size={72} demo={demo} combo />
                    <span className="meal-card-body">
                      <b>{m.name}</b>
                      <span className="muted small">{m.items.map((i) => i.productName).join(' + ')}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="card" style={{ marginTop: 18 }}>
            <h3>看看今天有什么</h3>
            <p className="muted small">当前门店在售商品，带官方商品图。点一下就加进这一餐。</p>
            {storeCode && (
              <MenuGrid
                storeCode={storeCode}
                orderType={orderType}
                beType={beType}
                demo={demo}
                onPick={pickFromMenu}
              />
            )}
          </div>

          <div className="hero-art small" aria-hidden="true">
            <img src="/burger/delivery-burger.png" alt="" style={{ maxWidth: 320, filter: 'drop-shadow(0 12px 22px rgba(122,86,40,.2))' }} />
          </div>
        </>
      )}

      {stage === 'meal' && draft && (
        <div className="meal-stage">
          {!draft.items.length && <Empty title="这一餐还是空的" desc="回到上一步选一份餐单。" />}

          {draft.items.length > 0 && (
            <div className="card meal-card-main">
              <div className="meal-head">
                <b>{draft.title}</b>
                <span className="muted small">
                  {draft.storeName || draft.storeCode} · {draft.orderType === 2 ? '外送' : '到店'}
                </span>
              </div>

              {draft.items.map((it, i) => {
                const nut = nutritionByCode[it.productCode];
                return (
                <div key={`${it.productCode}-${i}`} className="meal-row">
                  <div className="meal-product">
                    <ProductImage
                      url={images[it.productCode]}
                      name={it.productName}
                      size={80}
                      demo={demo}
                      combo={!!it.comboItemList?.length}
                    />
                    {nut && (
                      <div className="energy-tip" role="tooltip" aria-hidden="true">
                        <span className="et-k">能量</span>
                        <span className="et-v">{nut.energy != null ? `${nut.energy} kcal` : '暂无数据'}</span>
                        <span className="et-sub">
                          蛋白质 {nut.protein != null ? `${nut.protein} g` : '—'}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="meal-row-body">
                    <b>{it.productName}</b>
                    {it.comboItemList?.length ? (
                      <span className="muted small">含：{it.comboItemList.map((c) => c.name).join('、')}</span>
                    ) : null}
                    <div className="qty">
                      <button className="btn btn-ghost btn-icon" onClick={() => changeQty(it.productCode, -1)} aria-label={`减少${it.productName}`}>
                        −
                      </button>
                      <span className="qty-n">{it.quantity}</span>
                      <button className="btn btn-ghost btn-icon" onClick={() => changeQty(it.productCode, 1)} aria-label={`增加${it.productName}`}>
                        +
                      </button>
                      <button
                        className={`btn btn-sm ${locks.includes(it.productCode) ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => toggleLock(it.productCode)}
                      >
                        {locks.includes(it.productCode) ? '已锁定' : '锁定'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => openReplace(it.productCode)}>
                        替换
                      </button>
                    </div>
                    {replaceFor === it.productCode && replaceOpts.length > 0 && (
                      <div className="replace-opts">
                        {replaceOpts.map((o) => (
                          <button key={o.productCode} className="btn btn-ghost btn-sm" onClick={() => doReplace(it.productCode, o)}>
                            换成 {o.productName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                );
              })}

              <div className="meal-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => setStage((s) => (s === 'meal' ? 'choose' : 'meal'))}>
                  再加一件
                </button>
                <button className="btn btn-ghost btn-sm danger" onClick={clearMeal}>
                  清空
                </button>
              </div>
            </div>
          )}

          {nutrition && <EnergyCard data={nutrition} />}

          {draft.items.length > 0 && (
            <LighterBar
              items={draft.items}
              storeCode={draft.storeCode}
              orderType={draft.orderType}
              beType={draft.beType}
              locks={locks}
              budgetCap={budgetCap}
              onApply={applyItems}
              showToast={showToast}
            />
          )}

          {draft.items.length > 0 && (
            <CouponPanel
              items={draft.items}
              storeCode={draft.storeCode}
              orderType={draft.orderType}
              beType={draft.beType}
              onApply={applyItems}
              showToast={showToast}
            />
          )}

          <div className="order-bottom">
            <div className="order-total">
              {total?.priceUnavailable ? (
                <b className="na">金额暂不可用</b>
              ) : (
                <b>¥{(total?.amount ?? 0).toFixed(2)}</b>
              )}
              <span className="muted small">{demo ? '演示数据' : '当前核价'}</span>
            </div>
            <div className="btn-row">
              <button className="btn btn-ghost" onClick={() => setStage('choose')}>
                换一份
              </button>
              <button className="btn btn-ghost" onClick={saveVersion}>
                存为新版本
              </button>
              <button className="btn btn-primary" onClick={() => setStage('confirm')} disabled={!draft.items.length}>
                去核对
              </button>
            </div>
          </div>
        </div>
      )}

      {stage === 'confirm' && draft && (
        <ConfirmSheet
          items={draft.items}
          baseItems={draft.baseItems}
          storeCode={draft.storeCode}
          storeName={draft.storeName}
          orderType={draft.orderType}
          beType={draft.beType}
          locks={locks}
          nutrition={nutrition}
          images={images}
          demo={demo}
          onBack={() => setStage('meal')}
          onConfirm={async (_q, amount) => {
            showToast(demo ? '演示模式不会创建真实订单' : `已确认，金额 ¥${amount.toFixed(2)}`);
            setStage('meal');
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}
