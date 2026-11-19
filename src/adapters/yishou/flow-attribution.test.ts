/**
 * 请求 flow 归属契约（闸门限流的关键防线）
 *
 * 归属错误有两类，都会破坏限频设计：
 *   - 页面手动查询误走监控 flow → 被 1s 令牌排队，交互变慢；
 *   - 后台高频扫描误走 bypass → 绕过闸门，可能触发一手风控。
 * 这组测试锁定每条链路绑定的 flow，任何改动都要显式反映在这里。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ httpPost: vi.fn() }))

vi.mock('../../utils/http', () => ({
  httpPost: mocks.httpPost,
  httpRequest: vi.fn(),
}))

import { YishouAdapter } from './index'

const config = {
  uid: '19456111',
  token: '2083d8472ff2f0aa64d3bfe4164d229f',
  channel: 'app' as const,
  requestParams: { uid: '19456111', token: '2083d8472ff2f0aa64d3bfe4164d229f' },
  requestHeaders: { 'User-Agent': 'YiShou/7.66.01' },
}

const calls = () => mocks.httpPost.mock.calls as Array<[string, Record<string, string>, unknown, { gate?: { flow?: string } }]>
const flowOf = (i = 0) => calls()[i]?.[3]?.gate?.flow
const goodsData = {
  goods_id: '341451565',
  goods_no: '1381104809',
  goods_name: '测试商品',
  goods_price: '869.99',
  sale_stock: 5,
  market_name: '测试市场',
  supply_id: '1',
  supply_name: '测试店铺',
  is_collect: 0,
  collect_id: '',
  sku: [],
  pic: '',
}

const collectionData = [
  { goods_id: '341451565', goods_no: '1381104809', goods_name: '测试', goods_price: '10', sale_stock: 5 },
]

beforeEach(() => {
  mocks.httpPost.mockReset()
})

describe('请求 flow 归属', () => {
  it('checkStock：后台默认 monitor.stock（过闸门），页面传 manual（bypass）', async () => {
    mocks.httpPost.mockResolvedValue({ code: '200', msg: 'success', data: goodsData })
    const adapter = new YishouAdapter(config)

    await adapter.checkStock('341451565')
    expect(flowOf(0)).toBe('monitor.stock')

    await adapter.checkStock('341451565', undefined, 'manual')
    expect(flowOf(1)).toBe('manual')
  })

  it('getProductSkus：后台默认 monitor.stock（过闸门），页面传 manual（bypass）', async () => {
    mocks.httpPost.mockResolvedValue({ code: '200', msg: 'success', data: goodsData })
    const adapter = new YishouAdapter(config)

    await adapter.getProductSkus('341451565')
    expect(flowOf(0)).toBe('monitor.stock')

    await adapter.getProductSkus('341451565', 'manual')
    expect(flowOf(1)).toBe('manual')
  })

  it('checkCollectionStock：后台默认 collection.sync（过闸门），页面传 manual（bypass）', async () => {
    mocks.httpPost.mockResolvedValue({ code: '200', msg: 'success', data: collectionData })
    const adapter = new YishouAdapter(config)

    await adapter.checkCollectionStock(1, 20)
    expect(flowOf(0)).toBe('collection.sync')

    await adapter.checkCollectionStock(1, 20, 'manual')
    expect(flowOf(1)).toBe('manual')
  })

  it('getTabGoodsList：后台 Tab 监控显式走 monitor.tab，绝不落到 bypass 的 manual', async () => {
    mocks.httpPost.mockResolvedValue({ code: '200', msg: 'success', data: { list: [] } })
    const adapter = new YishouAdapter(config)

    await adapter.getTabGoodsList('91343', 1, 20)

    expect(flowOf(0)).toBe('monitor.tab')
    expect(flowOf(0)).not.toBe('manual')
  })
})
