/**
 * 登录态自检
 *
 * 一手对 (uid, token, udid) 三元组校验，任一不匹配只返回「请登录」；
 * 自检的价值就是把这种「静默失败」变成页面上一条明确结论。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdapterConfig } from '../types'

const mocks = vi.hoisted(() => ({ httpPost: vi.fn() }))

vi.mock('../../utils/http', () => ({
  httpPost: mocks.httpPost,
  httpRequest: vi.fn(),
}))

import { checkYishouAuth } from './auth-check'

const APP_CONFIG: AdapterConfig = {
  channel: 'app',
  requestParams: {
    uid: '20536811',
    token: '53b3cb4d',
    udid: 'be21db39a316aafd',
    model: 'MI 8 UD',
    version: '29',
    version_name: '7.65.00',
    plat_type: 'Android',
  },
  requestHeaders: { 'User-Agent': 'okhttp/3.14.9' },
}

describe('登录态自检', () => {
  beforeEach(() => {
    mocks.httpPost.mockReset()
  })

  it('没有 uid/token 时不发请求，直接说明缺凭证', async () => {
    const result = await checkYishouAuth({
      channel: 'app',
      requestParams: { udid: 'be21db39a316aafd', model: 'MI 8 UD', version: '29', version_name: '7.65.00' },
    })

    expect(result.ok).toBe(false)
    expect(result.message).toContain('uid')
    expect(mocks.httpPost).not.toHaveBeenCalled()
  })

  it('接口 200 时返回昵称，用于确认是哪个账号', async () => {
    mocks.httpPost.mockResolvedValueOnce({
      code: '200',
      msg: 'success',
      data: { user_id: 20536811, nickname: 'vls53410370' },
    })

    const result = await checkYishouAuth(APP_CONFIG)

    expect(mocks.httpPost.mock.calls[0]?.[0]).toContain('/users/get_user_info')
    expect(result).toMatchObject({
      ok: true,
      uid: '20536811',
      nickname: 'vls53410370',
      message: '登录态正常（vls53410370）',
    })
  })

  it('返回嵌套 user_info 时也能取到昵称', async () => {
    mocks.httpPost.mockResolvedValueOnce({
      code: '200',
      msg: 'success',
      data: { user_info: { user_id: '1', nick_name: '小明' } },
    })

    const result = await checkYishouAuth(APP_CONFIG)

    expect(result).toMatchObject({ ok: true, uid: '1', nickname: '小明' })
  })

  it('201 请登录时给出「token 过期或三者不同源」的明确提示', async () => {
    mocks.httpPost.mockResolvedValueOnce({ code: '201', msg: '请登录', data: null })

    const result = await checkYishouAuth(APP_CONFIG)

    expect(result.ok).toBe(false)
    expect(result.message).toContain('token')
    expect(result.message).toContain('同一台设备')
  })

  it('网络异常时保留原始信息，便于排查代理 / 超时', async () => {
    mocks.httpPost.mockRejectedValueOnce(new Error('请求超时（15000ms）'))

    const result = await checkYishouAuth(APP_CONFIG)

    expect(result.ok).toBe(false)
    expect(result.message).toContain('校验失败')
    expect(result.message).toContain('超时')
  })
})
