import { describe, it, expect } from 'vitest';
import {
  parseNutritionTable,
  normalizeName,
  buildIndex,
  matchRow,
  toKcal,
  computeMealNutrition,
  diffTotals,
  comparable,
} from '../apps/server/src/nutrition.js';
import type { MealItem } from '../apps/server/src/types.js';

// 与真实 list-nutrition-foods 返回格式一致的文本表格
const REAL_TEXT = `[160]{productName,nutritionDescription,energyKj,energyKcal,protein,fat,carbohydrate,sodium,calcium}:
  猪柳麦满分,null,1288,308,16,16,24,781,213
  中薯条,null,1210,289,4,12,38,165,18
  可乐中杯,null,616,147,0,0,36,0,10
  巨无霸,null,2146,513,27,26,42,961,171
  麦辣鸡翅-2块,null,937,224,13,15,9,537,13
  圆筒冰淇淋,null,391,93,2,3,14,36,77
  大杯鲜萃咖啡,null,54,13,1,0,0,3,8`;

describe('parseNutritionTable 解析官方文本表', () => {
  it('跳过表头并按列解析', () => {
    const rows = parseNutritionTable(REAL_TEXT);
    expect(rows.length).toBe(7);
    expect(rows[0].productName).toBe('猪柳麦满分');
    expect(rows[1].energyKj).toBe(1210);
    expect(rows[1].energyKcal).toBe(289);
    expect(rows[1].sodium).toBe(165);
  });

  it('空/异常输入返回空数组', () => {
    expect(parseNutritionTable('')).toEqual([]);
    expect(parseNutritionTable(null as any)).toEqual([]);
  });
});

describe('normalizeName 规格对齐', () => {
  it('括号与杯等量词归一化后可匹配', () => {
    expect(normalizeName('可乐（中）')).toBe(normalizeName('可乐中杯'));
    expect(normalizeName('麦辣鸡翅（2块）')).toBe(normalizeName('麦辣鸡翅-2块'));
  });
});

describe('toKcal 单位换算', () => {
  it('优先 kcal', () => {
    expect(toKcal({ productName: 'x', energyKj: 1210, energyKcal: 289 })).toBe(289);
  });
  it('仅有 kJ 时按 4.184 换算', () => {
    expect(toKcal({ productName: 'x', energyKj: 4184 })).toBe(1000);
  });
  it('都没有时返回 undefined（不填 0）', () => {
    expect(toKcal({ productName: 'x' })).toBeUndefined();
  });
});

describe('computeMealNutrition 汇总口径', () => {
  const index = buildIndex(parseNutritionTable(REAL_TEXT));

  const fries: MealItem = { productCode: 'FR01', productName: '中薯条', quantity: 1 };
  const coke: MealItem = { productCode: 'DR01', productName: '可乐（中）', quantity: 1 };

  it('按数量累加', () => {
    const r = computeMealNutrition([{ ...fries, quantity: 2 }], index);
    expect(r.totals.energyKcal).toBe(578);
    expect(r.totals.protein).toBe(8);
  });

  it('套餐只计组成项，不重复计入套餐本身', () => {
    const combo: MealItem = {
      productCode: 'MC001',
      productName: '巨无霸套餐',
      quantity: 1,
      comboItemList: [
        { productCode: 'MA01', name: '巨无霸', quantity: 1 },
        { productCode: 'FR01', name: '中薯条', quantity: 1 },
        { productCode: 'DR01', name: '可乐中杯', quantity: 1 },
      ],
    };
    const r = computeMealNutrition([combo], index);
    // 513 + 289 + 147 = 949，套餐本身（表中无“巨无霸套餐”）不应额外计入
    expect(r.totals.energyKcal).toBe(949);
    expect(r.coverage).toEqual({ matched: 3, total: 3, missingNames: [] });
  });

  it('未匹配项不计入合计，并给出覆盖情况', () => {
    const unknown: MealItem = { productCode: 'XX', productName: '不存在的餐品', quantity: 1 };
    const r = computeMealNutrition([fries, unknown], index);
    expect(r.coverage).toEqual({ matched: 1, total: 2, missingNames: ['不存在的餐品'] });
    expect(r.partial).toBe(true);
    // 未匹配项贡献为 0，且合计仅来自已匹配项
    expect(r.totals.energyKcal).toBe(289);
    expect(r.note).toContain('已知部分合计');
  });

  it('缺失数据为 undefined 而非 0（糖恒为暂无数据）', () => {
    const r = computeMealNutrition([fries, coke], index);
    expect(r.totals.sugar).toBeUndefined();
    expect(r.totals.energyKcal).toBe(436);
  });

  it('碳水不是糖、钠不是盐：分别给出', () => {
    const r = computeMealNutrition([fries], index);
    expect(r.totals.carbohydrate).toBe(38);
    expect(r.totals.sodium).toBe(165);
    expect(r.totals.sugar).toBeUndefined();
  });

  it('含特制时标注“营养变化未知”', () => {
    const withMod: MealItem = {
      ...fries,
      modification: { values: [{ code: 'M1', key: '去酱', quantity: 1 }] },
    };
    const r = computeMealNutrition([withMod], index);
    expect(r.modificationUnknown).toBe(true);
    expect(r.note).toContain('特制后的营养变化未知');
  });

  it('历史餐单标明资料口径', () => {
    const hist: MealItem = { ...fries, source: { orderId: 'O1', isHistory: true } };
    const r = computeMealNutrition([hist], index);
    expect(r.usesHistoryItems).toBe(true);
    expect(r.note).toContain('不代表当时的实际摄入');
  });
});

describe('diffTotals / comparable', () => {
  it('双方都有数据时给出差值', () => {
    const d = diffTotals({ energyKcal: 500, sodium: 100 }, { energyKcal: 400, sodium: 120 });
    expect(d.energyKcal).toBe(-100);
    expect(d.sodium).toBe(20);
  });
  it('任一方缺失时差值为 undefined（不给出精确差值）', () => {
    const d = diffTotals({ energyKcal: 500 }, { energyKcal: undefined });
    expect(d.energyKcal).toBeUndefined();
  });
  it('comparable 判定可比较性', () => {
    expect(comparable({ energyKcal: 1 }, { energyKcal: 2 }, 'energyKcal')).toBe(true);
    expect(comparable({ energyKcal: 1 }, { energyKcal: undefined }, 'energyKcal')).toBe(false);
  });
});

describe('matchRow 不做模糊匹配', () => {
  it('名称相似但规格不同不认定为同一份量', () => {
    const index = buildIndex(parseNutritionTable(REAL_TEXT));
    // 表里有“中薯条”，没有“大薯条”
    expect(matchRow('中薯条', index)).not.toBeNull();
    expect(matchRow('大薯条', index)).toBeNull();
  });
});
