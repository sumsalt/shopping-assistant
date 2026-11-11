/**
 * 价格监控：价格到点自动下单
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PriceSnapshot } from './types'

const sendEmail = vi.fn().mockResolvedValue({ success: true })
const placeAutoOrder = vi.fn()

vi.mock('./email', () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
  createPriceChangeTemplate: () => 'price-email',
  createAutoOrderTemplate: () => 'auto-order-email',
  createAutoOrderFailedTemplate: () => 'auto-order-failed-email',
}))

vi.mock('./auto-order', () => ({
  placeAutoOrder: (...args: unknown[]) => placeAutoOrder(...args),
}))

let currentPrice = 99
const priceInfo = vi.fn()

vi.mock('./adapters', () => ({
  getAdapter: () => ({ getPriceInfo: (...args: unknown[]) => priceInfo(...args) }),
  getOrderAdapter: () => ({ name: 'mock-order-adapter' }),
}))

const { createCancellablePriceMonitor } = await import('./price-monitor')

const snapshot = (
  shopPrice: number,
  overrides: Partial<PriceSnapshot> = {}
): PriceSnapshot => ({
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
})

const task = {
  request: { platform: 'yishou' as const, productId: '333816379' },
  recipient: 'test@example.com',
}

const baseConfig = {
  interval: 60,
  // 只跑一轮：轮次结束时会因为「剩余时间不够一轮」直接退出，不会 sleep 60 秒
  duration: 1,
  adapterConfig: { uid: 'u', token: 't' },
  initialSnapshot: snapshot(120),
}

describe('价格到点自动下单', () => {
  beforeEach(() => {
    sendEmail.mockClear()
    placeAutoOrder.mockReset()
    priceInfo.mockReset()
    currentPrice = 99
    priceInfo.mockImplementation(() => Promise.resolve(snapshot(currentPrice)))
  })

  it('价格低于目标价时自动下单，并优先发下单邮件', async () => {
    placeAutoOrder.mockResolvedValue({
      success: true,
      stage: 'done',
      orderSn: '12641415441626',
      orderAmount: 199.8,
      skuLabel: '蓝色 / L',
      items: [{ sku: '850001', skuLabel: '蓝色 / L', num: 2 }],
      num: 2,
      requestedNum: 2,
      expireAt: 1794336279000,
    })

    const { promise } = createCancellablePriceMonitor(task, {
      ...baseConfig,
      autoOrder: { enabled: true, targetPrice: 100, num: 2, payTool: '4' },
    })

    const result = await promise

    expect(placeAutoOrder).toHaveBeenCalledTimes(1)
    const args = placeAutoOrder.mock.calls[0][1] as {
      goodsId: string
      goodsNo: string
      config: { targetPrice: number }
    }
    expect(args.goodsId).toBe('333816379')
    expect(args.goodsNo).toBe('1350300027')
    expect(args.config.targetPrice).toBe(100)

    expect(result.orderSn).toBe('12641415441626')
    expect(result.orderNum).toBe(2)
    expect(result.orderError).toBeUndefined()

    // 只发一封：下单邮件（价格变动邮件被跳过）
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const mail = sendEmail.mock.calls[0][0] as { subject: string; html: string }
    expect(mail.subject).toContain('已自动下单')
    expect(mail.html).toBe('auto-order-email')
  })

  it('价格高于目标价时不下单', async () => {
    currentPrice = 108
    const { promise } = createCancellablePriceMonitor(task, {
      ...baseConfig,
      autoOrder: { enabled: true, targetPrice: 100, num: 1 },
    })

    const result = await promise

    expect(placeAutoOrder).not.toHaveBeenCalled()
    expect(result.orderSn).toBeUndefined()
  })

  it('还没到目标价时即使降价也不下单', async () => {
    currentPrice = 110
    const { promise } = createCancellablePriceMonitor(task, {
      ...baseConfig,
      initialSnapshot: snapshot(120),
      autoOrder: { enabled: true, targetPrice: 100, num: 1 },
    })

    const result = await promise

    // 降价了，发了价格变动邮件，但没有下单
    expect(placeAutoOrder).not.toHaveBeenCalled()
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect((sendEmail.mock.calls[0][0] as { html: string }).html).toBe('price-email')
    expect(result.detected).toBe(true)
  })

  it('下单失败但可重试时保留任务并记录原因', async () => {
    placeAutoOrder.mockResolvedValue({
      success: false,
      stage: 'sku',
      retryable: true,
      message: '该商品当前没有可售规格',
    })

    const { promise } = createCancellablePriceMonitor(task, {
      ...baseConfig,
      autoOrder: { enabled: true, targetPrice: 100, num: 1 },
    })

    const result = await promise

    expect(placeAutoOrder).toHaveBeenCalledTimes(1)
    expect(result.orderError).toContain('没有可售规格')
    expect(result.orderSn).toBeUndefined()
  })

  it('下单失败且不可重试时停下任务并发失败邮件', async () => {
    placeAutoOrder.mockResolvedValue({
      success: false,
      stage: 'create',
      uncertain: true,
      message: '建单请求中断，订单可能已生成',
    })

    const { promise } = createCancellablePriceMonitor(task, {
      ...baseConfig,
      autoOrder: { enabled: true, targetPrice: 100, num: 1 },
    })

    const result = await promise

    expect(result.orderUncertain).toBe(true)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect((sendEmail.mock.calls[0][0] as { html: string }).html).toBe(
      'auto-order-failed-email'
    )
  })

  it('未开启自动下单时不做任何下单', async () => {
    const { promise } = createCancellablePriceMonitor(task, baseConfig)

    await promise

    expect(placeAutoOrder).not.toHaveBeenCalled()
  })

  it('价格达标但商品无货时直接跳过下单链路', async () => {
    // 详情响应本身带库存状态：无货就连查规格、加购都不发
    priceInfo.mockImplementation(() =>
      Promise.resolve(snapshot(99, { inStock: false, stockMessage: '商品暂时缺货' }))
    )

    const { promise } = createCancellablePriceMonitor(task, {
      ...baseConfig,
      autoOrder: { enabled: true, targetPrice: 100, num: 1 },
    })

    const result = await promise

    expect(placeAutoOrder).not.toHaveBeenCalled()
    expect(result.orderSkipped).toBe('no_stock')
    expect(result.orderError).toContain('无货')
    expect(result.orderError).toContain('商品暂时缺货')
    expect(result.orderSn).toBeUndefined()
  })

  it('商品有货时照常下单，不被库存预判挡掉', async () => {
    priceInfo.mockImplementation(() =>
      Promise.resolve(snapshot(99, { inStock: true, stockMessage: '商品有货，可以购买' }))
    )
    placeAutoOrder.mockResolvedValue({
      success: true,
      stage: 'done',
      orderSn: '12641415441627',
      orderAmount: 99,
      skuLabel: '黑色 / M',
      items: [{ sku: '850002', skuLabel: '黑色 / M', num: 1 }],
      num: 1,
      requestedNum: 1,
      expireAt: 1794336279000,
    })

    const { promise } = createCancellablePriceMonitor(task, {
      ...baseConfig,
      autoOrder: { enabled: true, targetPrice: 100, num: 1 },
    })

    const result = await promise

    expect(placeAutoOrder).toHaveBeenCalledTimes(1)
    expect(result.orderSkipped).toBeUndefined()
    expect(result.orderSn).toBe('12641415441627')
  })
})
