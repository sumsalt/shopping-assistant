/**
 * 添加到收藏夹 - 请求契约
 *
 * 抓包依据：iOS form `POST /users/add_goods_collection`
 * （app_code=0&goods_no=xxx，响应 {collect_id}），
 * Android H5 同端点但用 JSON body，服务端两种都认，这里按 iOS 形态发。
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

const calls = () => mocks.httpPost.mock.calls as Array<[string, Record<string, string>, unknown, unknown]>
const bodyOf = (i: number) => calls()[i][1]

describe('addCollection（POST /users/add_goods_collection）', () => {
  beforeEach(() => {
    mocks.httpPost.mockReset()
  })

  it('按 iOS 抓包发 app_code=0 + goods_no，返回 collect_id', async () => {
    mocks.httpPost.mockResolvedValue({
      code: '200',
      msg: 'success',
      data: { collect_id: '374803378' },
    })

    const adapter = new YishouAdapter(config)
    const result = await adapter.addCollection('1381104809')

    expect(calls()).toHaveLength(1)
    expect(calls()[0][0]).toContain('/users/add_goods_collection')
    expect(bodyOf(0)).toMatchObject({ app_code: '0', goods_no: '1381104809' })
    expect(result).toEqual({ collectId: '374803378' })
  })

  it('收藏写入绑 collection.write flow（策略 normal，走闸门限频）', async () => {
    mocks.httpPost.mockResolvedValue({ code: '200', msg: 'success', data: { collect_id: '1' } })

    const adapter = new YishouAdapter(config)
    await adapter.addCollection('1381104809')

    expect((calls()[0][3] as { gate?: { flow?: string } }).gate?.flow).toBe('collection.write')
  })

  it('重复收藏时把一手文案原样抛出，交给页面提示「已收藏」', async () => {
    mocks.httpPost.mockResolvedValue({ code: '400', msg: '该商品已收藏', data: null })

    const adapter = new YishouAdapter(config)
    await expect(adapter.addCollection('1381104809')).rejects.toThrow(/已收藏/)
  })

  it('响应没有 collect_id 视为失败，不返回半成品结果', async () => {
    mocks.httpPost.mockResolvedValue({ code: '200', msg: 'success', data: {} })

    const adapter = new YishouAdapter(config)
    await expect(adapter.addCollection('1381104809')).rejects.toThrow(/未返回收藏 ID/)
  })

  it('限流时一手把错误文案塞进 collect_id，必须当作失败抛出而非写回', async () => {
    mocks.httpPost.mockResolvedValue({
      code: '200',
      msg: 'success',
      data: { collect_id: '操作过于频繁，请稍后再试' },
    })

    const adapter = new YishouAdapter(config)
    await expect(adapter.addCollection('1381104809')).rejects.toThrow(/操作过于频繁/)
  })

  it('缺货号时直接报错，不发请求', async () => {
    const adapter = new YishouAdapter(config)
    await expect(adapter.addCollection('  ')).rejects.toThrow(/缺少商品货号/)
    expect(mocks.httpPost).not.toHaveBeenCalled()
  })

  it('没有登录态时拒绝，不发请求', async () => {
    const adapter = new YishouAdapter({ channel: 'app' })
    await expect(adapter.addCollection('1381104809')).rejects.toThrow(/登录态/)
    expect(mocks.httpPost).not.toHaveBeenCalled()
  })
})
