import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 测试隔离策略：
// 1. 每个测试文件使用独立临时数据目录，避免污染开发库（server/data）。
// 2. 强制演示模式（FORCE_DEMO_MODE=true），这样所有测试都不触碰真实 MCP / Token，
//    也不会产生任何真实订单。
// dotenv 默认不会覆盖已存在的环境变量，所以本文件设置的强制值会优先生效。
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcd-buddy-test-'));
process.env.MCD_DATA_DIR = tmp;
process.env.FORCE_DEMO_MODE = 'true';
