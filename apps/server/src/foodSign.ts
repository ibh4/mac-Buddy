// 今日食签：有仪式感的每日餐单灵感。
// 定位：基于偏好与真实菜单的娱乐推荐；不使用黄历/生肖/星座/八字/财运/转运逻辑。
// 评分采用可配置启发式权重（收藏40 / 意图30 / 差异20 / 口味10），缺数据时忽略该项并重新归一化。
// 纯函数 + 注入目录/偏好/最近记录；候选在本地确定性构建，种子可复现（“换一份灵感”只推进种子）。

import type { MealItem } from './types.js';
import type { CatalogItem } from './catalog.js';
import { generateRandom, buildCandidates, hashString, mulberry32, pickWeightedIndex, type RandomCandidate } from './randomPicker.js';

export type SignIntent = 'keep' | 'slight' | 'new';
export type MealPeriod = 'breakfast' | 'lunch' | 'dinner' | 'any';

export interface SignPreference {
  /** 主动收藏 / 明确喜欢的商品编码 */
  favorites: string[];
  /** 用户主动设定的口味标签：code -> 标签列表（仅来自官方返回或用户标注） */
  tasteTags: Record<string, string[]>;
  /** 明确排除 / 不再推荐的商品编码（硬排除） */
  exclusions: string[];
  /** 锁定商品编码（硬约束） */
  locks: string[];
}

const YI_PHRASES = [
  '老样子微微调', '保留最爱，换个配角', '发现一种新搭配', '今天少一份负担', '把喜欢的加到两份',
  '给饮料换个心情', '主食不变，小食尝新', '熟悉里的一点新鲜',
];
const SIGN_SIGNATURES = [
  '熟悉里的一点新鲜', '今日宜：保留最爱', '小小的改变，刚刚好', '老样子，也可以有新意思', '照旧，但更合今天',
];

export interface DailySignInput {
  localAnonId: string;
  dateCN: string; // YYYY-MM-DD（Asia/Shanghai）
  storeCode: string;
  mealPeriod: MealPeriod;
  intent: SignIntent;
  catalog: CatalogItem[];
  savedMeals?: MealItem[][];
  baseMeal?: MealItem[];
  recentCodes?: string[];
  preference: SignPreference;
  budgetCap?: number;
  sellableSet?: Set<string>;
  /** 偏好版本（用于缓存失效）：传入偏好的哈希 */
  prefVersion: string;
  prevPickId?: string;
  seedNonce?: number;
}

export interface DailySignResult {
  candidates: RandomCandidate[];
  picked: RandomCandidate | null;
  seedUsed: number;
  yiText: string;
  signSignature: string;
  scores: number[];
}

function intentToNovelty(intent: SignIntent): 'familiar' | 'slight' | 'more' {
  return intent === 'keep' ? 'familiar' : intent === 'new' ? 'more' : 'slight';
}

function scoreSign(c: RandomCandidate, input: DailySignInput): number {
  const codes = c.items.map((i) => i.productCode);
  const n = codes.length || 1;
  const favSet = new Set(input.preference.favorites);
  const recent = new Set(input.recentCodes || []);
  const savedFlat = new Set((input.savedMeals || []).flat().map((i) => i.productCode));

  const favFraction = codes.filter((c2) => favSet.has(c2)).length / n;
  const overlapSaved = codes.filter((c2) => savedFlat.has(c2)).length / n;
  const diffFraction = codes.filter((c2) => !recent.has(c2)).length / n;
  const keepFraction = overlapSaved;

  // 口味匹配：商品命中用户口味标签的比例（标签仅来自官方/用户标注）
  const tasteFraction =
    codes.filter((c2) => (input.preference.tasteTags[c2] || []).length > 0).length / n;
  const tasteAvailable = Object.keys(input.preference.tasteTags).length > 0;

  const components: { w: number; v: number }[] = [];
  if (input.preference.favorites.length) components.push({ w: 40, v: favFraction });
  if (input.intent === 'keep') components.push({ w: 30, v: keepFraction });
  else components.push({ w: 30, v: diffFraction });
  components.push({ w: 20, v: diffFraction });
  if (tasteAvailable) components.push({ w: 10, v: tasteFraction });

  const wsum = components.reduce((a, b) => a + b.w, 0) || 1;
  return components.reduce((acc, c) => acc + (c.v * (c.w / wsum) * 100), 0);
}

export function generateDailySign(input: DailySignInput, seedNonce = 0): DailySignResult {
  const candidates = buildCandidates({
    mode: input.intent === 'keep' ? 'fromSaved' : input.intent === 'new' ? 'new' : 'keepMain',
    localAnonId: input.localAnonId,
    catalog: input.catalog,
    locks: input.preference.locks,
    budgetCap: input.budgetCap,
    peopleCount: 1,
    excludeCodes: input.preference.exclusions,
    recentCodes: input.recentCodes,
    novelty: intentToNovelty(input.intent),
    savedMeals: input.savedMeals,
    baseMeal: input.baseMeal,
  });

  if (candidates.length === 0) {
    return { candidates: [], picked: null, seedUsed: 0, yiText: '', signSignature: '', scores: [] };
  }

  const scores = candidates.map((c) => scoreSign(c, input));
  const seedInput = `sign|${input.localAnonId}|${input.dateCN}|${input.storeCode}|${input.mealPeriod}|${input.intent}|${input.prefVersion}|${candidates.map((c) => c.id).join(',')}|${seedNonce}`;
  const seedUsed = hashString(seedInput) >>> 0;
  const rng = mulberry32(seedUsed);

  let idx = pickWeightedIndex(rng, scores);
  if (seedNonce > 0 && input.prevPickId && candidates[idx].id === input.prevPickId && candidates.length > 1) {
    idx = (idx + 1) % candidates.length;
  }
  const yiText = YI_PHRASES[Math.floor(rng() * YI_PHRASES.length) % YI_PHRASES.length];
  const signSignature = SIGN_SIGNATURES[Math.floor(rng() * SIGN_SIGNATURES.length) % SIGN_SIGNATURES.length];

  return { candidates, picked: candidates[idx], seedUsed, yiText, signSignature, scores };
}
