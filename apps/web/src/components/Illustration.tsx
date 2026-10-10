// 原创扁平卡通插画（SVG），仅使用本项目设计色板，不复制任何官方图形或 Logo。
import React from 'react';

export function BurgerSticker({ size = 120 }: { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label="卡通汉堡">
      <ellipse cx="60" cy="108" rx="40" ry="6" fill="#000" opacity="0.06" />
      {/* 上层面包 */}
      <path d="M22 56c0-20 17-34 38-34s38 14 38 34c0 4-3 6-8 6H30c-5 0-8-2-8-6z" fill="#FFC72C" stroke="#E0A800" strokeWidth="2" />
      <circle cx="48" cy="40" r="2.4" fill="#fff" />
      <circle cx="64" cy="34" r="2.4" fill="#fff" />
      <circle cx="78" cy="42" r="2.4" fill="#fff" />
      {/* 生菜 */}
      <path d="M22 60c4 6 10 4 14 8s12 4 18 2 14 4 20-2 10 0 14-6c-6 4-12 2-18 4s-14 0-20-2-14 0-20-4-8-2-8-2z" fill="#8BC34A" />
      {/* 肉饼 */}
      <rect x="22" y="66" width="76" height="14" rx="7" fill="#9B5A2B" />
      {/* 下层面包 */}
      <path d="M22 80c0-4 3-6 8-6h60c5 0 8 2 8 6 0 8-17 16-38 16S22 88 22 80z" fill="#FFC72C" stroke="#E0A800" strokeWidth="2" />
    </svg>
  );
}

export function FriesSticker({ size = 90 }: { size?: number }) {
  return (
    <svg viewBox="0 0 90 120" width={size} height={size * 1.33} role="img" aria-label="卡通薯条">
      <ellipse cx="45" cy="112" rx="28" ry="5" fill="#000" opacity="0.06" />
      {/* 盒子 */}
      <path d="M20 60h50l-6 48H26z" fill="#DB3038" />
      <path d="M20 60h50l-2 14H22z" fill="#FFC72C" />
      {/* 薯条 */}
      <rect x="32" y="18" width="8" height="56" rx="4" fill="#FFC72C" stroke="#E0A800" strokeWidth="1.5" />
      <rect x="44" y="10" width="8" height="64" rx="4" fill="#FFD75E" stroke="#E0A800" strokeWidth="1.5" />
      <rect x="56" y="20" width="8" height="54" rx="4" fill="#FFC72C" stroke="#E0A800" strokeWidth="1.5" />
    </svg>
  );
}

export function DrinkSticker({ size = 80, color = '#DB3038' }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 80 120" width={size} height={size * 1.5} role="img" aria-label="卡通饮料">
      <ellipse cx="40" cy="112" rx="22" ry="5" fill="#000" opacity="0.06" />
      <path d="M24 34h32l-4 70H28z" fill={color} />
      <path d="M24 34h32l-1 16H25z" fill="#fff" opacity="0.85" />
      <rect x="36" y="10" width="6" height="28" fill="#fff" stroke="#E0A800" strokeWidth="1.5" />
      <ellipse cx="40" cy="34" rx="18" ry="5" fill="#FFC72C" />
    </svg>
  );
}

/**
 * 餐食插画。compact 用于小尺寸占位（商品图缺失时），只画一个主体，避免小图里挤成一团。
 * 仅使用本项目设计色板，不复制任何官方图形或 Logo。
 */
export function ComboArt({ compact }: { compact?: boolean } = {}) {
  if (compact) {
    return (
      <svg viewBox="0 0 120 120" width="100%" height="100%" role="img" aria-label="餐食示意图">
        <BurgerSticker size={120} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 320 220" width="100%" height="100%" role="img" aria-label="麦麦餐食插画">
      <g transform="translate(20,40)">
        <BurgerSticker size={130} />
      </g>
      <g transform="translate(150,70)">
        <FriesSticker size={84} />
      </g>
      <g transform="translate(232,86)">
        <DrinkSticker size={74} />
      </g>
    </svg>
  );
}

/**
 * 商品示意图（原创扁平 SVG，仅用本项目设计色板）。
 *
 * 重要边界：这些是**原创插画，不是麦当劳官方产品照片**。
 * 我们没有、也不会把官方产品摄影图打包进仓库——官方图只在运行时由 MCP 返回，
 * 前端直接使用其 https 地址（见 ProductImage）。演示模式没有真实图，
 * 就用这里的原创插画代替，并统一标注「示意图」，绝不让两者混用。
 */
export type ProductArtKind = 'burger' | 'fries' | 'drink' | 'dessert' | 'coffee' | 'combo';

/** 按商品名称粗分示意图形状：只影响插画外观，不参与任何业务判断。 */
export function guessProductArt(name: string): ProductArtKind {
  const n = name || '';
  if (/套餐/.test(n)) return 'combo';
  if (/咖啡|拿铁|美式|卡布|摩卡/.test(n)) return 'coffee';
  if (/冰淇淋|圆筒|圣代|新地|派|麦旋风/.test(n)) return 'dessert';
  if (/可乐|雪碧|橙汁|汽水|牛奶|豆浆|茶|柠/.test(n)) return 'drink';
  if (/薯条|鸡块|鸡翅|玉米|鸡柳|麦乐鸡/.test(n)) return 'fries';
  return 'burger';
}

export function ProductArt({ kind, size = 96 }: { kind: ProductArtKind; size?: number }) {
  const box = { width: size, height: size };
  switch (kind) {
    case 'fries':
      return <FriesSticker size={size * 0.78} />;
    case 'drink':
      return <DrinkSticker size={size * 0.7} />;
    case 'coffee':
      return <DrinkSticker size={size * 0.7} color="#6B4226" />;
    case 'dessert':
      return <DessertSticker size={size * 0.86} />;
    case 'combo':
      return (
        <svg viewBox="0 0 100 100" {...box} role="img" aria-label="套餐示意图">
          <BurgerSticker size={54} />
          <g transform="translate(48,14) scale(0.42)">
            <FriesSticker size={90} />
          </g>
          <g transform="translate(66,26) scale(0.5)">
            <DrinkSticker size={80} />
          </g>
        </svg>
      );
    case 'burger':
    default:
      return <BurgerSticker size={size * 0.94} />;
  }
}

export function DessertSticker({ size = 90 }: { size?: number }) {
  return (
    <svg viewBox="0 0 90 110" width={size} height={size * 1.22} role="img" aria-label="卡通甜品">
      <ellipse cx="45" cy="104" rx="26" ry="5" fill="#000" opacity="0.06" />
      <path d="M45 8c14 16 22 30 22 42a22 22 0 0 1-44 0c0-12 8-26 22-42z" fill="#FFF0B3" stroke="#E0A800" strokeWidth="2" />
      <path d="M28 52c6 6 12 3 17 7s11 2 17-4c-5 5-11 3-17 5s-12 0-17-8z" fill="#FFC72C" />
      <path d="M30 68l30 30H30z" fill="#DB3038" />
      <path d="M32 76h26l-2 8H34z" fill="#FFC72C" />
    </svg>
  );
}

export function EmptyArt() {
  return (
    <svg viewBox="0 0 160 140" width="160" height="140" role="img" aria-label="空状态">
      <ellipse cx="80" cy="120" rx="46" ry="7" fill="#000" opacity="0.06" />
      <path d="M40 70c0-18 18-30 40-30s40 12 40 30c0 4-3 6-7 6H47c-4 0-7-2-7-6z" fill="#FFF0B3" stroke="#E0A800" strokeWidth="2" />
      <rect x="40" y="80" width="80" height="10" rx="5" fill="#FFF0B3" stroke="#E0A800" strokeWidth="2" />
      <circle cx="80" cy="52" r="12" fill="#FFC72C" stroke="#E0A800" strokeWidth="2" />
      <path d="M74 52l5 5 9-10" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ErrorArt() {
  return (
    <svg viewBox="0 0 160 140" width="160" height="140" role="img" aria-label="出错了">
      <ellipse cx="80" cy="120" rx="46" ry="7" fill="#000" opacity="0.06" />
      <circle cx="80" cy="64" r="44" fill="#FFE9E4" stroke="#DB3038" strokeWidth="3" />
      <path d="M62 48l36 32M98 48l-36 32" stroke="#DB3038" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export function OfflineArt() {
  return (
    <svg viewBox="0 0 160 140" width="160" height="140" role="img" aria-label="未连接">
      <ellipse cx="80" cy="120" rx="46" ry="7" fill="#000" opacity="0.06" />
      <rect x="44" y="40" width="72" height="56" rx="10" fill="#FFF0B3" stroke="#E0A800" strokeWidth="3" />
      <path d="M70 96l10-14 10 14z" fill="#FFC72C" />
      <circle cx="80" cy="74" r="6" fill="#DB3038" />
      <path d="M58 58q22-16 44 0" stroke="#76675E" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
