import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, db } from './helpers';
import * as service from '../apps/server/src/service.js';
import type { MealSnapshot, MealItem } from '../apps/server/src/types.js';

const snap = (items: MealItem[]): MealSnapshot => ({
  storeCode: 'DSTORE01',
  storeName: '麦麦餐厅（演示·阳光店）',
  orderType: 1,
  beType: 1,
  items,
});

beforeEach(() => resetDb());

describe('版本不可变', () => {
  it('createVersion 生成新版本，旧版本内容不被覆盖', () => {
    const { template, version: v0 } = service.createTemplate(
      'T',
      '',
      false,
      snap([{ productCode: 'A', productName: 'A', quantity: 1 }])
    );
    const v1 = service.createVersion(
      template.id,
      snap([{ productCode: 'A', productName: 'A', quantity: 2 }]),
      '加量',
      v0.id
    );
    const versions = service.listVersions(template.id);
    expect(versions.length).toBe(2);
    // 旧版本原封不动
    expect(service.getVersion(v0.id)!.snapshot.items[0].quantity).toBe(1);
    expect(v1!.snapshot.items[0].quantity).toBe(2);
    expect(v1!.parentVersionId).toBe(v0.id);
    expect(service.getTemplate(template.id)!.latestVersionId).toBe(v1!.id);
  });
});

describe('差异对比', () => {
  it('computeDiff 正确识别 新增 / 数量变化 / 移除', () => {
    const from = snap([
      { productCode: 'A', productName: 'A', quantity: 1 },
      { productCode: 'B', productName: 'B', quantity: 1 },
    ]);
    const to = snap([
      { productCode: 'A', productName: 'A', quantity: 1 },
      { productCode: 'B', productName: 'B', quantity: 2 },
      { productCode: 'C', productName: 'C', quantity: 1 },
    ]);
    const r = service.computeDiff(from, to);
    const kinds = r.entries.map((e) => e.kind);
    expect(kinds).toContain('quantity');
    expect(kinds).toContain('added');
    expect(kinds).not.toContain('removed');
    const q = r.entries.find((e) => e.kind === 'quantity')!;
    expect(q.detail).toContain('1 → 2');
  });

  it('diffVersions 通过存储的版本进行对比', () => {
    const { template, version: v0 } = service.createTemplate(
      'T',
      '',
      false,
      snap([{ productCode: 'A', productName: 'A', quantity: 1 }])
    );
    const v1 = service.createVersion(
      template.id,
      snap([
        { productCode: 'A', productName: 'A', quantity: 1 },
        { productCode: 'C', productName: 'C', quantity: 1 },
      ]),
      '加C',
      v0.id
    );
    const r = service.diffVersions(v0.id, v1!.id);
    expect(r.entries.length).toBe(1);
    expect(r.entries[0].kind).toBe('added');
  });
});

describe('用回旧版（restore）', () => {
  it('从旧版本恢复出新版本，不删除旧版本，且不会产生任何下单记录', () => {
    const { template, version: v0 } = service.createTemplate(
      'T',
      '',
      false,
      snap([{ productCode: 'A', productName: 'A', quantity: 1 }])
    );
    const v1 = service.createVersion(
      template.id,
      snap([{ productCode: 'B', productName: 'B', quantity: 1 }]),
      '换成B',
      v0.id
    );
    const v2 = service.restoreVersion(v0.id, '用回最初');
    expect(v2).not.toBeNull();
    expect(v2!.snapshot.items[0].productCode).toBe('A');
    expect(v2!.parentVersionId).toBe(v0.id);
    expect(service.listVersions(template.id).length).toBe(3); // v0、v1、v2 都在
    // 恢复只是写入新版本，绝不触发任何真实交易
    const orderCount = (db.prepare('SELECT COUNT(*) c FROM orders').get() as any).c;
    expect(orderCount).toBe(0);
  });
});
