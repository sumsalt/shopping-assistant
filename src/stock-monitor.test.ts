/**
 * 库存到货监控：轮次间隔下限 2 秒
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  checkStock: vi.fn(),
}))

vi.mock('./stock-check', () => ({
  checkStock: mocks.checkStock,
}))

vi.mock('./email', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
  createBackInStockTemplate: () => '<html></html>',
  configureEmailService: () => {},
  loadEmailConfigFromEnv: () => undefined,
}))

import { createCancellableMonitor, MIN_STOCK_MONITOR_INTERVAL } from './stock-monitor'

/** 构造一个最小可用的到货监控任务 */
const task = {
  request: { platform: 'yishou' as const, productId: '123456' },
  recipient: 'dev@example.com',
}

/** 发起监控并拿到取消句柄 */
const start = (interval?: number) => {
  const { controller, promise } = createCancellableMonitor(task, {
    ...(interval === undefined ? {} : { interval }),
    duration: 3600,
  })
  return { controller, promise }
}

describe('库存监控轮次间隔', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.checkStock.mockReset()
    mocks.checkStock.mockResolvedValue({
      productId: '123456',
      productName: '测试商品',
      price: 100,
      inStock: false,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('最小间隔常量为 2 秒', () => {
    expect(MIN_STOCK_MONITOR_INTERVAL).toBe(2)
  })

  it('不传间隔时按 2 秒一轮', async () => {
    const { controller, promise } = start()

    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.checkStock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1_999)
    expect(mocks.checkStock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.checkStock).toHaveBeenCalledTimes(2)

    controller.abort()
    await promise
  })

  it('配置低于下限（历史任务的 1 秒）时按 2 秒执行', async () => {
    const { controller, promise } = start(1)

    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.checkStock).toHaveBeenCalledTimes(1)

    // 1 秒时不应该发起第二轮
    await vi.advanceTimersByTimeAsync(1_000)
    expect(mocks.checkStock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(mocks.checkStock).toHaveBeenCalledTimes(2)

    controller.abort()
    await promise
  })

  it('配置大于下限时按配置间隔执行', async () => {
    const { controller, promise } = start(5)

    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.checkStock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(4_999)
    expect(mocks.checkStock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.checkStock).toHaveBeenCalledTimes(2)

    controller.abort()
    await promise
  })

  it('等待期间取消任务可以立刻结束，不用等满间隔', async () => {
    const { controller, promise } = start(30)

    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.checkStock).toHaveBeenCalledTimes(1)

    controller.abort()
    // 不推进时钟，只让微任务跑完
    await promise
    expect(mocks.checkStock).toHaveBeenCalledTimes(1)
  })
})
