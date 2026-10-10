import React, { useState } from 'react';
import { ProductArt, guessProductArt } from './Illustration';

// 看图轻松点：
//  - 图片地址只来自 MCP 工具返回的官方地址（后端已限定 https），前端绝不自行拼接或搜索图片；
//  - 不把官方产品图下载打包进仓库（产品摄影有版权，也不符合原创性声明）；
//    仓库里只有原创 SVG 插画，用作占位并标注“示意图”；
//  - 固定容器尺寸 + object-fit: contain，图片加载前后都不产生布局跳动；
//  - 懒加载 + 占位 + 失败降级为插画，并明确标注“示意图”；
//  - 始终同时显示商品名称与规格，绝不只靠图传达信息；
//  - 演示模式没有真实图片，同样按“示意图”处理，不与真实图片混用。

export interface ProductImageProps {
  /** 官方图片地址（可能为空） */
  url?: string;
  name: string;
  /** 规格/份量说明（如“中份”），没有则传 undefined */
  spec?: string;
  size?: number;
  /** 是否演示模式：演示图与真实图不混用，统一标注 */
  demo?: boolean;
  /** 是否为套餐（示意图形状不同） */
  combo?: boolean;
}

export default function ProductImage({ url, name, spec, size = 96, demo, combo }: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  const useReal = !!url && !failed && !demo;
  const style: React.CSSProperties = { width: size, height: size };

  return (
    <div className="pimg" style={style} role="img" aria-label={spec ? `${name}（${spec}）` : name}>
      {useReal ? (
        <img
          src={url}
          alt={spec ? `${name}（${spec}）` : name}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="pimg-fallback" aria-hidden="true">
          {/* 没有官方图时用「原创插画」占位：按商品名选汉堡/薯条/饮料/甜品/咖啡形状，
              并统一标注“示意图”。这是原创图形，不是官方产品照片，也不来自网络搜索。 */}
          <ProductArt kind={combo ? 'combo' : guessProductArt(name)} size={size} />
        </span>
      )}
      {!useReal && <span className="pimg-tag">示意图</span>}
      {useReal && demo && <span className="pimg-tag">演示</span>}
    </div>
  );
}

/** 一行“图 + 名称规格”：保证任何情况下都看得出是哪一件商品。 */
export function ProductLine({
  url,
  name,
  spec,
  quantity,
  size = 56,
  demo,
  combo,
}: ProductImageProps & { quantity?: number }) {
  return (
    <span className="pline">
      <ProductImage url={url} name={name} spec={spec} size={size} demo={demo} combo={combo} />
      <span className="pline-text">
        <b>{name}</b>
        <span className="muted small">
          {spec ? `${spec} · ` : ''}
          {quantity != null ? `×${quantity}` : ''}
        </span>
      </span>
    </span>
  );
}
