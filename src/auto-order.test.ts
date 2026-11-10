/**
 * 自动下单链路：地址 → 规格 → 加购 → 结算 → 建单
 */

import { describe, expect, it, vi } from 'vitest'
import { StockCheckError, StockCheckErrorType } from './types'
import type { AutoOrderAdapter } from './auto-order'
import { placeAutoOrder, precheckAutoOrder } from './auto-order'
import type {
  YishouAddress,
  YishouCartAddResult,
  YishouConfirmOrderData,
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

const confirmData = (outOfStock = false): YishouConfirmOrderData => ({
  stock: outOfStock
    ? []
    : [
        {
          sku: '850000',
          num: '1',
          goods_no: '1381301740',
          goods_id: '338956151',
          buy_price: 53.81,
          tag_list: [{ name: '现货' }],
        },
      ],
  outStock: outOfStock ? [{ sku: '850000' }] : [],
  defaultAddress: address,
  goodsAmount: 53.81,
  shippingFee: 6,
  numTotal: 1,
  payTools: ['1', '4'],
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
  addToCart: vi.fn().mockResolvedValue({ recId: '1381301740', goodsNo: '1381301740', shopPrice: 53.81 } as YishouCartAddResult),
  confirmOrder: vi.fn().mockResolvedValue(confirmData()),
  createOrder: vi.fn().mockResolvedValue(createdOrder),
  deleteCart: vi.fn().mockResolvedValue(undefined),
  getOrderExpireAt: vi.fn().mockResolvedValue(1794336279000),
  ...overrides,
})

const params = {
  goodsId: '338956151',
  goodsNo: '1381301740',
  config: { enabled: true, num: 1 },
}

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

    // 加购时 num 必须是字符串、JSON 紧凑
    expect(adapter.addToCart).toHaveBeenCalledWith('338956151', '850001', 1)
    expect(adapter.confirmOrder).toHaveBeenCalledWith(
      '1381301740',
      '[{"sku":"850001","num":"1"}]',
      '9706970'
    )

    // 建单必须带上 confirm 返回的完整 stock 明细（适配器再剥掉嵌套字段）
    const createArgs = (adapter.createOrder as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(createArgs.recIds).toBe('1381301740')
    expect(createArgs.stock).toHaveLength(1)
    expect(createArgs.stock[0].goods_no).toBe('1381301740')
    expect(createArgs.payTool).toBe('4')
  })

  it('没有可售规格时不下单，标记为可重试', async () => {
    const adapter = createAdapter({
      getProductSkus: vi.fn().mockResolvedValue(skuResult([0, 0])),
    })

    const result = await placeAutoOrder(adapter, params)

    expect(result.success).toBe(false)
    expect(result.stage).toBe('sku')
    expect(result.retryable).toBe(true)
    expect(adapter.addToCart).not.toHaveBeenCalled()
  })

  it('结算时已无库存：清掉购物车并标记可重试', async () => {
    const adapter = createAdapter({
      confirmOrder: vi.fn().mockResolvedValue(confirmData(true)),
    })

    const result = await placeAutoOrder(adapter, params)

    expect(result.success).toBe(false)
    expect(result.retryable).toBe(true)
    expect(adapter.deleteCart).toHaveBeenCalledWith('1381301740')
    expect(adapter.createOrder).not.toHaveBeenCalled()
  })

  it('建单请求超时：标记结果未知，不能自动重试', async () => {
    const adapter = createAdapter({
      createOrder: vi
        .fn()
        .mockRejectedValue(
          new StockCheckError(StockCheckErrorType.NETWORK_ERROR, '请求超时（20000ms）')
        ),
    })

    const result = await placeAutoOrder(adapter, params)

    expect(result.success).toBe(false)
    expect(result.stage).toBe('create')
    expect(result.uncertain).toBe(true)
    expect(result.retryable).toBeFalsy()
    // 建单已发出，不能再去删购物车（订单可能已占掉）
    expect(adapter.deleteCart).not.toHaveBeenCalled()
  })

  it('登录态失效：不可重试', async () => {
    const adapter = createAdapter({
      getAddresses: vi
        .fn()
        .mockRejectedValue(new StockCheckError(StockCheckErrorType.AUTH_REQUIRED, '登录已失效')),
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
    expect(adapter.addToCart).toHaveBeenLastCalledWith('338956151', '850001', 99)

    await placeAutoOrder(adapter, { ...params, config: { enabled: true, num: 0 } })
    expect(adapter.addToCart).toHaveBeenLastCalledWith('338956151', '850001', 1)
  })

  it('指定地址不存在时直接失败', async () => {
    const adapter = createAdapter()
    const result = await placeAutoOrder(adapter, {
      ...params,
      config: { enabled: true, addressId: 'not-exist' },
    })

    expect(result.success).toBe(false)
    expect(result.stage).toBe('address')
    expect(adapter.addToCart).not.toHaveBeenCalled()
  })
})

describe('precheckAutoOrder', () => {
  it('走完加购与结算后清掉购物车，不建单', async () => {
    const adapter = createAdapter()
    const result = await precheckAutoOrder(adapter, params)

    expect(result.success).toBe(true)
    expect(result.goodsAmount).toBe(53.81)
    expect(result.shippingFee).toBe(6)
    expect(result.skuLabel).toBe('蓝色 / L')
    expect(adapter.deleteCart).toHaveBeenCalledWith('1381301740')
    expect(adapter.createOrder).not.toHaveBeenCalled()
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
