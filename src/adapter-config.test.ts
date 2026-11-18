/**
 * 账号快照 → 适配器配置（纯函数）
 *
 * 重点：有凭证就完整回放 uid/token；未选账号回退默认参数；两种通道都能带完整快照。
 * 账号快照存在服务端，这段逻辑在请求进入适配器前统一执行。
 */

import { describe, expect, it } from 'vitest'
import {
  buildAdapterConfigFromProfile,
  hasProfileCredential,
  DEFAULT_WX_ADAPTER_CONFIG,
} from './adapter-config'
import type { StoredRequestProfile } from './adapter-config'

const appProfile: StoredRequestProfile = {
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
  headers: {
    'User-Agent': 'okhttp/3.14.9',
    'Content-Type': 'application/x-www-form-urlencoded',
  },
}

const wxProfile: StoredRequestProfile = {
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

describe('buildAdapterConfigFromProfile - 未配置账号', () => {
  it('回退默认 wx 匿名参数，不带登录态', () => {
    const result = buildAdapterConfigFromProfile(null)
    expect(result).toEqual({ ...DEFAULT_WX_ADAPTER_CONFIG })
    expect(result.uid).toBeUndefined()
    expect(result.token).toBeUndefined()
  })

  it('空 params 的快照视为未配置', () => {
    const result = buildAdapterConfigFromProfile({ channel: 'app', params: {}, headers: {} })
    expect(result).toEqual({ ...DEFAULT_WX_ADAPTER_CONFIG })
  })
})

describe('buildAdapterConfigFromProfile - 已配置账号', () => {
  it('完整保留 uid/token 与快照参数', () => {
    const result = buildAdapterConfigFromProfile(appProfile)
    expect(result.uid).toBe('20536811')
    expect(result.token).toBe('53b3cb4ddc8cd0171cb9b6d6d1cb41ce')
    expect(result.requestParams?.uid).toBe('20536811')
    expect(result.requestParams?.token).toBe('53b3cb4ddc8cd0171cb9b6d6d1cb41ce')
    expect(result.requestHeaders?.['User-Agent']).toBe('okhttp/3.14.9')
    expect(result.model).toBe('MI 8 UD')
  })

  it('wx 账号的版本字段一起带出', () => {
    const result = buildAdapterConfigFromProfile(wxProfile)
    expect(result.wx_version_name).toBe('3.5.34')
    expect(result.version_name).toBe('4.9.0')
    expect(result.plat_type).toBe('wx')
  })
})

describe('hasProfileCredential', () => {
  it('需要 uid 和 token 同时存在', () => {
    expect(hasProfileCredential(appProfile)).toBe(true)
    expect(hasProfileCredential({ channel: 'app', params: { uid: '1' }, headers: {} })).toBe(false)
    expect(hasProfileCredential(null)).toBe(false)
  })
})
