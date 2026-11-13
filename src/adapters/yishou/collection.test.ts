/**
 * 一手适配器 - 收藏夹分页
 *
 * 收藏夹用 `pageindex`（页码，从 1 开始）+ `pagesize`，与订单列表的
 * `pageidx`（偏移量）不是一回事，写错就会一直返回第一页。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  httpPost: vi.fn(),
}))

vi.mock('../../utils/http', () => ({
  httpPost: mocks.httpPost,
  httpRequest: vi.fn(),
}))

import { YishouAdapter } from './index'

const config = {
  uid: '20478621',
  token: 'token-abc',
  openid: '',
  model: 'iPhone 14 Pro<iPhone15,2>',
  version: '8.0.60',
  version_name: '4.9.0',
}

const lastBody = () => mocks.httpPost.mock.calls.at(-1)?.[1] as Record<string, string>

const item = (collectId: string, overrides: Record<string, unknown> = {}) => ({
  goods_id: `goods_${collectId}`,
  goods_no: `no_${collectId}`,
  goods_name: `商品 ${collectId}`,
  brand_name: '测试品牌',
  shop_price: '100.00',
  goods_thumb: '',
  goods_img: '',
  goods_status: '1',
  is_on_sale: '1',
  is_stockout: '0',
  is_replenish: '2',
  collect_id: collectId,
  one_market_name: '市场',
  sales_of_7: 1,
  ...overrides,
})

beforeEach(() => {
  mocks.httpPost.mockReset()
})

describe('checkCollectionStock 分页', () => {
  it('按页码传 pageindex，不再传 page/page_size/defaultSort', async () => {
    mocks.httpPost.mockResolvedValueOnce({ code: '200', msg: '', data: [item('1')] })

    const adapter = new YishouAdapter(config)
    await adapter.checkCollectionStock(3, 20)

    const body = lastBody()
    expect(body.pageindex).toBe('3')
    expect(body.pagesize).toBe('20')
    expect(body).not.toHaveProperty('page')
    expect(body).not.toHaveProperty('page_size')
    expect(body).not.toHaveProperty('defaultSort')
  })

  it('页码非法时回落到第 1 页', async () => {
    mocks.httpPost.mockResolvedValueOnce({ code: '200', msg: '', data: [] })

    const adapter = new YishouAdapter(config)
    await adapter.checkCollectionStock(0, 0)

    expect(lastBody().pageindex).toBe('1')
    expect(lastBody().pagesize).toBe('20')
  })

  it('按有货/无货拆分，total 为本页条数', async () => {
    mocks.httpPost.mockResolvedValueOnce({
      code: '200',
      msg: '',
      data: [item('1'), item('2', { is_stockout: '1' }), item('3')],
    })

    const adapter = new YishouAdapter(config)
    const result = await adapter.checkCollectionStock(1, 20)

    expect(result.total).toBe(3)
    expect(result.inStockCount).toBe(2)
    expect(result.outOfStockCount).toBe(1)
  })
})
