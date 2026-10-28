/**
 * 价格监控测试
 */

import { describe, it, expect } from 'vitest';
import {
  comparePrice,
  shouldNotifyPriceChange,
  createCancellablePriceMonitor,
  MIN_PRICE_MONITOR_INTERVAL,
} from './price-monitor';
import type { PriceSnapshot } from './types';

/**
 * 构造价格快照
 */
const createSnapshot = (shopPrice: number, overrides: Partial<PriceSnapshot> = {}): PriceSnapshot => ({
  platform: 'yishou',
  productId: '333816379',
  productName: '测试商品',
  productNo: '1350300027',
  productImage: 'https://example.com/image.jpg',
  productUrl: 'https://www.yishouapp.com/goods/333816379',
  shopPrice,
  authState: 'logged_in',
  coupons: [],
  couponsNew: [],
  capturedAt: 1793167751000,
  ...overrides,
});

describe('comparePrice - 价格变化判定', () => {
  it('价格下降时应返回正确的变动信息', () => {
    const change = comparePrice(createSnapshot(899), createSnapshot(869.99));

    expect(change).not.toBeNull();
    expect(change?.previousPrice).toBe(899);
    expect(change?.currentPrice).toBe(869.99);
    expect(change?.delta).toBe(-29.01);
    expect(change?.deltaPercent).toBe(-3.23);
    expect(change?.direction).toBe('down');
  });

  it('价格上涨时应返回正确的变动信息', () => {
    const change = comparePrice(createSnapshot(869.99), createSnapshot(899));

    expect(change?.delta).toBe(29.01);
    expect(change?.direction).toBe('up');
  });

  it('价格未变化时应返回 null', () => {
    expect(comparePrice(createSnapshot(869.99), createSnapshot(869.99))).toBeNull();
  });

  it('变动小于最小变动金额时应返回 null', () => {
    expect(comparePrice(createSnapshot(869.99), createSnapshot(870.0), 0.02)).toBeNull();
    expect(comparePrice(createSnapshot(869.99), createSnapshot(870.0), 0.01)).not.toBeNull();
  });

  it('价格无效（0 或 NaN）时应返回 null', () => {
    expect(comparePrice(createSnapshot(0), createSnapshot(869.99))).toBeNull();
    expect(comparePrice(createSnapshot(869.99), createSnapshot(0))).toBeNull();
  });

  it('浮点误差不应产生误报', () => {
    expect(comparePrice(createSnapshot(0.1), createSnapshot(0.2), 0.5)).toBeNull();
    expect(comparePrice(createSnapshot(0.1), createSnapshot(0.3), 0.01)?.delta).toBe(0.2);
  });
});

describe('shouldNotifyPriceChange - 通知条件', () => {
  const drop = comparePrice(createSnapshot(899), createSnapshot(869.99))!;
  const rise = comparePrice(createSnapshot(869.99), createSnapshot(899))!;

  it('any 模式下涨跌都通知', () => {
    expect(shouldNotifyPriceChange(drop, 'any')).toBe(true);
    expect(shouldNotifyPriceChange(rise, 'any')).toBe(true);
    expect(shouldNotifyPriceChange(drop)).toBe(true);
  });

  it('drop 模式下只通知降价', () => {
    expect(shouldNotifyPriceChange(drop, 'drop')).toBe(true);
    expect(shouldNotifyPriceChange(rise, 'drop')).toBe(false);
  });

  it('rise 模式下只通知涨价', () => {
    expect(shouldNotifyPriceChange(drop, 'rise')).toBe(false);
    expect(shouldNotifyPriceChange(rise, 'rise')).toBe(true);
  });
});

describe('createCancellablePriceMonitor - 参数校验', () => {
  const task = {
    request: { platform: 'yishou' as const, productId: '333816379' },
    recipient: 'test@example.com',
  };

  it('检测间隔小于 60 秒时应拒绝', async () => {
    const { promise } = createCancellablePriceMonitor([task], {
      interval: MIN_PRICE_MONITOR_INTERVAL - 1,
      adapterConfig: { uid: 'u', token: 't' },
    });

    await expect(promise).rejects.toThrow('检测间隔不能小于 60 秒');
  });

  it('缺少 uid / token 时应拒绝', async () => {
    const { promise } = createCancellablePriceMonitor([task], {
      interval: 60,
      adapterConfig: {},
    });

    await expect(promise).rejects.toThrow('价格监控需要登录态');
  });

  it('监控任务为空时应拒绝', async () => {
    const { promise } = createCancellablePriceMonitor([], {
      interval: 60,
      adapterConfig: { uid: 'u', token: 't' },
    });

    await expect(promise).rejects.toThrow('监控任务列表不能为空');
  });
});
