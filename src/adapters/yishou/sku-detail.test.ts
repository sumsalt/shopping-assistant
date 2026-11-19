/**
 * 商品详情（get_goods_info_v2）→ SKU 列表
 *
 * 详情页只调这一个接口，所以这里锁定三件事：
 *   1. 只发一次请求、走 v2、入参是 goods_id（与 App 详情页抓包一致）；
 *   2. 匿名可用，价格回落 alone_price 并标注「游客参考价」；
 *   3. SKU 树、收藏标记、颜色名（去掉「-现货」后缀）映射正确。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ httpPost: vi.fn() }))

vi.mock('../../utils/http', () => ({
  httpPost: mocks.httpPost,
  httpRequest: vi.fn(),
}))

import { YishouAdapter } from './index'

const authConfig = {
  uid: '19456111',
  token: '2083d8472ff2f0aa64d3bfe4164d229f',
  openid: '',
  model: 'iPhone 14 Pro',
  version: '26.700001',
  version_name: '7.66.01',
  channel: 'app' as const,
  requestParams: {
    model: 'iPhone 14 Pro',
    plat_type: 'iOS',
    token: '2083d8472ff2f0aa64d3bfe4164d229f',
    udid: '43198096-8833-4F49-962F-DC330405010D',
    uid: '19456111',
    version: '26.700001',
    version_name: '7.66.01',
  },
  requestHeaders: { 'User-Agent': 'YiShou/7.66.01 (iPhone; iOS 26.7.1; Scale/3.00)' },
}

/** 与抓包同形状：stock / sale_stock 是数字，登录态颜色名带「-现货」 */
const goodsData = {
  goods_id: '341451565',
  goods_no: '1381104809',
  goods_name: '测试商品',
  shop_price: '869.99',
  alone_price: '869.99',
  goods_thumb: 'https://img.example.com/a.jpg',
  goods_status: '1',
  is_on_sale: '1',
  is_stockout: '0',
  sales: '12',
  restriction_number: -1,
  collect_id: '373216991',
  attribute: [
    {
      color: '白色-现货',
      color_id: '1018',
      color_card: 'https://img.example.com/card.jpg',
      card_thumb: '',
      is_recommend: '2',
      item: [
        {
          size: 'M',
          sku: '85228146',
          stock: 0,
          sale_stock: 0,
          sort: '1',
          sku_tag: '',
          is_show_stock: '0',
          is_stock_now: '0',
        },
        {
          size: 'L',
          sku: '85228147',
          stock: 3,
          sale_stock: 2,
          sort: '2',
          sku_tag: '',
          is_show_stock: '0',
          is_stock_now: '0',
        },
      ],
    },
  ],
}

const calls = () => mocks.httpPost.mock.calls as Array<[string, Record<string, string>, unknown, unknown]>
const bodyOf = (i: number) => calls()[i][1]
const optionsOf = (i: number) => calls()[i][3] as { gate?: { flow?: string; accountKey?: string } }

describe('getProductSkus（POST /goods/get_goods_info_v2）', () => {
  beforeEach(() => {
    mocks.httpPost.mockReset()
  })

  it('只发一次请求，入参是 goods_id，goods_no 传空', async () => {
    mocks.httpPost.mockResolvedValue({ code: '200', msg: 'success', data: goodsData })

    const adapter = new YishouAdapter(authConfig)
    await adapter.getProductSkus('341451565')

    expect(calls()).toHaveLength(1)
    expect(calls()[0][0]).toContain('/goods/get_goods_info_v2')
    expect(bodyOf(0)).toMatchObject({ goods_id: '341451565', goods_no: '' })
  })

  it('默认过闸门：库存/价格监控的 SKU 检测走 monitor.stock flow', async () => {
    mocks.httpPost.mockResolvedValue({ code: '200', msg: 'success', data: goodsData })

    const adapter = new YishouAdapter({ channel: 'app' })
    await adapter.getProductSkus('341451565')

    expect(optionsOf(0).gate?.flow).toBe('monitor.stock')
  })

  it('下单预检走 getOrderProductSkus，绑定 order.checkout flow（策略 bypass，不被 1s 令牌拖慢）', async () => {
    mocks.httpPost.mockResolvedValue({ code: '200', msg: 'success', data: goodsData })

    const adapter = new YishouAdapter(authConfig)
    await adapter.getOrderProductSkus('341451565')

    expect(optionsOf(0).gate?.flow).toBe('order.checkout')
  })

  it('登录态：拿货价、收藏标记、SKU 库存都从同一次响应带出', async () => {
    mocks.httpPost.mockResolvedValue({ code: '200', msg: 'success', data: goodsData })

    const adapter = new YishouAdapter(authConfig)
    const result = await adapter.getProductSkus('341451565')

    expect(result.productId).toBe('341451565')
    expect(result.productNo).toBe('1381104809')
    expect(result.price).toBe(869.99)
    expect(result.priceNote).toBeUndefined()
    expect(result.collectId).toBe('373216991')
    // 颜色名去掉登录态才有的「-现货」后缀
    expect(result.colors).toEqual(['白色'])
    expect(result.skuList.map(item => item.color)).toEqual(['白色', '白色'])
    expect(result.sizes).toEqual(['M', 'L'])
    expect(result.skuList[0]).toMatchObject({ skuId: '85228146', stock: 0, saleStock: 0, inStock: false })
    expect(result.skuList[1]).toMatchObject({ skuId: '85228147', stock: 3, saleStock: 2, inStock: true })
    expect(result.inStockSkuCount).toBe(1)
    expect(result.totalSkuCount).toBe(2)
    expect(result.sales).toBe(12)
    expect(result.restrictionNumber).toBe(-1)
  })

  it('匿名：价格改读 alone_price 并标注游客参考价，收藏标记为 0', async () => {
    mocks.httpPost.mockResolvedValue({
      code: '200',
      msg: 'success',
      // 匿名态 shop_price 是零售价，不能用
      data: { ...goodsData, shop_price: '3799.00', collect_id: '0', attribute: [{ ...goodsData.attribute[0], color: '白色' }] },
    })

    const adapter = new YishouAdapter({ channel: 'app' })
    const result = await adapter.getProductSkus('341451565')

    expect(result.price).toBe(869.99)
    expect(result.priceNote).toBe('游客参考价')
    expect(result.collectId).toBe('0')
    expect(calls()).toHaveLength(1)
  })

  it('商品不存在时抛 PRODUCT_NOT_FOUND，并带上商品 ID', async () => {
    mocks.httpPost.mockResolvedValue({ code: '200', msg: 'success', data: null })

    const adapter = new YishouAdapter(authConfig)

    await expect(adapter.getProductSkus('999999999')).rejects.toMatchObject({
      type: 'PRODUCT_NOT_FOUND',
      message: expect.stringContaining('999999999'),
    })
  })

  it('缺商品 ID 时直接拒绝，不发请求', async () => {
    const adapter = new YishouAdapter(authConfig)

    await expect(adapter.getProductSkus('')).rejects.toThrow('缺少商品 ID')
    expect(calls()).toHaveLength(0)
  })
})
