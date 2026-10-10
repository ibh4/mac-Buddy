// 四个入口的原创扁平卡通图标（SVG）。
// 仅使用本项目设计色板，不复制任何官方图形或 Logo。
import React from 'react';

type IconProps = { size?: number };

/** 就吃老样子：一只装好套餐的盘子 */
export function PlateIcon({ size = 56 }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label="就吃老样子">
      <ellipse cx="32" cy="54" rx="24" ry="5" fill="#000" opacity="0.06" />
      {/* 盘身 */}
      <ellipse cx="32" cy="36" rx="27" ry="18" fill="#FFF0B3" stroke="#E0A800" strokeWidth="2" />
      <ellipse cx="32" cy="34" rx="19" ry="12" fill="#fff" />
      {/* 汉堡 */}
      <path d="M20 32c0-7 5-11 12-11s12 4 12 11c0 1-.6 2-1.6 2H21.6C20.6 34 20 33 20 32z" fill="#FFC72C" stroke="#E0A800" strokeWidth="1.6" />
      <path d="M19 36h26c1 3-5 6-13 6s-14-3-13-6z" fill="#9B5A2B" />
      <circle cx="27" cy="27" r="1.6" fill="#fff" />
      <circle cx="35" cy="25.5" r="1.6" fill="#fff" />
      {/* 小叉子 */}
      <path d="M50 22v14" stroke="#DB3038" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M50 22v6M47 22v4M53 22v4" stroke="#DB3038" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** 今天微微调：一个带指针的旋钮 */
export function KnobIcon({ size = 56 }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label="今天微微调">
      <ellipse cx="32" cy="55" rx="22" ry="4.5" fill="#000" opacity="0.06" />
      {/* 刻度 */}
      <g stroke="#76675E" strokeWidth="2.4" strokeLinecap="round" opacity="0.55">
        <path d="M12 20l3.5 2" />
        <path d="M52 20l-3.5 2" />
        <path d="M32 10v3.6" />
      </g>
      {/* 旋钮主体 */}
      <circle cx="32" cy="34" r="20" fill="#FFC72C" stroke="#E0A800" strokeWidth="2.4" />
      <circle cx="32" cy="34" r="13" fill="#FFE9A8" />
      {/* 指针 */}
      <path d="M32 34l8-8" stroke="#DB3038" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="32" cy="34" r="3.4" fill="#DB3038" />
      {/* 微调标记 */}
      <path d="M20 48h7M24 44.5v7" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M38 48h7" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** 随机来一份：一颗骰子 */
export function DiceIcon({ size = 56 }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label="随机来一份">
      <ellipse cx="32" cy="56" rx="21" ry="4.5" fill="#000" opacity="0.06" />
      <rect x="10" y="12" width="44" height="44" rx="12" fill="#fff" stroke="#E0A800" strokeWidth="2.6" />
      <rect x="10" y="12" width="44" height="44" rx="12" fill="#FFF0B3" opacity="0.5" />
      {/* 点数 */}
      <circle cx="22" cy="24" r="4.2" fill="#DB3038" />
      <circle cx="42" cy="24" r="4.2" fill="#DB3038" />
      <circle cx="32" cy="34" r="4.2" fill="#DB3038" />
      <circle cx="22" cy="44" r="4.2" fill="#DB3038" />
      <circle cx="42" cy="44" r="4.2" fill="#DB3038" />
    </svg>
  );
}

/** 今日食签：一张日历卡 */
export function CalendarIcon({ size = 56 }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label="今日食签">
      <ellipse cx="32" cy="56" rx="21" ry="4.5" fill="#000" opacity="0.06" />
      {/* 卡身 */}
      <rect x="12" y="14" width="40" height="38" rx="9" fill="#fff" stroke="#E0A800" strokeWidth="2.6" />
      {/* 顶栏 */}
      <path d="M12 23a9 9 0 0 1 9-9h22a9 9 0 0 1 9 9v5H12z" fill="#DB3038" />
      {/* 挂环 */}
      <path d="M24 12v7M40 12v7" stroke="#76675E" strokeWidth="2.6" strokeLinecap="round" />
      {/* 日期格 */}
      <g fill="#FFF0B3">
        <rect x="19" y="32" width="8" height="7" rx="2" />
        <rect x="29" y="32" width="8" height="7" rx="2" />
        <rect x="39" y="32" width="8" height="7" rx="2" />
        <rect x="19" y="42" width="8" height="7" rx="2" />
      </g>
      {/* 今日高亮 */}
      <rect x="29" y="42" width="8" height="7" rx="2" fill="#FFC72C" stroke="#E0A800" strokeWidth="1.4" />
    </svg>
  );
}

/** 我的饮食足迹：一组脚印（轻量线稿） */
export function FootprintIcon({ size = 28 }: IconProps) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} role="img" aria-label="我的饮食足迹">
      <ellipse cx="14" cy="14" rx="6" ry="9" fill="#FFC72C" opacity="0.9" />
      <circle cx="9" cy="8" r="2.2" fill="#FFC72C" />
      <circle cx="14" cy="6" r="2.2" fill="#FFC72C" />
      <circle cx="19" cy="8" r="2.2" fill="#FFC72C" />
      <ellipse cx="27" cy="27" rx="6" ry="9" fill="#DB3038" opacity="0.85" />
      <circle cx="22" cy="21" r="2.2" fill="#DB3038" />
      <circle cx="27" cy="19" r="2.2" fill="#DB3038" />
      <circle cx="32" cy="21" r="2.2" fill="#DB3038" />
    </svg>
  );
}
