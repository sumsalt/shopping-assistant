/**
 * 一手适配器 - 按账号抓包快照发请求
 *
 * 重点验证：
 * - wx / App 两种通道都能原样回放快照参数与请求头，只覆盖动态 t_t
 * - 匿名链路（前端已剔除 uid/token）不会发出 uid=undefined / token=undefined
 * - App 通道 t_t 为秒级（10 位），小程序为毫秒级（13 位）
 * - 无快照时回退到改造前的默认 wx 匿名参数
 */

import { describe, expect, it } from 'vitest'
import { YishouAdapter } from './index'
import type { AdapterConfig } from '../types'

/** 私有方法只在测试里访问，用结构化类型避免 any 扩散 */
type AdapterInternals = {
  buildBaseRequestBody: (t_t: number) => Record<string, string>
  buildHeaders: (sign: string) => Record<string, string>
  generateSignature: () => { sign: string; t_t: number }
}

const internals = (config: AdapterConfig): AdapterInternals =>
  new YishouAdapter(config) as unknown as AdapterInternals

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

describe('抓包快照回放 - 请求体', () => {
  it('wx 快照原样回放，只覆盖动态 t_t', () => {
    const body = internals(WX_CONFIG).buildBaseRequestBody(1_700_000_000_000)

    expect(body).toMatchObject({
      uid: 'u-wx',
      token: 'tk-wx',
      openid: 'open-wx',
      model: 'iPhone 14 Pro<iPhone15,2>',
      version_name: '4.9.0',
      plat_type: 'wx',
      equipmd5: 'equip-wx',
    })
    expect(body.t_t).toBe('1700000000000')
    expect(body.sign).toBeUndefined()
  })

  it('抓包里残留的 t_t / sign 会被动态值覆盖', () => {
    const body = internals({
      ...WX_CONFIG,
      requestParams: { ...WX_CONFIG.requestParams, t_t: '111', sign: 'stale' },
    }).buildBaseRequestBody(2_222)

    expect(body.t_t).toBe('2222')
    expect(body.sign).toBeUndefined()
  })

  it('App 快照原样回放，保留 udid / plat_type=Android', () => {
    const body = internals(APP_CONFIG).buildBaseRequestBody(1_700_000_000)

    expect(body).toMatchObject({
      uid: 'u-app',
      udid: 'udid-xyz',
      model: 'Pixel 7',
      plat_type: 'Android',
      network_type: 'wifi',
    })
    expect(body.t_t).toBe('1700000000')
  })

  it('匿名快照（已剔除 uid/token）不会发出无效凭证', () => {
    const anonymous = Object.fromEntries(
      Object.entries(WX_CONFIG.requestParams!).filter(
        ([key]) => key !== 'uid' && key !== 'token'
      )
    )
    const body = internals({
      channel: 'wx',
      requestParams: anonymous,
      requestHeaders: WX_CONFIG.requestHeaders,
    }).buildBaseRequestBody(1_700_000_000_000)

    expect(body.uid).toBeUndefined()
    expect(body.token).toBeUndefined()
    expect(Object.values(body)).not.toContain('undefined')
    // 其它公共参数仍完整保留
    expect(body.openid).toBe('open-wx')
    expect(body.model).toBe('iPhone 14 Pro<iPhone15,2>')
  })

  it('无快照时回退默认 wx 参数，且不带 uid/token', () => {
    const body = internals({}).buildBaseRequestBody(1_700_000_000_000)

    expect(body).toMatchObject({
      model: 'iPhone 14 Pro<iPhone15,2>',
      version: '8.0.60',
      version_name: '4.9.0',
      plat_type: 'wx',
      t_t: '1700000000000',
    })
    expect(body.uid).toBeUndefined()
    expect(body.token).toBeUndefined()
    expect(Object.values(body)).not.toContain('undefined')
  })

  it('无快照但带登录态时，顶层凭证仍会写进请求体', () => {
    const body = internals({ uid: 'legacy-uid', token: 'legacy-token' })
      .buildBaseRequestBody(1_700_000_000_000)

    expect(body.uid).toBe('legacy-uid')
    expect(body.token).toBe('legacy-token')
  })
})

describe('抓包快照回放 - 请求头', () => {
  it('wx 抓包头原样回放，只覆盖 sign', () => {
    const headers = internals(WX_CONFIG).buildHeaders('sig-new')

    expect(headers['User-Agent']).toBe('Mozilla/5.0 MicroMessenger/8.0.60')
    expect(headers.equipmd5).toBe('equip-wx')
    expect(headers.sign).toBe('sig-new')
  })

  it('App 抓包头保留 okhttp UA', () => {
    const headers = internals(APP_CONFIG).buildHeaders('sig-app')

    expect(headers['User-Agent']).toBe('okhttp/3.14.9')
    expect(headers['Accept-Encoding']).toBe('gzip')
    expect(headers.sign).toBe('sig-app')
  })

  it('有抓包头但缺 UA 时按通道补默认 UA', () => {
    const wx = internals({ channel: 'wx', requestHeaders: { equipmd5: 'x' } })
      .buildHeaders('s')
    const app = internals({ channel: 'app', requestHeaders: { equipmd5: 'x' } })
      .buildHeaders('s')

    expect(wx['User-Agent']).toContain('MicroMessenger')
    expect(app['User-Agent']).toBe('okhttp/3.14.9')
  })

  it('无抓包头时回退微信 UA + Referer；App 通道不带微信 Referer', () => {
    const wx = internals({}).buildHeaders('s')
    const app = internals({ channel: 'app' }).buildHeaders('s')

    expect(wx['User-Agent']).toContain('MicroMessenger')
    expect(wx['Referer']).toContain('servicewechat.com')
    expect(app['User-Agent']).toBe('okhttp/3.14.9')
    expect(app['Referer']).toBeUndefined()
  })
})

describe('抓包快照回放 - 时间戳与签名', () => {
  it('小程序 / H5 通道 t_t 为毫秒级 13 位', () => {
    const { t_t, sign } = internals(WX_CONFIG).generateSignature()

    expect(String(t_t).length).toBe(13)
    expect(sign).toMatch(/^[a-f0-9]{32}$/)
  })

  it('App 通道 t_t 为秒级 10 位且签名可正常生成', () => {
    const { t_t, sign } = internals(APP_CONFIG).generateSignature()

    expect(String(t_t).length).toBe(10)
    expect(sign).toMatch(/^[a-f0-9]{32}$/)
  })

  it('显式 timestamp 优先，便于复现抓包时刻', () => {
    const { t_t } = internals({ ...APP_CONFIG, timestamp: 1_700_000_000 })
      .generateSignature()

    expect(t_t).toBe(1_700_000_000)
  })

  it('显式 sign 优先，不再重新计算', () => {
    const { sign } = internals({ ...WX_CONFIG, sign: 'captured-sign' })
      .generateSignature()

    expect(sign).toBe('captured-sign')
  })
})
