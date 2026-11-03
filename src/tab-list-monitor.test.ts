/**
 * Tab 监控 + 生效时段：验证「只在时段内发生的变化才推送」
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getTabGoodsList: vi.fn(),
  sendEmail: vi.fn(),
}))

vi.mock('./adapters', () => ({
  YishouAdapter: class {
    getTabGoodsList = mocks.getTabGoodsList
  },
}))

vi.mock('./email', () => ({
  sendEmail: mocks.sendEmail,
  createTabChangeTemplate: () => '<html></html>',
  configureEmailService: () => {},
  loadEmailConfigFromEnv: () => undefined,
}))

import { createCancellableTabMonitor } from './tab-list-monitor'
import type { CollectionStockResult } from './types'

/** 构造一个最小可用的商品条目 */
const item = (productId: string): CollectionStockResult =>
  ({ productId, productName: `商品${productId}` }) as CollectionStockResult

/** 构造一次 Tab 列表查询结果 */
const listResult = (ids: string[]) => ({
  inStockItems: ids.map(item),
  outOfStockItems: [],
})

describe('monitorTabList 生效时段', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // 本地时间 10:00，生效时段 10:05-10:10，启动时在时段外
    vi.setSystemTime(new Date(2026, 10, 3, 10, 0, 0))
    mocks.getTabGoodsList.mockReset()
    mocks.sendEmail.mockReset()
    mocks.sendEmail.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('时段外启动不建基线，进入时段后重建基线且不推送休眠期间的变化', async () => {
    // 时段外列表有 3 个商品，进入时段后仍是这 3 个（休眠期间没变化），之后新增 1 个
    mocks.getTabGoodsList
      .mockResolvedValueOnce(listResult(['1', '2', '3'])) // 进入时段后的基线
      .mockResolvedValueOnce(listResult(['1', '2', '3'])) // 第一次正式检测：无变化
      .mockResolvedValueOnce(listResult(['1', '2', '3', '4'])) // 第二次检测：新增 1 个

    const { controller } = createCancellableTabMonitor(
      { recipient: 'dev@example.com', tabName: '测试 Tab' },
      {
        tabId: '146453',
        interval: 60,
        minChangeCount: 1,
        activeWindow: { start: '10:05', end: '10:10' },
      }
    )

    // 启动：时段外，不应发请求（直接跳过初始化）
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.getTabGoodsList).toHaveBeenCalledTimes(0)

    // 10:00 → 10:01，进入主循环后判定在时段外，开始休眠
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mocks.getTabGoodsList).toHaveBeenCalledTimes(0)

    // 10:01 → 10:05，醒来后先重建基线（第 1 次请求）
    await vi.advanceTimersByTimeAsync(4 * 60_000)
    expect(mocks.getTabGoodsList).toHaveBeenCalledTimes(1)
    expect(mocks.sendEmail).toHaveBeenCalledTimes(0)

    // 10:06 第一次正式检测：和基线一致，不推送
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mocks.getTabGoodsList).toHaveBeenCalledTimes(2)
    expect(mocks.sendEmail).toHaveBeenCalledTimes(0)

    // 10:07 第二次检测：时段内新增 1 个商品，推送一次
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mocks.getTabGoodsList).toHaveBeenCalledTimes(3)
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)

    controller.abort()
  })

  it('基线抓取失败时保持待重建，不会用旧基线比对', async () => {
    mocks.getTabGoodsList
      .mockRejectedValueOnce(new Error('网络错误')) // 进入时段后建基线失败
      .mockResolvedValueOnce(listResult(['1', '2', '3'])) // 重试建基线成功
      .mockResolvedValueOnce(listResult(['1', '2', '3'])) // 正式检测：无变化

    const errors: string[] = []
    const { controller } = createCancellableTabMonitor(
      { recipient: 'dev@example.com', tabName: '测试 Tab' },
      {
        tabId: '146453',
        interval: 60,
        minChangeCount: 1,
        activeWindow: { start: '10:05', end: '10:10' },
      },
      undefined,
      (result) => {
        if (result.error) {
          errors.push(result.error)
        }
      }
    )

    await vi.advanceTimersByTimeAsync(60_000) // 进入休眠
    await vi.advanceTimersByTimeAsync(4 * 60_000) // 醒来，建基线失败
    expect(errors).toEqual(['网络错误'])

    await vi.advanceTimersByTimeAsync(60_000) // 重试建基线成功
    expect(mocks.getTabGoodsList).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(60_000) // 正式检测，无变化
    expect(mocks.getTabGoodsList).toHaveBeenCalledTimes(3)
    expect(mocks.sendEmail).toHaveBeenCalledTimes(0)

    controller.abort()
  })
})
