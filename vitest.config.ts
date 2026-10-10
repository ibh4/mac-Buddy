import { defineConfig } from 'vitest/config';

// 离线单元测试：全部在演示模式下运行，不触碰真实 MCP、Token，也不产生任何真实订单。
// 测试隔离由 tests/setup.ts 完成（临时数据目录 + 强制演示模式）。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
