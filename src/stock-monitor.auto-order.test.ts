/**
 * 库存监控 × 自动下单：成功、可重试失败、不可重试失败
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

/** 发起一个开启了自动下单的监控 */
const start = (autoOrder = autoOrderConfig) => {
  const results: MonitorResult[] = []

  const { controller, promise } = createCancellableMonitor(
    task,
    {
      interval: 2,
      duration: 3600,
      adapterConfig: { uid: '20478621', token: 'token' },
      autoOrder,
    },
    undefined,
    result => results.push({ ...result })
  )

  return { controller, promise, results }
}

describe('库存监控 × 自动下单', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.checkStock.mockReset()
    mocks.placeAutoOrder.mockReset()
    mocks.sendEmail.mockReset()
    mocks.getOrderAdapter.mockReset()

    mocks.getOrderAdapter.mockReturnValue({ fake: 'adapter' })
    mocks.sendEmail.mockResolvedValue({ success: true })
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

    const { controller, promise } = start()
    await vi.advanceTimersByTimeAsync(0)
    // 检测到之后还要走完这一轮的 sleep 才会跳出循环
    await vi.advanceTimersByTimeAsync(2_000)

    const result = await promise
    controller.abort()

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

    const { controller, promise } = start()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(2_000)

    controller.abort()
    const result = await promise

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

    const { controller, promise } = start()
    await vi.advanceTimersByTimeAsync(0)

    const result = await promise
    controller.abort()

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

    const { controller, promise } = start()
    await vi.advanceTimersByTimeAsync(0)

    const result = await promise
    controller.abort()

    expect(result.orderUncertain).toBe(true)
    // 结果未知必须人工核对，不能继续循环
    expect(mocks.checkStock).toHaveBeenCalledTimes(1)
  })

  it('没有登录态时降级为普通到货提醒', async () => {
    const { controller, promise } = createCancellableMonitor(
      task,
      { interval: 2, duration: 3600, autoOrder: autoOrderConfig },
      undefined
    )

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(2_000)

    const result = await promise
    controller.abort()

    expect(result.detected).toBe(true)
    expect(mocks.placeAutoOrder).not.toHaveBeenCalled()
    expect(mocks.sendEmail.mock.calls[0][0].html).toBe('<back-in-stock />')
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
      return {
        platform: 'yishou',
        productId: '338956151',
        productName: '测试商品',
        productNo: '1381301740',
        inStock: false,
        price: 53.81,
        productUrl: '',
        productImage: '',
        message: '无货',
      }
    })

    // start() 的 adapterConfig 里有 uid，检测仍然不能带上它
    const { controller, promise } = start()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(2_000)
    controller.abort()
    await promise

    expect(contexts.length).toBeGreaterThan(0)
    expect(contexts.every(ctx => ctx.accountKey === undefined)).toBe(true)
  })
})
