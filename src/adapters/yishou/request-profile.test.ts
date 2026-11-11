/**
 * 请求档案解析 - 账号抓包快照 → 实际请求
 *
 * 重点验证：
 * - wx / App 两种通道都能原样回放快照参数与请求头，只覆盖动态 t_t
 * - 匿名链路（前端已剔除 uid/token）不会发出 uid=undefined / token=undefined
 * - App 通道 t_t 为秒级（10 位），小程序为毫秒级（13 位）
 * - 无快照时回退到改造前的默认 wx 匿名参数
 */

import { describe, expect, it, vi } from 'vitest'
import type { AdapterConfig } from '../types'

const mocks = vi.hoisted(() => ({ httpPost: vi.fn() }))

vi.mock('../../utils/http', () => ({
  httpPost: mocks.httpPost,
  httpRequest: vi.fn(),
}))

import { resolveRequestProfile } from './profile'
import { YishouClient } from './client'

const WX_CONFIG: AdapterConfig = {
  channel: 'wx',
  requestParams: {
    uid: 'u-wx',
    token: 'tk-wx',
    openid: 'open-wx',
    model: 'iPhone 14 Pro<iPhone15,2>',
    version: '8.0.60',
    version_name: '4.9.0',
    wx_version_name: '3.5.34',
    plat_type: 'wx',
    equipmd5: 'equip-wx',
  },
  requestHeaders: {
    'User-Agent': 'Mozilla/5.0 MicroMessenger/8.0.60',
    'Content-Type': 'application/x-www-form-urlencoded',
    equipmd5: 'equip-wx',
  },
}

const APP_CONFIG: AdapterConfig = {
  channel: 'app',
  requestParams: {
    uid: 'u-app',
    token: 'tk-app',
    udid: 'udid-xyz',
    model: 'Pixel 7',
    version: '5.11.0',
    version_name: '5.11.0',
    plat_type: 'Android',
    network_type: 'wifi',
  },
  requestHeaders: {
    'User-Agent': 'okhttp/3.14.9',
    'Accept-Encoding': 'gzip',
  },
}

describe('请求档案 - 公共参数', () => {
  it('wx 快照原样保留，动态字段 t_t / sign 被剔除', () => {
    const profile = resolveRequestProfile({
      ...WX_CONFIG,
      requestParams: { ...WX_CONFIG.requestParams, t_t: '111', sign: 'stale' },
    })

    expect(profile.params).toMatchObject({
      uid: 'u-wx',
      token: 'tk-wx',
      openid: 'open-wx',
      model: 'iPhone 14 Pro<iPhone15,2>',
      version_name: '4.9.0',
      plat_type: 'wx',
      equipmd5: 'equip-wx',
    })
    expect(profile.params.t_t).toBeUndefined()
    expect(profile.params.sign).toBeUndefined()
    expect(profile.captured).toBe(true)
  })

  it('App 快照保留 udid / plat_type=Android', () => {
    const profile = resolveRequestProfile(APP_CONFIG)

    expect(profile.params).toMatchObject({
      uid: 'u-app',
      udid: 'udid-xyz',
      model: 'Pixel 7',
      plat_type: 'Android',
      network_type: 'wifi',
    })
    expect(profile.channel).toBe('app')
  })

  it('匿名快照（已剔除 uid/token）不会补出无效凭证', () => {
    const anonymous = Object.fromEntries(
      Object.entries(WX_CONFIG.requestParams!).filter(
        ([key]) => key !== 'uid' && key !== 'token'
      )
    )
    const profile = resolveRequestProfile({
      channel: 'wx',
      requestParams: anonymous,
      requestHeaders: WX_CONFIG.requestHeaders,
    })

    expect(profile.params.uid).toBeUndefined()
    expect(profile.params.token).toBeUndefined()
    expect(profile.hasAuth).toBe(false)
    expect(Object.values(profile.params)).not.toContain('undefined')
    // 其它公共参数仍完整保留
    expect(profile.params.openid).toBe('open-wx')
  })

  it('无快照时回退默认 wx 参数，且不带 uid/token', () => {
    const profile = resolveRequestProfile({})

    expect(profile.params).toMatchObject({
      model: 'iPhone 14 Pro<iPhone15,2>',
      version: '8.0.60',
      version_name: '4.9.0',
      plat_type: 'wx',
    })
    expect(profile.params.uid).toBeUndefined()
    expect(profile.params.token).toBeUndefined()
    expect(Object.values(profile.params)).not.toContain('undefined')
    expect(profile.captured).toBe(false)
  })

  it('无快照但带登录态时，凭证写进公共参数', () => {
    const profile = resolveRequestProfile({ uid: 'legacy-uid', token: 'legacy-token' })

    expect(profile.params.uid).toBe('legacy-uid')
    expect(profile.params.token).toBe('legacy-token')
    expect(profile.hasAuth).toBe(true)
  })
})

describe('请求档案 - 请求头', () => {
  it('wx 抓包头原样回放，不额外补 Referer', () => {
    const profile = resolveRequestProfile(WX_CONFIG)

    expect(profile.headers['User-Agent']).toBe('Mozilla/5.0 MicroMessenger/8.0.60')
    expect(profile.headers.equipmd5).toBe('equip-wx')
    expect(profile.headers.Referer).toBeUndefined()
  })

  it('App 抓包头保留 okhttp UA', () => {
    const profile = resolveRequestProfile(APP_CONFIG)

    expect(profile.headers['User-Agent']).toBe('okhttp/3.14.9')
    expect(profile.headers['Accept-Encoding']).toBe('gzip')
  })

  it('有抓包头但缺 UA 时按通道补默认 UA', () => {
    const wx = resolveRequestProfile({ channel: 'wx', requestHeaders: { equipmd5: 'x' } })
    const app = resolveRequestProfile({ channel: 'app', requestHeaders: { equipmd5: 'x' } })

    expect(wx.headers['User-Agent']).toContain('MicroMessenger')
    expect(app.headers['User-Agent']).toBe('okhttp/3.14.9')
  })

  it('无抓包头时回退微信 UA + Referer；App 通道不带微信 Referer', () => {
    const wx = resolveRequestProfile({})
    const app = resolveRequestProfile({ channel: 'app' })

    expect(wx.headers['User-Agent']).toContain('MicroMessenger')
    expect(wx.headers.Referer).toContain('servicewechat.com')
    expect(app.headers['User-Agent']).toBe('okhttp/3.14.9')
    expect(app.headers.Referer).toBeUndefined()
  })
})

describe('请求档案 - 时间戳与签名', () => {
  it('小程序 / H5 通道 t_t 为毫秒级 13 位', () => {
    const profile = resolveRequestProfile(WX_CONFIG)
    const t_t = profile.timestamp()

    expect(String(t_t).length).toBe(13)
    expect(profile.sign(t_t)).toMatch(/^[a-f0-9]{32}$/)
  })

  it('App 通道 t_t 为秒级 10 位且签名可正常生成', () => {
    const profile = resolveRequestProfile(APP_CONFIG)
    const t_t = profile.timestamp()

    expect(String(t_t).length).toBe(10)
    expect(profile.sign(t_t)).toMatch(/^[a-f0-9]{32}$/)
  })

  it('显式 timestamp / sign 优先，便于复现抓包时刻', () => {
    const profile = resolveRequestProfile({
      ...APP_CONFIG,
      timestamp: 1_700_000_000,
      sign: 'captured-sign',
    })

    expect(profile.timestamp()).toBe(1_700_000_000)
    expect(profile.sign(1_700_000_000)).toBe('captured-sign')
  })
})

describe('请求客户端 - 实际发出的请求', () => {
  it('业务参数覆盖公共参数，但 t_t 始终用本次生成值', async () => {
    mocks.httpPost.mockResolvedValueOnce({ code: '200', msg: 'ok', data: { ok: true } })

    const client = new YishouClient({ ...WX_CONFIG, timestamp: 1_700_000_000_000 })
    await client.post('https://example.com/api', { goods_id: '1', model: 'override' })

    const body = mocks.httpPost.mock.calls.at(-1)?.[1] as Record<string, string>
    const headers = mocks.httpPost.mock.calls.at(-1)?.[2] as Record<string, string>

    expect(body.goods_id).toBe('1')
    expect(body.model).toBe('override')
    expect(body.t_t).toBe('1700000000000')
    expect(headers.sign).toMatch(/^[a-f0-9]{32}$/)
  })

  it('code 非 200 时抛出业务错误，登录文案映射为 AUTH_REQUIRED', async () => {
    mocks.httpPost.mockResolvedValueOnce({ code: '500', msg: '请先登录', data: null })

    const client = new YishouClient(WX_CONFIG)
    await expect(client.post('https://example.com/api')).rejects.toMatchObject({
      type: 'AUTH_REQUIRED',
    })
  })

  it('没有登录态时 requireAuth 直接拦截，不发请求', async () => {
    mocks.httpPost.mockClear()
    const client = new YishouClient({ channel: 'wx', requestParams: { openid: 'o' } })

    expect(() => client.requireAuth('需要登录')).toThrow('需要登录')
    expect(mocks.httpPost).not.toHaveBeenCalled()
  })
})
