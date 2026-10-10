import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { MealTemplate, MealVersion, MealItem, MenuCatalogItem } from '../types';
import { formatDate, formatYuan } from '../components/Common';
import DiffView from './DiffView';
import QuoteDrawer from './QuoteDrawer';

export default function TemplateDetail({
  templateId,
  status,
  onBack,
  onChanged,
  showToast,
}: {
  templateId: string;
  status: any;
  onBack: () => void;
  onChanged: () => void;
  showToast: (m: string) => void;
}) {
  const [template, setTemplate] = useState<MealTemplate | null>(null);
  const [versions, setVersions] = useState<MealVersion[]>([]);
  const [draft, setDraft] = useState<MealItem[]>([]);
  const [baseVersionId, setBaseVersionId] = useState<string>('');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const [saving, setSaving] = useState(false);
  const [nlText, setNlText] = useState('');
  const [clarify, setClarify] = useState<{ message: string; options?: string[] } | null>(null);
  const [catalog, setCatalog] = useState<MenuCatalogItem[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuCatalogItem[]>([]);
  const [fromV, setFromV] = useState('');
  const [toV, setToV] = useState('');
  const [diff, setDiff] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await api.getTemplate(templateId);
      setTemplate(r.template);
      setVersions(r.versions);
      const last = r.versions[r.versions.length - 1];
      if (last) {
        setDraft(last.snapshot.items.map((i) => ({ ...i })));
        setBaseVersionId(last.id);
        setFromV(r.versions[Math.max(0, r.versions.length - 2)].id);
        setToV(last.id);
      }
      setNameInput(r.template.name);
      setNoteInput(r.template.note);
      // 构建自然语言目录（菜单 + 当前草稿）
      const sc = r.template.latestVersionId ? last?.snapshot : null;
      const storeCode = sc?.storeCode || 'DSTORE01';
      const orderType = sc?.orderType || 1;
      const beType = sc?.beType || 1;
      try {
        const m = await api.menu(storeCode, orderType, beType);
        setCatalog(m.items || []);
      } catch {
        setCatalog([]);
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const refreshVersions = async () => {
    const r = await api.getTemplate(templateId);
    setVersions(r.versions);
    const last = r.versions[r.versions.length - 1];
    if (last) {
      setToV(last.id);
    }
  };

  const toggleFavorite = async () => {
    if (!template) return;
    const t = await api.updateTemplate(templateId, { favorite: !template.favorite });
    setTemplate(t);
    onChanged();
  };

  const saveName = async () => {
    if (!template) return;
    const t = await api.updateTemplate(templateId, { name: nameInput, note: noteInput });
    setTemplate(t);
    setEditingName(false);
    onChanged();
  };

  const doDelete = async () => {
    if (!confirm('确定删除这份“老样子”及其所有版本？')) return;
    await api.deleteTemplate(templateId);
    showToast('已删除');
    onBack();
  };

  // 草稿编辑
  const changeQty = (code: string, delta: number) =>
    setDraft((d) => d.map((i) => (i.productCode === code ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i)));
  const removeItem = (code: string) => setDraft((d) => d.filter((i) => i.productCode !== code));
  const addItem = (it: MenuCatalogItem) =>
    setDraft((d) => {
      const ex = d.find((x) => x.productCode === it.productCode);
      if (ex) return d.map((x) => (x.productCode === it.productCode ? { ...x, quantity: x.quantity + 1 } : x));
      return [...d, { productCode: it.productCode, productName: it.productName, quantity: 1, source: { isHistory: false } }];
    });

  const runNl = async (text: string) => {
    setClarify(null);
    if (!text.trim()) return;
    try {
      const r = await api.nlParse(text, draft, catalog);
      if (r.previewItems) {
        setDraft(r.previewItems);
        showToast('已应用修改');
      } else if (r.clarification) {
        setClarify(r.clarification);
      } else {
        showToast('没有可应用的修改');
      }
    } catch (e: any) {
      showToast('解析失败：' + e.message);
    }
  };

  const replaceFirstDrink = (toName: string) => {
    const to = catalog.find((c) => c.productName === toName);
    if (!to) return;
    setDraft((d) => {
      const idx = d.findIndex((i) => (catalog.find((c) => c.productCode === i.productCode)?.category || '').includes('饮料'));
      if (idx < 0) return [...d, { productCode: to.productCode, productName: to.productName, quantity: 1, source: { isHistory: false } }];
      const n = [...d];
      n[idx] = { ...n[idx], productCode: to.productCode, productName: to.productName };
      return n;
    });
    setClarify(null);
    showToast('已替换饮料');
  };

  const saveVersion = async () => {
    if (!template) return;
    setSaving(true);
    try {
      await api.createVersion(templateId, buildSnapshot(), changeSummary || '未填写说明', baseVersionId || null);
      showToast('已保存新版本');
      setChangeSummary('');
      await refreshVersions();
      onChanged();
    } catch (e: any) {
      showToast('保存失败：' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const buildSnapshot = (): any => {
    const last = versions.find((v) => v.id === baseVersionId);
    return {
      storeCode: last?.snapshot.storeCode,
      storeName: last?.snapshot.storeName,
      orderType: last?.snapshot.orderType ?? 1,
      beType: last?.snapshot.beType ?? 1,
      historicalAmount: null,
      items: draft,
    };
  };

  const restore = async (vid: string) => {
    try {
      await api.restoreVersion(vid, `用回「${versions.find((v) => v.id === vid)?.changeSummary || '旧版本'}」`);
      showToast('已用回该版本（生成新版本）');
      await refreshVersions();
      onChanged();
    } catch (e: any) {
      showToast('操作失败：' + e.message);
    }
  };

  const loadVersionToDraft = (vid: string) => {
    const v = versions.find((x) => x.id === vid);
    if (!v) return;
    setDraft(v.snapshot.items.map((i) => ({ ...i })));
    setBaseVersionId(vid);
    showToast('已载入该版本到草稿');
  };

  const doDiff = async () => {
    if (!fromV || !toV) return;
    try {
      setDiff(await api.diff(fromV, toV));
    } catch (e: any) {
      showToast('对比失败：' + e.message);
    }
  };

  useEffect(() => {
    if (fromV && toV) doDiff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromV, toV]);

  const toggleMenuPicker = async () => {
    if (!menuOpen) {
      const last = versions.find((v) => v.id === baseVersionId);
      const storeCode = last?.snapshot.storeCode || 'DSTORE01';
      const orderType = last?.snapshot.orderType || 1;
      const beType = last?.snapshot.beType || 1;
      try {
        const m = await api.menu(storeCode, orderType, beType);
        setMenuItems(m.items || []);
      } catch {
        setMenuItems([]);
      }
    }
    setMenuOpen((o) => !o);
  };

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (err && !template) return <div className="page"><div className="banner warn">{err}</div><button className="btn btn-ghost" onClick={onBack}>返回</button></div>;
  if (!template) return null;

  const lastVersion = versions[versions.length - 1];
  const draftCount = draft.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="page page-narrow">
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← 返回</button>
        <span className="spacer" />
        <button className="icon-btn" title="设为常用" onClick={toggleFavorite}>{template.favorite ? '★' : '☆'}</button>
        <button className="icon-btn" title="删除" onClick={doDelete}>🗑</button>
      </div>

      <div className="panel">
        {editingName ? (
          <div className="stack">
            <input className="text-input" value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="餐单名称" />
            <input className="text-input" value={noteInput} onChange={(e) => setNoteInput(e.target.value)} placeholder="备注（可选）" />
            <div className="row">
              <button className="btn btn-primary btn-sm" onClick={saveName}>保存</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingName(false)}>取消</button>
            </div>
          </div>
        ) : (
          <div className="row">
            <h2 style={{ margin: 0 }}>{template.name}</h2>
            <span className="spacer" />
            <button className="btn btn-ghost btn-sm" onClick={() => setEditingName(true)}>改名/备注</button>
          </div>
        )}
        {template.note && <p className="muted small" style={{ marginTop: 6 }}>{template.note}</p>}
        <p className="muted small">{versions.length} 个版本 · 最近修改 {formatDate(template.updatedAt)}</p>
      </div>

      <div className="detail-layout" style={{ marginTop: 16 }}>
        {/* 左侧：修改面板 + 草稿 */}
        <div className="stack">
          <div className="panel">
            <h2>今天换一点</h2>
            <div className="nl-input">
              <input
                value={nlText}
                onChange={(e) => setNlText(e.target.value)}
                placeholder="用自然语言说，例如：饮料换一下 / 加一个玉米杯 / 不要中薯条"
                onKeyDown={(e) => e.key === 'Enter' && runNl(nlText)}
              />
              <button className="btn btn-primary btn-sm" onClick={() => runNl(nlText)}>应用</button>
            </div>
            <div className="quick-row">
              {['饮料换一下', '加一个玉米杯', '不要中薯条', '巨无霸套餐来2个'].map((q) => (
                <button key={q} className="chip-btn" onClick={() => runNl(q)}>{q}</button>
              ))}
            </div>
            {clarify && (
              <div className="clarify" style={{ marginTop: 10 }}>
                {clarify.message}
                {clarify.options && (
                  <div className="opts">
                    {clarify.options.map((o) => (
                      <button key={o} className="chip-btn" onClick={() => replaceFirstDrink(o)}>{o}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button className="chip-btn" style={{ marginTop: 10 }} onClick={toggleMenuPicker}>＋ 从菜单添加</button>
            {menuOpen && (
              <div className="row" style={{ marginTop: 8, maxHeight: 160, overflowY: 'auto' }}>
                {menuItems.map((m) => (
                  <button key={m.productCode} className="chip-btn" onClick={() => addItem(m)} title={m.category}>{m.productName}</button>
                ))}
                {menuItems.length === 0 && <span className="muted small">菜单为空或加载失败</span>}
              </div>
            )}
          </div>

          <div className="panel">
            <h2>当前草稿（{draftCount} 件）</h2>
            {draft.length === 0 && <p className="muted small">草稿为空，可从菜单或历史添加。</p>}
            {draft.map((it) => (
              <div className="draft-item" key={it.productCode}>
                <span className="name">{it.productName}</span>
                <div className="qty">
                  <button onClick={() => changeQty(it.productCode, -1)}>－</button>
                  <span className="n">{it.quantity}</span>
                  <button onClick={() => changeQty(it.productCode, 1)}>＋</button>
                </div>
                <button className="icon-btn" onClick={() => removeItem(it.productCode)}>✕</button>
              </div>
            ))}
            <div className="field" style={{ marginTop: 12 }}>
              <label>这一版说明</label>
              <input className="text-input" value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)} placeholder="例如：饮料换过的" />
            </div>
            <button className="btn btn-primary btn-block" onClick={saveVersion} disabled={saving}>
              {saving ? '保存中…' : '保存这一版（新版本，旧版不变）'}
            </button>
          </div>
        </div>

        {/* 右侧：时间线 + 差异 */}
        <div className="stack">
          <div className="panel">
            <h2>历史时间线</h2>
            <div className="timeline">
              {versions.map((v) => (
                <div className="tl-item" key={v.id}>
                  <div className="tl-name">{v.changeSummary}</div>
                  <div className="tl-date">{formatDate(v.createdAt)}</div>
                  <div className="tl-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => loadVersionToDraft(v.id)}>载入编辑</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => restore(v.id)}>用回这一版</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <h2>看看改了什么</h2>
            <div className="row" style={{ marginBottom: 10 }}>
              <select className="select" style={{ flex: 1 }} value={fromV} onChange={(e) => setFromV(e.target.value)}>
                {versions.map((v) => (<option key={v.id} value={v.id}>旧：{v.changeSummary}</option>))}
              </select>
              <select className="select" style={{ flex: 1 }} value={toV} onChange={(e) => setToV(e.target.value)}>
                {versions.map((v) => (<option key={v.id} value={v.id}>新：{v.changeSummary}</option>))}
              </select>
            </div>
            {diff && <DiffView diff={diff} />}
          </div>
        </div>
      </div>

      <div className="bottom-bar">
        <button className="btn btn-red btn-block" onClick={() => setDrawerOpen(true)}>
          核对后下单（{draftCount} 件）
        </button>
      </div>

      {drawerOpen && lastVersion && (
        <QuoteDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          template={template}
          version={lastVersion}
          items={draft}
          status={status}
          onOrdered={() => {}}
          showToast={showToast}
        />
      )}
    </div>
  );
}
