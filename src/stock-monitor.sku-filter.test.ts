/**
 * 库存监控 × 指定规格
 *
 * 只监控所选 SKU：商品整体有货但所选规格都没货时不算到货，也不发邮件 / 不下单。
 * 实验分支去掉固定 sleep，测试用「result 回调里数轮数、到目标轮就 abort」自我终止。
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
import type { MonitorResult, StockMonitorConfig } from './stock-monitor'

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
    { skuId: '850000', color: '蓝色', size: 'M', stock: 0, saleStock: 0, inStock: false, colorImage: '' },
    { skuId: '850001', color: '蓝色', size: 'L', stock: 3, saleStock: 3, inStock: true, colorImage: '' },
  ],
  inStockSkuCount: 1,
  totalSkuCount: 2,
  restrictionNumber: -1,
}

const inStockResult = {
  platform: 'yishou',
  productId: '338956151',
  productName: '测试商品',
  productNo: '1381301740',
  inStock: true,
  price: 53.81,
  productUrl: '',
  productImage: '',
  message: '有货',
}

/**
 * 启动监控，跑到 targetRounds 轮后由 result 回调主动 abort 自我终止。
 */
const startAndRun = async (
  config: Partial<StockMonitorConfig> = {},
  targetRounds = 1
): Promise<{ result: MonitorResult; results: MonitorResult[] }> => {
  const results: MonitorResult[] = []
  let controllerRef: AbortController | null = null

  const { controller, promise } = createCancellableMonitor(
    task,
    {
      interval: 2,
      duration: 3600,
      adapterConfig: { uid: '20478621', token: 'token' },
      ...config,
    },
    undefined,
    result => {
      results.push({ ...result })
      if (results.length >= targetRounds) {
        controllerRef?.abort()
      }
    }
  )
  controllerRef = controller

  const result = await promise
  return { result, results }
}

describe('库存监控 × 指定规格', () => {
  beforeEach(() => {
    mocks.checkStock.mockReset()
    mocks.getProductSkus.mockReset()
    mocks.sendEmail.mockReset()

    mocks.sendEmail.mockResolvedValue({ success: true })
    mocks.checkStock.mockResolvedValue(inStockResult)
    mocks.getProductSkus.mockResolvedValue(skuDetail)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('所选规格都没货时不算到货，继续检测且不发邮件', async () => {
    const { result } = await startAndRun({ skus: ['850000'] }, 2)

    expect(mocks.checkStock).toHaveBeenCalledTimes(2)
    expect(mocks.getProductSkus).toHaveBeenCalled()
    expect(mocks.sendEmail).not.toHaveBeenCalled()
    expect(result.detected).toBe(false)
  })

  it('所选规格有货时正常提醒，并带上命中规格', async () => {
    const { result } = await startAndRun({ skus: ['850001'] }, 1)

    expect(result.detected).toBe(true)
    expect(result.matchedSkus).toEqual(['850001'])
    expect(result.matchedSkuLabel).toBe('蓝色 / L')
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)
  })

  it('不选规格时只看商品整体，不额外查 SKU', async () => {
    const { result } = await startAndRun({}, 1)

    expect(result.detected).toBe(true)
    expect(mocks.getProductSkus).not.toHaveBeenCalled()
  })

  it('选了规格但没有登录态也能查 SKU：检测与规格明细都走匿名', async () => {
    const { result } = await startAndRun({ adapterConfig: {}, skus: ['850001'] }, 1)

    expect(result.detected).toBe(true)
    expect(result.matchedSkus).toEqual(['850001'])
    const [request, options] = mocks.getProductSkus.mock.calls[0]
    expect(request).toMatchObject({ productId: '338956151' })
    expect(options?.adapterConfig?.uid).toBeUndefined()
    expect(options?.adapterConfig?.token).toBeUndefined()
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

    await startAndRun(
      {
        adapterConfig: { uid: '20478621', token: 'token' },
        autoOrder: { enabled: true, num: 1 },
        skus: ['850001'],
      },
      1
    )

    expect(mocks.placeAutoOrder).toHaveBeenCalledTimes(1)
    expect(mocks.placeAutoOrder.mock.calls[0][1]).toMatchObject({
      goodsNo: '1381301740',
      skus: ['850001'],
    })
  })
})
