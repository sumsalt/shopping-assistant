/**
 * 一手下单协议层：selected 构造与抓包对齐（纯函数）
 *
 * 这些断言锁住的是抓包 2.3 / 2.7 / 2.11 / 2.15 的真实请求形态，
 * 下单接口无法在 CI 里真实发单验证，只能靠契约测试守住。
 */

import { describe, expect, it } from 'vitest'
import {
  buildAddCartSelected,
  buildConfirmSelected,
  buildCreateSelected,
  buildEventId,
  buildRsa,
  buildSelectGoods,
  buildTrackingId,
  CART_ADD_SOURCE,
  CREATE_ORDER_CONSTANTS,
  pickCartGroup,
  pickCartLines,
  resolveSelectedExpress,
  resolveSettledNum,
  toSettledItems,
  type YishouCartColorRaw,
  type YishouCartGroupItemRaw,
  type YishouCartLineRaw,
  type YishouCartsBySupplyRaw,
  type YishouConfirmRaw,
  type YishouConfirmStockRaw,
} from './checkout'

/** 抓包 2.1 的 attribute（精简） */
const attributes: YishouCartColorRaw[] = [
  {
    color: '米色-现货',
    color_id: '1432',
    is_recommend: '2',
    item: [
      { sku: '82357192', size: '均码', num: '0', stock: 2, sale_stock: 2, ys_instock_num: 2 },
      { sku: '82357193', size: 'L', num: '0', stock: 0, sale_stock: 0, ys_instock_num: 0 },
    ],
  },
  {
    color: '黑色-现货',
    color_id: '1433',
    is_recommend: '2',
    item: [{ sku: '82357194', size: '均码', num: '0', stock: 1, sale_stock: 1, ys_instock_num: 1 }],
  },
]

/** 抓包 2.6 的 detail（cart_id 是整条链路的枢纽） */
const cartLine = (over: Partial<YishouCartLineRaw> = {}): YishouCartLineRaw => ({
  cart_id: '1278423441',
  sku: '82357192',
  color: '米色',
  size: '均码',
  num: '1',
  goods_id: '339696422',
  is_alone: '0',
  is_stock_now: '0',
  sku_tag: '',
  sale_stock_now: '2',
  color_style_id: '6',
  color_style_name: '白色系',
  color_style_icon: '',
  ys_instock_num: '2',
  sale_stock: '2',
  add_cart_id: '19456111_1794500298',
  shop_price: '37.19',
  ...over,
})

const group: YishouCartGroupItemRaw = {
  goods_id: '339696422',
  goods_no: '1373604156',
  rec_id: '1373604156',
  origin: '2',
  special_id: '612616',
  price_total: '37.19',
  total: '1',
  is_goods_in_stock: '1',
  is_new_goods: '0',
  is_goods_original_price: '0',
  detail: [cartLine()],
  cart_ids: ['1278423441'],
}

const cartsData: YishouCartsBySupplyRaw = {
  in_stock: { group_data: [{ stock_data: [{ item: [group] }] }] },
}

/** 抓包 2.11 的 stock */
const confirmStock: YishouConfirmStockRaw[] = [
  {
    cart_id: '1278423441',
    sku: '82357192',
    color: '米色',
    size: '均码',
    num: '1',
    goods_id: '339696422',
    is_stock_now: '0',
    ys_instock_num: '2',
    buy_price: 37.19,
    special_id: '612616',
    tag_list: [{ type: '24h' }],
  },
]

describe('加购 selected（抓包 2.3）', () => {
  it('按颜色分组、item 复用原始规格、只覆盖选中 SKU 的 num', () => {
    const result = JSON.parse(buildAddCartSelected(attributes, [{ sku: '82357192', num: 2 }]))

    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('米色-现货')
    expect(result[0].is_recommend).toBe('0')
    expect(result[0].item).toHaveLength(1) // 未选中的 82357193 被剔除
    expect(result[0].item[0]).toMatchObject({
      sku: '82357192',
      num: '2', // 覆盖成字符串件数
      size: '均码',
      sale_stock: 2, // 原始字段原样保留
    })
  })

  it('多个颜色各选一个时分成多组，num 各自独立', () => {
    const result = JSON.parse(
      buildAddCartSelected(attributes, [
        { sku: '82357192', num: 1 },
        { sku: '82357194', num: 3 },
      ])
    )
    expect(result).toHaveLength(2)
    expect(result[0].color).toBe('米色-现货')
    expect(result[0].item[0].num).toBe('1')
    expect(result[1].color).toBe('黑色-现货')
    expect(result[1].item[0].num).toBe('3')
  })

  it('选中的 SKU 不在 attribute 里时返回空数组（适配器据此拒绝加购）', () => {
    expect(buildAddCartSelected(attributes, [{ sku: 'not-exist', num: 1 }])).toBe('[]')
  })
})

describe('购物车明细（抓包 2.6）— cart_id 枢纽', () => {
  it('按 rec_id + goods_id 精确定位本次加购的商品', () => {
    expect(pickCartGroup(cartsData, { recId: '1373604156', goodsId: '339696422', goodsNo: '1373604156' })).toBe(group)
    expect(pickCartGroup(cartsData, { recId: 'other', goodsId: '339696422', goodsNo: '1373604156' })).toBeNull()
  })

  it('只保留本次选中的规格行，过滤残留', () => {
    const withResidue: YishouCartGroupItemRaw = {
      ...group,
      detail: [cartLine(), cartLine({ cart_id: '999', sku: 'residue-sku' })],
    }
    const lines = pickCartLines(withResidue, [{ sku: '82357192', num: 1 }])
    expect(lines).toHaveLength(1)
    expect(lines[0].cart_id).toBe('1278423441')
  })
})

describe('算折 select_goods（抓包 2.7）', () => {
  it('按商品分组，detail 带真实 cart_id', () => {
    const result = JSON.parse(buildSelectGoods(group, [cartLine()], '19456111_1794500298'))
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      number: '1',
      goods_id: '339696422',
      special_id: '612616',
    })
    expect(result[0].detail[0]).toMatchObject({
      cart_id: '1278423441',
      sku: '82357192',
      add_cart_id: '19456111_1794500298',
      shop_price: '37.19',
    })
  })
})

describe('结算 selected（抓包 2.11）', () => {
  it('sku 级明细，必须带真实 cart_id', () => {
    const result = JSON.parse(buildConfirmSelected([cartLine()]))
    expect(result).toEqual([
      {
        ys_instock_num: '2',
        color: '米色',
        sku: '82357192',
        size: '均码',
        cart_id: '1278423441',
        num: '1',
        is_stock_now: '0',
        goods_id: '339696422',
      },
    ])
  })
})

describe('建单 selected（抓包 2.15）', () => {
  it('去掉 cart_id，补 from/piece_together_num，且不回传 tag_list 等嵌套字段', () => {
    const result = JSON.parse(buildCreateSelected(confirmStock))
    expect(result).toEqual([
      {
        from: '',
        color: '米色',
        ys_instock_num: '2',
        sku: '82357192',
        piece_together_num: '0',
        size: '均码',
        num: '1',
        is_stock_now: '0',
        goods_id: '339696422',
      },
    ])
    expect(result[0]).not.toHaveProperty('cart_id')
    expect(result[0]).not.toHaveProperty('tag_list')
    expect(result[0]).not.toHaveProperty('buy_price')
  })

  it('selected_express 只取 express_options_v2 里 selected:"1" 的项', () => {
    const result = resolveSelectedExpress([
      {
        origin: 2,
        express_list: [
          { express_id: '9999', selected: '1' },
          { express_id: '1', selected: '0' },
        ],
      },
    ])
    expect(result).toEqual([{ origin: '2', express_id: '9999' }])
  })
})

describe('埋点 ID 与固定常量（对齐抓包）', () => {
  it('trackingId / eventId 用 uid + 秒/毫秒时间戳', () => {
    expect(buildTrackingId('19456111', 1794497554)).toBe('19456111_1794497554')
    expect(buildEventId('19456111', 1794497158878)).toBe('19456111_1794497158878')
  })

  it('保险开关为 2（不投保），加购来源参数齐全', () => {
    expect(CART_ADD_SOURCE).toEqual({
      is_select_refund_insurance: '2',
      is_select_super_refund_insurance: '2',
      source: '3',
      sources: '3',
      position: '1',
      ss_type: '0',
    })
  })

  it('建单固定参数与 rsa 埋点', () => {
    expect(CREATE_ORDER_CONSTANTS).toEqual({ is_balance_pay: '0', user_address_tag: '0' })
    expect(JSON.parse(buildRsa())).toEqual({
      previous_vc_sorce: '进货车',
      buy_channel: '支付页',
      system_os: 'APP',
      app_entrance: '支付页',
    })
  })
})

describe('结算明细 → 编排层领域模型', () => {
  it('toSettledItems 过滤掉无 sku / 非法件数的行', () => {
    expect(
      toSettledItems([
        ...confirmStock,
        { sku: '', num: '1' } as YishouConfirmStockRaw,
        { sku: 'x', num: '0' } as YishouConfirmStockRaw,
      ])
    ).toEqual([{ sku: '82357192', num: 1 }])
  })

  it('num_total 优先，缺失时累加 stock[].num', () => {
    const raw: YishouConfirmRaw = { num_total: '3', stock: confirmStock }
    expect(resolveSettledNum(raw, confirmStock)).toBe(3)
    expect(resolveSettledNum({ stock: confirmStock }, [
      ...confirmStock,
      { ...confirmStock[0], num: '2' },
    ])).toBe(3)
  })
})
