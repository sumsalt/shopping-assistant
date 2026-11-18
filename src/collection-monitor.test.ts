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

  it('商品分发给对应订阅者，未订阅的当脏数据取消收藏', async () => {
    const engine = new CollectionMonitorEngine()
    const handler = vi.fn()

    mocks.checkCollectionStock.mockImplementation(async () => {
      await yieldTurn()
      engine.stop() // 首轮翻页后立即停，避免重复
      return pageResult([item('subscribed'), item('dirty')])
    })

    engine.subscribe('subscribed', handler)
    engine.start(account)
    await tick()

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0]).toMatchObject({ productNo: 'subscribed' })
    expect(mocks.removeProductFromCollection).toHaveBeenCalledTimes(1)
    expect(mocks.removeProductFromCollection.mock.calls[0][0]).toMatchObject({
      productNo: 'dirty',
      collectId: 'cid_dirty',
    })
  })

  it('自定义 onDirty 时不再走默认取消收藏', async () => {
    const engine = new CollectionMonitorEngine()
    const onDirty = vi.fn()

    mocks.checkCollectionStock.mockImplementation(async () => {
      await yieldTurn()
      engine.stop()
      return pageResult([item('dirty')])
    })

    engine.start(account, { onDirty })
    await tick()

    expect(onDirty).toHaveBeenCalledTimes(1)
    expect(mocks.removeProductFromCollection).not.toHaveBeenCalled()
  })
})
