import type { MealItem, MealSnapshot } from './types.js';

// ============================================================================
// 演示模式数据（全部为虚构，仅用于体验保存 / 修改 / 版本比较）。
// 演示模式不会产生任何真实订单，也不会返回伪造的支付链接。
// 真实模式不会使用本文件，而是调用真实 MCP 工具。
// ============================================================================

export interface DemoStore {
  storeCode: string;
  storeName: string;
  beTypes: number[]; // 支持的就餐类型：1 到店自取, 2 麦乐送到家, 5 得来速
  city: string;
}

export const DEMO_STORES: DemoStore[] = [
  { storeCode: 'DSTORE01', storeName: '麦麦餐厅（演示·阳光店）', beTypes: [1, 5], city: '演示市' },
  { storeCode: 'DSTORE02', storeName: '麦麦餐厅（演示·江畔店）', beTypes: [1, 2], city: '演示市' },
];

export interface DemoMenuItem {
  productCode: string;
  productName: string;
  price: number;
  category: string;
  isCombo: boolean;
  comboItemList?: { productCode: string; name: string; quantity: number }[];
  modifications?: { code: string; key: string; name: string }[];
}

export const DEMO_MENU: DemoMenuItem[] = [
  {
    productCode: 'MC001',
    productName: '巨无霸套餐',
    price: 42.5,
    category: '超值套餐',
    isCombo: true,
    comboItemList: [
      { productCode: 'MA01', name: '巨无霸', quantity: 1 },
      { productCode: 'FR01', name: '中薯条', quantity: 1 },
      { productCode: 'DR01', name: '可乐（中）', quantity: 1 },
    ],
  },
  {
    productCode: 'MC002',
    productName: '麦辣鸡腿堡套餐',
    price: 38.0,
    category: '超值套餐',
    isCombo: true,
    comboItemList: [
      { productCode: 'MA02', name: '麦辣鸡腿堡', quantity: 1 },
      { productCode: 'FR01', name: '中薯条', quantity: 1 },
      { productCode: 'DR02', name: '雪碧（中）', quantity: 1 },
    ],
  },
  {
    productCode: 'MA03',
    productName: '双层吉士堡',
    price: 21.0,
    category: '汉堡',
    isCombo: false,
  },
  {
    productCode: 'FR01',
    productName: '中薯条',
    price: 12.0,
    category: '小食',
    isCombo: false,
  },
  {
    productCode: 'DR01',
    productName: '可乐（中）',
    price: 10.0,
    category: '饮料',
    isCombo: false,
    modifications: [
      { code: 'M_NOICE', key: 'ice', name: '去冰' },
      { code: 'M_LESSSUGAR', key: 'sugar', name: '少糖' },
    ],
  },
  {
    productCode: 'DR02',
    productName: '雪碧（中）',
    price: 10.0,
    category: '饮料',
    isCombo: false,
    modifications: [{ code: 'M_NOICE', key: 'ice', name: '去冰' }],
  },
  {
    productCode: 'VE01',
    productName: '玉米杯',
    price: 9.0,
    category: '小食',
    isCombo: false,
  },
  {
    productCode: 'CH01',
    productName: '麦辣鸡翅（2块）',
    price: 13.0,
    category: '小食',
    isCombo: false,
  },
  {
    productCode: 'IC01',
    productName: '圆筒冰淇淋',
    price: 7.0,
    category: '甜品',
    isCombo: false,
  },
  {
    productCode: 'CF01',
    productName: '美式咖啡',
    price: 14.0,
    category: '饮料',
    isCombo: false,
  },
];

export function demoMenuItem(code: string): DemoMenuItem | undefined {
  return DEMO_MENU.find((m) => m.productCode === code);
}

export interface DemoHistoryOrder {
  orderId: string;
  orderType: string;
  createTime: string;
  beType: string;
  storeCode: string;
  storeName: string;
  orderStatus: string;
  orderProductList: MealItem[];
  realTotalAmount: string;
}

function item(
  productCode: string,
  productName: string,
  quantity: number,
  comboItemList?: { productCode: string; name: string; quantity: number }[]
): MealItem {
  return { productCode, productName, quantity, comboItemList, source: { isHistory: true } };
}

export const DEMO_HISTORY_ORDERS: DemoHistoryOrder[] = [
  {
    orderId: 'DEMO-ORD-1001',
    orderType: '1',
    createTime: '2026-09-20 12:30:11',
    beType: '1',
    storeCode: 'DSTORE01',
    storeName: '麦麦餐厅（演示·阳光店）',
    orderStatus: '订单已完成',
    orderProductList: [
      item('MC001', '巨无霸套餐', 1, [
        { productCode: 'MA01', name: '巨无霸', quantity: 1 },
        { productCode: 'FR01', name: '中薯条', quantity: 1 },
        { productCode: 'DR01', name: '可乐（中）', quantity: 1 },
      ]),
      item('FR01', '中薯条', 1),
      item('DR01', '可乐（中）', 1),
    ],
    realTotalAmount: '64.50',
  },
  {
    orderId: 'DEMO-ORD-1002',
    orderType: '1',
    createTime: '2026-09-27 13:05:42',
    beType: '1',
    storeCode: 'DSTORE01',
    storeName: '麦麦餐厅（演示·阳光店）',
    orderStatus: '订单已完成',
    orderProductList: [
      item('MC002', '麦辣鸡腿堡套餐', 1, [
        { productCode: 'MA02', name: '麦辣鸡腿堡', quantity: 1 },
        { productCode: 'FR01', name: '中薯条', quantity: 1 },
        { productCode: 'DR02', name: '雪碧（中）', quantity: 1 },
      ]),
      item('VE01', '玉米杯', 1),
    ],
    realTotalAmount: '47.00',
  },
];

// 首跑演示种子：一个餐单模板 + 两个版本，方便直接体验版本与差异。
export interface DemoSeed {
  name: string;
  note: string;
  favorite: boolean;
  versions: { snapshot: MealSnapshot; changeSummary: string }[];
}

export const DEMO_SEED: DemoSeed[] = [
  {
    name: '工作日午餐',
    note: '平时中午常点的那套，省心。',
    favorite: true,
    versions: [
      {
        changeSummary: '最初那一版',
        snapshot: {
          storeCode: 'DSTORE01',
          storeName: '麦麦餐厅（演示·阳光店）',
          orderType: 1,
          beType: 1,
          historicalAmount: 64.5,
          items: [
            item('MC001', '巨无霸套餐', 1, [
              { productCode: 'MA01', name: '巨无霸', quantity: 1 },
              { productCode: 'FR01', name: '中薯条', quantity: 1 },
              { productCode: 'DR01', name: '可乐（中）', quantity: 1 },
            ]),
            item('FR01', '中薯条', 1),
            item('DR01', '可乐（中）', 1),
          ],
        },
      },
      {
        changeSummary: '饮料换过的',
        snapshot: {
          storeCode: 'DSTORE01',
          storeName: '麦麦餐厅（演示·阳光店）',
          orderType: 1,
          beType: 1,
          historicalAmount: 64.5,
          items: [
            item('MC001', '巨无霸套餐', 1, [
              { productCode: 'MA01', name: '巨无霸', quantity: 1 },
              { productCode: 'FR01', name: '中薯条', quantity: 1 },
              { productCode: 'DR01', name: '可乐（中）', quantity: 1 },
            ]),
            item('FR01', '中薯条', 1),
            item('CF01', '美式咖啡', 1),
          ],
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// 演示营养表（虚构，仅供演示模式使用，界面必须标注“演示数据”）。
// 结构与官方 list-nutrition-foods 一致：按“每份”计量；无糖数据。
// ---------------------------------------------------------------------------
export const DEMO_NUTRITION: {
  productName: string;
  energyKj?: number;
  energyKcal?: number;
  protein?: number;
  fat?: number;
  carbohydrate?: number;
  sodium?: number;
  calcium?: number;
}[] = [
  { productName: '巨无霸', energyKj: 2146, energyKcal: 513, protein: 27, fat: 26, carbohydrate: 42, sodium: 961, calcium: 171 },
  { productName: '麦辣鸡腿堡', energyKj: 2029, energyKcal: 485, protein: 24, fat: 24, carbohydrate: 42, sodium: 1208, calcium: 154 },
  { productName: '双层吉士堡', energyKj: 1796, energyKcal: 429, protein: 27, fat: 22, carbohydrate: 31, sodium: 1017, calcium: 232 },
  { productName: '中薯条', energyKj: 1210, energyKcal: 289, protein: 4, fat: 12, carbohydrate: 38, sodium: 165, calcium: 18 },
  { productName: '可乐（中）', energyKj: 616, energyKcal: 147, protein: 0, fat: 0, carbohydrate: 36, sodium: 0, calcium: 10 },
  { productName: '雪碧（中）', energyKj: 440, energyKcal: 105, protein: 0, fat: 0, carbohydrate: 26, sodium: 29, calcium: 0 },
  { productName: '玉米杯', energyKj: 223, energyKcal: 53, protein: 2, fat: 1, carbohydrate: 7, sodium: 1, calcium: 6 },
  { productName: '麦辣鸡翅（2块）', energyKj: 937, energyKcal: 224, protein: 13, fat: 15, carbohydrate: 9, sodium: 537, calcium: 13 },
  { productName: '圆筒冰淇淋', energyKj: 391, energyKcal: 93, protein: 2, fat: 3, carbohydrate: 14, sodium: 36, calcium: 77 },
  { productName: '美式咖啡', energyKj: 54, energyKcal: 13, protein: 1, fat: 0, carbohydrate: 0, sodium: 3, calcium: 8 },
];

// ---------------------------------------------------------------------------
// 演示优惠券（虚构，仅供演示模式使用，界面必须标注“演示数据”）。
// 字段结构与真实 query-store-coupons 返回保持一致：
//   [{ title, couponId, couponCode, tradeDateTime, products:[{productCode,productName}], promotionId }]
// 注意：真实接口不返回“优惠金额”，真实模式的金额一律来自 calculate-price 实际核价；
// 演示模式没有真实核价服务，才用 demoDiscountYuan 模拟，且必须在界面上标明。
// ---------------------------------------------------------------------------
export interface DemoCoupon {
  title: string;
  couponId: string;
  couponCode: string;
  tradeDateTime: string;
  products: { productCode: string; productName: string }[];
  promotionId: string;
  /** 仅演示模式用于模拟核价；真实模式不会读取此字段。 */
  demoDiscountYuan: number;
  /** 附加条件说明（真实接口未给出时不臆造；演示里显式写清） */
  condition?: string;
  /** 演示用适用就餐方式限制（真实场景由接口筛好，不需要本地过滤） */
  orderTypes?: number[];
}

export const DEMO_COUPONS: DemoCoupon[] = [
  {
    title: '中薯条立减 ¥2',
    couponId: 'DEMO-CP-001',
    couponCode: 'DEMOCP0001',
    tradeDateTime: '2026-12-31 23:59:59',
    products: [{ productCode: 'FR01', productName: '中薯条' }],
    promotionId: 'DEMO-PM-001',
    demoDiscountYuan: 2,
  },
  {
    title: '美式咖啡立减 ¥3',
    couponId: 'DEMO-CP-002',
    couponCode: 'DEMOCP0002',
    tradeDateTime: '2026-12-31 23:59:59',
    products: [{ productCode: 'CF01', productName: '美式咖啡' }],
    promotionId: 'DEMO-PM-002',
    demoDiscountYuan: 3,
  },
  {
    title: '巨无霸套餐立减 ¥4（仅限到店取餐）',
    couponId: 'DEMO-CP-003',
    couponCode: 'DEMOCP0003',
    tradeDateTime: '2026-12-31 23:59:59',
    products: [{ productCode: 'MC001', productName: '巨无霸套餐' }],
    promotionId: 'DEMO-PM-003',
    demoDiscountYuan: 4,
    condition: '仅限到店取餐（orderType=1）时使用',
    orderTypes: [1],
  },
];
