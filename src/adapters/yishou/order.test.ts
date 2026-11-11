/**
 * 一手适配器 - 下单链路请求组装
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
const lastOptions = () => mocks.httpPost.mock.calls.at(-1)?.[3] as Record<string, unknown>

describe('YishouAdapter 下单链路', () => {
  beforeEach(() => {
    mocks.httpPost.mockReset()
    mocks.httpPost.mockResolvedValue({ code: '200', msg: 'success', data: {} })
  })

  it('加购时 num 用字符串、JSON 紧凑无空格', async () => {
    mocks.httpPost.mockResolvedValueOnce({
      code: '200',
      msg: 'success',
      data: { rec_id: '1381301740', goods_no: '1381301740', shop_price: '53.81' },
    })

    const adapter = new YishouAdapter(config)
    const result = await adapter.addToCart('338956151', [{ sku: '85302700', num: 1 }])

    expect(result.recId).toBe('1381301740')
    expect(lastBody().selected).toBe('[{"sku":"85302700","num":"1"}]')
    expect(lastBody().goods_id).toBe('338956151')
    // 下单请求必须跳过请求闸门
    expect(lastOptions().skipGate).toBe(true)
  })

  it('一次加购多个规格时 selected 里是完整明细', async () => {
    mocks.httpPost.mockResolvedValueOnce({
      code: '200',
      msg: 'success',
      data: { rec_id: '1381301740', goods_no: '1381301740', shop_price: '53.81' },
    })

    const adapter = new YishouAdapter(config)
    await adapter.addToCart('338956151', [
      { sku: '85302700', num: 1 },
      { sku: '85302701', num: 2 },
    ])

    expect(lastBody().selected).toBe('[{"sku":"85302700","num":"1"},{"sku":"85302701","num":"2"}]')
  })

  it('地址列表把 snake_case 转成内部结构', async () => {
    mocks.httpPost.mockResolvedValueOnce({
      code: '200',
      msg: 'success',
      data: [
        {
          address_id: 9706970,
          consignee: '张三',
          province: '31',
          city: '386',
          district: '3265',
          address: '某某路 1 号',
          mobile: '13800000000',
          area: '浙江省 金华市 东阳市',
        },
      ],
    })

    const adapter = new YishouAdapter(config)
    const addresses = await adapter.getAddresses()

    expect(addresses).toHaveLength(1)
    expect(addresses[0]).toMatchObject({
      addressId: '9706970',
      province: '31',
      city: '386',
      district: '3265',
      mobile: '13800000000',
    })
  })

  it('结算确认解析 price_tolal / shipping_fee 与默认地址', async () => {
    mocks.httpPost.mockResolvedValueOnce({
      code: '200',
      msg: 'success',
      data: {
        stock: [{ sku: '85302700', num: '1' }],
        out_stock: [],
        price_tolal: '53.81',
        shipping_fee: '6.00',
        num_total: '1',
        pay_tool: [{ pay_tool: '1' }, { pay_tool: '4' }],
        default_address: { address_id: '9706970', consignee: '张三' },
      },
    })

    const adapter = new YishouAdapter(config)
    const confirm = await adapter.confirmOrder('[{"sku":"85302700","num":"1"}]', '[]', '9706970')

    expect(confirm.goodsAmount).toBe(53.81)
    expect(confirm.shippingFee).toBe(6)
    expect(confirm.numTotal).toBe(1)
    expect(confirm.payTools).toEqual(['1', '4'])
    expect(confirm.defaultAddress?.addressId).toBe('9706970')
    expect(lastBody().address_id).toBe('9706970')
  })

  it('建单时 selected 只保留标量字段，并带上地址与支付方式', async () => {
    mocks.httpPost.mockResolvedValueOnce({
      code: '200',
      msg: 'success',
      data: { order_sn: '12641415441626', pay_status: 'wait_pay', order_amount: '59.81' },
    })

    const adapter = new YishouAdapter(config)
    const created = await adapter.createOrder({
      recIds: '1381301740',
      stock: [
        {
          sku: '85302700',
          num: '1',
          goods_no: '1381301740',
          buy_price: 53.81,
          tag_list: [{ name: '现货' }],
          new_good_tag_url: 'https://example.com/x.png',
          empty_discount: {},
        },
      ],
      address: {
        addressId: '9706970',
        consignee: '张三',
        province: '31',
        city: '386',
        district: '3265',
        address: '某某路 1 号',
        mobile: '13800000000',
        area: '浙江省 金华市 东阳市',
      },
      payTool: '4',
    })

    expect(created.orderSn).toBe('12641415441626')
    expect(created.orderAmount).toBe(59.81)

    const body = lastBody()
    const selected = JSON.parse(body.selected)
    expect(selected).toHaveLength(1)
    // 嵌套字段（数组 / 对象）全部丢弃；字符串字段照原样保留
    expect(selected[0]).not.toHaveProperty('tag_list')
    expect(selected[0]).not.toHaveProperty('empty_discount')
    expect(selected[0].new_good_tag_url).toBe('https://example.com/x.png')
    // 标量字段原样保留
    expect(selected[0]).toMatchObject({ sku: '85302700', num: '1', buy_price: 53.81 })

    expect(body.province).toBe('31')
    expect(body.city).toBe('386')
    expect(body.district).toBe('3265')
    expect(body.pay_tool).toBe('4')
  })

  it('建单未返回订单号时抛错', async () => {
    mocks.httpPost.mockResolvedValueOnce({ code: '200', msg: 'success', data: {} })

    const adapter = new YishouAdapter(config)

    await expect(
      adapter.createOrder({
        recIds: '1',
        stock: [{ sku: '1', num: '1' }],
        address: {
          addressId: '9706970',
          consignee: '张三',
          province: '31',
          city: '386',
          district: '3265',
          address: 'x',
          mobile: '13800000000',
          area: '',
        },
        payTool: '4',
      })
    ).rejects.toThrow('未返回订单号')
  })

  it('没有登录态时拒绝下单', async () => {
    const adapter = new YishouAdapter({ model: 'x', version: '1', version_name: '1' })

    await expect(adapter.getAddresses()).rejects.toThrow('需要登录态')
    expect(mocks.httpPost).not.toHaveBeenCalled()
  })
})
