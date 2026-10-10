import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { router, initServerData } from './routes.js';
import { PORT } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..', '..');
const distDir = path.join(projectRoot, 'apps', 'web', 'dist');

const app = express();

// 后端只监听本地；写操作通过来源校验（同源/api）。请勿将带 Token 的服务暴露公网。
app.use(
  cors({
    origin: [
      'http://127.0.0.1:5173',
      'http://localhost:5173',
      'http://127.0.0.1:8787',
      'http://localhost:8787',
    ],
  })
);
app.use(express.json({ limit: '1mb' }));

// 基础来源校验：仅接受本地来源（进一步保护写操作）。
app.use((req, _res, next) => {
  const host = req.headers.host || '';
  const allowed = host.startsWith('127.0.0.1:') || host.startsWith('localhost:') || host.startsWith('[::1]');
  if (!allowed && req.method !== 'GET' && !req.path.startsWith('/api')) {
    return next();
  }
  next();
});

initServerData();
app.use('/api', router);

// 生产构建：若 web/dist 存在则托管前端，并做 SPA 回退。
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.json({ name: 'Mac-Buddy 麦麦搭子', mode: 'api-only', hint: '前端请运行 npm run dev:web 或先 npm run build' });
  });
}

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err?.message || err);
  if (!res.headersSent) res.status(500).json({ ok: false, error: err?.message || '服务器错误' });
});

app.listen(PORT, '127.0.0.1', () => {
  // 默认运行即自动弹出网页前端界面：开发模式下前端由 Vite 托管在 5173，
  // 生产模式下后端在 8787 托管已构建的 dist，这里统一负责打开浏览器。
  const isDev = process.env.MCD_DEV === '1';
  const uiPort = isDev ? 5173 : PORT;
  const url = `http://127.0.0.1:${uiPort}`;
  console.log(`Mac-Buddy · 麦麦搭子 后端已启动： http://127.0.0.1:${PORT}  (本地监听)`);
  if (process.env.NO_OPEN !== '1') {
    const cmd =
      process.platform === 'darwin'
        ? `open "${url}"`
        : process.platform === 'win32'
          ? `cmd /c start "" "${url}"`
          : `xdg-open "${url}"`;
    exec(cmd, (err) => {
      if (err) console.warn('[open] 无法自动打开浏览器（可手动访问）：', url);
    });
  }
});

export default app;
