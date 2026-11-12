/**
 * 一手适配器 - 下单链路请求组装（对齐抓包 2.1~2.15）
 *
 * 下单接口无法在 CI 里真实发单，只能靠契约测试锁住每一步的请求形态：
 * prepareCheckout 的 5 个接口顺序与 selected 结构、createOrder 的 2.15 参数、清理语义。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ httpPost: vi.fn() }))

vi.mock('../../utils/http', () => ({
  httpPost: mocks.httpPost,
  httpRequest: vi.fn(),
}))

import { YishouAdapter } from './index'
import type { YishouAddress } from '../../types'

const config = {
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

const address: YishouAddress = {
  addressId: '9740845',
  consignee: '夏言',
  province: '26',
  city: '322',
  district: '2725',
  address: '腾讯大厦',
  mobile: '13551394387',
  area: '四川省 成都市 武侯区',
}

const goodsInfoResp = {
  code: '200', msg: 'success',
  data: {
    goods_id: '339696422', goods_no: '1373604156', shop_price: '37.19',
    attribute: [
      {
        color: '米色-现货', color_id: '1432', is_recommend: '2',
        item: [{ sku: '82357192', size: '均码', num: '0', stock: 2, sale_stock: 2 }],
      },
    ],
  },
}
const cartAddResp = { code: '200', msg: 'success', data: { rec_id: '1373604156' } }
const cartsResp = {
  code: '200', msg: 'success',
  data: {
    in_stock: {
      group_data: [{
        stock_data: [{
          item: [{
            goods_id: '339696422', goods_no: '1373604156', rec_id: '1373604156',
            origin: '2', special_id: '612616', price_total: '37.19', total: '1',
            is_goods_in_stock: '1', is_new_goods: '0', is_goods_original_price: '0',
            cart_ids: ['1278423441'],
            detail: [{
              cart_id: '1278423441', sku: '82357192', color: '米色', size: '均码', num: '1',
              goods_id: '339696422', is_alone: '0', is_stock_now: '0', sku_tag: '',
              sale_stock_now: '2', color_style_id: '6', color_style_name: '白色系',
              color_style_icon: '', ys_instock_num: '2', sale_stock: '2',
              add_cart_id: '19456111_1794500298', shop_price: '37.19',
            }],
          }],
        }],
      }],
    },
  },
}
const activitiesResp = {
  code: '200', msg: 'success',
  data: { order_amount: '37.19', discount_amount: '86.76', goods_amount_total: '123.95' },
}
const confirmResp = {
  code: '200', msg: 'success',
  data: {
    stock: [{ cart_id: '1278423441', sku: '82357192', color: '米色', size: '均码', num: '1',
      goods_id: '339696422', is_stock_now: '0', ys_instock_num: '2', buy_price: 37.19 }],
    out_stock: [],
    price_tolal: '37.19', shipping_fee: '6.00', num_total: '1',
    pay_tool: [{ pay_tool: '1' }, { pay_tool: '4' }],
    express_options_v2: [{ origin: 2, express_list: [{ express_id: '9999', selected: '1' }] }],
  },
}
const createResp = {
  code: '200', msg: 'success',
  data: {
    order_sn: '12641516252369', pay_status: 'wait_pay', order_amount: '43.19',
    // 真实抓包：pay_tool 是内部渠道码 12，current_pay_tool 才是支付方式 1
    pay_tool: '12', current_pay_tool: '1',
  },
}

/** 按 URL 分发 mock 响应，模拟一手各接口 */
const route = (url: string): unknown => {
  if (url.includes('/cart/add_cart_goods_info')) return goodsInfoResp
  if (url.includes('/cart/add_goods_to_cart')) return cartAddResp
  if (url.includes('/cart/get_carts_by_supply')) return cartsResp
  if (url.includes('/cart/activities')) return activitiesResp
  if (url.includes('/order/confirm_order_v4')) return confirmResp
  if (url.includes('/order/create_order_v4')) return createResp
  if (url.includes('/cart/del_cart')) return { code: '200', msg: 'success', data: {} }
  if (url.includes('/userAddress/get_user_address')) {
    return { code: '200', msg: 'success', data: [{ ...address, address_id: address.addressId }] }
  }
  return { code: '200', msg: 'success', data: {} }
}

const calls = () => mocks.httpPost.mock.calls as Array<[string, Record<string, string>, unknown, unknown]>
const bodyOf = (i: number) => calls()[i][1]
const urlOf = (i: number) => calls()[i][0]

describe('YishouAdapter 下单链路（对齐抓包）', () => {
  beforeEach(() => {
    mocks.httpPost.mockReset()
    mocks.httpPost.mockImplementation((url: string) => Promise.resolve(route(url)))
  })

  it('prepareCheckout 按抓包顺序走 5 个接口，返回业务结论', async () => {
    const adapter = new YishouAdapter(config)
    const ready = await adapter.prepareCheckout({
      goodsId: '339696422', goodsNo: '1373604156',
      lines: [{ sku: '82357192', num: 1 }], address,
    })

    expect(calls()).toHaveLength(5)
    expect(urlOf(0)).toContain('/cart/add_cart_goods_info')
    expect(urlOf(1)).toContain('/cart/add_goods_to_cart')
    expect(urlOf(2)).toContain('/cart/get_carts_by_supply')
    expect(urlOf(3)).toContain('/cart/activities')
    expect(urlOf(4)).toContain('/order/confirm_order_v4')

    expect(ready.items).toEqual([{ sku: '82357192', num: 1 }])
    expect(ready.num).toBe(1)
    expect(ready.goodsAmount).toBe(37.19)
    expect(ready.shippingFee).toBe(6)
    expect(ready.activityDiscount).toBe(86.76)
    expect(ready.payTools).toEqual(['1', '4'])
    expect(ready.address.addressId).toBe('9740845')
    // 所有下单请求跳过闸门
    for (const c of calls()) expect((c[3] as { skipGate: boolean }).skipGate).toBe(true)
  })

  it('加购 selected 是 color+item 嵌套结构，带抓包的来源参数与保险开关', async () => {
    const adapter = new YishouAdapter(config)
    await adapter.prepareCheckout({
      goodsId: '339696422', goodsNo: '1373604156',
      lines: [{ sku: '82357192', num: 2 }], address,
    })

    const body = bodyOf(1)
    expect(body.goods_id).toBe('339696422')
    const selected = JSON.parse(body.selected)
    expect(selected[0].color).toBe('米色-现货')
    expect(selected[0].is_recommend).toBe('0')
    expect(selected[0].item[0]).toMatchObject({ sku: '82357192', num: '2' })
    expect(body.is_select_refund_insurance).toBe('2')
    expect(body.is_select_super_refund_insurance).toBe('2')
    expect(body.source).toBe('3')
    expect(body.sources).toBe('3')
    expect(body.position).toBe('1')
    expect(body.ss_type).toBe('0')
    expect(body.add_cart_id).toMatch(/^19456111_\d+$/)
    expect(body.event_id).toMatch(/^19456111_\d+$/)
    expect(body.landing_event_id).toMatch(/^19456111_\d+$/)
  })

  it('算折与结算的 selected 都带真实 cart_id，结算不带多余的 is_df', async () => {
    const adapter = new YishouAdapter(config)
    await adapter.prepareCheckout({
      goodsId: '339696422', goodsNo: '1373604156',
      lines: [{ sku: '82357192', num: 1 }], address,
    })

    const selectGoods = JSON.parse(bodyOf(3).select_goods)
    expect(selectGoods[0].detail[0].cart_id).toBe('1278423441')

    const confirmBody = bodyOf(4)
    expect(confirmBody.rec_ids).toBe('1373604156')
    expect(confirmBody.address_id).toBe('9740845')
    expect(JSON.parse(confirmBody.selected)[0].cart_id).toBe('1278423441')
    expect(confirmBody).not.toHaveProperty('is_df')
  })

  it('结算 selected 缺 cart_id 会让服务端返回假 cart_id：本实现必须带真值', async () => {
    // 回归保护：真实抓包验证过简化 [{sku,num}] 会让 confirm 返回 cart_id="0"
    const adapter = new YishouAdapter(config)
    await adapter.prepareCheckout({
      goodsId: '339696422', goodsNo: '1373604156',
      lines: [{ sku: '82357192', num: 1 }], address,
    })
    const selected = JSON.parse(bodyOf(4).selected)
    expect(selected[0].cart_id).not.toBe('0')
    expect(selected[0].cart_id).toBeTruthy()
  })

  it('createOrder 严格按抓包 2.15 发参数，去掉多余字段', async () => {
    const adapter = new YishouAdapter(config)
    const ready = await adapter.prepareCheckout({
      goodsId: '339696422', goodsNo: '1373604156',
      lines: [{ sku: '82357192', num: 1 }], address,
    })
    mocks.httpPost.mockClear()
    mocks.httpPost.mockImplementation((url: string) => Promise.resolve(route(url)))

    const created = await adapter.createOrder(ready.protocol, '1')
    expect(created.orderSn).toBe('12641516252369')
    expect(created.orderAmount).toBe(43.19)
    // 真实建单验证：响应的 pay_tool=12 是内部渠道码，支付方式取 current_pay_tool
    expect(created.payTool).toBe('1')
    expect(created.payTool).not.toBe('12')

    expect(urlOf(0)).toContain('/order/create_order_v4')
    const body = bodyOf(0)
    // 建单 selected：无 cart_id、带 from/piece_together_num
    const selected = JSON.parse(body.selected)
    expect(selected[0]).toMatchObject({ from: '', piece_together_num: '0', sku: '82357192' })
    expect(selected[0]).not.toHaveProperty('cart_id')
    // 抓包 2.15 的补齐字段
    expect(JSON.parse(body.selected_express)).toEqual([{ origin: '2', express_id: '9999' }])
    expect(JSON.parse(body.rsa)).toEqual({
      previous_vc_sorce: '进货车', buy_channel: '支付页', system_os: 'APP', app_entrance: '支付页',
    })
    expect(body.pay_id).toMatch(/^19456111_\d+$/)
    expect(body.user_address_tag).toBe('0')
    expect(body.is_balance_pay).toBe('0')
    expect(body.pay_tool).toBe('1')
    // 地址用数字 ID
    expect(body).toMatchObject({ province: '26', city: '322', district: '2725', consignee: '夏言', mobile: '13551394387' })
    // 抓包里没有的字段一律不发
    for (const key of ['custom_note', 'is_other', 'is_send_logistics', 'is_merge_order', 'is_no_invoice', 'is_df']) {
      expect(body).not.toHaveProperty(key)
    }
  })

  it('discardCheckout 清掉购物车', async () => {
    const adapter = new YishouAdapter(config)
    const ready = await adapter.prepareCheckout({
      goodsId: '339696422', goodsNo: '1373604156',
      lines: [{ sku: '82357192', num: 1 }], address,
    })
    mocks.httpPost.mockClear()
    mocks.httpPost.mockImplementation((url: string) => Promise.resolve(route(url)))

    await adapter.discardCheckout(ready.protocol)
    expect(urlOf(0)).toContain('/cart/del_cart')
    expect(bodyOf(0).rec_ids).toBe('1373604156')
  })

  it('结算准备失败时自动清理购物车，避免残留', async () => {
    mocks.httpPost.mockImplementation((url: string) => {
      if (url.includes('/order/confirm_order_v4')) {
        return Promise.resolve({ code: '500', msg: '服务异常', data: {} })
      }
      return Promise.resolve(route(url))
    })
    const adapter = new YishouAdapter(config)
    await expect(
      adapter.prepareCheckout({
        goodsId: '339696422', goodsNo: '1373604156',
        lines: [{ sku: '82357192', num: 1 }], address,
      })
    ).rejects.toThrow()
    // 最后一步是 del_cart 清理
    expect(urlOf(calls().length - 1)).toContain('/cart/del_cart')
  })

  it('算折失败不阻断结算（可选增强）', async () => {
    mocks.httpPost.mockImplementation((url: string) => {
      if (url.includes('/cart/activities')) {
        return Promise.resolve({ code: '500', msg: 'fail', data: {} })
      }
      return Promise.resolve(route(url))
    })
    const adapter = new YishouAdapter(config)
    const ready = await adapter.prepareCheckout({
      goodsId: '339696422', goodsNo: '1373604156',
      lines: [{ sku: '82357192', num: 1 }], address,
    })
    expect(ready.activityDiscount).toBeUndefined()
    expect(ready.items).toEqual([{ sku: '82357192', num: 1 }])
  })

  it('地址列表把 snake_case 转成内部结构', async () => {
    const adapter = new YishouAdapter(config)
    const addresses = await adapter.getAddresses()
    expect(addresses[0]).toMatchObject({
      addressId: '9740845', province: '26', city: '322', district: '2725', mobile: '13551394387',
    })
  })

  it('建单未返回订单号时抛错', async () => {
    mocks.httpPost.mockImplementation((url: string) => {
      if (url.includes('/order/create_order_v4')) return Promise.resolve({ code: '200', msg: 'success', data: {} })
      return Promise.resolve(route(url))
    })
    const adapter = new YishouAdapter(config)
    const ready = await adapter.prepareCheckout({
      goodsId: '339696422', goodsNo: '1373604156',
      lines: [{ sku: '82357192', num: 1 }], address,
    })
    await expect(adapter.createOrder(ready.protocol, '1')).rejects.toThrow('未返回订单号')
  })

  it('没有登录态时拒绝下单', async () => {
    const adapter = new YishouAdapter({ model: 'x', version: '1', version_name: '1' })
    await expect(adapter.getAddresses()).rejects.toThrow('需要登录态')
    expect(mocks.httpPost).not.toHaveBeenCalled()
  })
})
