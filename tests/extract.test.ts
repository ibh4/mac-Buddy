import { describe, it, expect } from 'vitest';
import { extractData } from '../apps/server/src/mcpClient.js';

describe('extractData 解析 MCP 返回', () => {
  it('优先使用 structuredContent', () => {
    const r = extractData({ structuredContent: { data: { price: 1590 } } });
    expect(r.data.price).toBe(1590);
  });

  it('从嵌在说明文字中间的 JSON 提取对象', () => {
    const text = '以下是计算结果：{"data":{"price":1590}} 仅供参考';
    const r = extractData({ content: [{ type: 'text', text }] });
    expect(r).toBeTruthy();
    expect(r.data.price).toBe(1590);
  });

  it('处理 JSON 后面还跟有尾随文字的情况', () => {
    const text = '订单信息 {"list":[{"a":1}]} 结束';
    const r = extractData({ content: [{ type: 'text', text }] });
    expect(Array.isArray(r.list)).toBe(true);
    expect(r.list[0].a).toBe(1);
  });

  it('没有明确 JSON 时返回 null', () => {
    const r = extractData({ content: [{ type: 'text', text: '暂无数据' }] });
    expect(r).toBeNull();
  });
});
