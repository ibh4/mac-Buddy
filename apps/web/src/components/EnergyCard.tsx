import React, { useState } from 'react';
import type { MealNutrition, NutrientTotals } from '../types';

// 这一餐的能量卡。
// 口径严格：
//  - 默认只展示“能量 + 蛋白质”，其余指标收在“营养详情”里；
//  - 数据缺失显示“暂无数据”，绝不填 0；
//  - 部分匹配显示覆盖情况（如 4 项中 3 项已匹配），不把部分合计写成整餐总量；
//  - 糖恒为“暂无数据”（官方营养表未提供，绝不由碳水推算）；碳水不是糖、钠不是盐；
//  - 含特制时明确“特制后的营养变化未知”，不编造减少值；
//  - 历史餐单按当前资料估算时标明口径，不声称还原历史摄入；
//  - 未设置参考上限时不给任何健康评分或红绿灯（只陈述数值）；
//  - 数值是可选中的文本，不画进插画里，便于复制与读屏。

const UNIT: Record<keyof NutrientTotals, string> = {
  energyKcal: 'kcal',
  protein: 'g',
  fat: 'g',
  carbohydrate: 'g',
  sodium: 'mg',
  sugar: 'g',
  calcium: 'mg',
};

const LABEL: Record<keyof NutrientTotals, string> = {
  energyKcal: '能量',
  protein: '蛋白质',
  fat: '脂肪',
  carbohydrate: '碳水化合物',
  sodium: '钠',
  sugar: '糖',
  calcium: '钙',
};

function fmt(v?: number): string {
  if (v == null) return '暂无数据';
  return String(Math.round(v * 10) / 10);
}

function N({ k, v }: { k: keyof NutrientTotals; v?: number }) {
  return (
    <div className="nut">
      <span className="nut-k">{LABEL[k]}</span>
      <span className={`nut-v ${v == null ? 'na' : ''}`}>
        {fmt(v)}
        {v != null && <em className="nut-u">{UNIT[k]}</em>}
      </span>
    </div>
  );
}

export default function EnergyCard({ data, dense }: { data: MealNutrition; dense?: boolean }) {
  const [open, setOpen] = useState(false);
  const t = data.totals;
  const ref = data.energyRef;

  return (
    <div className={`card energy-card ${dense ? 'dense' : ''}`}>
      <div className="energy-head">
        <div className="energy-main">
          <N k="energyKcal" v={t.energyKcal} />
          <N k="protein" v={t.protein} />
        </div>
        {ref ? (
          <span className={`ref-tag ${ref.over ? 'over' : 'ok'}`}>
            {ref.over ? `超出自设参考 ${Math.abs(ref.diff)} kcal` : `距自设参考还差 ${ref.diff} kcal`}
          </span>
        ) : (
          <span className="ref-tag none">未设参考值</span>
        )}
      </div>

      {data.partial && (
        <p className="caliber">
          已知部分合计：{data.coverage.matched}/{data.coverage.total} 项已匹配
          {data.coverage.missingNames.length > 0 && `（未匹配：${data.coverage.missingNames.join('、')}）`}
          ，未匹配项不计入合计。
        </p>
      )}
      {data.modificationUnknown && <p className="caliber">含特制选项，特制后的营养变化未知（未编造增减值）。</p>}
      {data.usesHistoryItems && <p className="caliber">历史餐单按当前营养资料估算，不代表当时的实际摄入。</p>}

      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? '收起营养详情' : '营养详情'}
      </button>

      {open && (
        <div className="nut-grid">
          <N k="fat" v={t.fat} />
          <N k="carbohydrate" v={t.carbohydrate} />
          <N k="sodium" v={t.sodium} />
          <N k="sugar" v={t.sugar} />
          <N k="calcium" v={t.calcium} />
          <div className="nut-wide muted small">
            糖暂无数据：官方营养表未提供，不由碳水化合物推算；碳水不是糖，钠不是盐。
          </div>
        </div>
      )}

      <p className="caliber muted">{data.note}</p>
    </div>
  );
}
