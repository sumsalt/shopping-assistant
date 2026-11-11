/**
 * 库存监控 × 指定规格
 *
 * 只监控所选 SKU：商品整体有货但所选规格都没货时不算到货，也不发邮件 / 不下单。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  checkStock: vi.fn(),
  getProductSkus: vi.fn(),
  sendEmail: vi.fn(),
  placeAutoOrder: vi.fn(),
  getOrderAdapter: vi.fn(),
}))

vi.mock('./stock-check', () => ({
  checkStock: mocks.checkStock,
  getProductSkus: mocks.getProductSkus,
}))

vi.mock('./email', () => ({
  sendEmail: mocks.sendEmail,
  createBackInStockTemplate: () => '<back-in-stock />',
  createAutoOrderTemplate: () => '<auto-order />',
  createAutoOrderFailedTemplate: () => '<auto-order-failed />',
  configureEmailService: () => {},
  loadEmailConfigFromEnv: () => undefined,
}))

vi.mock('./auto-order', () => ({
  placeAutoOrder: mocks.placeAutoOrder,
  DEFAULT_AUTO_ORDER_PAY_TOOL: '4',
  MAX_AUTO_ORDER_NUM: 99,
}))

vi.mock('./adapters', () => ({
  getOrderAdapter: mocks.getOrderAdapter,
}))

import { createCancellableMonitor } from './stock-monitor'
import type { StockMonitorConfig } from './stock-monitor'

const task = {
  request: { platform: 'yishou' as const, productId: '338956151' },
  recipient: 'dev@example.com',
}

/** 一手 SKU 列表：第二个规格有货 */
const skuDetail = {
  platform: 'yishou' as const,
  productId: '338956151',
  productName: '测试商品',
  productNo: '1381301740',
  price: 53.81,
  productImage: '',
  productUrl: '',
  sales: 0,
  colors: ['蓝色'],
  sizes: ['M', 'L'],
  skuList: [
    {
      skuId: '850000',
      color: '蓝色',
      size: 'M',
      stock: 0,
      saleStock: 0,
      inStock: false,
      colorImage: '',
    },
    {
      skuId: '850001',
      color: '蓝色',
      size: 'L',
      stock: 3,
      saleStock: 3,
      inStock: true,
      colorImage: '',
    },
  ],
  inStockSkuCount: 1,
  totalSkuCount: 2,
  restrictionNumber: -1,
}

const start = (config: Partial<StockMonitorConfig> = {}) => {
  const { controller, promise } = createCancellableMonitor(task, {
    interval: 2,
    duration: 3600,
    // 查 SKU 明细必须登录态：选了规格的任务检测也带凭证
    adapterConfig: { uid: '20478621', token: 'token' },
    ...config,
  })

  return { controller, promise }
}

describe('库存监控 × 指定规格', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.checkStock.mockReset()
    mocks.getProductSkus.mockReset()
    mocks.sendEmail.mockReset()

    mocks.sendEmail.mockResolvedValue({ success: true })
    // 商品整体有货
    mocks.checkStock.mockResolvedValue({
      platform: 'yishou',
      productId: '338956151',
      productName: '测试商品',
      productNo: '1381301740',
      inStock: true,
      price: 53.81,
      productUrl: '',
      productImage: '',
      message: '有货',
    })
    mocks.getProductSkus.mockResolvedValue(skuDetail)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('所选规格都没货时不算到货，继续检测且不发邮件', async () => {
    const { controller, promise } = start({ skus: ['850000'] })

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(2_000)

    expect(mocks.checkStock).toHaveBeenCalledTimes(2)
    expect(mocks.getProductSkus).toHaveBeenCalled()
    expect(mocks.sendEmail).not.toHaveBeenCalled()

    controller.abort()
    const result = await promise
    expect(result.detected).toBe(false)
  })

  it('所选规格有货时正常提醒，并带上命中规格', async () => {
    const { controller, promise } = start({ skus: ['850001'] })

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(2_000)

    const result = await promise
    controller.abort()

    expect(result.detected).toBe(true)
    expect(result.matchedSkus).toEqual(['850001'])
    expect(result.matchedSkuLabel).toBe('蓝色 / L')
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)
  })

  it('不选规格时只看商品整体，不额外查 SKU', async () => {
    const { controller, promise } = start()

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(2_000)

    const result = await promise
    controller.abort()

    expect(result.detected).toBe(true)
    expect(mocks.getProductSkus).not.toHaveBeenCalled()
  })

  it('选了规格但没有登录态时直接报错，不静默忽略', async () => {
    const { promise } = start({ adapterConfig: {}, skus: ['850001'] })
    await expect(promise).rejects.toThrow('按规格监控需要一手登录态')
  })

  it('自动下单只把选中的规格传给下单链路', async () => {
    mocks.getOrderAdapter.mockReturnValue({ fake: 'adapter' })
    mocks.placeAutoOrder.mockResolvedValue({
      success: true,
      stage: 'done',
      orderSn: '12641415441626',
      orderAmount: 59.81,
      skuLabel: '蓝色 / L',
      num: 1,
      payTool: '4',
      message: '已创建待付款订单',
    })

    const { controller, promise } = start({
      adapterConfig: { uid: '20478621', token: 'token' },
      autoOrder: { enabled: true, num: 1 },
      skus: ['850001'],
    })

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(2_000)

    await promise
    controller.abort()

    expect(mocks.placeAutoOrder).toHaveBeenCalledTimes(1)
    expect(mocks.placeAutoOrder.mock.calls[0][1]).toMatchObject({
      goodsNo: '1381301740',
      skus: ['850001'],
    })
  })
})
