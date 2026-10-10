import type { MealItem } from './types.js';

// 范围明确的中文点餐指令解析。可选适配器：输出必须经过校验才能应用到餐单。
// 无法识别时返回 clarification，由前端引导用户选择，绝不伪装理解成功。

export type MealOp =
  | { type: 'add'; productCode: string; productName: string; quantity: number }
  | { type: 'remove'; productCode: string; productName: string }
  | { type: 'setQty'; productCode: string; productName: string; quantity: number }
  | { type: 'replace'; fromCode: string; fromName: string; toCode: string; toName: string }
  | { type: 'modify'; productCode: string; productName: string; code: string; key: string; name: string };

export interface ParseResult {
  ops: MealOp[];
  clarification?: { message: string; options?: string[] };
}

export interface CatalogItem {
  productCode: string;
  productName: string;
  category?: string;
  modifications?: { code: string; key: string; name: string }[];
}

function findByName(catalog: CatalogItem[], name: string): CatalogItem | undefined {
  const n = name.trim();
  return catalog.find((c) => c.productName === n || c.productName.includes(n) || n.includes(c.productName));
}

function findDrink(catalog: CatalogItem[]): CatalogItem[] {
  return catalog.filter((c) => (c.category || '').includes('饮料'));
}

export function parseInstruction(text: string, catalog: CatalogItem[]): ParseResult {
  const t = (text || '').trim();
  if (!t) return { ops: [], clarification: { message: '请输入想做的修改，例如“饮料换一下”或“加一个玉米杯”。' } };

  const ops: MealOp[] = [];
  let clarification: ParseResult['clarification'];

  // 替换：X 换成 Y / 把 X 换成 Y
  const replaceMatch = t.match(/(?:把)?(.+?)(?:换(?:成|为)|→|->)(.+)/);
  if (replaceMatch) {
    const from = findByName(catalog, replaceMatch[1]);
    const to = findByName(catalog, replaceMatch[2]);
    if (from && to && from.productCode !== to.productCode) {
      ops.push({ type: 'replace', fromCode: from.productCode, fromName: from.productName, toCode: to.productCode, toName: to.productName });
      return { ops };
    }
  }

  // “饮料换一下 / 换个饮料 / 换饮料”：需要用户指定换成哪种饮料
  if (/(饮料|喝的|饮品).*(换|改|来个)|换.{0,2}(饮料|喝的|饮品)/.test(t)) {
    const drinks = findDrink(catalog);
    return {
      ops: [],
      clarification: {
        message: '想换成哪种饮料？',
        options: drinks.map((d) => d.productName),
      },
    };
  }

  // 数量：X 数量改成 N / X 来 N 个 / 加 N 个 X
  const qtyMatch = t.match(/(.+?)(?:数量改成|来|要|改成)\s*(\d+)\s*(?:个|份|只)?/);
  if (qtyMatch) {
    const target = findByName(catalog, qtyMatch[1]);
    const qty = parseInt(qtyMatch[2], 10);
    if (target && qty > 0) {
      ops.push({ type: 'setQty', productCode: target.productCode, productName: target.productName, quantity: qty });
      return { ops };
    }
  }

  // 加：加一个 X / 加 X / 多一个 X
  const addMatch = t.match(/(?:加|多|添)(?:一?个|一?份|一?只)?\s*(.+)/);
  if (addMatch && /(加|多|添)/.test(t)) {
    const target = findByName(catalog, addMatch[1]);
    if (target) {
      ops.push({ type: 'add', productCode: target.productCode, productName: target.productName, quantity: 1 });
      return { ops };
    }
  }

  // 移除：不要 X / 去掉 X / 移除 X / 删掉 X
  const removeMatch = t.match(/(?:不要|去掉|移除|删掉|减)\s*(.+)/);
  if (removeMatch && /(不要|去掉|移除|删掉|减)/.test(t)) {
    const target = findByName(catalog, removeMatch[1]);
    if (target) {
      ops.push({ type: 'remove', productCode: target.productCode, productName: target.productName });
      return { ops };
    }
  }

  // 特制：去冰 / 少糖（作用于最近/首个饮料）
  const modMatch = t.match(/(去冰|少糖|不加冰|常温)/);
  if (modMatch) {
    const drinks = catalog.filter((c) => (c.category || '').includes('饮料'));
    if (drinks.length > 0) {
      const d = drinks[0];
      const code = modMatch[1] === '去冰' || modMatch[1] === '不加冰' || modMatch[1] === '常温' ? 'M_NOICE' : 'M_LESSSUGAR';
      ops.push({ type: 'modify', productCode: d.productCode, productName: d.productName, code, key: 'ice', name: modMatch[1] });
      return { ops };
    }
  }

  clarification = { message: '没能识别这句修改，试试这些说法，或直接用下方表单调整：', options: ['饮料换一下', '加一个玉米杯', '不要中薯条', '巨无霸套餐来2个', '可乐换成美式咖啡'] };
  return { ops, clarification };
}

/** 将解析出的操作应用到餐单草稿（snapshot.items）。 */
export function applyOps(items: MealItem[], ops: MealOp[]): MealItem[] {
  let next: MealItem[] = items.map((i) => ({ ...i, comboItemList: i.comboItemList?.map((c) => ({ ...c })), modification: i.modification ? { values: [...i.modification.values] } : undefined }));
  for (const op of ops) {
    if (op.type === 'add') {
      const existing = next.find((i) => i.productCode === op.productCode);
      if (existing) existing.quantity += op.quantity;
      else next.push({ productCode: op.productCode, productName: op.productName, quantity: op.quantity, source: { isHistory: false } });
    } else if (op.type === 'remove') {
      next = next.filter((i) => i.productCode !== op.productCode);
    } else if (op.type === 'setQty') {
      const it = next.find((i) => i.productCode === op.productCode);
      if (it) it.quantity = op.quantity;
    } else if (op.type === 'replace') {
      const it = next.find((i) => i.productCode === op.fromCode);
      if (it) {
        it.productCode = op.toCode;
        it.productName = op.toName;
      }
    } else if (op.type === 'modify') {
      const it = next.find((i) => i.productCode === op.productCode);
      if (it) {
        it.modification = it.modification || { values: [] };
        const existing = it.modification.values.find((m) => m.code === op.code);
        if (existing) existing.quantity = 1;
        else it.modification.values.push({ code: op.code, key: op.key, quantity: 1 });
      }
    }
  }
  return next;
}
