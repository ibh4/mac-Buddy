import { db } from '../apps/server/src/db.js';

/** 清空所有业务表，保证测试用例之间互不干扰（同一文件内共享同一个 DB 连接）。 */
export function resetDb(): void {
  db.exec(
    'DELETE FROM orders; DELETE FROM quotes; DELETE FROM versions; DELETE FROM templates;'
  );
}

export { db };
