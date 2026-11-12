/**
 * 待支付订单续期 - HTTP 请求契约（对齐抓包 1.1 / 1.4）
 *
 * mock 掉最底层的 httpPost，按 URL 分发 envelope 响应，
 * 断言请求路径、参数形态、响应解包与错误处理。
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

const confirmResp = {
  code: '200', msg: 'success',
  data: {
    stock: [{
      sku: '82357192', color: '米色', size: '均码', num: '1',
      goods_id: '339696422', goods_no: '1373604156', goods_name: '背心',
      shop_price: '37.19', is_stock_now: '1', ys_instock_num: '0',
    }],
    default_address: {
      address_id: '0', consignee: '夏言', province: '26', city: '322',
      district: '2725', address: '腾讯大厦', mobile: '13551394387',
      area: '四川省 成都市 武侯区',
    },
    order_remark: { custom_note: '', sender_name: '', sender_tel: '' },
    pay_tool: [{ pay_tool: '1' }, { pay_tool: '4' }],
    express_options_v2: [{
      origin: 2,
      express_list: [
        { express_id: '9999', selected: '1' },
        { express_id: '1', selected: '0' },
      ],
    }],
    cancel_expire: 1794498417,
    current_timestamp: 1794497331,
  },
}

const reloadResp = {
  code: '200', msg: 'success',
  data: {
    order_sn: '12641516245909',
    pay_status: 'wait_pay',
    // 响应里的 pay_tool 是内部渠道码，真正的支付方式是 current_pay_tool
    pay_tool: '12',
    current_pay_tool: '1',
    trade_order_no: 'YSZF26415153523243548979',
    order_amount: '43.19',
  },
}

const route = (url: string): unknown => {
  if (url.includes('/order/confirm_wait_pay_order')) return confirmResp
  if (url.includes('/order/reload_wait_pay_order')) return reloadResp
  return { code: '200', msg: 'success', data: {} }
}

const calls = () => mocks.httpPost.mock.calls as Array<[string, Record<string, string>, unknown, unknown]>
const urlOf = (i: number) => calls()[i][0]
const bodyOf = (i: number) => calls()[i][1]
const optionsOf = (i: number) => calls()[i][3] as { skipGate?: boolean; timeout?: number }

describe('confirmWaitPayOrder（抓包 1.1）', () => {
  beforeEach(() => {
    mocks.httpPost.mockReset()
    mocks.httpPost.mockImplementation((url: string) => Promise.resolve(route(url)))
  })

  it('只发 order_sn 这一个业务参数', async () => {
    const adapter = new YishouAdapter(config)
    await adapter.confirmWaitPayOrder('12641516245909')

    expect(urlOf(0)).toContain('/order/confirm_wait_pay_order')
    const publicKeys = [
      't_t', 'model', 'plat_type', 'token', 'udid', 'uid', 'version',
      'version_name', 'openid', 'wx_version_name', 'app_code',
    ]
    const businessKeys = Object.keys(bodyOf(0)).filter(k => !publicKeys.includes(k))
    expect(businessKeys).toEqual(['order_sn'])
    expect(bodyOf(0).order_sn).toBe('12641516245909')
  })

  it('沿用下单链路的 skipGate + 20s 超时', async () => {
    const adapter = new YishouAdapter(config)
    await adapter.confirmWaitPayOrder('12641516245909')
    expect(optionsOf(0).skipGate).toBe(true)
    expect(optionsOf(0).timeout).toBe(20000)
  })

  it('解包剩余时长、地址、快递、支付方式', async () => {
    const adapter = new YishouAdapter(config)
    const data = await adapter.confirmWaitPayOrder('12641516245909')
    expect(data.remainingSeconds).toBe(1086)
    expect(data.cancelExpireAt).toBe(1794498417000)
    expect(data.payTools).toEqual(['1', '4'])
    expect(data.hasExpress).toBe(true)
    expect(data.hasAddress).toBe(true)
  })

  it('未登录态不发请求', async () => {
    const adapter = new YishouAdapter({ model: 'x', version: '1', version_name: '1' })
    await expect(adapter.confirmWaitPayOrder('X')).rejects.toThrow()
    expect(mocks.httpPost).not.toHaveBeenCalled()
  })

  it('code 非 200 抛错', async () => {
    mocks.httpPost.mockResolvedValue({ code: '500', msg: '订单已关闭', data: {} })
    const adapter = new YishouAdapter(config)
    await expect(adapter.confirmWaitPayOrder('X')).rejects.toThrow()
  })
})

describe('reloadWaitPayOrder（抓包 1.4）', () => {
  beforeEach(() => {
    mocks.httpPost.mockReset()
    mocks.httpPost.mockImplementation((url: string) => Promise.resolve(route(url)))
  })

  const confirmedProtocol = async () => {
    const adapter = new YishouAdapter(config)
    return (await adapter.confirmWaitPayOrder('12641516245909')).protocol
  }

  it('严格按抓包发参数，且不发 pay_id', async () => {
    const adapter = new YishouAdapter(config)
    const protocol = await confirmedProtocol()
    mocks.httpPost.mockClear()

    const result = await adapter.reloadWaitPayOrder(protocol)

    expect(urlOf(0)).toContain('/order/reload_wait_pay_order')
    const body = bodyOf(0)
    expect(body.order_sn).toBe('12641516245909')
    expect(JSON.parse(body.selected)[0]).toMatchObject({
      from: '', piece_together_num: '0', sku: '82357192',
    })
    expect(JSON.parse(body.selected)[0]).not.toHaveProperty('cart_id')
    expect(JSON.parse(body.selected_express)).toEqual([{ origin: '2', express_id: '9999' }])
    expect(JSON.parse(body.rsa).previous_vc_sorce).toBe('YiShou.MyOrderViewController')
    expect(body.advanced_check_selected).toBe('[\n\n]')
    expect(body).toMatchObject({
      consignee: '夏言', province: '26', city: '322', district: '2725',
      address: '腾讯大厦', mobile: '13551394387', pay_tool: '1',
      app_code: '0', is_balance_pay: '0', user_address_tag: '0',
    })
    for (const key of ['pay_id', 'rec_ids', 'is_df']) {
      expect(body).not.toHaveProperty(key)
    }
    expect(optionsOf(0).skipGate).toBe(true)

    expect(result.orderSn).toBe('12641516245909')
    expect(result.payStatus).toBe('wait_pay')
    expect(result.orderAmount).toBe(43.19)
    expect(result.finished).toBe(false)
  })

  it('payTool 取 current_pay_tool，不用内部渠道码 pay_tool=12', async () => {
    const adapter = new YishouAdapter(config)
    const protocol = await confirmedProtocol()
    const result = await adapter.reloadWaitPayOrder(protocol)
    expect(result.payTool).toBe('1')
    expect(result.payTool).not.toBe('12')
  })

  it('协议句柄非法时拒绝发请求', async () => {
    const adapter = new YishouAdapter(config)
    await expect(adapter.reloadWaitPayOrder(null)).rejects.toThrow(/续期上下文缺失/)
    expect(mocks.httpPost).not.toHaveBeenCalled()
  })

  it('快递解析为空时跳过，不发无效参数', async () => {
    mocks.httpPost.mockImplementation((url: string) => {
      if (url.includes('/order/confirm_wait_pay_order')) {
        return Promise.resolve({
          ...confirmResp,
          data: { ...confirmResp.data, express_options_v2: [] },
        })
      }
      return Promise.resolve(route(url))
    })
    const adapter = new YishouAdapter(config)
    const confirmed = await adapter.confirmWaitPayOrder('X')
    expect(confirmed.hasExpress).toBe(false)
    const callCount = calls().length
    await expect(adapter.reloadWaitPayOrder(confirmed.protocol)).rejects.toThrow(/可用快递/)
    expect(calls().length).toBe(callCount)
  })

  it('pay_status 非 wait_pay 时标记 finished', async () => {
    mocks.httpPost.mockImplementation((url: string) => {
      if (url.includes('/order/reload_wait_pay_order')) {
        return Promise.resolve({
          ...reloadResp,
          data: { ...reloadResp.data, pay_status: 'already' },
        })
      }
      return Promise.resolve(route(url))
    })
    const adapter = new YishouAdapter(config)
    const protocol = await confirmedProtocol()
    const result = await adapter.reloadWaitPayOrder(protocol)
    expect(result.finished).toBe(true)
  })

  it('响应带 cancel_expire 时换算成毫秒', async () => {
    mocks.httpPost.mockImplementation((url: string) => {
      if (url.includes('/order/reload_wait_pay_order')) {
        return Promise.resolve({
          ...reloadResp,
          data: { ...reloadResp.data, cancel_expire: 1794499531 },
        })
      }
      return Promise.resolve(route(url))
    })
    const adapter = new YishouAdapter(config)
    const protocol = await confirmedProtocol()
    const result = await adapter.reloadWaitPayOrder(protocol)
    expect(result.cancelExpireAt).toBe(1794499531000)
  })
})
