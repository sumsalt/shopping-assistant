/**
 * 库存监控测试（实验分支）
 *
 * 去掉了固定的 detection-interval sleep：节奏完全由双层请求闸门控制。
 * 生产环境 checkStock 内部的 HTTP 请求会被闸门挡住；测试里 mock 掉了 stock-check，
 * 所以用真实短延时 + 到达指定轮数后主动 abort 的方式驱动，避免 tight loop。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = {
  checkStock: vi.fn(),
  getProductSkus: vi.fn(),
}

vi.mock('./stock-check', () => ({
  checkStock: (...args: unknown[]) => mocks.checkStock(...args),
  getProductSkus: (...args: unknown[]) => mocks.getProductSkus(...args),
}))

vi.mock('./email', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
  createBackInStockTemplate: () => '<html></html>',
  configureEmailService: () => {},
  loadEmailConfigFromEnv: () => undefined,
}))

const { createCancellableMonitor, MIN_STOCK_MONITOR_INTERVAL } = await import('./stock-monitor')

const task = {
  request: { platform: 'yishou' as const, productId: '123456' },
  recipient: 'dev@example.com',
}

const stockResult = {
  productId: '123456',
  productName: '测试商品',
  price: 100,
  inStock: false,
}

/**
 * 启动监控，让每轮 checkStock 走一个真实宏任务（setTimeout 2ms），
 * 达到 targetRounds 轮后自动 abort，返回 promise 供 await。
 */
const runRounds = async (config: Record<string, unknown>, targetRounds = 1) => {
  let controllerRef: AbortController | null = null
  mocks.checkStock.mockImplementation(
    () => new Promise((resolve) => setTimeout(() => resolve(stockResult), 2))
  )
  const realCheck = mocks.checkStock.getMockImplementation()!
  mocks.checkStock.mockImplementation((...args: unknown[]) => {
    const result = realCheck(...args)
    if (mocks.checkStock.mock.calls.length >= targetRounds) {
      // 达到目标轮数后，下一 tick 取消，让当前轮完整结束
      setTimeout(() => controllerRef?.abort(), 1)
    }
    return result
  })

  const { controller, promise } = createCancellableMonitor(task, {
    duration: 3600,
    ...config,
  } as never)
  controllerRef = controller
  await promise
}

describe('库存监控（无 sleep，闸门控节奏）', () => {
  beforeEach(() => {
    mocks.checkStock.mockReset()
    mocks.getProductSkus.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('最小间隔常量保留为 2 秒（仅用于配置展示/时长边界）', () => {
    expect(MIN_STOCK_MONITOR_INTERVAL).toBe(2)
  })

  it('启动后立即执行首轮检测', async () => {
    await runRounds({}, 1)
    expect(mocks.checkStock).toHaveBeenCalled()
  })

  it('去掉 sleep 后不再按 interval 等待：轮次连续执行', async () => {
    await runRounds({}, 3)
    expect(mocks.checkStock.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('检测请求跟随任务凭证，uid/token 与设备参数原样透传', async () => {
    await runRounds(
      {
        adapterConfig: {
          uid: '20536811',
          token: 'tok',
          openid: 'oXxx123',
          requestParams: { uid: '20536811', token: 'tok', udid: 'dev-1', plat_type: 'wx' },
        },
      },
      1
    )

    const options = mocks.checkStock.mock.calls[0]?.[1] as {
      adapterConfig: {
        uid?: string
        token?: string
        openid?: string
        requestParams?: Record<string, string>
      }
    }
    expect(options.adapterConfig.uid).toBe('20536811')
    expect(options.adapterConfig.token).toBe('tok')
    expect(options.adapterConfig.requestParams?.uid).toBe('20536811')
    expect(options.adapterConfig.requestParams?.token).toBe('tok')
    expect(options.adapterConfig.requestParams?.udid).toBe('dev-1')
    expect(options.adapterConfig.openid).toBe('oXxx123')
  })

  it('运行期间取消任务可以立刻结束', async () => {
    const { controller, promise } = createCancellableMonitor(task, { duration: 3600 })
    // 给首轮一个真实宏任务，随后立刻取消
    mocks.checkStock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(stockResult), 2))
    )
    await new Promise((resolve) => setTimeout(resolve, 5))
    controller.abort()
    await promise
    expect(mocks.checkStock.mock.calls.length).toBeGreaterThanOrEqual(1)
  })
})
