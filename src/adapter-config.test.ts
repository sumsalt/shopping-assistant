/**
 * 统一适配器配置构造测试（纯函数）
 *
 * 重点：匿名检测必须剔除 uid/token；未选账号回退默认参数；两种通道都能带完整快照。
 */

import { describe, expect, it } from 'vitest'
import {
  buildAdapterConfig,
  stripAuthParams,
  hasLoginCredential,
  summarizeProfile,
  DEFAULT_WX_ADAPTER_CONFIG,
} from '../web/utils/adapterConfig'
import type { UserConfig, RequestProfile } from '../web/types'

const appProfile: RequestProfile = {
  channel: 'app',
  params: {
    uid: '20536811',
    token: '53b3cb4ddc8cd0171cb9b6d6d1cb41ce',
    udid: 'be21db39a316aafd',
    device_id: 'be21db39a316aafd',
    plat_type: 'Android',
    model: 'MI 8 UD',
    version: '29',
    version_name: '7.65.00',
    manufacturer: 'Xiaomi',
  },
  headers: { 'User-Agent': 'okhttp/3.14.9', 'Content-Type': 'application/x-www-form-urlencoded' },
  path: '/goods/get_goods_info_v2',
}

const wxProfile: RequestProfile = {
  channel: 'wx',
  params: {
    uid: '20478621',
    token: 'a878dabfb1eaf3d4acf19fa3f81f9cef',
    openid: 'oXxx123',
    plat_type: 'wx',
    model: 'iPhone 14 Pro<iPhone15,2>',
    version: '8.0.60',
    version_name: '4.9.0',
    wx_version_name: '3.5.34',
  },
  headers: { 'User-Agent': 'Mozilla/5.0 ... MicroMessenger/8.0.60' },
}

const configWith = (profile: RequestProfile | null): UserConfig => ({
  activeAccountId: 'acc_1',
  activeAccountProfile: profile,
  proxyUrl: 'http://127.0.0.1:7890',
  proxyEnabled: '1',
})

describe('buildAdapterConfig - 未选账号', () => {
  it('回退默认 wx 匿名参数，且代理设置仍透传', () => {
    const result = buildAdapterConfig({ proxyUrl: 'http://p', proxyEnabled: '1' }, false)
    expect(result).toMatchObject({
      ...DEFAULT_WX_ADAPTER_CONFIG,
      proxyUrl: 'http://p',
      proxyEnabled: '1',
    })
    expect(result.uid).toBeUndefined()
    expect(result.token).toBeUndefined()
    expect(result.requestParams).toBeUndefined()
  })

  it('config 为 null / undefined 也能安全构造', () => {
    expect(buildAdapterConfig(null, true).plat_type).toBe('wx')
    expect(buildAdapterConfig(undefined, false).uid).toBeUndefined()
    expect(buildAdapterConfig(undefined, true).uid).toBeUndefined()
  })

  it('空 params 的快照视为未配置', () => {
    const result = buildAdapterConfig(configWith({ channel: 'app', params: {}, headers: {} }), true)
    expect(result.requestParams).toBeUndefined()
    expect(result.plat_type).toBe('wx')
  })
})

describe('buildAdapterConfig - 匿名检测（needAuth=false）', () => {
  it('App 账号：requestParams 不含 uid/token，顶层也没有', () => {
    const result = buildAdapterConfig(configWith(appProfile), false)

    expect(result.channel).toBe('app')
    expect(result.plat_type).toBe('Android')
    expect(result.requestParams?.uid).toBeUndefined()
    expect(result.requestParams?.token).toBeUndefined()
    expect(result.requestParams?.udid).toBe('be21db39a316aafd')
    expect(result.requestParams?.plat_type).toBe('Android')
    expect(result.uid).toBeUndefined()
    expect(result.token).toBeUndefined()
  })

  it('wx 账号：同样剔除 uid/token，但保留 openid', () => {
    const result = buildAdapterConfig(configWith(wxProfile), false)
    expect(result.requestParams?.uid).toBeUndefined()
    expect(result.requestParams?.token).toBeUndefined()
    expect(result.requestParams?.openid).toBe('oXxx123')
    expect(result.uid).toBeUndefined()
  })

  it('完整快照与请求头都带过去', () => {
    const result = buildAdapterConfig(configWith(appProfile), false)
    expect(result.requestHeaders?.['User-Agent']).toBe('okhttp/3.14.9')
    expect(result.proxyEnabled).toBe('1')
  })
})

describe('buildAdapterConfig - 需要登录态（needAuth=true）', () => {
  it('App 账号：顶层 uid/token 供后端校验，requestParams 完整', () => {
    const result = buildAdapterConfig(configWith(appProfile), true)
    expect(result.uid).toBe('20536811')
    expect(result.token).toBe('53b3cb4ddc8cd0171cb9b6d6d1cb41ce')
    expect(result.requestParams?.uid).toBe('20536811')
    expect(result.requestParams?.token).toBe('53b3cb4ddc8cd0171cb9b6d6d1cb41ce')
    expect(result.channel).toBe('app')
  })

  it('wx 账号也能带登录态', () => {
    const result = buildAdapterConfig(configWith(wxProfile), true)
    expect(result.uid).toBe('20478621')
    expect(result.token).toBe('a878dabfb1eaf3d4acf19fa3f81f9cef')
    expect(result.openid).toBe('oXxx123')
  })

  it('不修改原 profile（无副作用）', () => {
    const config = configWith(appProfile)
    buildAdapterConfig(config, false)
    expect(config.activeAccountProfile?.params.uid).toBe('20536811')
  })
})

describe('辅助函数', () => {
  it('stripAuthParams 大小写不敏感地剔除 uid/token', () => {
    expect(stripAuthParams({ uid: '1', TOKEN: '2', UDID: 'x', model: 'm' })).toEqual({
      UDID: 'x', model: 'm',
    })
  })

  it('hasLoginCredential 需要 uid 和 token 同时存在', () => {
    expect(hasLoginCredential(configWith(appProfile))).toBe(true)
    expect(hasLoginCredential({ activeAccountProfile: { channel: 'app', params: { uid: '1' }, headers: {} } })).toBe(false)
    expect(hasLoginCredential(null)).toBe(false)
  })

  it('summarizeProfile 给出摘要', () => {
    expect(summarizeProfile(appProfile)).toEqual({
      channel: 'app', paramCount: 9, uid: '20536811', model: 'MI 8 UD',
      platType: 'Android', path: '/goods/get_goods_info_v2',
    })
    expect(summarizeProfile(null).channel).toBeNull()
  })
})
