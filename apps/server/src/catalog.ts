// 餐单目录（菜单）模型与通用工具：分类、价格、总价。
// 这些工具是纯函数，便于在测试与生成器（微调 / 随机 / 食签）中复用，不触碰 MCP。

export interface CatalogItem {
  productCode: string;
  productName: string;
  /** 单价（元） */
  price: number;
  category?: string;
  isCombo?: boolean;
  image?: string;
  comboItemList?: { productCode: string; name: string; quantity: number }[];
  modifications?: { code: string; key: string; name: string }[];
  tags?: string[];
}

export type FoodClass = 'main' | 'drink' | 'snack' | 'dessert' | 'other';

/** 根据品类 / 是否套餐做粗略但透明的分类（仅用于槽位识别，不臆测配料）。 */
export function classify(item: CatalogItem): FoodClass {
  const cat = (item.category || '').toLowerCase();
  const name = item.productName || '';
  if (item.isCombo) return 'main';
  if (/饮料|饮品|喝的/.test(cat) || /可乐|雪碧|咖啡|茶|牛奶|豆浆|橙汁|汽水/.test(name)) return 'drink';
  if (/甜品|冰淇淋|派/.test(cat) || /冰淇淋|圆筒|圣代|派/.test(name)) return 'dessert';
  if (/小食|小吃|配餐/.test(cat) || /薯条|鸡块|鸡翅|玉米|麦辣|鸡柳|饼干|汤/.test(name)) return 'snack';
  if (/汉堡|卷|套餐|饭|面/.test(name)) return 'main';
  return 'other';
}

export function priceOf(catalog: CatalogItem[], code: string): number {
  const it = catalog.find((c) => c.productCode === code);
  return it ? it.price : 0;
}

export function totalPrice(items: { productCode: string; quantity: number }[], catalog: CatalogItem[]): number {
  return items.reduce((sum, i) => sum + priceOf(catalog, i.productCode) * i.quantity, 0);
}

/** 在目录中按分类收集候选（排除 locked 与 excluded）。 */
export function candidatesByClass(
  catalog: CatalogItem[],
  cls: FoodClass,
  opts: { exclude?: string[]; locked?: string[] } = {}
): CatalogItem[] {
  const exclude = new Set(opts.exclude || []);
  const locked = new Set(opts.locked || []);
  return catalog.filter(
    (c) => classify(c) === cls && !exclude.has(c.productCode) && !locked.has(c.productCode)
  );
}
