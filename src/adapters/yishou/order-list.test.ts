/**
 * 一手适配器 - 订单列表
 *
 * 只测「请求参数 + 映射」。三个最容易写错的点都在这里：
 *   - 参数名是 pageidx（不是 pageindex），且是 **记录偏移量 offset**（步长 = pagesize），
 *     不是页码；传 1 只会前移 1 条，导致加载更多重复第一页
 *   - 传了 pageidx 返回 `{list,...}`，不传是裸数组
 *   - 没有总数，hasMore 只能按本页是否满页判断
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
import { formatOrderAttribute, formatOrderSelected, formatOrderSpec } from './mappers'
import { StockCheckError, StockCheckErrorType } from '../../types'

const config = {
  uid: '20478621',
  token: 'token-abc',
  openid: '',
  model: 'iPhone 14 Pro<iPhone15,2>',
  version: '8.0.60',
  version_name: '4.9.0',
}

const lastBody = () => mocks.httpPost.mock.calls.at(-1)?.[1] as Record<string, string>

const order = (overrides: Record<string, unknown> = {}) => ({
  order_sn: '12641500005438',
  order_status: '3',
  order_status_name: '交易关闭',
  add_time: '2026-11-12 02:18:32',
  order_amount: '24.90',
  goods_amount: '18.90',
  shipping_fee: '6.00',
  stock_total: '2',
  pay_tool: '12',
  cancel_expire: '1794422312',
  order_msg_text: '交易关闭',
  purchased: [
    {
      goods_id: '339456047',
      goods_no: '1376601426',
      goods_name: '秋上新！【A派】女装韩系',
      goods_thumb: 'https://img4.yishouapp.com/obs/baob/4958.jpg',
      attribute: '{"粉色":{"M":"1"},"灰色":{"均码":"1"}}',
      selected: '粉色：M/1件，\n灰色：均码/1件，',
      shop_price: '18.90',
      num: '2',
      goods_status: '2',
    },
  ],
  ...overrides,
})

describe('订单规格文案', () => {
  it('attribute 嵌套对象摊平成「颜色 尺码 ×件数」', () => {
    expect(formatOrderAttribute('{"粉色":{"M":"1"},"灰色":{"均码":"2"}}')).toBe(
      '粉色 M ×1 / 灰色 均码 ×2'
    )
  })

  it('attribute 非法时返回空串，由 selected 兜底', () => {
    expect(formatOrderAttribute('not-json')).toBe('')
    expect(formatOrderAttribute('')).toBe('')
    expect(formatOrderAttribute(undefined)).toBe('')
  })

  it('selected 文本清洗成统一格式', () => {
    expect(formatOrderSelected('粉色：M/1件，\n浅咖色：M/1件，')).toBe('粉色 M ×1 / 浅咖色 M ×1')
  })

  it('优先 attribute，失败才用 selected', () => {
    expect(formatOrderSpec('{"黑色":{"L":"3"}}', '忽略')).toBe('黑色 L ×3')
    expect(formatOrderSpec('bad', '黑色：L/3件，')).toBe('黑色 L ×3')
  })
})

describe('YishouAdapter 订单列表', () => {
  beforeEach(() => {
    mocks.httpPost.mockReset()
  })

  it('pageidx 是记录偏移量：第 N 页传 (N-1)*size，并把每页条数收敛到 10', async () => {
    mocks.httpPost.mockResolvedValue({ code: '200', msg: 'success', data: { list: [order()] } })

    const adapter = new YishouAdapter(config)
    // pagesize 传 50 会被收敛到 10；对外第 2 页的 offset 应为 (2-1)*10 = 10
    await adapter.getOrderList(2, 50)

    expect(lastBody().pageidx).toBe('10')
    expect(lastBody().pagesize).toBe('10')
    // 写错成 pageindex 会直接 500，这里守住参数名
    expect(lastBody().pageindex).toBeUndefined()
  })

  it('连续翻页按 pagesize 递增，不会重复前一页（pageidx 不是页码）', async () => {
    mocks.httpPost.mockResolvedValue({ code: '200', msg: 'success', data: { list: [] } })

    const adapter = new YishouAdapter(config)
    const offsets: string[] = []
    for (const page of [1, 2, 3, 4]) {
      await adapter.getOrderList(page, 10)
      offsets.push(lastBody().pageidx)
    }

    // 0 / 10 / 20 / 30：每页正好跨过一整页，不会像页码那样只挪 1 条
    expect(offsets).toEqual(['0', '10', '20', '30'])
  })

  it('默认 order_status=all，显式 tab 原样回传', async () => {
    mocks.httpPost.mockResolvedValue({ code: '200', msg: 'success', data: { list: [] } })

    const adapter = new YishouAdapter(config)
    await adapter.getOrderList()
    expect(lastBody().order_status).toBe('all')

    const pay = await adapter.getOrderList(1, 10, 'wait_pay')
    expect(lastBody().order_status).toBe('wait_pay')
    expect(pay.status).toBe('wait_pay')

    // wait_comfirm 是一手的拼写错误，必须照抄；非法值收敛成 all
    await adapter.getOrderList(1, 10, 'wait_comfirm')
    expect(lastBody().order_status).toBe('wait_comfirm')
    await adapter.getOrderList(1, 10, 'wait_confirm' as never)
    expect(lastBody().order_status).toBe('all')
  })

  it('映射金额、件数、截止时间与商品明细', async () => {
    mocks.httpPost.mockResolvedValue({
      code: '200',
      msg: 'success',
      // 传了 pageidx 时的真实结构：list 包一层，附带服务器时间
      data: { list: [order()], pageidx: 0, current_timestamp: 1794454534 },
    })

    const adapter = new YishouAdapter(config)
    const result = await adapter.getOrderList(1, 10)
    const item = result.items[0]

    expect(item.orderSn).toBe('12641500005438')
    expect(item.statusName).toBe('交易关闭')
    expect(item.orderAmount).toBe(24.9)
    expect(item.goodsAmount).toBe(18.9)
    expect(item.shippingFee).toBe(6)
    expect(item.totalNum).toBe(2)
    expect(item.cancelExpireAt).toBe(1794422312000)
    expect(item.items[0]).toMatchObject({
      goodsId: '339456047',
      goodsNo: '1376601426',
      price: 18.9,
      num: 2,
      specText: '粉色 M ×1 / 灰色 均码 ×1',
    })
  })

  it('满页视为可能还有下一页，不满页结束分页', async () => {
    const full = Array.from({ length: 10 }, () => order())
    mocks.httpPost.mockResolvedValueOnce({ code: '200', msg: 'success', data: { list: full } })
    const adapter = new YishouAdapter(config)
    expect((await adapter.getOrderList(1, 10)).hasMore).toBe(true)

    mocks.httpPost.mockResolvedValueOnce({
      code: '200',
      msg: 'success',
      data: { list: [order()] },
    })
    expect((await adapter.getOrderList(2, 10)).hasMore).toBe(false)
  })

  it('缺 stock_total 时用商品件数求和，缺 order_amount 时用商品金额加运费', async () => {
    mocks.httpPost.mockResolvedValue({
      code: '200',
      msg: 'success',
      data: { list: [order({ stock_total: '', order_amount: '' })] },
    })

    const adapter = new YishouAdapter(config)
    const item = (await adapter.getOrderList()).items[0]

    expect(item.totalNum).toBe(2)
    expect(item.orderAmount).toBe(24.9)
  })

  it('没有登录态时不发请求，直接提示去账号管理', async () => {
    const adapter = new YishouAdapter({ ...config, uid: '', token: '' })

    await expect(adapter.getOrderList()).rejects.toThrow(StockCheckError)
    expect(mocks.httpPost).not.toHaveBeenCalled()

    try {
      await adapter.getOrderList()
    } catch (error) {
      expect((error as StockCheckError).type).toBe(StockCheckErrorType.AUTH_REQUIRED)
      expect((error as StockCheckError).message).toContain('查看订单需要登录态')
    }
  })

  it('兼容裸数组与空结构：都返回空列表且没有下一页', async () => {
    const adapter = new YishouAdapter(config)

    // 不传 pageidx 时的裸数组
    mocks.httpPost.mockResolvedValueOnce({ code: '200', msg: 'success', data: [order()] })
    expect((await adapter.getOrderList(1, 10)).items).toHaveLength(1)

    mocks.httpPost.mockResolvedValueOnce({ code: '200', msg: 'success', data: null })
    const result = await adapter.getOrderList(3, 10)

    expect(result.items).toEqual([])
    expect(result.hasMore).toBe(false)
    expect(result.page).toBe(3)
  })
})
