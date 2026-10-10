import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DATA_DIR, DB_PATH } from './config.js';

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    favorite INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    latest_version_id TEXT
  );

  CREATE TABLE IF NOT EXISTS versions (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    parent_version_id TEXT,
    snapshot_json TEXT NOT NULL,
    change_summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    version_id TEXT NOT NULL,
    store_code TEXT NOT NULL,
    store_name TEXT,
    order_type INTEGER NOT NULL,
    be_type INTEGER NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'CNY',
    quoted_at TEXT NOT NULL,
    signature TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    version_id TEXT NOT NULL,
    quote_id TEXT NOT NULL,
    status TEXT NOT NULL,
    remote_order_id TEXT,
    payment_url TEXT,
    created_at TEXT NOT NULL,
    confirmed_at TEXT,
    note TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_versions_template ON versions(template_id);
  CREATE INDEX IF NOT EXISTS idx_quotes_version ON quotes(version_id);
`);

// ---- 饮食足迹（我的饮食足迹）相关表 ----
// 同步的真实订单（去重依据 orderId）；ownerType 记录用途，默认 unknown 不归属个人口味。
db.exec(`
  CREATE TABLE IF NOT EXISTS synced_orders (
    order_id TEXT PRIMARY KEY,
    store_code TEXT,
    store_name TEXT,
    order_type TEXT,
    be_type TEXT,
    create_time TEXT,
    order_status TEXT,
    real_total_amount TEXT,
    products_json TEXT NOT NULL DEFAULT '[]',
    owner_type TEXT NOT NULL DEFAULT 'unknown',
    included_items_json TEXT NOT NULL DEFAULT '[]',
    is_demo INTEGER NOT NULL DEFAULT 0,
    sync_at TEXT
  );

  CREATE TABLE IF NOT EXISTS order_sync_meta (
    k TEXT PRIMARY KEY,
    v TEXT
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    target_type TEXT NOT NULL,
    target_code TEXT NOT NULL,
    verdict TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS prefs (
    k TEXT PRIMARY KEY,
    v TEXT
  );

  CREATE TABLE IF NOT EXISTS item_locks (
    template_id TEXT NOT NULL,
    product_code TEXT NOT NULL,
    reason TEXT,
    PRIMARY KEY (template_id, product_code)
  );

  CREATE TABLE IF NOT EXISTS sign_cache (
    cache_key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT
  );
`);

// ---- 商品图片「地址」缓存 ----
// 只缓存官方返回的 https 图片**地址**（不落图片文件、更不打包进仓库），
// 目的：营业时间拉过一次后，非营业时间也能正常显示商品图；同时避免反复调用 MCP。
db.exec(`
  CREATE TABLE IF NOT EXISTS product_images (
    product_code TEXT NOT NULL,
    store_code TEXT NOT NULL,
    order_type INTEGER NOT NULL,
    be_type INTEGER NOT NULL,
    url TEXT NOT NULL,
    product_name TEXT,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (product_code, store_code, order_type, be_type)
  );
`);

// 轻量迁移：为早期库补上 is_demo 列（用于严格区分演示数据与真实订单）。
const syncedCols = db.prepare('PRAGMA table_info(synced_orders)').all() as any[];
if (!syncedCols.some((c: any) => c.name === 'is_demo')) {
  db.exec('ALTER TABLE synced_orders ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0');
}

export function nowISO(): string {
  return new Date().toISOString();
}
