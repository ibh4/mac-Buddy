import React, { useEffect, useState } from 'react';
import { api } from '../api';
import type { Prefs } from '../types';

// 偏好设置抽屉：预算上限、一餐能量参考值、不要出现的商品。
//  - 设置会被记住（存后端 prefs）；
//  - 能量参考值不填就是“不设参考”，此时界面不做任何健康评分或红绿灯；
//  - 这里只做“你自己的偏好”，不按疾病/人群/体检指标自动给出阈值。

export default function PrefDrawer({
  open,
  onClose,
  prefs,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  prefs: Prefs | null;
  onSaved: (p: Prefs) => void;
}) {
  const [budget, setBudget] = useState<string>('');
  const [energyRef, setEnergyRef] = useState<string>('');
  const [exclusions, setExclusions] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!prefs) return;
    setExclusions((prefs.exclusions || []).join('、'));
    setEnergyRef(prefs.energyRefKcal != null ? String(prefs.energyRefKcal) : '');
  }, [prefs]);

  if (!open) return null;

  const save = async () => {
    setSaving(true);
    try {
      const eRef = energyRef.trim() === '' ? null : Math.max(0, Number(energyRef));
      const p = await api.setPrefs({
        exclusions: exclusions
          .split(/[、,，\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        energyRefKcal: Number.isFinite(eRef as number) ? (eRef as number) : null,
      });
      localStorage.setItem('mcd.budgetCap', budget);
      onSaved(p);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="drawer-mask" onClick={onClose} />
      <aside className="drawer" aria-label="偏好设置">
        <div className="drawer-head">
          <b>偏好设置</b>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            关闭
          </button>
        </div>

        <label className="field">
          <span>这一餐预算上限（元）</span>
          <input
            type="number"
            inputMode="decimal"
            placeholder="不填表示不限"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
          <small className="muted">只用于筛选方案，不会替你下单。</small>
        </label>

        <label className="field">
          <span>一餐能量参考值（kcal）</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder="不填 = 不设参考"
            value={energyRef}
            onChange={(e) => setEnergyRef(e.target.value)}
          />
          <small className="muted">
            只与你自设的数值比较。不填时不会给出任何健康评分或红绿灯，也不按人群/疾病自动推荐数值。
          </small>
        </label>

        <label className="field">
          <span>不要出现的商品</span>
          <input
            type="text"
            placeholder="用、分隔，如：香菜、可乐"
            value={exclusions}
            onChange={(e) => setExclusions(e.target.value)}
          />
          <small className="muted">替换与随机方案都会避开这些商品。</small>
        </label>

        <button className="btn btn-primary" onClick={save} disabled={saving}>
          保存偏好
        </button>
      </aside>
    </>
  );
}
