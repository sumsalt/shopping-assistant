/**
 * 库存监控 × 自动下单：成功、可重试失败、不可重试失败
 *
 * 实验分支去掉了固定 sleep，节奏由双层闸门控制。测试里 mock 掉了 stock-check（不再过闸门），
 * 因此用「result 回调里数轮数、达到目标轮数就 abort」的方式自我终止，避免 tight loop。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  checkStock: vi.fn(),
  placeAutoOrder: vi.fn(),
  sendEmail: vi.fn(),
  getOrderAdapter: vi.fn(),
}))

vi.mock('./stock-check', () => ({
  checkStock: mocks.checkStock,
}))

vi.mock('./auto-order', () => ({
  placeAutoOrder: mocks.placeAutoOrder,
  DEFAULT_AUTO_ORDER_PAY_TOOL: '4',
  MAX_AUTO_ORDER_NUM: 99,
}))

vi.mock('./adapters', () => ({
  getOrderAdapter: mocks.getOrderAdapter,
}))

vi.mock('./email', () => ({
  sendEmail: mocks.sendEmail,
  createBackInStockTemplate: () => '<back-in-stock />',
  createAutoOrderTemplate: () => '<auto-order />',
  createAutoOrderFailedTemplate: () => '<auto-order-failed />',
  configureEmailService: () => {},
  loadEmailConfigFromEnv: () => undefined,
}))

import { createCancellableMonitor } from './stock-monitor'
import type { MonitorResult } from './stock-monitor'
import { getGateContext } from './utils/request-gate'

const task = {
  request: { platform: 'yishou' as const, productId: '338956151' },
  recipient: 'dev@example.com',
}

const autoOrderConfig = {
  enabled: true,
  num: 1,
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

const outOfStockResult = { ...inStockResult, inStock: false, message: '无货' }

/**
 * 启动监控，跑到 targetRounds 轮后由 result 回调主动 abort 自我终止。
 * 返回最终 result 与每轮结果快照。
 */
const startAndRun = async (
  config: Record<string, unknown> = {},
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
      autoOrder: autoOrderConfig,
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

describe('库存监控 × 自动下单', () => {
  beforeEach(() => {
    mocks.checkStock.mockReset()
    mocks.placeAutoOrder.mockReset()
    mocks.sendEmail.mockReset()
    mocks.getOrderAdapter.mockReset()

    mocks.getOrderAdapter.mockReturnValue({ fake: 'adapter' })
    mocks.sendEmail.mockResolvedValue({ success: true })
    mocks.checkStock.mockResolvedValue(inStockResult)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('下单成功后标记已检测并发出下单邮件', async () => {
    mocks.placeAutoOrder.mockResolvedValue({
      success: true,
      stage: 'done',
      orderSn: '12641415441626',
      orderAmount: 59.81,
      skuLabel: '蓝色 / L',
      num: 1,
      payTool: '4',
      expireAt: 1794336279000,
      message: '已创建待付款订单',
    })

    const { result } = await startAndRun({}, 1)

    expect(result.detected).toBe(true)
    expect(result.orderSn).toBe('12641415441626')
    expect(result.orderAmount).toBe(59.81)
    expect(result.orderSkuLabel).toBe('蓝色 / L')
    expect(result.orderAttempts).toBe(1)

    expect(mocks.placeAutoOrder).toHaveBeenCalledTimes(1)
    expect(mocks.placeAutoOrder.mock.calls[0][0]).toEqual({ fake: 'adapter' })
    expect(mocks.placeAutoOrder.mock.calls[0][1]).toMatchObject({
      goodsId: '338956151',
      goodsNo: '1381301740',
    })

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)
    expect(mocks.sendEmail.mock.calls[0][0].html).toBe('<auto-order />')
  })

  it('暂时无货时继续监控，不发邮件也不结束任务', async () => {
    mocks.placeAutoOrder.mockResolvedValue({
      success: false,
      stage: 'sku',
      retryable: true,
      message: '该商品当前没有可售规格',
    })

    const { result } = await startAndRun({}, 2)

    expect(result.detected).toBe(false)
    expect(result.orderError).toBe('该商品当前没有可售规格')
    expect(result.orderAttempts).toBe(2)
    expect(mocks.checkStock).toHaveBeenCalledTimes(2)
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('登录态失效时停止任务并发告警邮件', async () => {
    mocks.placeAutoOrder.mockResolvedValue({
      success: false,
      stage: 'create',
      message: '一手登录态失效：登录已失效',
    })

    const { result } = await startAndRun({}, 1)

    expect(result.detected).toBe(false)
    expect(result.orderError).toContain('登录态失效')
    expect(mocks.checkStock).toHaveBeenCalledTimes(1)
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)
    expect(mocks.sendEmail.mock.calls[0][0].html).toBe('<auto-order-failed />')
  })

  it('建单结果未知时在结果里标记 uncertain', async () => {
    mocks.placeAutoOrder.mockResolvedValue({
      success: false,
      stage: 'create',
      uncertain: true,
      message: '建单请求中断，订单可能已生成',
    })

    const { result } = await startAndRun({}, 1)

    expect(result.orderUncertain).toBe(true)
    expect(mocks.checkStock).toHaveBeenCalledTimes(1)
  })

  it('没有登录态时降级为普通到货提醒', async () => {
    const { result } = await startAndRun(
      { adapterConfig: {}, autoOrder: autoOrderConfig },
      1
    )

    expect(result.detected).toBe(true)
    expect(mocks.placeAutoOrder).not.toHaveBeenCalled()
    expect(mocks.sendEmail.mock.calls[0][0].html).toBe('<back-in-stock />')
  })

  it('建单失败后冷却期内只检测、不重复下单', async () => {
    mocks.placeAutoOrder.mockResolvedValue({
      success: false,
      stage: 'create',
      retryable: true,
      cooldownMs: 180_000,
      message: '库存不足',
    })

    const { result } = await startAndRun({}, 3)

    expect(mocks.checkStock.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(mocks.placeAutoOrder).toHaveBeenCalledTimes(1)
    expect(result.orderError).toContain('冷却中')
  })

  it('检测阶段落在匿名桶，不占用账号配额', async () => {
    mocks.placeAutoOrder.mockResolvedValue({
      success: false,
      stage: 'sku',
      retryable: true,
      message: '该商品当前没有可售规格',
    })

    const contexts: Array<{ taskId: string; accountKey?: string }> = []
    mocks.checkStock.mockImplementation(async () => {
      const context = getGateContext()
      contexts.push({
        taskId: context?.taskId ?? '',
        accountKey: context?.accountKey,
      })
      return outOfStockResult
    })

    // startAndRun 的 adapterConfig 里有 uid，检测仍然不能带上它
    await startAndRun({}, 2)

    expect(contexts.length).toBeGreaterThan(0)
    expect(contexts.every(ctx => ctx.accountKey === undefined)).toBe(true)
  })

  it('检测错误在下一轮成功后被清空，不一直挂在卡片上', async () => {
    mocks.checkStock
      .mockRejectedValueOnce(new Error('请求超时（10000ms）'))
      .mockResolvedValue(outOfStockResult)

    const { results } = await startAndRun({}, 2)

    expect(results[0].error).toBe('请求超时（10000ms）')
    expect(results[results.length - 1].error).toBeUndefined()
  })

  it('下单失败后商品转无货时，orderError 不再残留', async () => {
    mocks.checkStock
      .mockResolvedValueOnce(inStockResult)
      .mockResolvedValue(outOfStockResult)
    mocks.placeAutoOrder.mockResolvedValue({
      success: false,
      stage: 'sku',
      retryable: true,
      message: '该商品当前没有可售规格',
    })

    const { results } = await startAndRun({}, 2)

    expect(results[0].orderError).toBe('该商品当前没有可售规格')
    expect(results[results.length - 1].orderError).toBeUndefined()
  })
})
