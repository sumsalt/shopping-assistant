/**
 * 待支付订单续期 - 协议纯函数契约
 *
 * 重点锁定两件事：
 *   1. 续期 rsa 与建单 rsa 并列、互不影响（buildRsa 旧值仍是「进货车」）
 *   2. 1.4 的 selected 复用 buildCreateSelected，请求参数严格对齐抓包
 */

import { describe, expect, it } from 'vitest'
import {
  buildReloadRsa,
  buildReloadRequest,
  parseWaitPayConfirm,
  resolveRenewPayTool,
  RENEW_CONSTANTS,
  type YishouRenewProtocol,
  type YishouWaitPayConfirmRaw,
} from './renew'
import { buildCreateSelected, buildRsa } from './checkout'

const rawStock = [{
  sku: '82357192', color: '米色', size: '均码', num: '1',
  goods_id: '339696422', is_stock_now: '1', ys_instock_num: '0',
}]

const protocol: YishouRenewProtocol = {
  orderSn: '12641516245909',
  stock: rawStock,
  selectedExpress: [{ origin: '2', express_id: '9999' }],
  address: {
    addressId: '0', consignee: '夏言', province: '26', city: '322',
    district: '2725', address: '腾讯大厦', mobile: '13551394387',
    area: '四川省 成都市 武侯区',
  },
  orderRemark: { custom_note: '', sender_name: '', sender_tel: '' },
  payTool: '1',
}

const confirmRaw: YishouWaitPayConfirmRaw = {
  stock: rawStock,
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
}

describe('续期 rsa 与建单 rsa 相互隔离', () => {
  it('buildReloadRsa 来源是「我的订单页」', () => {
    expect(JSON.parse(buildReloadRsa())).toEqual({
      previous_vc_sorce: 'YiShou.MyOrderViewController',
      buy_channel: '支付页',
      system_os: 'APP',
      app_entrance: '支付页',
    })
  })

  it('buildRsa（建单 2.15）不受影响，仍是「进货车」', () => {
    expect(JSON.parse(buildRsa())).toEqual({
      previous_vc_sorce: '进货车',
      buy_channel: '支付页',
      system_os: 'APP',
      app_entrance: '支付页',
    })
  })

  it('两者不相等', () => {
    expect(buildReloadRsa()).not.toBe(buildRsa())
  })
})

describe('parseWaitPayConfirm（抓包 1.1 响应解包）', () => {
  it('用服务端时钟计算剩余时长，解析地址/快递/支付方式', () => {
    const data = parseWaitPayConfirm(confirmRaw, '12641516245909')
    expect(data.orderSn).toBe('12641516245909')
    expect(data.cancelExpireAt).toBe(1794498417000)
    expect(data.currentTimestamp).toBe(1794497331)
    expect(data.remainingSeconds).toBe(1086)
    expect(data.payTools).toEqual(['1', '4'])
    expect(data.hasExpress).toBe(true)
    expect(data.hasAddress).toBe(true)
  })

  it('协议句柄自带 payTool、selectedExpress、地址与备注', () => {
    const data = parseWaitPayConfirm(confirmRaw, '12641516245909')
    const ctx = data.protocol as YishouRenewProtocol
    expect(ctx.orderSn).toBe('12641516245909')
    expect(ctx.payTool).toBe('1')
    expect(ctx.selectedExpress).toEqual([{ origin: '2', express_id: '9999' }])
    expect(ctx.address).toMatchObject({
      consignee: '夏言', province: '26', city: '322',
      district: '2725', address: '腾讯大厦', mobile: '13551394387',
    })
    expect(ctx.orderRemark).toEqual({ custom_note: '', sender_name: '', sender_tel: '' })
  })

  it('缺少 default_address / express 时标记 hasAddress / hasExpress 为 false', () => {
    const data = parseWaitPayConfirm({ stock: rawStock, cancel_expire: 1794498417 }, 'X')
    expect(data.hasAddress).toBe(false)
    expect(data.hasExpress).toBe(false)
    expect(data.remainingSeconds).toBeUndefined()
  })

  it('cancel_expire 与 current_timestamp 同源时剩余时长为 0', () => {
    const data = parseWaitPayConfirm({
      cancel_expire: 1794497331, current_timestamp: 1794497331,
    }, 'X')
    expect(data.remainingSeconds).toBe(0)
  })

  it('非法 / 0 时间戳当作缺失', () => {
    const data = parseWaitPayConfirm({ cancel_expire: 0, current_timestamp: 'abc' }, 'X')
    expect(data.cancelExpireAt).toBeUndefined()
    expect(data.currentTimestamp).toBeUndefined()
    expect(data.remainingSeconds).toBeUndefined()
  })

  it('响应为空也不抛错', () => {
    const data = parseWaitPayConfirm(undefined, 'X')
    expect(data.payTools).toEqual([])
    expect(data.hasExpress).toBe(false)
    expect(data.hasAddress).toBe(false)
    expect((data.protocol as YishouRenewProtocol).stock).toEqual([])
  })
})

describe('resolveRenewPayTool', () => {
  it('取 pay_tool[] 第一项', () => {
    expect(resolveRenewPayTool(['4', '1'])).toBe('4')
  })
  it('缺失回落抓包值 1', () => {
    expect(resolveRenewPayTool([])).toBe('1')
  })
})

describe('buildReloadRequest（抓包 1.4 请求组装）', () => {
  const body = buildReloadRequest(protocol)

  it('订单号与原单一致', () => {
    expect(body.order_sn).toBe('12641516245909')
  })

  it('selected 与建单同款 9 字段，不带 cart_id / 价格 / 商品名', () => {
    expect(body.selected).toBe(buildCreateSelected(rawStock))
    const item = JSON.parse(body.selected)[0]
    expect(item).toEqual({
      from: '', color: '米色', ys_instock_num: '0', sku: '82357192',
      piece_together_num: '0', size: '均码', num: '1',
      is_stock_now: '1', goods_id: '339696422',
    })
    expect(item).not.toHaveProperty('cart_id')
    expect(item).not.toHaveProperty('shop_price')
    expect(item).not.toHaveProperty('goods_name')
  })

  it('selected_express 取 selected:"1" 的快递', () => {
    expect(JSON.parse(body.selected_express)).toEqual([{ origin: '2', express_id: '9999' }])
  })

  it('地址与备注全部来自 1.1', () => {
    expect(body).toMatchObject({
      consignee: '夏言', province: '26', city: '322', district: '2725',
      address: '腾讯大厦', mobile: '13551394387',
      custom_note: '', sender_name: '', sender_tel: '',
    })
  })

  it('固定常量严格对齐抓包', () => {
    expect(RENEW_CONSTANTS.advanced_check_selected).toBe('[\n\n]')
    expect(body.advanced_check_selected).toBe('[\n\n]')
    expect(body.advanced_check_selected).not.toBe('[]')
    expect(body).toMatchObject({
      app_code: '0', is_balance_pay: '0', user_address_tag: '0', pay_tool: '1',
    })
  })

  it('rsa 是「我的订单页」来源，不是建单的「进货车」', () => {
    expect(JSON.parse(body.rsa).previous_vc_sorce).toBe('YiShou.MyOrderViewController')
    expect(body.rsa).not.toBe(buildRsa())
  })

  it('不发送建单专用字段 pay_id / rec_ids / is_df', () => {
    for (const key of ['pay_id', 'rec_ids', 'is_df', 'goods_id', 'from_page']) {
      expect(body).not.toHaveProperty(key)
    }
  })

  it('所有参数都是字符串（YishouClient 的契约）', () => {
    for (const value of Object.values(body)) {
      expect(typeof value).toBe('string')
    }
  })
})
