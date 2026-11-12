/**
 * 自动下单编排层：地址 → 规格 → 结算准备 → 建单
 *
 * 编排层只做业务决策，协议细节由适配器封装。这里用假的 prepareCheckout / createOrder
 * 覆盖：多规格合单、库存削减、残留检测、失败语义、支付方式回落、precheck 不建单。
 */

import { describe, expect, it, vi } from 'vitest'
import { StockCheckError, StockCheckErrorType } from './types'
import type { AutoOrderAdapter } from './auto-order'
import { placeAutoOrder, precheckAutoOrder } from './auto-order'
import type {
  CheckoutReady,
  YishouAddress,
  YishouCreateOrderData,
  ProductSkuResult,
} from './types'

const address: YishouAddress = {
  addressId: '9706970',
  consignee: '张三',
  province: '31',
  city: '386',
  district: '3265',
  address: '某某路 1 号',
  mobile: '13800000000',
  area: '浙江省 金华市 东阳市',
}

const skuResult = (saleStocks: number[]): ProductSkuResult => ({
  platform: 'yishou',
  productId: '338956151',
  productName: '测试商品',
  productNo: '1381301740',
  price: 53.81,
  productImage: '',
  productUrl: '',
  sales: 0,
  colors: ['蓝色', '黑色'],
  sizes: ['M', 'L'],
  skuList: saleStocks.map((sale, index) => ({
    skuId: `85000${index}`,
    color: index < 2 ? '蓝色' : '黑色',
    colorId: '1',
    size: index % 2 === 0 ? 'M' : 'L',
    stock: sale,
    saleStock: sale,
    inStock: sale > 0,
    colorImage: '',
  })),
  inStockSkuCount: saleStocks.filter(n => n > 0).length,
  totalSkuCount: saleStocks.length,
  restrictionNumber: -1,
})

/** 构造结算就绪结果；默认「结算认可 850001 一件」 */
const checkoutReady = (over: Partial<CheckoutReady> = {}): CheckoutReady => ({
  items: [{ sku: '850001', num: 1 }],
  num: 1,
  goodsAmount: 53.81,
  shippingFee: 6,
  payTools: ['1', '4'],
  address,
  protocol: { recIds: '1381301740' },
  ...over,
})

const createdOrder: YishouCreateOrderData = {
  orderSn: '12641415441626',
  payStatus: 'wait_pay',
  orderAmount: 59.81,
  payTool: '4',
}

/** 构造一个全成功路径的假适配器 */
const createAdapter = (overrides: Partial<AutoOrderAdapter> = {}): AutoOrderAdapter => ({
  getAddresses: vi.fn().mockResolvedValue([address]),
  getProductSkus: vi.fn().mockResolvedValue(skuResult([0, 3])),
  prepareCheckout: vi.fn().mockResolvedValue(checkoutReady()),
  createOrder: vi.fn().mockResolvedValue(createdOrder),
  discardCheckout: vi.fn().mockResolvedValue(undefined),
  getOrderDetail: vi.fn().mockResolvedValue({ expireAt: 1794336279000, orderAmount: 59.81 }),
  ...overrides,
})

const params = {
  goodsId: '338956151',
  goodsNo: '1381301740',
  config: { enabled: true, num: 1 },
}

/** 取 prepareCheckout 的调用入参 */
const prepareArgs = (adapter: AutoOrderAdapter) =>
  (adapter.prepareCheckout as ReturnType<typeof vi.fn>).mock.calls[0][0]
/** 取 createOrder 的调用入参 (protocol, payTool) */
const createArgs = (adapter: AutoOrderAdapter) =>
  (adapter.createOrder as ReturnType<typeof vi.fn>).mock.calls[0]

describe('placeAutoOrder', () => {
  it('挑第一个有货规格并建单成功', async () => {
    const adapter = createAdapter()
    const result = await placeAutoOrder(adapter, params)

    expect(result.success).toBe(true)
    expect(result.orderSn).toBe('12641415441626')
    expect(result.orderAmount).toBe(59.81)
    expect(result.sku).toBe('850001')
    expect(result.skuLabel).toBe('蓝色 / L')
    expect(result.expireAt).toBe(1794336279000)

    // 编排层只把「买哪些规格、几件 + 地址」交给适配器，不碰 selected
    expect(prepareArgs(adapter)).toMatchObject({
      goodsId: '338956151',
      goodsNo: '1381301740',
      lines: [{ sku: '850001', num: 1 }],
      address,
    })
    // 建单用 prepareCheckout 返回的协议上下文，支付方式按结算结果回落
    expect(createArgs(adapter)[0]).toEqual(checkoutReady().protocol)
    expect(createArgs(adapter)[1]).toBe('4')
  })

  it('没有可售规格时不下单，标记为可重试', async () => {
    const adapter = createAdapter({
      getProductSkus: vi.fn().mockResolvedValue(skuResult([0, 0])),
    })
    const result = await placeAutoOrder(adapter, params)

    expect(result.success).toBe(false)
    expect(result.stage).toBe('sku')
    expect(result.retryable).toBe(true)
    expect(adapter.prepareCheckout).not.toHaveBeenCalled()
  })

  it('结算时已无库存：放弃结算并标记可重试', async () => {
    const adapter = createAdapter({
      prepareCheckout: vi.fn().mockResolvedValue(checkoutReady({ items: [], num: 0 })),
    })
    const result = await placeAutoOrder(adapter, params)

    expect(result.success).toBe(false)
    expect(result.retryable).toBe(true)
    expect(adapter.discardCheckout).toHaveBeenCalledWith(checkoutReady({ items: [], num: 0 }).protocol)
    expect(adapter.createOrder).not.toHaveBeenCalled()
  })

  it('建单请求超时：标记结果未知，不能自动重试，也不清购物车', async () => {
    const adapter = createAdapter({
      createOrder: vi.fn().mockRejectedValue(
        new StockCheckError(StockCheckErrorType.NETWORK_ERROR, '请求超时（20000ms）')
      ),
    })
    const result = await placeAutoOrder(adapter, params)

    expect(result.success).toBe(false)
    expect(result.stage).toBe('create')
    expect(result.uncertain).toBe(true)
    expect(result.retryable).toBeFalsy()
    expect(adapter.discardCheckout).not.toHaveBeenCalled()
  })

  it('建单返回 5xx：标记结果未知并放弃结算（一手会锁单）', async () => {
    const adapter = createAdapter({
      createOrder: vi.fn().mockRejectedValue(
        new StockCheckError(StockCheckErrorType.API_ERROR, 'HTTP 请求失败: 500 Internal Server Error')
      ),
    })
    const result = await placeAutoOrder(adapter, params)

    expect(result.success).toBe(false)
    expect(result.stage).toBe('create')
    expect(result.uncertain).toBe(true)
    expect(result.message).toContain('锁单')
    expect(adapter.discardCheckout).toHaveBeenCalled()
  })

  it('建单参数错误：放弃结算，避免下一轮加购累加数量', async () => {
    const adapter = createAdapter({
      createOrder: vi.fn().mockRejectedValue(new StockCheckError(StockCheckErrorType.API_ERROR, '参数错误')),
    })
    const result = await placeAutoOrder(adapter, params)

    expect(result.success).toBe(false)
    expect(result.retryable).toBeFalsy()
    expect(adapter.discardCheckout).toHaveBeenCalled()
  })

  it('配置的支付方式不可用时回落到结算返回的可用方式', async () => {
    const adapter = createAdapter({
      prepareCheckout: vi.fn().mockResolvedValue(checkoutReady({ payTools: ['1'] })),
    })
    const result = await placeAutoOrder(adapter, {
      ...params,
      config: { enabled: true, num: 1, payTool: '4' },
    })

    expect(result.success).toBe(true)
    expect(createArgs(adapter)[1]).toBe('1')
  })

  it('建单不返回金额且详情查询失败时，用结算金额估算', async () => {
    const adapter = createAdapter({
      createOrder: vi.fn().mockResolvedValue({ orderSn: '12641415441626', payStatus: 'wait_pay' }),
      getOrderDetail: vi.fn().mockRejectedValue(new Error('boom')),
    })
    const result = await placeAutoOrder(adapter, params)

    expect(result.success).toBe(true)
    expect(result.orderAmount).toBe(59.81) // 商品 53.81 + 运费 6.00
    expect(result.expireAt).toBeUndefined()
  })

  it('登录态失效：不可重试', async () => {
    const adapter = createAdapter({
      getAddresses: vi.fn().mockRejectedValue(
        new StockCheckError(StockCheckErrorType.AUTH_REQUIRED, '登录已失效')
      ),
    })
    const result = await placeAutoOrder(adapter, params)

    expect(result.success).toBe(false)
    expect(result.stage).toBe('address')
    expect(result.retryable).toBeFalsy()
    expect(result.uncertain).toBeFalsy()
  })

  it('件数超上限时按 99 处理，非法值按 1 处理', async () => {
    const adapter = createAdapter()
    await placeAutoOrder(adapter, { ...params, config: { enabled: true, num: 9999 } })
    expect(prepareArgs(adapter).lines).toEqual([{ sku: '850001', num: 3 }]) // 削到可售 3 件

    await placeAutoOrder(adapter, { ...params, config: { enabled: true, num: 0 } })
    expect((adapter.prepareCheckout as ReturnType<typeof vi.fn>).mock.calls[1][0].lines).toEqual([
      { sku: '850001', num: 1 },
    ])
  })

  it('库存不够时按实际可买数量下单', async () => {
    const adapter = createAdapter({
      getProductSkus: vi.fn().mockResolvedValue(skuResult([0, 1])),
    })
    const result = await placeAutoOrder(adapter, { ...params, config: { enabled: true, num: 5 } })

    expect(result.success).toBe(true)
    expect(prepareArgs(adapter).lines).toEqual([{ sku: '850001', num: 1 }])
    expect(result.num).toBe(1)
    expect(result.requestedNum).toBe(5)
    expect(result.numReduced).toBe(true)
    expect(result.message).toContain('实际可买 1 件')
  })

  it('两个规格各 1 件、要 2 件时合并成一单', async () => {
    const adapter = createAdapter({
      getProductSkus: vi.fn().mockResolvedValue(skuResult([1, 1])),
      prepareCheckout: vi.fn().mockResolvedValue(
        checkoutReady({ items: [{ sku: '850000', num: 1 }, { sku: '850001', num: 1 }], num: 2 })
      ),
    })
    const result = await placeAutoOrder(adapter, { ...params, config: { enabled: true, num: 2 } })

    expect(result.success).toBe(true)
    expect(adapter.prepareCheckout).toHaveBeenCalledTimes(1)
    expect(prepareArgs(adapter).lines).toEqual([
      { sku: '850000', num: 1 },
      { sku: '850001', num: 1 },
    ])
    expect(result.num).toBe(2)
    expect(result.numReduced).toBe(false)
    expect(result.items).toEqual([
      { sku: '850000', skuLabel: '蓝色 / M', num: 1 },
      { sku: '850001', skuLabel: '蓝色 / L', num: 1 },
    ])
    expect(result.skuLabel).toBe('蓝色 / M、蓝色 / L')
  })

  it('要 5 件时按规格顺序分配：3 + 2', async () => {
    const adapter = createAdapter({
      getProductSkus: vi.fn().mockResolvedValue(skuResult([3, 4])),
      prepareCheckout: vi.fn().mockResolvedValue(
        checkoutReady({ items: [{ sku: '850000', num: 3 }, { sku: '850001', num: 2 }], num: 5 })
      ),
    })
    const result = await placeAutoOrder(adapter, { ...params, config: { enabled: true, num: 5 } })

    expect(result.success).toBe(true)
    expect(prepareArgs(adapter).lines).toEqual([
      { sku: '850000', num: 3 },
      { sku: '850001', num: 2 },
    ])
    expect(result.num).toBe(5)
  })

  it('结算时某个规格卖完，只下剩下的规格', async () => {
    const adapter = createAdapter({
      getProductSkus: vi.fn().mockResolvedValue(skuResult([1, 1])),
      prepareCheckout: vi.fn().mockResolvedValue(
        checkoutReady({ items: [{ sku: '850001', num: 1 }], num: 1 })
      ),
    })
    const result = await placeAutoOrder(adapter, { ...params, config: { enabled: true, num: 2 } })

    expect(result.success).toBe(true)
    expect(result.num).toBe(1)
    expect(result.numReduced).toBe(true)
    expect(result.items).toEqual([{ sku: '850001', skuLabel: '蓝色 / L', num: 1 }])
  })

  it('结算出现本次没加购的规格时放弃结算重试，避免买错规格', async () => {
    const adapter = createAdapter({
      getProductSkus: vi.fn().mockResolvedValue(skuResult([0, 1])),
      prepareCheckout: vi.fn().mockResolvedValue(
        checkoutReady({ items: [{ sku: '850002', num: 1 }] })
      ),
    })
    const result = await placeAutoOrder(adapter, { ...params, config: { enabled: true, num: 1 } })

    expect(result.success).toBe(false)
    expect(result.retryable).toBe(true)
    expect(result.message).toContain('残留')
    expect(adapter.discardCheckout).toHaveBeenCalled()
    expect(adapter.createOrder).not.toHaveBeenCalled()
  })

  it('结算把件数削小时按结算件数下单', async () => {
    const adapter = createAdapter({
      getProductSkus: vi.fn().mockResolvedValue(skuResult([0, 3])),
      prepareCheckout: vi.fn().mockResolvedValue(
        checkoutReady({ items: [{ sku: '850001', num: 2 }], num: 2 })
      ),
    })
    const result = await placeAutoOrder(adapter, { ...params, config: { enabled: true, num: 5 } })

    expect(result.success).toBe(true)
    expect(prepareArgs(adapter).lines).toEqual([{ sku: '850001', num: 3 }]) // 加购按库存 3 件
    expect(result.num).toBe(2) // 结算只给 2 件
    expect(result.numReduced).toBe(true)
  })

  it('指定多个规格时只在其中挑选有货的', async () => {
    const adapter = createAdapter({
      getProductSkus: vi.fn().mockResolvedValue(skuResult([0, 0, 2])),
      prepareCheckout: vi.fn().mockResolvedValue(
        checkoutReady({ items: [{ sku: '850002', num: 1 }] })
      ),
    })
    const result = await placeAutoOrder(adapter, { ...params, skus: ['850001', '850002'] })

    expect(result.success).toBe(true)
    expect(result.sku).toBe('850002')
    expect(prepareArgs(adapter).lines).toEqual([{ sku: '850002', num: 1 }])
  })

  it('指定规格都没货时不做回退，标记为可重试', async () => {
    const adapter = createAdapter({
      getProductSkus: vi.fn().mockResolvedValue(skuResult([2, 0])),
    })
    const result = await placeAutoOrder(adapter, { ...params, skus: ['850001'] })

    expect(result.success).toBe(false)
    expect(result.stage).toBe('sku')
    expect(result.retryable).toBe(true)
    expect(result.message).toContain('所选规格')
    expect(adapter.prepareCheckout).not.toHaveBeenCalled()
  })

  it('购物车有残留导致结算件数变多时放弃并重试，避免多买', async () => {
    const adapter = createAdapter({
      getProductSkus: vi.fn().mockResolvedValue(skuResult([0, 3])),
      prepareCheckout: vi.fn().mockResolvedValue(
        checkoutReady({ items: [{ sku: '850001', num: 6 }], num: 6 })
      ),
    })
    const result = await placeAutoOrder(adapter, { ...params, config: { enabled: true, num: 3 } })

    expect(result.success).toBe(false)
    expect(result.retryable).toBe(true)
    expect(result.message).toContain('残留')
    expect(adapter.discardCheckout).toHaveBeenCalled()
    expect(adapter.createOrder).not.toHaveBeenCalled()
  })

  it('指定地址不存在时直接失败', async () => {
    const adapter = createAdapter()
    const result = await placeAutoOrder(adapter, {
      ...params,
      config: { enabled: true, addressId: 'not-exist' },
    })

    expect(result.success).toBe(false)
    expect(result.stage).toBe('address')
    expect(adapter.prepareCheckout).not.toHaveBeenCalled()
  })

  it('prepareCheckout 抛「没货」类错误时标记可重试', async () => {
    const adapter = createAdapter({
      prepareCheckout: vi.fn().mockRejectedValue(new Error('购物车里找不到本次加购的规格（可能已被抢完）')),
    })
    const result = await placeAutoOrder(adapter, params)

    expect(result.success).toBe(false)
    expect(result.retryable).toBe(true)
    expect(adapter.createOrder).not.toHaveBeenCalled()
  })
})

describe('precheckAutoOrder', () => {
  it('走完结算准备后放弃结算，不建单', async () => {
    const adapter = createAdapter()
    const result = await precheckAutoOrder(adapter, params)

    expect(result.success).toBe(true)
    expect(result.goodsAmount).toBe(53.81)
    expect(result.shippingFee).toBe(6)
    expect(result.skuLabel).toBe('蓝色 / L')
    expect(adapter.discardCheckout).toHaveBeenCalled()
    expect(adapter.createOrder).not.toHaveBeenCalled()
  })

  it('显示合并后的每个规格与件数', async () => {
    const adapter = createAdapter({
      getProductSkus: vi.fn().mockResolvedValue(skuResult([1, 1])),
      prepareCheckout: vi.fn().mockResolvedValue(
        checkoutReady({
          items: [{ sku: '850000', num: 1 }, { sku: '850001', num: 1 }],
          num: 2,
        })
      ),
    })
    const result = await precheckAutoOrder(adapter, { ...params, config: { enabled: true, num: 5 } })

    expect(result.success).toBe(true)
    expect(result.num).toBe(2)
    expect(result.items).toHaveLength(2)
    expect(result.message).toContain('蓝色 / M × 1')
    expect(result.message).toContain('蓝色 / L × 1')
  })

  it('无货时返回可重试原因', async () => {
    const adapter = createAdapter({
      getProductSkus: vi.fn().mockResolvedValue(skuResult([0, 0])),
    })
    const result = await precheckAutoOrder(adapter, params)

    expect(result.success).toBe(false)
    expect(result.retryable).toBe(true)
    expect(adapter.createOrder).not.toHaveBeenCalled()
  })
})
