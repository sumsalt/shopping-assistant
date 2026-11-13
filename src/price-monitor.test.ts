/**
 * 价格监控测试
 */

import { describe, it, expect } from 'vitest';
import {
  comparePrice,
  compareCoupons,
  shouldNotifyPriceChange,
  createCancellablePriceMonitor,
  computeCouponAdjustedPrice,
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
    const { promise } = createCancellablePriceMonitor(task, {
      interval: MIN_PRICE_MONITOR_INTERVAL - 1,
      adapterConfig: { uid: 'u', token: 't' },
    });

    await expect(promise).rejects.toThrow('检测间隔不能小于 60 秒');
  });

  it('缺少 uid / token 时应拒绝', async () => {
    const { promise } = createCancellablePriceMonitor(task, {
      interval: 60,
      adapterConfig: {},
    });

    await expect(promise).rejects.toThrow('价格监控需要登录态');
  });

  it('未指定商品时应拒绝', async () => {
    const { promise } = createCancellablePriceMonitor(undefined as never, {
      interval: 60,
      adapterConfig: { uid: 'u', token: 't' },
    });

    await expect(promise).rejects.toThrow('监控商品不能为空');
  });
});

describe('compareCoupons - 优惠券变化判定', () => {
  it('券列表完全一致时返回 null', () => {
    const coupons = [{ couponId: '269120', typeTitle: '平台红包', title: '通用红包' }];
    const couponsNew = [{ couponId: '281895', threshold: 400, reduce: 120 }];

    expect(
      compareCoupons(
        createSnapshot(100, { coupons, couponsNew }),
        createSnapshot(100, { coupons, couponsNew })
      )
    ).toBeNull();
  });

  it('新增满减券时能识别', () => {
    const change = compareCoupons(
      createSnapshot(100),
      createSnapshot(100, { couponsNew: [{ couponId: '281895', threshold: 200, reduce: 35 }] })
    );

    expect(change).not.toBeNull();
    expect(change?.added).toEqual([{ kind: '满减券', label: '满200减35' }]);
    expect(change?.removed).toEqual([]);
  });

  it('满减门槛变化时表现为一删一增', () => {
    const change = compareCoupons(
      createSnapshot(100, { couponsNew: [{ couponId: '281895', threshold: 400, reduce: 120 }] }),
      createSnapshot(100, { couponsNew: [{ couponId: '281895', threshold: 300, reduce: 120 }] })
    );

    expect(change?.added).toEqual([{ kind: '满减券', label: '满300减120' }]);
    expect(change?.removed).toEqual([{ kind: '满减券', label: '满400减120' }]);
  });

  it('红包失效时能识别，且不受顺序影响', () => {
    const a = { couponId: '1', typeTitle: '平台红包', title: 'A' };
    const b = { couponId: '2', typeTitle: '专场红包', title: 'B' };

    const change = compareCoupons(
      createSnapshot(100, { coupons: [a, b] }),
      createSnapshot(100, { coupons: [b] })
    );

    expect(change?.removed).toEqual([{ kind: '红包', label: '平台红包：A' }]);
    expect(change?.added).toEqual([]);
  });
});

describe('computeCouponAdjustedPrice - 券后最优价', () => {
  const cn = (threshold: number, reduce: number) => ({ couponId: String(threshold + reduce), threshold, reduce });

  it('价<门槛的券按折扣率缩放减免（取折扣最大的一张）', () => {
    // 88, 100-5(5%) / 200-15(7.5%) → 88 * 0.925 = 81.4
    expect(computeCouponAdjustedPrice(88, [cn(100, 5), cn(200, 15)])).toBeCloseTo(81.4, 6);
  });

  it('价≥门槛减足、价<门槛按比例，两组各取最优再取低价', () => {
    // 88, 50-5(价够→减5→83) / 100-8(价不够→88*0.92=80.96) → 80.96
    expect(computeCouponAdjustedPrice(88, [cn(50, 5), cn(100, 8)])).toBeCloseTo(80.96, 6);
  });

  it('价≥门槛的多张券取额度最大的一张', () => {
    // 120, 满100减10 / 满50减5 → 减10 → 110
    expect(computeCouponAdjustedPrice(120, [cn(100, 10), cn(50, 5)])).toBeCloseTo(110, 6);
  });

  it('价远低于所有门槛时按比例缩放', () => {
    // 30, 满100减20 / 满200减50 → 30*0.8=24 / 30*0.75=22.5 → 22.5
    expect(computeCouponAdjustedPrice(30, [cn(100, 20), cn(200, 50)])).toBeCloseTo(22.5, 6);
  });

  it('无券或空列表返回原价', () => {
    expect(computeCouponAdjustedPrice(88, [])).toBe(88);
    expect(computeCouponAdjustedPrice(88)).toBe(88);
  });

  it('门槛为 0 视为减足', () => {
    expect(computeCouponAdjustedPrice(88, [cn(0, 10)])).toBe(78);
  });

  it('游客态/无券返回原价（urls 不带金额）', () => {
    expect(computeCouponAdjustedPrice(0, [cn(100, 5)])).toBe(0);
  });
});
