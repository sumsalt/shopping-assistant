/**
 * 共享收藏夹监控引擎测试
 *
 * 重点验证：
 * - 单循环按 pageSize=20 全量翻页，直到某页不足一页
 * - 商品按 goods_no 分发给对应订阅者
 * - 未订阅商品当脏数据清理（默认 removeProductFromCollection）
 * - stop 后循环终止
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  checkCollectionStock: vi.fn(),
  removeProductFromCollection: vi.fn(),
  runWithGateContext: vi.fn(),
}))

vi.mock('./stock-check', () => ({
  checkCollectionStock: mocks.checkCollectionStock,
  removeProductFromCollection: mocks.removeProductFromCollection,
}))

// 让 runWithGateContext 直接执行传入的函数（测试里不真的建闸门上下文）
vi.mock('./utils/request-gate', () => ({
  runWithGateContext: (_ctx: unknown, fn: () => unknown) => fn(),
}))

import { CollectionMonitorEngine } from './collection-monitor'
import type { CollectionStockResult } from './types'

const item = (no: string, overrides: Partial<CollectionStockResult> = {}): CollectionStockResult => ({
  platform: 'yishou',
  productId: `gid_${no}`,
  productName: `商品 ${no}`,
  brandName: '品牌',
  productNo: no,
  inStock: true,
  price: 100,
  productUrl: '',
  productImage: '',
  marketName: '市场',
  salesOf7: 0,
  message: '',
  collectId: `cid_${no}`,
  ...overrides,
})

const account = {
  platform: 'yishou' as const,
  adapterConfig: { uid: 'u1', token: 't1' },
  accountKey: 'u1',
}

/** 让出一个宏任务（mock 里用，避免不 sleep 的循环把微任务打满） */
const yieldTurn = () => new Promise<void>(resolve => setTimeout(resolve, 1))

/** 等待若干轮，让 async 循环推进 */
const tick = async (rounds = 8) => {
  for (let i = 0; i < rounds; i++) await yieldTurn()
}

const pageResult = (items: CollectionStockResult[]) => ({
  inStockItems: items,
  outOfStockItems: [],
  total: items.length,
  inStockCount: items.length,
  outOfStockCount: 0,
})

beforeEach(() => {
  mocks.checkCollectionStock.mockReset()
  mocks.removeProductFromCollection.mockReset()
  mocks.runWithGateContext.mockClear()
})

describe('CollectionMonitorEngine', () => {
  it('订阅 / 注销 / has / size', () => {
    const engine = new CollectionMonitorEngine()
    const handler = vi.fn()
    engine.subscribe('no1', handler)
    expect(engine.has('no1')).toBe(true)
    expect(engine.size).toBe(1)
    engine.unsubscribe('no1')
    expect(engine.has('no1')).toBe(false)
    expect(engine.size).toBe(0)
  })

  it('没有 uid 时拒绝启动', () => {
    const engine = new CollectionMonitorEngine()
    expect(() => engine.start({ ...account, accountKey: '' })).toThrow(/登录态/)
    expect(engine.isRunning).toBe(false)
  })

  it('全量翻页：第一页满 20 继续翻第二页，第二页不足 20 后本轮结束', async () => {
    const engine = new CollectionMonitorEngine()
    const firstPage = Array.from({ length: 20 }, (_, i) => item(`p1_${i}`))
    const secondPage = [item('p2_0')]

    mocks.checkCollectionStock.mockImplementation(async ({ page }: { page: number }) => {
      await yieldTurn()
      // 进入下一轮（第三次调用）就停，避免无限空转
      if (mocks.checkCollectionStock.mock.calls.length > 2) engine.stop()
      return page === 1 ? pageResult(firstPage) : pageResult(secondPage)
    })

    engine.subscribe('p1_0', vi.fn())
    engine.start(account)
    await tick()

    expect(mocks.checkCollectionStock.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(mocks.checkCollectionStock.mock.calls[0][0]).toMatchObject({ page: 1, pageSize: 20 })
    expect(mocks.checkCollectionStock.mock.calls[1][0]).toMatchObject({ page: 2, pageSize: 20 })
    engine.stop()
  })

  it('商品分发给对应订阅者，未订阅的商品连续两轮后才当脏数据取消收藏', async () => {
    const engine = new CollectionMonitorEngine()
    const handler = vi.fn()
    let calls = 0

    mocks.checkCollectionStock.mockImplementation(async () => {
      await yieldTurn()
      calls += 1
      // 前两轮返回同一页：第一轮只记未命中，第二轮才真正清理；第三轮停掉
      if (calls > 2) {
        engine.stop()
        return pageResult([])
      }
      return pageResult([item('subscribed'), item('dirty')])
    })

    engine.subscribe('subscribed', handler)
    engine.start(account)
    await tick()

    expect(handler).toHaveBeenCalledTimes(2)
    expect(handler.mock.calls[0][0]).toMatchObject({ productNo: 'subscribed' })
    expect(mocks.removeProductFromCollection).toHaveBeenCalledTimes(1)
    expect(mocks.removeProductFromCollection.mock.calls[0][0]).toMatchObject({
      productNo: 'dirty',
      collectId: 'cid_dirty',
    })
  })

  it('单轮未订阅不清洗（避免服务恢复期误删）', async () => {
    const engine = new CollectionMonitorEngine()
    let calls = 0

    mocks.checkCollectionStock.mockImplementation(async () => {
      await yieldTurn()
      calls += 1
      if (calls > 1) {
        engine.stop()
        return pageResult([])
      }
      return pageResult([item('dirty')])
    })

    engine.start(account)
    await tick()

    expect(mocks.removeProductFromCollection).not.toHaveBeenCalled()
  })

  it('占位的商品连续多轮也不清理（创建任务 → 订阅之间的窗口保护）', async () => {
    const engine = new CollectionMonitorEngine()
    let calls = 0

    mocks.checkCollectionStock.mockImplementation(async () => {
      await yieldTurn()
      calls += 1
      if (calls > 3) {
        engine.stop()
        return pageResult([])
      }
      return pageResult([item('reserved')])
    })

    engine.reserve('reserved')
    engine.start(account)
    await tick()

    expect(mocks.removeProductFromCollection).not.toHaveBeenCalled()
  })

  it('自定义 onDirty 时不再走默认取消收藏', async () => {
    const engine = new CollectionMonitorEngine()
    const onDirty = vi.fn()
    let calls = 0

    mocks.checkCollectionStock.mockImplementation(async () => {
      await yieldTurn()
      calls += 1
      if (calls > 2) {
        engine.stop()
        return pageResult([])
      }
      return pageResult([item('dirty')])
    })

    engine.start(account, { onDirty })
    await tick()

    expect(onDirty).toHaveBeenCalledTimes(1)
    expect(mocks.removeProductFromCollection).not.toHaveBeenCalled()
  })

  it('单轮扫描异常后继续下一轮，不终止整个循环（超时/502 自愈）', async () => {
    const engine = new CollectionMonitorEngine()
    const onError = vi.fn()
    const log = vi.fn()
    let calls = 0
    let firstThrown = false

    mocks.checkCollectionStock.mockImplementation(async () => {
      await yieldTurn()
      calls += 1
      // 第一次抛 502，之后恢复正常；达到次数后停循环
      if (!firstThrown) {
        firstThrown = true
        throw new Error('HTTP 502 Bad Gateway')
      }
      if (calls >= 4) {
        engine.stop()
        return pageResult([])
      }
      return pageResult([item('heal')])
    })

    engine.subscribe('heal', vi.fn())
    engine.start(account, { onError, log, errorRetryDelayMs: 0 })
    await tick(20)

    // 异常被记录，但循环没有退出：后续轮次照常执行
    expect(onError).toHaveBeenCalled()
    expect(log.mock.calls.some(([msg, level]) => level === 'error' && String(msg).includes('单轮扫描失败'))).toBe(
      true
    )
    expect(calls).toBeGreaterThanOrEqual(3)
    engine.stop()
  })

  it('forgetProduct 清掉 collectId 缓存，避免下一次 ensure 假命中', async () => {
    const engine = new CollectionMonitorEngine()
    mocks.checkCollectionStock.mockImplementation(async () => {
      await yieldTurn()
      if (mocks.checkCollectionStock.mock.calls.length > 2) engine.stop()
      return pageResult([item('forgot')])
    })

    engine.subscribe('forgot', vi.fn())
    engine.start(account)
    await tick()

    // 扫描到后引擎记住了 collectId
    expect(engine.getCollectId('forgot')).toBe('cid_forgot')
    engine.forgetProduct('forgot')
    expect(engine.getCollectId('forgot')).toBeUndefined()
    engine.stop()
  })
})
