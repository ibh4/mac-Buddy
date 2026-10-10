import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 前端开发服务器：默认 5173，把 /api 代理到本地后端 8787。
// 注意：Token 只在后端使用，前端绝不会拿到 MCD_MCP_TOKEN。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
