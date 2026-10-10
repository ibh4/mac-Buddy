import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..', '..');

// Load apps/server/.env if present (gitignored). Never commit the real token.
// 注意：真实模式下为了兼容既有本地数据，数据库文件名沿用 mcd-old-same.db。
const envPath = path.join(projectRoot, 'apps', 'server', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

export const PORT = parseInt(process.env.PORT || '8787', 10);
export const MCD_MCP_URL = process.env.MCD_MCP_URL || 'https://mcp.mcd.cn';
export const MCD_MCP_TOKEN = process.env.MCD_MCP_TOKEN || '';
export const FORCE_DEMO_MODE = (process.env.FORCE_DEMO_MODE || 'false').toLowerCase() === 'true';

// Real mode requires a token and not being forced into demo.
export const REAL_MODE = !FORCE_DEMO_MODE && MCD_MCP_TOKEN.trim().length > 0;

export const DATA_DIR = process.env.MCD_DATA_DIR
  ? path.resolve(process.env.MCD_DATA_DIR)
  : path.join(projectRoot, 'apps', 'server', 'data');
export const DB_PATH = path.join(DATA_DIR, 'mcd-old-same.db');

export const APP_INFO = {
  name: 'mcd-buddy',
  version: '1.0.0',
};
