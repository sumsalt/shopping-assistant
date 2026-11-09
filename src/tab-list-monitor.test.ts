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
  // Tab 监控走专用发件服务，测试里与默认服务共用同一个 mock 便于断言
  sendTabEmail: mocks.sendEmail,
  createTabChangeTemplate: (_tabName: string, info: TemplateInfo) => {
    mocks.templates.push(info)
    return '<html></html>'
  },
  configureEmailService: () => {},
  configureTabEmailService: () => {},
  loadEmailConfigFromEnv: () => undefined,
  loadTabEmailConfigFromEnv: () => undefined,
}))

import {
  createCancellableTabMonitor,
  MAX_TAB_FULL_SCAN_PAGE_COUNT,
} from './tab-list-monitor'
import type { TabMonitorProgress } from './tab-list-monitor'
import type { CollectionStockResult } from './types'

/** 构造一个最小可用的商品条目 */
const item = (productId: string, supplyId?: string): CollectionStockResult =>
  ({
    productId,
    productName: `商品${productId}`,
    price: 100,
    ...(supplyId ? { supplyId } : {}),
  }) as CollectionStockResult

/** 构造一次 Tab 列表查询结果 */
const listResult = (ids: string[]) => ({
  inStockItems: ids.map(id => item(id)),
  outOfStockItems: [],
})

/** 按「轮 → 页」给出响应：每轮第一次请求第 1 页时切到下一轮，缺失的页返回空 */
const queuePageRounds = (...rounds: string[][][]) => {
  let roundIndex = -1
  mocks.getTabGoodsList.mockImplementation(async (_tabId: string, currentPage: number) => {
    if (currentPage === 1) {
      roundIndex++
    }
    const round = rounds[roundIndex] ?? []
    return listResult(round[currentPage - 1] ?? [])
  })
}

/** 按顺序给出每一轮第一页的商品列表（全量翻页的后续页为空） */
const queueLists = (...lists: string[][]) => {
  queuePageRounds(...lists.map(ids => [ids]))
}

/** 按顺序给出每一轮第一页的商品条目（可带供应商标识） */
const queueItems = (...lists: CollectionStockResult[][]) => {
  let roundIndex = -1
  mocks.getTabGoodsList.mockImplementation(async (_tabId: string, currentPage: number) => {
    if (currentPage === 1) {
      roundIndex++
    }
    return {
      inStockItems: currentPage === 1 ? (lists[roundIndex] ?? []) : [],
      outOfStockItems: [],
    }
  })
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

  it('逐轮对比模式：首页有新商品时全量对比，新增/下架合计达到阈值就提醒', async () => {
    queueLists(
      ['1', '2', '3'], // 初始化基线
      ['1', '2', '3', '4', '5'], // 首页新增 2 个 → 全量对比，提醒
      ['1', '2', '3'], // 首页没有新商品 → 不翻页、不对比
      ['1', '2', '3', '7'] // 首页新增 7 → 全量对比：新增 7、下架 4/5，再次提醒
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

    await vi.advanceTimersByTimeAsync(60_000) // 首页无新商品 → 不提醒
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_000) // 新增 7，同时下架 4、5 → 第 2 次提醒
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2)

    const second = mocks.templates.at(-1)!
    expect(second.newProducts.map(p => p.productId)).toEqual(['7'])
    expect(second.removedProducts?.map(p => p.productId)).toEqual(['4', '5'])

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

    // 10:01 → 10:05，醒来后先全量重建基线（第 1 页有商品、第 2 页为空）
    await vi.advanceTimersByTimeAsync(4 * 60_000)
    expect(mocks.getTabGoodsList).toHaveBeenCalledTimes(2)
    expect(mocks.sendEmail).toHaveBeenCalledTimes(0)

    // 10:06 第一次正式检测：和基线一致，不推送
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mocks.getTabGoodsList).toHaveBeenCalledTimes(3)
    expect(mocks.sendEmail).toHaveBeenCalledTimes(0)

    controller.abort()
  })

  it('基线抓取失败时保持待重建，不会用旧基线检测', async () => {
    let calls = 0
    mocks.getTabGoodsList.mockImplementation(async (_tabId: string, currentPage: number) => {
      calls++
      if (calls === 1) {
        throw new Error('网络错误') // 进入时段后建基线失败
      }
      return currentPage === 1 ? listResult(['1', '2', '3']) : listResult([])
    })

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

    await vi.advanceTimersByTimeAsync(60_000) // 重试建基线成功（第 1 页 + 第 2 页空页）
    expect(mocks.getTabGoodsList).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(60_000) // 正式检测，无新商品
    expect(mocks.getTabGoodsList).toHaveBeenCalledTimes(4)
    expect(mocks.sendEmail).toHaveBeenCalledTimes(0)

    controller.abort()
  })
})

describe('monitorTabList 首页触发全量抓取', () => {
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

  it('首页出现新商品时翻页抓全部，合并去重后计入本轮', async () => {
    queuePageRounds(
      [['1', '2'], ['3'], []], // 初始化：第 1、2 页有商品，第 3 页为空
      [['1', '4'], ['5'], []] // 首页出现 4 → 继续抓第 2 页，发现 5
    )

    const progresses: TabMonitorProgress[] = []
    const { controller } = createCancellableTabMonitor(
      { recipient: 'dev@example.com', tabName: '测试 Tab' },
      { tabId: '146453', interval: 60, minChangeCount: 10, fullInitialScan: true },
      progress => progresses.push(progress)
    )

    // 初始化：连续翻到空页
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.getTabGoodsList.mock.calls.map(call => call[1])).toEqual([1, 2, 3])
    expect(progresses.at(-1)?.seenTotal).toBe(3)

    // 第 1 轮：首页有 4 → 抓第 2 页，合并后 1/4/5，4、5 都是新商品
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mocks.getTabGoodsList.mock.calls.map(call => call[1])).toEqual([1, 2, 3, 1, 2, 3])
    expect(progresses.at(-1)?.newlySeenProducts?.map(item => item.productId)).toEqual(['4', '5'])
    expect(progresses.at(-1)?.currentTotal).toBe(3)

    controller.abort()
  })

  it('首页没有新商品时只抓第 1 页，不继续翻页', async () => {
    queuePageRounds([['1', '2'], []], [['1', '2']], [['2', '1']])

    const { controller } = createCancellableTabMonitor(
      { recipient: 'dev@example.com', tabName: '测试 Tab' },
      { tabId: '146453', interval: 60, minChangeCount: 10, fullInitialScan: true }
    )

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(2 * 60_000)

    // 初始化 2 次（第 2 页为空），之后两轮各只请求第 1 页
    expect(mocks.getTabGoodsList.mock.calls.map(call => call[1])).toEqual([1, 2, 1, 1])
    expect(mocks.sendEmail).toHaveBeenCalledTimes(0)

    controller.abort()
  })

  it('全量抓取某一页失败时整轮作废，新商品不记为已见，下一轮重试', async () => {
    let firstPageCalls = 0
    mocks.getTabGoodsList.mockImplementation(async (_tabId: string, currentPage: number) => {
      if (currentPage === 1) {
        firstPageCalls++
        return listResult(firstPageCalls === 1 ? ['1', '2'] : ['1', '3'])
      }

      // 第 1 轮全量抓第 2 页时失败
      if (firstPageCalls === 2) {
        throw new Error('第 2 页超时')
      }

      return listResult(firstPageCalls === 3 && currentPage === 2 ? ['3'] : [])
    })

    const errors: string[] = []
    const progresses: TabMonitorProgress[] = []
    const { controller } = createCancellableTabMonitor(
      { recipient: 'dev@example.com', tabName: '测试 Tab' },
      { tabId: '146453', interval: 60, minChangeCount: 1, fullInitialScan: true },
      progress => progresses.push(progress),
      result => {
        if (result.error) {
          errors.push(result.error)
        }
      }
    )

    await vi.advanceTimersByTimeAsync(0) // 初始化成功
    await vi.advanceTimersByTimeAsync(60_000) // 首页出现 3 → 全量第 2 页失败
    expect(errors).toEqual(['第 2 页超时'])
    expect(mocks.sendEmail).toHaveBeenCalledTimes(0)
    expect(progresses.at(-1)?.seenTotal).toBe(2)

    await vi.advanceTimersByTimeAsync(60_000) // 重试成功，3 被记为已见
    expect(progresses.at(-1)?.seenTotal).toBe(3)

    controller.abort()
  })

  it('全量抓取最多翻 MAX_TAB_FULL_SCAN_PAGE_COUNT 页', async () => {
    let lastPage = 0
    mocks.getTabGoodsList.mockImplementation(async (_tabId: string, currentPage: number) => {
      lastPage = currentPage
      return currentPage === 1 ? listResult(['1', '2']) : listResult([`p${currentPage}`])
    })

    const { controller } = createCancellableTabMonitor(
      { recipient: 'dev@example.com', tabName: '测试 Tab' },
      { tabId: '146453', interval: 60, fullInitialScan: true }
    )

    // 初始化全量翻页到上限（每页都有商品，不会提前结束）
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.getTabGoodsList).toHaveBeenCalledTimes(MAX_TAB_FULL_SCAN_PAGE_COUNT)
    expect(lastPage).toBe(MAX_TAB_FULL_SCAN_PAGE_COUNT)

    controller.abort()
  })
})

describe('monitorTabList 累计模式全量初始化', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 7, 10, 0, 0))
    mocks.getTabGoodsList.mockReset()
    mocks.sendEmail.mockReset()
    mocks.sendEmail.mockResolvedValue({ success: true })
    mocks.templates.length = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('首次创建时翻页抓全部商品作为基线，之后每轮只抓第一页', async () => {
    queuePageRounds(
      [['1', '2'], ['3', '4'], ['5'], []], // 初始化翻到空页结束
      [['1', '2']], // 第 1 轮：第一页没有新商品
      [['1', '2', '6', '7'], []] // 第 2 轮：第一页出现新商品，继续翻第 2 页
    )

    const progresses: TabMonitorProgress[] = []
    const { controller } = createCancellableTabMonitor(
      { recipient: 'dev@example.com', tabName: '测试 Tab' },
      { tabId: '146453', interval: 60, minChangeCount: 2, fullInitialScan: true },
      progress => progresses.push(progress)
    )

    // 初始化：连续翻 4 页（第 4 页为空），全部记为已见
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.getTabGoodsList).toHaveBeenCalledTimes(4)
    expect(mocks.getTabGoodsList.mock.calls.map(call => call[1])).toEqual([1, 2, 3, 4])
    expect(progresses.at(-1)?.seenTotal).toBe(5)
    expect(progresses.at(-1)?.newlySeenProducts?.map(item => item.productId)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ])
    expect(progresses.at(-1)?.newlySeenProducts?.[0].firstSeenAt).toBeTruthy()
    expect(mocks.sendEmail).toHaveBeenCalledTimes(0)

    // 之后每轮只抓第一页
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mocks.getTabGoodsList).toHaveBeenCalledTimes(5)
    expect(mocks.getTabGoodsList.mock.calls.at(-1)?.[1]).toBe(1)
    expect(mocks.sendEmail).toHaveBeenCalledTimes(0)

    // 第一页出现新商品：继续抓第 2 页（空页），新商品计入提醒
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mocks.getTabGoodsList).toHaveBeenCalledTimes(7)
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)
    expect(mocks.templates.at(-1)!.newProducts.map(item => item.productId)).toEqual(['6', '7'])

    controller.abort()
  })

  it('续跑时沿用已记录的商品详情，不重复计入新商品', async () => {
    queueLists(['1', '2', '3'])

    const progresses: TabMonitorProgress[] = []
    const { controller } = createCancellableTabMonitor(
      { recipient: 'dev@example.com', tabName: '测试 Tab' },
      {
        tabId: '146453',
        interval: 60,
        minChangeCount: 1,
        initialSeenProducts: [
          { productId: '1', productName: '商品1', price: 100, firstSeenAt: '2026-11-01T00:00:00.000Z' },
          { productId: '2', productName: '商品2', price: 200, firstSeenAt: '2026-11-02T00:00:00.000Z' },
        ],
      },
      progress => progresses.push(progress)
    )

    await vi.advanceTimersByTimeAsync(0)
    expect(progresses.at(-1)?.seenTotal).toBe(3)
    expect(progresses.at(-1)?.newlySeenProducts?.map(item => item.productId)).toEqual(['3'])
    expect(mocks.sendEmail).toHaveBeenCalledTimes(0)

    controller.abort()
  })

  it('累计记录带上店铺名、市场与不带店铺名的商品名，供页面展示', async () => {
    mocks.getTabGoodsList.mockResolvedValueOnce({
      inStockItems: [
        {
          ...item('1'),
          brandName: '阿刁的店',
          marketName: '广州沙河',
          productName: '【阿刁的店】复古针织马甲',
          productNameWithoutBrand: '复古针织马甲',
          productNo: 'G9620',
        } as CollectionStockResult,
      ],
      outOfStockItems: [],
    })

    const progresses: TabMonitorProgress[] = []
    const { controller } = createCancellableTabMonitor(
      { recipient: 'dev@example.com', tabName: '测试 Tab' },
      { tabId: '146453', interval: 60 },
      progress => progresses.push(progress)
    )

    await vi.advanceTimersByTimeAsync(0)
    const seen = progresses.at(-1)?.newlySeenProducts?.[0]
    expect(seen?.shopName).toBe('阿刁的店')
    expect(seen?.marketName).toBe('广州沙河')
    expect(seen?.shortName).toBe('复古针织马甲')
    expect(seen?.productNo).toBe('G9620')
    expect(seen?.productName).toBe('【阿刁的店】复古针织马甲')

    controller.abort()
  })

  it('逐轮对比模式：首页没有新商品时只抓第一页', async () => {
    let firstPageCalls = 0
    mocks.getTabGoodsList.mockImplementation(async (_tabId: string, currentPage: number) => {
      if (currentPage === 1) {
        firstPageCalls++
      }
      return currentPage === 1 ? listResult(['1', '2']) : listResult([])
    })

    const { controller } = createCancellableTabMonitor(
      { recipient: 'dev@example.com', tabName: '测试 Tab' },
      { tabId: '146453', interval: 60, mode: 'diff' }
    )

    await vi.advanceTimersByTimeAsync(0) // 初始化全量：第 1 页 + 第 2 页（空）
    await vi.advanceTimersByTimeAsync(120_000) // 两轮常规检测，都只看第 1 页
    expect(mocks.getTabGoodsList.mock.calls.map(call => call[1])).toEqual([1, 2, 1, 1])
    expect(firstPageCalls).toBe(3)

    controller.abort()
  })
})

describe('monitorTabList 店铺黑名单', () => {
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

  it('黑名单店铺的商品不记入累计，也不触发提醒', async () => {
    queueItems(
      [item('1', 's1'), item('2', 's2')], // 基线：s2 在黑名单里，只剩 1
      [item('1', 's1'), item('2', 's2'), item('3', 's2'), item('4', 's1')]
    )

    const progresses: TabMonitorProgress[] = []
    const { controller } = createCancellableTabMonitor(
      { recipient: 'dev@example.com', tabName: '测试 Tab' },
      {
        tabId: '146453',
        interval: 60,
        minChangeCount: 1,
        getBlacklistedSuppliers: () => ['s2'],
      },
      progress => progresses.push(progress)
    )

    await vi.advanceTimersByTimeAsync(0)
    // 基线里只有 s1 的 1 被记录
    expect(progresses.at(-1)?.seenTotal).toBe(1)

    await vi.advanceTimersByTimeAsync(60_000)

    // 新一轮 s2 的 2、3 被过滤，只有 4 是新商品
    expect(progresses.at(-1)?.currentTotal).toBe(2)
    const sent = mocks.templates.at(-1)!
    expect(sent.newProducts.map(p => p.productId)).toEqual(['4'])

    controller.abort()
  })

  it('运行中把店铺加入黑名单，下一轮立即生效', async () => {
    let blacklist: string[] = []

    queueItems(
      [item('1', 's1'), item('2', 's2')],
      [item('1', 's1'), item('2', 's2')],
      [item('1', 's1'), item('2', 's2')]
    )

    const progresses: TabMonitorProgress[] = []
    const { controller } = createCancellableTabMonitor(
      { recipient: 'dev@example.com', tabName: '测试 Tab' },
      {
        tabId: '146453',
        interval: 60,
        minChangeCount: 10,
        getBlacklistedSuppliers: () => blacklist,
      },
      progress => progresses.push(progress)
    )

    await vi.advanceTimersByTimeAsync(0)
    expect(progresses.at(-1)?.currentTotal).toBe(2)

    blacklist = ['s2']
    await vi.advanceTimersByTimeAsync(60_000)

    // 下一轮开始就不再抓黑名单店铺的商品
    expect(progresses.at(-1)?.currentTotal).toBe(1)
    // 已经记录过的商品不会被清掉（取消黑名单后还能看到）
    expect(progresses.at(-1)?.seenTotal).toBe(2)

    controller.abort()
  })
})
