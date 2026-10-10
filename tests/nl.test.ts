import { describe, it, expect } from 'vitest';
import { parseInstruction, applyOps, type CatalogItem, type MealItem } from '../apps/server/src/nl.js';

const catalog: CatalogItem[] = [
  { productCode: 'C1', productName: '巨无霸套餐', category: '套餐' },
  { productCode: 'C2', productName: '麦辣鸡腿堡套餐', category: '套餐' },
  { productCode: 'D1', productName: '可乐（中）', category: '饮料' },
  { productCode: 'D2', productName: '美式咖啡', category: '饮料' },
  { productCode: 'S1', productName: '中薯条', category: '小食' },
  { productCode: 'Y1', productName: '玉米杯', category: '小食' },
];

describe('自然语言解析', () => {
  it('替换：可乐换成美式咖啡', () => {
    const r = parseInstruction('可乐换成美式咖啡', catalog);
    expect(r.ops).toHaveLength(1);
    expect(r.ops[0].type).toBe('replace');
  });

  it('加：加一个玉米杯', () => {
    const r = parseInstruction('加一个玉米杯', catalog);
    expect(r.ops[0].type).toBe('add');
  });

  it('移除：不要中薯条', () => {
    const r = parseInstruction('不要中薯条', catalog);
    expect(r.ops[0].type).toBe('remove');
  });

  it('数量：巨无霸套餐来2个', () => {
    const r = parseInstruction('巨无霸套餐来2个', catalog);
    expect(r.ops[0].type).toBe('setQty');
    expect((r.ops[0] as any).quantity).toBe(2);
  });

  it('饮料换一下 需要用户澄清', () => {
    const r = parseInstruction('饮料换一下', catalog);
    expect(r.ops).toHaveLength(0);
    expect(r.clarification).toBeTruthy();
    expect((r.clarification!.options ?? []).length).toBeGreaterThan(0);
  });

  it('空输入需要澄清', () => {
    const r = parseInstruction('', catalog);
    expect(r.clarification).toBeTruthy();
  });

  it('无法识别时返回澄清，绝不伪装理解', () => {
    const r = parseInstruction('今天天气真好', catalog);
    expect(r.ops).toHaveLength(0);
    expect(r.clarification).toBeTruthy();
  });
});

describe('applyOps 应用修改', () => {
  const base: MealItem[] = [{ productCode: 'D1', productName: '可乐（中）', quantity: 1 }];

  it('add 新增不存在的商品', () => {
    const next = applyOps(base, [{ type: 'add', productCode: 'Y1', productName: '玉米杯', quantity: 1 }]);
    expect(next.find((i) => i.productCode === 'Y1')).toBeTruthy();
  });

  it('remove 删除已有商品', () => {
    const next = applyOps(base, [{ type: 'remove', productCode: 'D1', productName: '可乐（中）' }]);
    expect(next.find((i) => i.productCode === 'D1')).toBeUndefined();
  });

  it('setQty 修改数量', () => {
    const next = applyOps(base, [{ type: 'setQty', productCode: 'D1', productName: '可乐（中）', quantity: 3 }]);
    expect(next[0].quantity).toBe(3);
  });

  it('replace 替换商品编码与名称', () => {
    const next = applyOps(base, [
      { type: 'replace', fromCode: 'D1', fromName: '可乐（中）', toCode: 'D2', toName: '美式咖啡' },
    ]);
    expect(next[0].productCode).toBe('D2');
    expect(next[0].productName).toBe('美式咖啡');
  });

  it('modify 增加特制选项', () => {
    const next = applyOps(base, [
      { type: 'modify', productCode: 'D1', productName: '可乐（中）', code: 'M_NOICE', key: 'ice', name: '去冰' },
    ]);
    expect(next[0].modification?.values[0].code).toBe('M_NOICE');
  });
});
