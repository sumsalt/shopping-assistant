/**
 * Tab 监控：任务内累积「新商品」并只在累计达到阈值时提醒
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** 邮件模板入参（只关心断言用到的字段） */
type TemplateInfo = {
  mode?: 'accumulate' | 'diff'
  newProducts: Array<{ productId: string }>
  removedProducts?: Array<{ productId: string }>
  currentTotal: number
  seenTotal?: number
}

const mocks = vi.hoisted(() => ({
  getTabGoodsList: vi.fn(),
  sendEmail: vi.fn(),
  templates: [] as TemplateInfo[],
}))

vi.mock('./adapters', () => ({
  YishouAdapter: class {
    getTabGoodsList = mocks.getTabGoodsList
  },
}))

vi.mock('./email', () => ({
  sendEmail: mocks.sendEmail,
  createTabChangeTemplate: (_tabName: string, info: TemplateInfo) => {
    mocks.templates.push(info)
    return '<html></html>'
  },
  configureEmailService: () => {},
  loadEmailConfigFromEnv: () => undefined,
}))

import { createCancellableTabMonitor } from './tab-list-monitor'
import type { CollectionStockResult } from './types'

/** 构造一个最小可用的商品条目 */
const item = (productId: string): CollectionStockResult =>
  ({ productId, productName: `商品${productId}`, price: 100 }) as CollectionStockResult

/** 构造一次 Tab 列表查询结果 */
const listResult = (ids: string[]) => ({
  inStockItems: ids.map(item),
  outOfStockItems: [],
})

/** 按顺序给出每一轮的商品列表 */
const queueLists = (...lists: string[][]) => {
  for (const ids of lists) {
    mocks.getTabGoodsList.mockResolvedValueOnce(listResult(ids))
  }
}

describe('monitorTabList 累积新商品', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 3, 10, 0, 0))
    mocks.getTabGoodsList.mockReset()
    mocks.sendEmail.mockReset()
    mocks.sendEmail.mockResolvedValue({ success: true })
    mocks.templates.length = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('累计达到阈值才提醒，只列新商品，反复上下架不重复提醒', async () => {
    queueLists(
      ['1', '2', '3'], // 初始化基线
      ['1', '2', '3'], // 无新商品
      ['1', '2', '4'], // 4 是新商品（1/3，未达阈值）
      ['1', '2', '3', '4'], // 3 重新上架，但早就见过，不算新
      ['1', '2', '4', '5'], // 5 是新商品（2/3）
      ['1', '2', '5', '6'], // 6 是新商品，累计 3 个 → 推送
      ['1', '2', '5', '6'], // 推送后队列已清空
      ['3', '4', '5', '6'] // 3、4 都是老商品，再次上架不提醒
    )

    const { controller } = createCancellableTabMonitor(
      { recipient: 'dev@example.com', tabName: '测试 Tab' },
      { tabId: '146453', interval: 60, minChangeCount: 3 }
    )

    // 初始化（立即执行）
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.getTabGoodsList).toHaveBeenCalledTimes(1)

    // 第 1~4 轮：新商品 4、5 陆续出现但累计不足 3 个
    await vi.advanceTimersByTimeAsync(4 * 60_000)
    expect(mocks.sendEmail).toHaveBeenCalledTimes(0)

    // 第 5 轮：6 出现，累计 3 个 → 推送一次
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)

    const sent = mocks.templates.at(-1)!
    expect(sent.newProducts.map(p => p.productId)).toEqual(['4', '5', '6'])
    expect(sent.currentTotal).toBe(4)
    expect(sent.seenTotal).toBe(6)

    // 后面两轮：不再有新商品（3、4 是老人），不重复提醒
    await vi.advanceTimersByTimeAsync(2 * 60_000)
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)

    controller.abort()
  })

  it('逐轮对比模式：每轮新增/下架合计达到阈值就提醒', async () => {
    queueLists(
      ['1', '2', '3'], // 初始化基线
      ['1', '2', '3', '4', '5'], // 新增 2 个 → 达到阈值 2，提醒
      ['1', '2', '3'], // 下架 4、5 → 又达到阈值，再次提醒（对比模式特性）
      ['1', '2', '3'], // 无变化
      ['1', '2', '3', '4'] // 只新增 1 个，不足阈值
    )

    const { controller } = createCancellableTabMonitor(
      { recipient: 'dev@example.com', tabName: '测试 Tab' },
      { tabId: '146453', interval: 60, mode: 'diff', minChangeCount: 2 }
    )

    await vi.advanceTimersByTimeAsync(0) // 初始化
    await vi.advanceTimersByTimeAsync(60_000) // 新增 4、5 → 第 1 次提醒
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)

    const first = mocks.templates.at(-1)!
    expect(first.mode).toBe('diff')
    expect(first.newProducts.map(p => p.productId)).toEqual(['4', '5'])

    await vi.advanceTimersByTimeAsync(60_000) // 下架 4、5 → 第 2 次提醒
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2)

    const second = mocks.templates.at(-1)!
    expect(second.removedProducts?.map(p => p.productId)).toEqual(['4', '5'])

    await vi.advanceTimersByTimeAsync(2 * 60_000) // 无变化 / 只变 1 个
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2)

    controller.abort()
  })

  it('续跑时沿用已见集合，重启前的商品不算新商品', async () => {
    queueLists(
      ['1', '2', '3'],
      ['1', '2', '3', '4']
    )

    const { controller } = createCancellableTabMonitor(
      { recipient: 'dev@example.com', tabName: '测试 Tab' },
      {
        tabId: '146453',
        interval: 60,
        minChangeCount: 1,
        initialSeenProductIds: ['1', '2', '3', '4'],
      }
    )

    await vi.advanceTimersByTimeAsync(2 * 60_000)
    expect(mocks.sendEmail).toHaveBeenCalledTimes(0)

    controller.abort()
  })

  it('邮件发送失败时保留待提醒队列，下一轮重试而不是丢掉', async () => {
    queueLists(
      ['1'],
      ['1', '2'],
      ['1', '2']
    )
    mocks.sendEmail
      .mockResolvedValueOnce({ success: false, error: 'SMTP 超时' })
      .mockResolvedValueOnce({ success: true })

    const { controller } = createCancellableTabMonitor(
      { recipient: 'dev@example.com', tabName: '测试 Tab' },
      { tabId: '146453', interval: 60, minChangeCount: 1 }
    )

    await vi.advanceTimersByTimeAsync(0) // 初始化
    await vi.advanceTimersByTimeAsync(60_000) // 发现 2，发送失败
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_000) // 本轮无新商品，但队列未清空 → 重试成功
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2)

    const sent = mocks.templates.at(-1)!
    expect(sent.newProducts.map(p => p.productId)).toEqual(['2'])

    controller.abort()
  })
})

describe('monitorTabList 生效时段', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // 本地时间 10:00，生效时段 10:05-10:10，启动时在时段外
    vi.setSystemTime(new Date(2026, 10, 3, 10, 0, 0))
    mocks.getTabGoodsList.mockReset()
    mocks.sendEmail.mockReset()
    mocks.sendEmail.mockResolvedValue({ success: true })
    mocks.templates.length = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('时段外启动不建基线，进入时段后重建基线且不推送休眠期间的变化', async () => {
    queueLists(
      ['1', '2', '3'], // 进入时段后的基线
      ['1', '2', '3'] // 第一次正式检测：无新商品
    )

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

    controller.abort()
  })

  it('基线抓取失败时保持待重建，不会用旧基线检测', async () => {
    mocks.getTabGoodsList
      .mockRejectedValueOnce(new Error('网络错误')) // 进入时段后建基线失败
      .mockResolvedValueOnce(listResult(['1', '2', '3'])) // 重试建基线成功
      .mockResolvedValueOnce(listResult(['1', '2', '3'])) // 正式检测：无新商品

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

    await vi.advanceTimersByTimeAsync(60_000) // 正式检测，无新商品
    expect(mocks.getTabGoodsList).toHaveBeenCalledTimes(3)
    expect(mocks.sendEmail).toHaveBeenCalledTimes(0)

    controller.abort()
  })
})
