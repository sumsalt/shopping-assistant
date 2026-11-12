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

import { encodeFormComponent, resolveRequestProfile } from './profile'
import { YishouClient } from './client'
import { md5 } from '../../utils/crypto'

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

describe('请求档案 - 签名编码与 App 设备指纹（对齐实测指南）', () => {
  it('model 按 OkHttp 规则编码：空格 %20、括号与特殊字符也要编码', () => {
    // 实测：MI 8 UD → MI%208%20UD
    expect(encodeFormComponent('MI 8 UD')).toBe('MI%208%20UD')
    // encodeURIComponent 不编码 ( ) ! ' *，OkHttp 会编码，这是两者唯一的差异
    expect(encodeFormComponent('MI 8 (UD)')).toBe('MI%208%20%28UD%29')
    expect(encodeFormComponent("1234!*'()")).toBe('1234%21%2A%27%28%29')
    // 中文机型名按 UTF-8 逐字节编码
    expect(encodeFormComponent('小米 8')).toBe('%E5%B0%8F%E7%B1%B3%208')
    // 无特殊字符时两种算法等价
    expect(encodeFormComponent('Pixel7')).toBe('Pixel7')
  })

  it('App 签名首段优先 udid，缺失时用 device_id 兜底', () => {
    const build = (params: Record<string, string>) =>
      resolveRequestProfile({
        channel: 'app',
        requestParams: { model: 'MI 8 UD', version: '29', version_name: '7.65.00', ...params },
        requestHeaders: { 'User-Agent': 'okhttp/3.14.9' },
      })

    const withUdid = build({ udid: 'udid-a', device_id: 'udid-a' })
    const onlyDeviceId = build({ device_id: 'udid-a' })

    expect(withUdid.sign(1_700_000_000)).toBe(onlyDeviceId.sign(1_700_000_000))
    expect(withUdid.sign(1_700_000_000)).toMatch(/^[a-f0-9]{32}$/)
  })

  it('App 通道抓包没带 equipmd5 时补 md5(udid)，已带则原样保留', () => {
    const base = {
      channel: 'app' as const,
      requestParams: {
        udid: 'be21db39a316aafd',
        model: 'MI 8 UD',
        version: '29',
        version_name: '7.65.00',
        plat_type: 'Android',
      },
      requestHeaders: { 'User-Agent': 'okhttp/3.14.9' },
    }

    expect(resolveRequestProfile(base).headers.equipmd5).toBe(md5('be21db39a316aafd'))

    const captured = resolveRequestProfile({
      ...base,
      requestHeaders: { 'User-Agent': 'okhttp/3.14.9', equipmd5: '11' },
    })
    // 预发环境该值是字符串 11，不能覆盖用户抓到的真实值
    expect(captured.headers.equipmd5).toBe('11')
  })

  it('wx 通道不补 equipmd5（该字段只属于 App 通道）', () => {
    const profile = resolveRequestProfile(WX_CONFIG)
    expect(profile.headers.equipmd5).toBe('equip-wx')

    const noEquip = resolveRequestProfile({
      channel: 'wx',
      requestParams: { openid: 'o', model: 'm', version: 'v', version_name: 'vn' },
      requestHeaders: { 'User-Agent': 'Mozilla/5.0 MicroMessenger/8.0.60' },
    })
    expect(noEquip.headers.equipmd5).toBeUndefined()
  })
})

/** iOS App 抓包：UA 是 YiShou/x.y.z，plat_type=iOS，t_t 秒级 */
const IOS_CONFIG: AdapterConfig = {
  channel: 'app',
  requestParams: {
    uid: 'u-ios',
    token: 'tk-ios',
    udid: '43198096-8833-4F49-962F-DC330405010D',
    model: 'iPhone 14 Pro',
    version: '26.700001',
    version_name: '7.66.01',
    plat_type: 'iOS',
  },
  requestHeaders: {
    'User-Agent': 'YiShou/7.66.01 (iPhone; iOS 26.7.1; Scale/3.00)',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept-Encoding': 'gzip, deflate, br',
    equipmd5: 'af923c1ee36a5254113ade612254ef11',
  },
}

describe('请求档案 - iOS App 抓包', () => {
  it('原样回放 YiShou UA 与 plat_type=iOS，t_t 为秒级', () => {
    const profile = resolveRequestProfile(IOS_CONFIG)

    expect(profile.channel).toBe('app')
    expect(profile.headers['User-Agent']).toContain('YiShou/7.66.01')
    expect(profile.headers['Accept-Encoding']).toBe('gzip, deflate, br')
    expect(profile.headers.equipmd5).toBe('af923c1ee36a5254113ade612254ef11')
    expect(profile.params.plat_type).toBe('iOS')
    expect(String(profile.timestamp()).length).toBe(10)
    expect(profile.sign(profile.timestamp())).toMatch(/^[a-f0-9]{32}$/)
  })

  it('iOS 签名用未编码的 model，能复现抓包里的 sign', () => {
    // 2026-11-12 真实抓包：t_t=1794454532 → sign=c4672a61666a07d51b6793d7dfd48e44
    // 签名原料 = udid + 原始 model + version + version_name，model 不做 URL 编码
    const profile = resolveRequestProfile(IOS_CONFIG)

    expect(profile.sign(1794454532)).toBe('c4672a61666a07d51b6793d7dfd48e44')
  })

  it('Android 仍按 OkHttp 规则用编码后的 model 参与签名', () => {
    const profile = resolveRequestProfile({
      channel: 'app',
      requestParams: { ...APP_CONFIG.requestParams, udid: 'udid-a', model: 'MI 8 UD' },
    })
    const t = 1_700_000_000

    expect(profile.sign(t)).toBe(md5(md5(`udid-aMI%208%20UD${profile.params.version}${profile.params.version_name}`) + t))
  })

  it('iOS 抓包没带 UA 时补 YiShou UA，不能补 Android 的 okhttp', () => {
    const profile = resolveRequestProfile({
      channel: 'app',
      requestParams: IOS_CONFIG.requestParams,
    })

    expect(profile.headers['User-Agent']).toContain('YiShou/7.66.01')
    expect(profile.headers['User-Agent']).not.toContain('okhttp')
    expect(profile.headers.equipmd5).toBe(md5('43198096-8833-4F49-962F-DC330405010D'))
  })

  it('Android 抓包没带 UA 时仍补 okhttp', () => {
    const profile = resolveRequestProfile({
      channel: 'app',
      requestParams: { ...APP_CONFIG.requestParams },
    })

    expect(profile.headers['User-Agent']).toBe('okhttp/3.14.9')
  })
})
