import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { resetDb } from './helpers';
import { DB_PATH } from '../apps/server/src/config.js';
import * as service from '../apps/server/src/service.js';
import type { MealSnapshot } from '../apps/server/src/types.js';

const snap: MealSnapshot = {
  storeCode: 'DSTORE01',
  storeName: '麦麦餐厅（演示·阳光店）',
  orderType: 1,
  beType: 1,
  items: [{ productCode: 'MC001', productName: '巨无霸套餐', quantity: 1 }],
};

beforeEach(() => resetDb());

describe('持久化（重启后不丢失）', () => {
  it('创建模板后，用全新的数据库连接仍可读取到该模板', () => {
    const { template } = service.createTemplate('测试模板', 'no-commit-note', false, snap);
    const conn = new Database(DB_PATH);
    const row = conn
      .prepare('SELECT id, name FROM templates WHERE id = ?')
      .get(template.id) as any;
    conn.close();
    expect(row).toBeTruthy();
    expect(row.name).toBe('测试模板');
  });

  it('版本数据持久化，且完整保留餐单快照', () => {
    const { template, version: v0 } = service.createTemplate('T', '', false, snap);
    const v1 = service.createVersion(
      template.id,
      {
        ...snap,
        items: [{ productCode: 'FR01', productName: '中薯条', quantity: 2 }],
      },
      '加薯条',
      v0.id
    );
    const conn = new Database(DB_PATH);
    const row = conn
      .prepare('SELECT snapshot_json FROM versions WHERE id = ?')
      .get(v1!.id) as any;
    conn.close();
    const parsed = JSON.parse(row.snapshot_json);
    expect(parsed.items[0].productCode).toBe('FR01');
    expect(parsed.items[0].quantity).toBe(2);
  });
});
