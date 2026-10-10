import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MCD_MCP_TOKEN, MCD_MCP_URL, APP_INFO } from './config.js';

// 麦当劳 MCP 客户端封装。
// 仅后端使用，Token 来自服务端环境变量，绝不进入前端或源码。
// 传输协议：Streamable HTTP，鉴权：Authorization: Bearer <token>。

let client: Client | null = null;
let connecting: Promise<Client> | null = null;
let lastError: string | null = null;
let lastSyncAt: string | null = null;

/** 本项目重点使用的 MCP 工具。 */
export const MCP_TOOL_NAMES = [
  'now-time-info',
  'order-list',
  'query-nearby-stores',
  'query-meals',
  'query-meal-detail',
  'calculate-price',
  'create-order',
  'query-order',
  'cancel-order',
  'delivery-query-addresses',
  'delivery-query-stores',
  // 本轮新增：官方营养资料、门店优惠券
  'list-nutrition-foods',
  'query-store-coupons',
] as const;

export async function ensureClient(): Promise<Client> {
  if (client) return client;
  if (connecting) return connecting;
  connecting = (async () => {
    const transport = new StreamableHTTPClientTransport(new URL(MCD_MCP_URL), {
      requestInit: { headers: { Authorization: `Bearer ${MCD_MCP_TOKEN}` } },
    });
    const c = new Client(
      { name: APP_INFO.name, version: APP_INFO.version },
      { capabilities: {} }
    );
    await c.connect(transport);
    client = c;
    lastError = null;
    lastSyncAt = new Date().toISOString();
    return c;
  })().catch((e) => {
    connecting = null;
    lastError = e?.message || String(e);
    throw e;
  });
  return connecting;
}

export function getConnectionState(): {
  connected: boolean;
  lastError: string | null;
  lastSyncAt: string | null;
} {
  return { connected: !!client, lastError, lastSyncAt };
}

/** 从文本中提取第一个“括号平衡”的 JSON 对象（兼容工具把 JSON 嵌在说明文字中间的写法）。 */
function extractJsonObject(text: string): any {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(start, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

/** 从 MCP 工具返回中提取结构化数据。优先 structuredContent，否则从 text 中提取 JSON 对象。 */
export function extractData(result: any): any {
  if (!result) return null;
  if (result.structuredContent && typeof result.structuredContent === 'object') {
    return result.structuredContent;
  }
  const texts = Array.isArray(result.content)
    ? result.content.map((c: any) => (typeof c?.text === 'string' ? c.text : '')).join('\n')
    : typeof result.content === 'string'
      ? result.content
      : '';
  return extractJsonObject(texts) || null;
}

/** 调用 MCP 工具并返回解析后的 data 对象（自动取 data 字段）。 */
export async function callMcpTool(name: string, args: Record<string, any>): Promise<any> {
  const c = await ensureClient();
  const res = await c.callTool({ name, arguments: args || {} });
  const parsed = extractData(res);
  // API 返回通常包裹在 { success, code, message, data } 中
  if (parsed && typeof parsed === 'object' && 'data' in parsed) {
    return parsed.data ?? parsed;
  }
  return parsed;
}

/**
 * 调用 MCP 工具并返回“原始文本”。
 * 部分工具（如 list-nutrition-foods）返回的是纯文本表格而非 JSON，
 * 结构化解析会失效，因此单独提供文本通道，绝不臆造字段名。
 */
export async function callMcpToolText(name: string, args: Record<string, any>): Promise<string> {
  const c = await ensureClient();
  const res: any = await c.callTool({ name, arguments: args || {} });
  const texts = Array.isArray(res?.content)
    ? res.content.map((x: any) => (typeof x?.text === 'string' ? x.text : '')).join('\n')
    : typeof res?.content === 'string'
      ? res.content
      : '';
  if (texts.trim()) return texts;
  // 兜底：结构化内容转回文本，避免丢数据
  if (res?.structuredContent) return JSON.stringify(res.structuredContent);
  return '';
}

export async function listTools(): Promise<string[]> {
  try {
    const c = await ensureClient();
    const res: any = await c.listTools();
    const tools = (res?.tools || []) as any[];
    return tools.map((t) => t.name);
  } catch {
    return [];
  }
}
