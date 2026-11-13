import { describe, expect, it } from 'vitest'
import { migrateLegacyRecord } from './legacy-migrate'

const now = 1_700_000_000_000

describe('legacy-migrate', () => {
  it('price：凭证抽到 secret，changes/couponChanges 转事件', () => {
    const result = migrateLegacyRecord('price', {
      id: 'p1',
      product: { productId: '339789599', productName: '测试商品' },
      config: {
        interval: 60,
        notifyOn: 'drop',
        minPriceDelta: 0.01,
        adapterConfig: { uid: '1', token: 't' },
      },
      checkCount: 3,
      detectedCount: 2,
      changes: [
        {
          productId: '339789599',
          productName: '测试商品',
          previousPrice: 204.99,
          currentPrice: 199,
          delta: -5.99,
          deltaPercent: -2.92,
          direction: 'down',
          detectedAt: now,
          emailSent: true,
        },
      ],
      couponChanges: [
        { added: [{ kind: '满减券', label: '满100减10' }], removed: [], detectedAt: now - 1, emailSent: false },
      ],
      accountId: 'acc1',
    })

    const state = result.state as any
    expect(state.product.productNo).toBeUndefined()
    expect(state.config.adapterConfig).toBeUndefined()
    expect(result.secret).toEqual({ uid: '1', token: 't' })
    expect(result.accountId).toBe('acc1')
    expect(state.events.map((e: any) => e.type)).toEqual(['price.changed', 'coupon.changed'])
    expect(state.events[0].tone).toBe('down')
    expect(state.events[0].previousPrice).toBe(204.99)
  })

  it('stock：订单字段收敛为 OrderBrief', () => {
    const result = migrateLegacyRecord('stock', {
      product: { productId: '1', productName: '到货商品', productNo: 'PN1' },
      config: { interval: 10, duration: 3600, adapterConfig: { uid: '1' } },
      result: {
        checkCount: 5,
        errorCount: 1,
        detected: true,
        orderSn: 'SN1',
        orderAmount: 99.5,
        orderNum: 2,
        orderSkuLabel: '蓝色 / M',
        orderExpireAt: now,
      },
    })

    const state = result.state as any
    expect(state.config.interval).toBe(10)
    expect(state.product.productNo).toBe('PN1')
    expect(state.result.order).toMatchObject({
      orderSn: 'SN1',
      amount: 99.5,
      num: 2,
      skuLabel: '蓝色 / M',
      expireAt: now,
    })
    expect(state.events).toEqual([])
  })

  it('tab：只有 seenProductIds 时补出 seenProducts，函数字段不落盘', () => {
    const result = migrateLegacyRecord('tab', {
      tabId: '146453',
      tabName: '女装',
      config: {
        interval: 300,
        duration: 10800,
        mode: 'accumulate',
        adapterConfig: { uid: '1' },
        getBlacklistedSuppliers: () => ['x'],
      },
      createdAt: new Date(now).toISOString(),
      seenProductIds: ['a', 'b'],
      seenProducts: [],
    })

    const state = result.state as any
    expect(state.tab).toEqual({ id: '146453', name: '女装' })
    expect(state.seenProducts).toHaveLength(2)
    expect(state.seenProducts[0].firstSeenAt).toBe(new Date(now).toISOString())
    expect(state.config.getBlacklistedSuppliers).toBeUndefined()
  })

  it('renew：recentRenewals 转续期事件，并保留账号摘要', () => {
    const result = migrateLegacyRecord('renew', {
      accountId: 'acc1',
      accountPhone: '166****',
      accountTitle: '主号',
      source: 'auto',
      config: { duration: 43200, adapterConfig: { uid: '1' } },
      recentRenewals: [
        { orderSn: 'SN2', renewedAt: now, remainingBefore: 120, expireAfter: now + 1_200_000, verified: true },
        { orderSn: 'SN3', renewedAt: now - 1, finishedReason: '已支付' },
      ],
    })

    const state = result.state as any
    expect(state.account).toEqual({ id: 'acc1', phone: '166****', title: '主号' })
    expect(state.events.map((e: any) => e.type)).toEqual(['renew.succeeded', 'renew.finished'])
    expect(state.events[0].orderSn).toBe('SN2')
  })

  it('幂等：同一份输入两次结果一致', () => {
    const raw = {
      product: { productId: '1' },
      config: { interval: 60, adapterConfig: { uid: '1' } },
      changes: [],
      couponChanges: [],
    }
    expect(JSON.stringify(migrateLegacyRecord('price', raw))).toBe(
      JSON.stringify(migrateLegacyRecord('price', raw))
    )
  })
})
