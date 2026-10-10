// 营养计算：基于官方 list-nutrition-foods 数据。
//
// 严格口径（不做任何臆测）：
//  1. 只在“规格与计量基准可核对”时匹配；名称相似但份量未知的不认定为同一份量。
//  2. 官方数据按“每份（件）”给出，表中无重量列，因此只按数量累加，不做每 100g 换算。
//  3. 能量：优先 kcal；仅有 kJ 时按 1 kcal = 4.184 kJ 转换。
//  4. 套餐只累计其组成项，不重复计入套餐本身。
//  5. 特制（如去酱）无对应营养数据时，标注“特制后的营养变化未知”，绝不编造减少值。
//  6. 缺失数据一律为 undefined（界面显示“暂无数据”），绝不填 0。
//  7. 部分匹配时给出覆盖情况（如“4 项中 3 项已匹配”），不把部分合计写成整餐总量。
//  8. 碳水不是糖，钠不是盐：糖在官方表中无数据，恒为“暂无数据”。
//  9. 历史餐单按当前营养资料分析时，标明资料口径，不声称还原历史实际摄入。

import type { MealItem } from './types.js';
import { DEMO_NUTRITION } from './demoData.js';

export interface NutritionRow {
  productName: string;
  description?: string;
  energyKj?: number;
  energyKcal?: number;
  protein?: number;
  fat?: number;
  carbohydrate?: number;
  sodium?: number;
  calcium?: number;
}

/** 官方表列顺序（真实返回的表头）：productName,nutritionDescription,energyKj,energyKcal,protein,fat,carbohydrate,sodium,calcium */
const HEADER_HINT = '{productName';

function num(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const t = String(v).trim();
  if (!t || t === 'null' || t === 'NULL' || t === '-' || t === 'nan') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * 解析 list-nutrition-foods 的真实返回：它是一段纯文本表格（非 JSON）。
 * 形如：`[160]{productName,...}:\n  中薯条,null,1210,289,4,12,38,165,18`
 */
export function parseNutritionTable(text: string): NutritionRow[] {
  if (!text || typeof text !== 'string') return [];
  const rows: NutritionRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.includes(HEADER_HINT) || line.startsWith('[')) continue; // 表头行
    const p = line.split(',');
    if (p.length < 4) continue; // 至少需要 name,desc,kj,kcal
    const name = (p[0] || '').trim();
    if (!name) continue;
    rows.push({
      productName: name,
      description: p[1] && p[1].trim() !== 'null' ? p[1].trim() : undefined,
      energyKj: num(p[2]),
      energyKcal: num(p[3]),
      protein: num(p[4]),
      fat: num(p[5]),
      carbohydrate: num(p[6]),
      sodium: num(p[7]),
      calcium: num(p[8]),
    });
  }
  return rows;
}

/** 名称归一化：去掉括号/空格/连字符等噪声，并去掉尾部计量词与套餐标记，便于“规格对齐”匹配。 */
export function normalizeName(s: string): string {
  let t = (s || '').replace(/[（）()【】\[\]<>《》""''""''·、,，.。:：\-—_/\s]/g, '');
  // 尾部计量词、容器、套餐标记：先剥“组合”等套餐后缀，再剥 杯/盒装/罐/瓶/份/个/块/包。
  t = t.replace(/(组合|套餐|超值|精选|随心配|风味|常规)$/g, '');
  t = t.replace(/(杯|盒装|罐|瓶|份|个|块|包|只|根|片)$/g, '');
  return t.toLowerCase();
}

const SIZE_WORDS = ['大', '中', '小', '迷你'];

/**
 * 名称候选键：在归一化基础上，对“规格位置”和“堡/汉堡”两种系统性错位生成等价键。
 *  - 规格位置互换：表用“大薯条”、菜单用“薯条（大）”→ 互相生成对方，避免份量错位；
 *    注意只“换位置”不“去份量”，以免把大/中/小薯条混为同一份。
 *  - 堡/汉堡：菜单“麦辣鸡腿堡”与表“麦辣鸡腿汉堡”互认，不改动其他字符。
 * 不做“名称相似即认定”，同名但份量不同仍视为不同。
 */
export function nameCandidates(s: string): string[] {
  const base = normalizeName(s);
  const cands = new Set<string>([base]);
  if (!base) return [base];
  for (const sz of SIZE_WORDS) {
    if (base.startsWith(sz)) cands.add(base.slice(sz.length) + sz); // 大薯条 -> 薯条大
    if (base.endsWith(sz)) cands.add(sz + base.slice(0, base.length - sz.length)); // 薯条大 -> 大薯条
  }
  if (base.includes('汉堡')) cands.add(base.replace('汉堡', '堡'));
  else if (base.includes('堡')) cands.add(base.replace('堡', '汉堡'));
  return [...cands];
}

/** 建立 归一化名称 -> 行 的索引；每行同时登记其候选键（同名保留首次出现）。 */
export function buildIndex(rows: NutritionRow[]): Map<string, NutritionRow> {
  const m = new Map<string, NutritionRow>();
  for (const r of rows) {
    for (const k of nameCandidates(r.productName)) {
      if (k && !m.has(k)) m.set(k, r);
    }
  }
  return m;
}

/**
 * 按名称匹配营养行。先归一化完全相等，再退化为候选键（规格位置/堡汉堡互认），
 * 不匹配不同份量、不做“名称相似即认定”。
 */
export function matchRow(productName: string, index: Map<string, NutritionRow>): NutritionRow | null {
  for (const k of nameCandidates(productName)) {
    const r = index.get(k);
    if (r) return r;
  }
  return null;
}

/** 取 kcal：优先 kcal，仅 kJ 时按 4.184 换算；都没有则 undefined（不填 0）。 */
export function toKcal(row: NutritionRow | null): number | undefined {
  if (!row) return undefined;
  if (row.energyKcal != null) return row.energyKcal;
  if (row.energyKj != null) return Math.round((row.energyKj / 4.184) * 10) / 10;
  return undefined;
}

export interface NutrientTotals {
  energyKcal?: number;
  protein?: number;
  fat?: number;
  carbohydrate?: number;
  sodium?: number;
  /** 糖：官方表未提供，恒为 undefined（界面显示“暂无数据”），绝不由碳水推算。 */
  sugar?: number;
  calcium?: number;
}

export interface ItemNutrition {
  productCode: string;
  productName: string;
  matched: boolean;
  /** 套餐按组成项展开时不重复计入套餐本身 */
  expandedFromCombo?: boolean;
  perUnit?: NutrientTotals;
  quantity: number;
}

export interface MealNutrition {
  totals: NutrientTotals;
  /** 覆盖情况：matched/total（按“可计量的餐品项”计） */
  coverage: { matched: number; total: number; missingNames: string[] };
  /** 是否为“已知部分合计”（存在未匹配项） */
  partial: boolean;
  /** 含特制（如去酱）但无对应营养数据 */
  modificationUnknown: boolean;
  /** 是否使用了历史餐单（需标明资料口径） */
  usesHistoryItems: boolean;
  demo: boolean;
  items: ItemNutrition[];
  note: string;
}

function emptyTotals(): NutrientTotals {
  return { sugar: undefined, calcium: undefined };
}

function addTotals(a: NutrientTotals, b: NutrientTotals | undefined, qty: number): NutrientTotals {
  if (!b) return a;
  // 逐项累加：缺失项按 0 计入该项合计，但“整餐是否完整”由 coverage 单独表达（不冒充整餐总量）。
  const safe = (x?: number, y?: number) => (x ?? 0) + (y ?? 0) * qty;
  return {
    energyKcal: a.energyKcal == null && b.energyKcal == null ? undefined : safe(a.energyKcal, b.energyKcal),
    protein: a.protein == null && b.protein == null ? undefined : safe(a.protein, b.protein),
    fat: a.fat == null && b.fat == null ? undefined : safe(a.fat, b.fat),
    carbohydrate: a.carbohydrate == null && b.carbohydrate == null ? undefined : safe(a.carbohydrate, b.carbohydrate),
    sodium: a.sodium == null && b.sodium == null ? undefined : safe(a.sodium, b.sodium),
    calcium: a.calcium == null && b.calcium == null ? undefined : safe(a.calcium, b.calcium),
    sugar: undefined, // 官方无糖数据
  };
}

function rowToTotals(row: NutritionRow | null): NutrientTotals | undefined {
  if (!row) return undefined;
  return {
    energyKcal: toKcal(row),
    protein: row.protein,
    fat: row.fat,
    carbohydrate: row.carbohydrate,
    sodium: row.sodium,
    calcium: row.calcium,
    sugar: undefined,
  };
}

/**
 * 计算一餐的营养合计。
 * - 套餐：只累计 comboItemList 的组成项，不重复计入套餐本身；
 *   若套餐没有组成信息，则该套餐记为未匹配（不能凭空拆）。
 * - 数量：按 quantity 累加。
 * - 缺失：未匹配的项完全不计入 totals（不是 0），并记入 missingNames。
 */
export function computeMealNutrition(
  items: MealItem[],
  index: Map<string, NutritionRow>,
  opts: { demo?: boolean } = {}
): MealNutrition {
  let totals = emptyTotals();
  const out: ItemNutrition[] = [];
  const missingNames: string[] = [];
  let matched = 0;
  let total = 0;
  let modificationUnknown = false;
  let usesHistoryItems = false;

  for (const it of items) {
    if (it.modification?.values?.length) modificationUnknown = true;
    if (it.source?.isHistory) usesHistoryItems = true;

    const comps = it.comboItemList && it.comboItemList.length > 0 ? it.comboItemList : null;
    if (comps) {
      // 套餐：展开组成项，套餐本身不再单独匹配
      for (const c of comps) {
        total++;
        const row = matchRow(c.name, index);
        if (row) {
          matched++;
          totals = addTotals(totals, rowToTotals(row), c.quantity * (it.quantity || 1));
          out.push({
            productCode: c.productCode,
            productName: c.name,
            matched: true,
            expandedFromCombo: true,
            perUnit: rowToTotals(row),
            quantity: c.quantity * (it.quantity || 1),
          });
        } else {
          missingNames.push(c.name);
          out.push({ productCode: c.productCode, productName: c.name, matched: false, expandedFromCombo: true, quantity: c.quantity * (it.quantity || 1) });
        }
      }
      continue;
    }

    total++;
    const row = matchRow(it.productName, index);
    if (row) {
      matched++;
      totals = addTotals(totals, rowToTotals(row), it.quantity || 1);
      out.push({ productCode: it.productCode, productName: it.productName, matched: true, perUnit: rowToTotals(row), quantity: it.quantity || 1 });
    } else {
      missingNames.push(it.productName);
      out.push({ productCode: it.productCode, productName: it.productName, matched: false, quantity: it.quantity || 1 });
    }
  }

  const partial = total > 0 && matched < total;
  const notes: string[] = [];
  notes.push(opts.demo ? '演示数据（虚构餐单按演示营养表估算）' : '数据来源：麦当劳官方营养资料（list-nutrition-foods），按“每份”计量');
  if (usesHistoryItems) notes.push('历史餐单按当前营养资料估算，不代表当时的实际摄入');
  if (modificationUnknown) notes.push('含特制选项，特制后的营养变化未知（未编造增减值）');
  if (partial) notes.push(`已知部分合计：${matched}/${total} 项已匹配，未匹配项不计入合计`);

  return {
    totals,
    coverage: { matched, total, missingNames },
    partial,
    modificationUnknown,
    usesHistoryItems,
    demo: !!opts.demo,
    items: out,
    note: notes.join('；'),
  };
}

/** 比较两个合计的差异（仅对“双方都有数据”的指标给出差值）。 */
export function diffTotals(
  from: NutrientTotals,
  to: NutrientTotals
): Partial<Record<keyof NutrientTotals, number | undefined>> {
  const d = (a?: number, b?: number) => (a == null || b == null ? undefined : Math.round((b - a) * 10) / 10);
  return {
    energyKcal: d(from.energyKcal, to.energyKcal),
    protein: d(from.protein, to.protein),
    fat: d(from.fat, to.fat),
    carbohydrate: d(from.carbohydrate, to.carbohydrate),
    sodium: d(from.sodium, to.sodium),
    calcium: d(from.calcium, to.calcium),
    sugar: undefined,
  };
}

/** 判断两个合计是否“可比较”：双方在该指标上都有数据，否则不能给出精确差值。 */
export function comparable(a: NutrientTotals, b: NutrientTotals, key: keyof NutrientTotals): boolean {
  return a[key] != null && b[key] != null;
}

// ---------------------------------------------------------------------------
// 拉取与缓存
// ---------------------------------------------------------------------------
let cache: { at: number; rows: NutritionRow[]; demo: boolean } | null = null;
const TTL_MS = 6 * 3600 * 1000;

export interface NutritionIndex {
  index: Map<string, NutritionRow>;
  rows: NutritionRow[];
  demo: boolean;
}

/** 取营养索引：演示模式用演示表，真实模式用已缓存的官方表。 */
export function getNutritionIndex(demo: boolean): NutritionIndex {
  if (demo) return { index: buildIndex(DEMO_NUTRITION), rows: DEMO_NUTRITION, demo: true };
  if (cache && Date.now() - cache.at < TTL_MS) return { index: buildIndex(cache.rows), rows: cache.rows, demo: false };
  return { index: new Map(), rows: [], demo: false };
}

/** 真实缓存是否已就绪（未就绪时由编排层先拉取 list-nutrition-foods）。 */
export function hasRealNutritionCache(): boolean {
  return !!(cache && Date.now() - cache.at < TTL_MS);
}

/** 用真实 MCP 返回的文本填充缓存。 */
export function setNutritionCacheFromText(text: string): NutritionRow[] {
  const rows = parseNutritionTable(text);
  cache = { at: Date.now(), rows, demo: false };
  return rows;
}

export function clearNutritionCache(): void {
  cache = null;
}
