/**
 * 待支付订单续期 - 编排循环契约
 *
 * 用 fake timers 推进「每分钟一轮」，mock 掉注入的 RenewOrderAdapter，
 * 覆盖：阈值判定（服务端时钟）、翻页上限、去重、串行、冷却、失败重试、
 * 凭据失效停止、abort / duration 退出。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCancellableOrderRenewMonitor,
  RENEW_COOLDOWN_MS,
  RENEW_MAX_PAGES,
  RENEW_PAGE_SIZE,
  type OrderRenewMonitorConfig,
  type OrderRenewMonitorResult,
} from './order-renew-monitor'
import { StockCheckError, StockCheckErrorType } from './types'
import type { OrderListItem, RenewOrderResult, WaitPayConfirmData } from './types'
import type { RenewOrderAdapter } from './adapters/types'

const NOW = 1794497331000

/** 构造一个待支付订单列表项 */
const order = (sn: string, remainingSeconds = 120, extra: Partial<OrderListItem> = {}): OrderListItem => ({
  orderSn: sn,
  status: 'wait_pay',
  statusName: '待付款',
  addTime: '2026-11-12 23:10:00',
  totalNum: 1,
  payTool: '1',
  message: '',
  items: [],
  ...(remainingSeconds === null
    ? {}
    : { cancelExpireAt: NOW + remainingSeconds * 1000 }),
  ...extra,
})

const confirmed = (
  sn: string,
  remainingSeconds = 120,
  overrides: Partial<WaitPayConfirmData> = {}
): WaitPayConfirmData => ({
  orderSn: sn,
  remainingSeconds,
  cancelExpireAt: NOW + remainingSeconds * 1000,
  currentTimestamp: Math.floor(NOW / 1000),
  payTools: ['1', '4'],
  hasExpress: true,
  hasAddress: true,
  protocol: { mock: sn },
  ...overrides,
})

const renewed = (sn: string, overrides: Partial<RenewOrderResult> = {}): RenewOrderResult => ({
  orderSn: sn,
  payStatus: 'wait_pay',
  orderAmount: 43.19,
  payTool: '1',
  finished: false,
  ...overrides,
})

/** 动态订单：cancelExpireAt 始终相对「当前」剩余 60 秒，避免 fake timer 推进后被初筛判为过期 */
const liveOrder = (sn: string): OrderListItem => ({
  ...order(sn, 60),
  cancelExpireAt: Date.now() + 60 * 1000,
})

const pageResult = (items: OrderListItem[], hasMore = false) => ({
  items,
  page: 1,
  pageSize: RENEW_PAGE_SIZE,
  status: 'wait_pay' as const,
  hasMore,
})

const makeAdapter = () => ({
  getOrderList: vi.fn().mockResolvedValue(pageResult([])),
  confirmWaitPayOrder: vi.fn(),
  reloadWaitPayOrder: vi.fn(),
  getOrderDetail: vi.fn(),
}) as unknown as {
  getOrderList: ReturnType<typeof vi.fn>
  confirmWaitPayOrder: ReturnType<typeof vi.fn>
  reloadWaitPayOrder: ReturnType<typeof vi.fn>
  getOrderDetail: ReturnType<typeof vi.fn>
} & RenewOrderAdapter

/** 单轮跑完即自然退出：duration == interval，不进入下一轮 sleep */
const defaultConfig: OrderRenewMonitorConfig = {
  intervalSeconds: 60,
  duration: 60,
  requestGapMs: 0,
}

const runOneRound = async (
  adapter: RenewOrderAdapter,
  config: OrderRenewMonitorConfig = defaultConfig,
  onResult?: (r: OrderRenewMonitorResult) => void
) => {
  const monitor = createCancellableOrderRenewMonitor(adapter, config, onResult)
  await vi.advanceTimersByTimeAsync(0)
  return monitor.promise
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('扫描周期', () => {
  it('立即执行第一轮，推进 60 秒后执行第二轮', async () => {
    const adapter = makeAdapter()
    adapter.getOrderList.mockResolvedValue(pageResult([]))
    const onResult = vi.fn()
    const monitor = createCancellableOrderRenewMonitor(adapter, { ...defaultConfig, duration: 1000 }, onResult)

    await vi.advanceTimersByTimeAsync(0)
    expect(onResult).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(onResult).toHaveBeenCalledTimes(2)

    monitor.controller.abort()
    await monitor.promise
    expect(adapter.getOrderList).toHaveBeenCalledTimes(2)
  })
})

describe('翻页', () => {
  it('满页继续翻，不满页停止', async () => {
    const adapter = makeAdapter()
    const fullPage = Array.from({ length: RENEW_PAGE_SIZE }, (_, i) => order(`A${i}`, 600))
    adapter.getOrderList
      .mockResolvedValueOnce(pageResult(fullPage, true))
      .mockResolvedValueOnce(pageResult([order('B1', 600)], false))
    // 剩余 600s > 300s，全部跳过，不会续期

    await runOneRound(adapter)
    expect(adapter.getOrderList).toHaveBeenCalledTimes(2)
    expect(adapter.confirmWaitPayOrder).not.toHaveBeenCalled()
  })

  it('到达最大页数后截断', async () => {
    const adapter = makeAdapter()
    const fullPage = Array.from({ length: RENEW_PAGE_SIZE }, (_, i) => order(`A${i}`, 600))
    adapter.getOrderList.mockResolvedValue(pageResult(fullPage, true))

    await runOneRound(adapter)
    expect(adapter.getOrderList).toHaveBeenCalledTimes(RENEW_MAX_PAGES)
  })

  it('status 固定为 wait_pay', async () => {
    const adapter = makeAdapter()
    await runOneRound(adapter)
    expect(adapter.getOrderList).toHaveBeenCalledWith(1, RENEW_PAGE_SIZE, 'wait_pay')
  })
})

describe('阈值判定（服务端时钟复判）', () => {
  it('剩余 0 < x < 300 秒才续期', async () => {
    const adapter = makeAdapter()
    adapter.getOrderList.mockResolvedValue(pageResult([order('A', 120)]))
    adapter.confirmWaitPayOrder.mockResolvedValue(confirmed('A', 120))
    adapter.reloadWaitPayOrder.mockResolvedValue(renewed('A'))

    const result = await runOneRound(adapter)
    expect(adapter.confirmWaitPayOrder).toHaveBeenCalledWith('A')
    expect(adapter.reloadWaitPayOrder).toHaveBeenCalledWith({ mock: 'A' })
    expect(result.renewedCount).toBe(1)
    expect(result.recentRenewals[0]).toMatchObject({ orderSn: 'A', remainingBefore: 120 })
  })

  it.each([
    ['已过期', 0],
    ['恰好 300 秒', 300],
    ['时间充足', 600],
  ])('%s 跳过，不发 reload', async (_label, remaining) => {
    const adapter = makeAdapter()
    adapter.getOrderList.mockResolvedValue(pageResult([order('A', remaining)]))
    // 初筛会挡掉 <=0 与 >=300 的，但 300 边界要走到 confirm 才能确认服务端口径
    adapter.confirmWaitPayOrder.mockResolvedValue(confirmed('A', remaining as number))

    const result = await runOneRound(adapter)
    expect(adapter.reloadWaitPayOrder).not.toHaveBeenCalled()
    expect(result.skippedCount).toBeGreaterThanOrEqual(1)
  })

  it('本地时钟初筛：明显时间充足的订单不调用 confirm', async () => {
    const adapter = makeAdapter()
    adapter.getOrderList.mockResolvedValue(pageResult([order('A', 900)]))
    await runOneRound(adapter)
    expect(adapter.confirmWaitPayOrder).not.toHaveBeenCalled()
  })

  it('无 cancelExpireAt 时仍交给 confirm 的服务端时钟复判', async () => {
    const adapter = makeAdapter()
    adapter.getOrderList.mockResolvedValue(pageResult([order('A', null as unknown as number)]))
    adapter.confirmWaitPayOrder.mockResolvedValue(confirmed('A', 60))
    adapter.reloadWaitPayOrder.mockResolvedValue(renewed('A'))

    const result = await runOneRound(adapter)
    expect(result.renewedCount).toBe(1)
  })

  it('confirm 的服务端剩余时长优先于本地初筛', async () => {
    const adapter = makeAdapter()
    adapter.getOrderList.mockResolvedValue(pageResult([order('A', 60)]))
    // 本地看是 60s，但服务端说还有 600s → 跳过
    adapter.confirmWaitPayOrder.mockResolvedValue(confirmed('A', 600))

    const result = await runOneRound(adapter)
    expect(adapter.reloadWaitPayOrder).not.toHaveBeenCalled()
    expect(result.skippedCount).toBe(1)
  })

  it('remainingSeconds 缺失时回落到 cancelExpireAt 与本地时钟', async () => {
    const adapter = makeAdapter()
    adapter.getOrderList.mockResolvedValue(pageResult([order('A', 60)]))
    adapter.confirmWaitPayOrder.mockResolvedValue({
      ...confirmed('A', 60),
      remainingSeconds: undefined,
    })
    adapter.reloadWaitPayOrder.mockResolvedValue(renewed('A'))

    const result = await runOneRound(adapter)
    expect(result.renewedCount).toBe(1)
  })

  it('缺少地址或快递时跳过并告警，不发 reload', async () => {
    const adapter = makeAdapter()
    adapter.getOrderList.mockResolvedValue(pageResult([order('A', 60)]))
    adapter.confirmWaitPayOrder.mockResolvedValue(confirmed('A', 60, { hasExpress: false }))

    const result = await runOneRound(adapter)
    expect(adapter.reloadWaitPayOrder).not.toHaveBeenCalled()
    expect(result.error).toMatch(/可用快递/)
  })
})

describe('单轮去重与串行', () => {
  it('同轮重复订单号只处理一次', async () => {
    const adapter = makeAdapter()
    adapter.getOrderList.mockResolvedValue(pageResult([order('A', 60), order('A', 60)]))
    adapter.confirmWaitPayOrder.mockResolvedValue(confirmed('A', 60))
    adapter.reloadWaitPayOrder.mockResolvedValue(renewed('A'))

    const result = await runOneRound(adapter)
    expect(adapter.confirmWaitPayOrder).toHaveBeenCalledTimes(1)
    expect(result.renewedCount).toBe(1)
  })

  it('多个订单串行续期，顺序与列表一致', async () => {
    const adapter = makeAdapter()
    adapter.getOrderList.mockResolvedValue(pageResult([order('A', 60), order('B', 90)]))
    adapter.confirmWaitPayOrder.mockImplementation((sn: string) =>
      Promise.resolve(confirmed(sn, sn === 'A' ? 60 : 90)))
    adapter.reloadWaitPayOrder.mockImplementation((p: unknown) =>
      Promise.resolve(renewed((p as { mock: string }).mock)))

    const result = await runOneRound(adapter)
    expect(adapter.confirmWaitPayOrder.mock.calls.map(c => c[0])).toEqual(['A', 'B'])
    expect(result.renewedCount).toBe(2)
    expect(result.recentRenewals.map(r => r.orderSn)).toEqual(['B', 'A'])
  })
})

describe('冷却（防止有效期未刷新时重复提交）', () => {
  it('续期后 4 分钟内同一单不再提交 reload', async () => {
    const adapter = makeAdapter()
    adapter.getOrderList.mockImplementation(() => Promise.resolve(pageResult([liveOrder('A')])))
    adapter.confirmWaitPayOrder.mockResolvedValue(confirmed('A', 60))
    adapter.reloadWaitPayOrder.mockResolvedValue(renewed('A'))

    const monitor = createCancellableOrderRenewMonitor(adapter, { ...defaultConfig, duration: 1000 })
    await vi.advanceTimersByTimeAsync(0)
    expect(adapter.reloadWaitPayOrder).toHaveBeenCalledTimes(1)

    // 推进两轮仍在 4 分钟冷却内
    await vi.advanceTimersByTimeAsync(60_000)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(adapter.reloadWaitPayOrder).toHaveBeenCalledTimes(1)

    monitor.controller.abort()
    await monitor.promise
  })

  it('超过冷却后可以再次续期', async () => {
    const adapter = makeAdapter()
    adapter.getOrderList.mockImplementation(() => Promise.resolve(pageResult([liveOrder('A')])))
    adapter.confirmWaitPayOrder.mockResolvedValue(confirmed('A', 60))
    adapter.reloadWaitPayOrder.mockResolvedValue(renewed('A'))

    const monitor = createCancellableOrderRenewMonitor(adapter, { ...defaultConfig, duration: 100000 })
    await vi.advanceTimersByTimeAsync(0)
    expect(adapter.reloadWaitPayOrder).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(RENEW_COOLDOWN_MS + 60_000)
    expect(adapter.reloadWaitPayOrder.mock.calls.length).toBeGreaterThan(1)

    monitor.controller.abort()
    await monitor.promise
  })
})

describe('失败语义', () => {
  it('reload 失败不中断循环，下一轮重试', async () => {
    const adapter = makeAdapter()
    adapter.getOrderList.mockImplementation(() => Promise.resolve(pageResult([liveOrder('A')])))
    adapter.confirmWaitPayOrder.mockResolvedValue(confirmed('A', 60))
    adapter.reloadWaitPayOrder
      .mockRejectedValueOnce(new Error('网络抖动'))
      .mockResolvedValueOnce(renewed('A'))

    const results: OrderRenewMonitorResult[] = []
    const monitor = createCancellableOrderRenewMonitor(
      adapter, { ...defaultConfig, duration: 1000 }, r => results.push({ ...r })
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(results[0].error).toMatch(/网络抖动/)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(adapter.reloadWaitPayOrder).toHaveBeenCalledTimes(2)

    monitor.controller.abort()
    await monitor.promise
  })

  it('reload 返回非 wait_pay 时标记结束，后续不再续期', async () => {
    const adapter = makeAdapter()
    adapter.getOrderList.mockResolvedValue(pageResult([order('A', 60)]))
    adapter.confirmWaitPayOrder.mockResolvedValue(confirmed('A', 60))
    adapter.reloadWaitPayOrder.mockResolvedValue(renewed('A', { payStatus: 'already', finished: true }))

    const monitor = createCancellableOrderRenewMonitor(adapter, { ...defaultConfig, duration: 1000 })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(adapter.reloadWaitPayOrder).toHaveBeenCalledTimes(1)

    monitor.controller.abort()
    const result = await monitor.promise
    expect(result.finishedCount).toBe(1)
    expect(result.recentRenewals[0].finishedReason).toMatch(/already/)
  })

  it('续期后回查发现有效期未后移时告警', async () => {
    const adapter = makeAdapter()
    adapter.getOrderList.mockResolvedValue(pageResult([order('A', 60)]))
    adapter.confirmWaitPayOrder.mockResolvedValue(confirmed('A', 60))
    adapter.reloadWaitPayOrder.mockResolvedValue(renewed('A'))
    adapter.getOrderDetail.mockResolvedValue({ expireAt: NOW + 60 * 1000 })

    const result = await runOneRound(adapter)
    expect(result.renewedCount).toBe(1)
    expect(result.recentRenewals[0].verified).toBe(false)
    expect(result.error).toMatch(/未后移/)
  })

  it('续期后有效期后移则 verified 为 true', async () => {
    const adapter = makeAdapter()
    adapter.getOrderList.mockResolvedValue(pageResult([order('A', 60)]))
    adapter.confirmWaitPayOrder.mockResolvedValue(confirmed('A', 60))
    adapter.reloadWaitPayOrder.mockResolvedValue(renewed('A'))
    adapter.getOrderDetail.mockResolvedValue({ expireAt: NOW + 20 * 60 * 1000 })

    const result = await runOneRound(adapter)
    expect(result.recentRenewals[0].verified).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('凭据失效立即停止任务，不无限重试', async () => {
    const adapter = makeAdapter()
    adapter.getOrderList.mockResolvedValue(pageResult([order('A', 60)]))
    adapter.confirmWaitPayOrder.mockRejectedValue(
      new StockCheckError(StockCheckErrorType.AUTH_REQUIRED, '登录态失效')
    )

    const monitor = createCancellableOrderRenewMonitor(adapter, { ...defaultConfig, duration: 100000 })
    await vi.advanceTimersByTimeAsync(0)
    const result = await monitor.promise
    expect(result.error).toMatch(/登录态失效/)
    expect(adapter.confirmWaitPayOrder).toHaveBeenCalledTimes(1)
  })
})

describe('退出条件', () => {
  it('duration 到期自然结束', async () => {
    const adapter = makeAdapter()
    adapter.getOrderList.mockResolvedValue(pageResult([]))
    const result = await runOneRound(adapter, { ...defaultConfig, duration: 60 })
    expect(result.checkCount).toBe(1)
  })

  it('abort 可打断等待立即结束', async () => {
    const adapter = makeAdapter()
    adapter.getOrderList.mockResolvedValue(pageResult([]))
    const monitor = createCancellableOrderRenewMonitor(adapter, { ...defaultConfig, duration: 100000 })
    await vi.advanceTimersByTimeAsync(0)
    monitor.controller.abort()
    const result = await monitor.promise
    expect(result.checkCount).toBe(1)
  })

  it('progress 回调带出轮次与续期数', async () => {
    const adapter = makeAdapter()
    adapter.getOrderList.mockResolvedValue(pageResult([order('A', 60)]))
    adapter.confirmWaitPayOrder.mockResolvedValue(confirmed('A', 60))
    adapter.reloadWaitPayOrder.mockResolvedValue(renewed('A'))
    const progress = vi.fn()
    const monitor = createCancellableOrderRenewMonitor(adapter, defaultConfig, undefined, progress)
    await vi.advanceTimersByTimeAsync(0)
    await monitor.promise
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({ checkCount: 1, renewedCount: 1, duration: 60 })
    )
  })
})
