/**
 * 中央限频策略表测试
 *
 * 锁定「哪些业务走过闸门、哪些额外节流、哪些缓存」的定义——这张表是限频的真相来源，
 * 任何改动都应显式反映在测试里，避免悄悄改变限频行为。
 */

import { describe, it, expect } from 'vitest';
import {
  RATE_POLICIES,
  getRatePolicy,
  isGateBypassed,
  COLLECTION_WRITE_GAP_MS,
  COLLECTION_INDEX_TTL_MS,
  RENEW_REQUEST_GAP_MS,
  RENEW_WRITE_GAP_MS,
} from './rate-policy';
import type { GateFlow } from './request-gate';

describe('rate-policy 中央限频策略表', () => {
  it('唯一豁免是下单与登录，其余业务流全部过闸门', () => {
    const bypassed = (Object.keys(RATE_POLICIES) as GateFlow[]).filter(isGateBypassed);
    expect(bypassed.sort()).toEqual(['auth.login', 'order.checkout']);
  });

  it('监控扫描 / 收藏读写 / 订单续期都过闸门', () => {
    for (const flow of [
      'monitor.stock',
      'monitor.price',
      'monitor.tab',
      'collection.sync',
      'collection.index',
      'collection.write',
      'order.renew',
      'manual',
    ] as GateFlow[]) {
      expect(getRatePolicy(flow).gate, flow).toBe('normal');
    }
  });

  it('额外节流与缓存参数：收藏写 300ms、索引缓存 10s、续期读 300ms 写 5s', () => {
    expect(COLLECTION_WRITE_GAP_MS).toBe(300);
    expect(COLLECTION_INDEX_TTL_MS).toBe(10_000);
    expect(RENEW_REQUEST_GAP_MS).toBe(300);
    expect(RENEW_WRITE_GAP_MS).toBe(5_000);
  });

  it('未登记的流安全降级为 normal（不放行未知流量绕过闸门）', () => {
    expect(getRatePolicy('unknown' as GateFlow)).toEqual({ gate: 'normal' });
    expect(isGateBypassed('unknown' as GateFlow)).toBe(false);
  });
});
