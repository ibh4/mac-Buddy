import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import ProductImage from './ProductImage';
import { Loading, ErrorState, Empty } from './Common';
import type { MenuCatalogItem } from '../types';

// 看看今天有什么：当前门店菜单，带真实官方商品图，点了就加进这一餐。
//  - 图片地址只来自 MCP 返回（后端已限定 https），前端不拼接、不搜索；
//  - 图加载失败时降级为原创插画并标注“示意图”，不影响下单；
//  - 始终显示商品名称与价格，绝不只靠图传达信息。

export default function MenuGrid({
  storeCode,
  orderType,
  beType,
  demo,
  onPick,
  compact,
}: {
  storeCode: string;
  orderType: number;
  beType: number;
  demo: boolean;
  onPick: (item: MenuCatalogItem) => void;
  compact?: boolean;
}) {
  const [items, setItems] = useState<MenuCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.menu(storeCode, orderType, beType);
      // 真实菜单里同一商品可能在多个分类重复出现，按编码去重后再展示
      const seen = new Set<string>();
      const list = (r.items || []).filter((i) => {
        if (seen.has(i.productCode)) return false;
        seen.add(i.productCode);
        return true;
      });
      setItems(list);
      setErr(null);
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (storeCode) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeCode, orderType, beType]);

  const filtered = useMemo(() => {
    const k = q.trim();
    if (!k) return items;
    return items.filter((i) => (i.productName || '').includes(k));
  }, [items, q]);

  if (loading) return <Loading text="正在读取当前门店菜单…" />;
  if (err) return <ErrorState desc={err} onRetry={load} />;
  if (!items.length) return <Empty title="当前门店暂无菜单" desc="可能不在营业时间，换个门店或稍后再试。" />;

  return (
    <div className="menu-grid-wrap">
      <input
        className="menu-search"
        type="search"
        placeholder="搜一下想吃的（如：薯条、咖啡）"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="搜索商品"
      />
      <div className={compact ? 'menu-grid compact' : 'menu-grid'}>
        {filtered.map((it) => (
          <button key={it.productCode} className="menu-item" onClick={() => onPick(it)}>
            <ProductImage url={it.image} name={it.productName} size={compact ? 72 : 96} demo={demo} combo={!!it.isCombo} />
            <span className="menu-item-name">{it.productName}</span>
            <span className="menu-item-price">¥{(it.price ?? 0).toFixed(2)}</span>
          </button>
        ))}
      </div>
      {filtered.length === 0 && <p className="muted small">没有匹配「{q}」的商品。</p>}
    </div>
  );
}
