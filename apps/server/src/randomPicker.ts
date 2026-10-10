// 带权随机抽取（受约束的真实菜单抽取）。
// 关键性质：
//  - 纯函数 + 注入目录 / 可售集合 / 锁定 / 排除 / 最近记录，便于测试，不主动调用 MCP；
//  - 候选集合先在本地确定性构建，“换一个”只推进抽取种子，不反复调用 MCP；
//  - 相同种子 + 相同输入可复现（验收要求 5）；存在其他候选时“换一个”避免立即重复（验收 7）。

import type { MealItem } from './types.js';
import type { CatalogItem } from './catalog.js';
import { classify, priceOf, totalPrice } from './catalog.js';
import type { DetailProvider } from './tweak.js';

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickWeightedIndex(rng: () => number, weights: number[]): number {
  const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return Math.floor(rng() * weights.length) % weights.length;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    const w = Math.max(0, weights[i]);
    if (r < w) return i;
    r -= w;
  }
  return weights.length - 1;
}

export interface RandomCandidate {
  id: string;
  items: MealItem[];
  reason: string;
  source: 'saved' | 'built' | 'variation';
  total: number;
  signature: string;
}

export interface RandomInput {
  mode: 'fromSaved' | 'keepMain' | 'new';
  localAnonId: string;
  catalog: CatalogItem[];
  /** 用户已保存的餐单（用于“老样子里随机”） */
  savedMeals?: MealItem[][];
  /** 当前/基础餐单（用于“保留主角，随机配角”） */
  baseMeal?: MealItem[];
  locks: string[];
  budgetCap?: number;
  peopleCount?: number;
  excludeCodes?: string[];
  recentCodes?: string[];
  novelty?: 'familiar' | 'slight' | 'more';
  sellableSet?: Set<string>;
  detail?: DetailProvider;
  /** 上一次抽中的候选 id，用于“换一个”避免立即重复 */
  prevPickId?: string;
}

function cloneItems(items: MealItem[]): MealItem[] {
  return items.map((i) => ({
    ...i,
    comboItemList: i.comboItemList?.map((c) => ({ ...c })),
    modification: i.modification ? { values: i.modification.values.map((v) => ({ ...v })) } : undefined,
    source: i.source ? { ...i.source } : undefined,
  }));
}

function scaleForPeople(items: MealItem[], peopleCount: number): MealItem[] {
  const n = Math.max(1, Math.floor(peopleCount || 1));
  if (n === 1) return items;
  return items.map((i) => ({ ...i, quantity: i.quantity * n }));
}

function sig(items: MealItem[]): string {
  return items.map((i) => `${i.productCode}:${i.quantity}`).join('|');
}

function eligible(catalog: CatalogItem[], code: string, locks: string[], exclude: Set<string>, sellable?: Set<string>): boolean {
  if (locks.includes(code) || exclude.has(code)) return false;
  if (sellable && !sellable.has(code)) return false;
  return true;
}

function buildStructuredCombo(
  catalog: CatalogItem[],
  opts: { locks: string[]; exclude: Set<string>; sellable?: Set<string>; recentCodes?: string[]; novelty: 'familiar' | 'slight' | 'more'; mainBias?: string }
): MealItem[] | null {
  const mains = catalog.filter((c) => classify(c) === 'main' && eligible(catalog, c.productCode, opts.locks, opts.exclude, opts.sellable));
  const drinks = catalog.filter((c) => classify(c) === 'drink' && eligible(catalog, c.productCode, opts.locks, opts.exclude, opts.sellable));
  const snacks = catalog.filter((c) => classify(c) === 'snack' && eligible(catalog, c.productCode, opts.locks, opts.exclude, opts.sellable));
  if (mains.length === 0 || drinks.length === 0 || snacks.length === 0) return null;
  // 主料优先指定 bias（用于遍历不同主料），否则取第一个
  let main = opts.mainBias ? mains.find((m) => m.productCode === opts.mainBias) : mains[0];
  if (!main) main = mains[0];
  const pickByNovelty = (pool: CatalogItem[]): CatalogItem => {
    const recent = new Set(opts.recentCodes || []);
    const preferred = pool.filter((c) => (opts.novelty === 'more' ? !recent.has(c.productCode) : opts.novelty === 'familiar' ? recent.has(c.productCode) : true));
    const src = preferred.length ? preferred : pool;
    // 确定性：按编码排序取第一个，保证可复现
    return [...src].sort((a, b) => a.productCode.localeCompare(b.productCode))[0];
  };
  const drink = pickByNovelty(drinks);
  const snack = pickByNovelty(snacks);
  const mainClone = cloneItems([{ productCode: main.productCode, productName: main.productName, quantity: 1, comboItemList: main.comboItemList?.map((c) => ({ ...c })), source: { isHistory: false } }])[0];
  const result: MealItem[] = [
    mainClone,
    { productCode: drink.productCode, productName: drink.productName, quantity: 1, source: { isHistory: false } },
    { productCode: snack.productCode, productName: snack.productName, quantity: 1, source: { isHistory: false } },
  ];
  return result;
}

export function buildCandidates(input: RandomInput): RandomCandidate[] {
  const { catalog, locks, budgetCap, excludeCodes = [], recentCodes = [], novelty = 'slight', sellableSet, savedMeals = [], baseMeal } = input;
  const exclude = new Set(excludeCodes);
  const peopleCount = input.peopleCount || 1;
  const out: RandomCandidate[] = [];

  const withBudget = (items: MealItem[]): MealItem[] | null => {
    const scaled = scaleForPeople(items, peopleCount);
    const total = totalPrice(scaled, catalog);
    if (budgetCap != null && total > budgetCap + 1e-6) return null;
    return scaled;
  };

  const hasKeep = (items: MealItem[], keepCodes: string[]) => keepCodes.every((c) => items.some((i) => i.productCode === c));
  const keepCodes = locks; // “必须保留的商品”视作锁定处理

  if (input.mode === 'fromSaved') {
    savedMeals.forEach((meal, idx) => {
      if (!hasKeep(meal, keepCodes)) return;
      if (meal.some((i) => exclude.has(i.productCode))) return;
      const scaled = withBudget(meal);
      if (!scaled) return;
      out.push({ id: 'saved-' + idx, items: scaled, reason: '从你保存的“老样子”中随机抽的一份。', source: 'saved', total: totalPrice(scaled, catalog), signature: sig(scaled) });
    });
  } else if (input.mode === 'keepMain') {
    const base = baseMeal && baseMeal.length ? baseMeal : savedMeals[0];
    if (!base) return out;
    // 锁定主料，逐个替换一个配角（饮料/小食）生成变体
    const mainCodes = new Set(base.filter((i) => classify(catalog.find((c) => c.productCode === i.productCode) || ({ productName: i.productName } as CatalogItem)) === 'main').map((i) => i.productCode));
    const sides = base.filter((i) => !mainCodes.has(i.productCode) && !locks.includes(i.productCode));
    let variant = 0;
    for (const side of sides) {
      const cls = classify(catalog.find((c) => c.productCode === side.productCode) || ({ productName: side.productName } as CatalogItem));
      const pool = catalog.filter((c) => classify(c) === cls && eligible(catalog, c.productCode, locks, exclude, sellableSet) && c.productCode !== side.productCode);
      const rep = [...pool].sort((a, b) => a.productCode.localeCompare(b.productCode))[0];
      if (!rep) continue;
      const next = cloneItems(base).map((i) => (i.productCode === side.productCode ? { ...i, productCode: rep.productCode, productName: rep.productName } : i));
      const scaled = withBudget(next);
      if (!scaled) continue;
      out.push({ id: 'variation-' + variant++, items: scaled, reason: `保留你锁定的主角，把「${side.productName}」换成了「${rep.productName}」。`, source: 'variation', total: totalPrice(scaled, catalog), signature: sig(scaled) });
    }
    // 若没有任何可替换配角，退回：整份作为候选
    if (out.length === 0) {
      const scaled = withBudget(base);
      if (scaled) out.push({ id: 'variation-base', items: scaled, reason: '当前餐单无可替换的配角，按原样推荐。', source: 'variation', total: totalPrice(scaled, catalog), signature: sig(scaled) });
    }
  } else {
    // today try something new：遍历不同主料，构建结构化合餐
    const mains = catalog.filter((c) => classify(c) === 'main' && eligible(catalog, c.productCode, locks, exclude, sellableSet));
    for (const m of mains.slice(0, 6)) {
      const combo = buildStructuredCombo(catalog, { locks, exclude, sellable: sellableSet, recentCodes, novelty, mainBias: m.productCode });
      if (!combo) continue;
      const scaled = withBudget(combo);
      if (!scaled) continue;
      out.push({ id: 'built-' + m.productCode, items: scaled, reason: `为你搭配了一份以「${m.productName}」为主、与近期有所不同的组合。`, source: 'built', total: totalPrice(scaled, catalog), signature: sig(scaled) });
    }
  }
  return out;
}

function scoreCandidate(c: RandomCandidate, input: RandomInput): number {
  let s = 1;
  const recent = new Set(input.recentCodes || []);
  const codes = c.items.map((i) => i.productCode);
  const overlap = codes.filter((c2) => recent.has(c2)).length;
  if (input.novelty === 'more') s += (codes.length - overlap) * 1.5;
  else if (input.novelty === 'familiar') s += overlap * 1.5;
  else s += (codes.length - overlap) * 0.5 + overlap * 0.5; // slight
  if (input.mode === 'fromSaved' && c.source === 'saved') s += 0.5;
  return s;
}

export interface RandomResult {
  candidates: RandomCandidate[];
  picked: RandomCandidate | null;
  seedUsed: number;
}

/** 生成随机候选并基于种子抽取一个。seedNonce 每次“换一个”自增以保证复现与避免立即重复。 */
export function generateRandom(input: RandomInput, seedNonce = 0): RandomResult {
  const candidates = buildCandidates(input);
  if (candidates.length === 0) return { candidates: [], picked: null, seedUsed: 0 };
  const seedInput = `${input.localAnonId}|${input.mode}|${input.novelty}|${Math.round(input.budgetCap || 0)}|${input.peopleCount || 1}|${[...input.locks].sort().join(',')}|${[...input.excludeCodes || []].sort().join(',')}|${[...input.recentCodes || []].sort().join(',')}|${candidates.map((c) => c.id).join(',')}|${seedNonce}`;
  const baseSeed = hashString(seedInput);
  const seedUsed = (baseSeed + Math.imul(seedNonce + 1, 2654435761)) >>> 0;
  const rng = mulberry32(seedUsed);
  const weights = candidates.map((c) => scoreCandidate(c, input));

  let idx = pickWeightedIndex(rng, weights);
  // 避免与上次立即重复
  if (seedNonce > 0 && input.prevPickId && candidates[idx].id === input.prevPickId && candidates.length > 1) {
    idx = (idx + 1) % candidates.length;
  }
  return { candidates, picked: candidates[idx], seedUsed };
}
