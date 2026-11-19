/**
 * 取消收藏 - 请求契约
 *
 * 抓包依据：Android H5 `POST /users/del_goods_collection`（JSON body）：
 *   { goods_no, goods_id, collect_id, token, uid, version_name }
 * 其中 token / uid / version_name 由 writeClient 从账号快照自动注入并签名，
 * 这里只验证业务参数、端点、闸门与错误分支。
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

describe('removeCollection（POST /users/del_goods_collection）', () => {
  beforeEach(() => {
    mocks.httpPost.mockReset()
  })

  it('按抓包发 goods_no + collect_id + goods_id', async () => {
    mocks.httpPost.mockResolvedValue({ code: '200', msg: 'success', data: null })

    const adapter = new YishouAdapter(config)
    await adapter.removeCollection('1381104809', '374803803', '341451565')

    expect(calls()).toHaveLength(1)
    expect(calls()[0][0]).toContain('/users/del_goods_collection')
    expect(bodyOf(0)).toMatchObject({
      goods_no: '1381104809',
      goods_id: '341451565',
      collect_id: '374803803',
    })
  })

  it('没有 goods_id 时只发 goods_no + collect_id，不塞空字段', async () => {
    mocks.httpPost.mockResolvedValue({ code: '200', msg: 'success', data: null })

    const adapter = new YishouAdapter(config)
    await adapter.removeCollection('1381104809', '374803803')

    expect(bodyOf(0)).toMatchObject({ goods_no: '1381104809', collect_id: '374803803' })
    expect(bodyOf(0)).not.toHaveProperty('goods_id')
  })

  it('公共参数（token/uid/version_name）由 writeClient 注入，业务层不重复拼', async () => {
    mocks.httpPost.mockResolvedValue({ code: '200', msg: 'success', data: null })

    const adapter = new YishouAdapter(config)
    await adapter.removeCollection('1381104809', '374803803', '341451565')

    expect(bodyOf(0)).toMatchObject({ token: config.token, uid: config.uid })
    expect(bodyOf(0)).toHaveProperty('t_t')
  })

  it('取消收藏绑 collection.write flow（策略 normal，走闸门限频）', async () => {
    mocks.httpPost.mockResolvedValue({ code: '200', msg: 'success', data: null })

    const adapter = new YishouAdapter(config)
    await adapter.removeCollection('1381104809', '374803803', '341451565')

    expect((calls()[0][3] as { gate?: { flow?: string } }).gate?.flow).toBe('collection.write')
  })

  it('一手业务错误（如不在收藏夹）原样抛出', async () => {
    mocks.httpPost.mockResolvedValue({ code: '400', msg: '收藏记录不存在', data: null })

    const adapter = new YishouAdapter(config)
    await expect(adapter.removeCollection('1381104809', '374803803')).rejects.toThrow(/收藏记录不存在/)
  })

  it('缺货号或缺 collect_id 时直接报错，不发请求', async () => {
    const adapter = new YishouAdapter(config)
    await expect(adapter.removeCollection('  ', '374803803')).rejects.toThrow(/缺少商品货号/)
    await expect(adapter.removeCollection('1381104809', '')).rejects.toThrow(/缺少商品货号/)
    expect(mocks.httpPost).not.toHaveBeenCalled()
  })

  it('没有登录态时拒绝，不发请求', async () => {
    const adapter = new YishouAdapter({ channel: 'app' })
    await expect(adapter.removeCollection('1381104809', '374803803')).rejects.toThrow(/登录态/)
    expect(mocks.httpPost).not.toHaveBeenCalled()
  })
})
