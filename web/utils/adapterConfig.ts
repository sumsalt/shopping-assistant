/**
 * 统一构造「一手适配器配置」的纯函数（无 Nuxt / DOM 依赖，便于单测）
 *
 * 背景：设备 / 登录信息已从「系统配置」迁到「账号管理」。
 * 一个账号保存的是一次抓包的完整请求快照（params + headers + channel）。
 * 发请求时以这份快照为基础；匿名检测（库存/Tab 监控、库存查询）必须剔除 uid/token，
 * 走匿名桶，与改造前的行为一致；需要登录态（下单、价格、SKU 详情、收藏夹）则完整带上。
 *
 * 未选择账号时回退到旧的默认 wx 匿名参数，保证线上已有行为不回退。
 */

import type { UserConfig, RequestProfile } from '../types'

/** 传给后端 / core 的适配器配置 */
export interface AdapterConfigPayload {
  // ---- 顶层标量：供后端校验（uid/token）与适配器无快照时回退 ----
  uid?: string
  token?: string
  openid: string
  model: string
  version: string
  version_name: string
  wx_version_name: string
  plat_type: string
  // ---- 完整抓包快照：适配器优先用这一套 ----
  requestParams?: Record<string, string>
  requestHeaders?: Record<string, string>
  channel?: 'wx' | 'app'
  // ---- 代理（全局设置） ----
  proxyUrl?: string
  proxyEnabled?: '1' | '0'
}

/** 无账号时的默认匿名参数（与旧 config store 默认值一致） */
export const DEFAULT_WX_ADAPTER_CONFIG = {
  openid: '',
  model: 'iPhone 14 Pro<iPhone15,2>',
  version: '8.0.60',
  version_name: '4.9.0',
  wx_version_name: '3.5.34',
  plat_type: 'wx',
} as const

/** 从 params 里取字段（大小写不敏感） */
const pick = (params: Record<string, string>, key: string): string => {
  for (const [name, value] of Object.entries(params)) {
    if (name.toLowerCase() === key) {
      return value
    }
  }
  return ''
}

/** 剔除登录态字段（匿名检测用） */
export const stripAuthParams = (params: Record<string, string>): Record<string, string> => {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    const lower = key.toLowerCase()
    if (lower !== 'uid' && lower !== 'token') {
      result[key] = value
    }
  }
  return result
}

/**
 * 构造适配器配置
 *
 * @param config 前端配置（含当前账号的完整请求快照）
 * @param needAuth 是否需要登录态。false 时剔除 uid/token（匿名桶）
 */
export const buildAdapterConfig = (
  config: UserConfig | null | undefined,
  needAuth: boolean
): AdapterConfigPayload => {
  const proxy = {
    proxyUrl: config?.proxyUrl,
    proxyEnabled: config?.proxyEnabled || '0',
  }

  const profile = config?.activeAccountProfile
  // 没有抓包快照：回退旧的默认 wx 匿名参数，不带任何登录态
  if (!profile || !profile.params || Object.keys(profile.params).length === 0) {
    return { ...DEFAULT_WX_ADAPTER_CONFIG, ...proxy }
  }

  const rawParams = profile.params
  // 匿名：requestParams 与顶层字段都不含 uid/token
  const requestParams = needAuth ? { ...rawParams } : stripAuthParams(rawParams)

  const result: AdapterConfigPayload = {
    openid: pick(rawParams, 'openid'),
    model: pick(rawParams, 'model'),
    version: pick(rawParams, 'version'),
    version_name: pick(rawParams, 'version_name'),
    wx_version_name: pick(rawParams, 'wx_version_name'),
    plat_type: pick(rawParams, 'plat_type') || (profile.channel === 'app' ? 'Android' : 'wx'),
    requestParams,
    requestHeaders: { ...profile.headers },
    channel: profile.channel,
    ...proxy,
  }

  if (needAuth) {
    result.uid = pick(rawParams, 'uid')
    result.token = pick(rawParams, 'token')
  }

  return result
}

/** 账号是否可用于需要登录态的操作（下单 / 价格监控） */
export const hasLoginCredential = (config: UserConfig | null | undefined): boolean => {
  const params = config?.activeAccountProfile?.params
  if (!params) {
    return false
  }
  return Boolean(pick(params, 'uid') && pick(params, 'token'))
}

/** 从抓包快照生成账号摘要（用于系统配置界面展示） */
export const summarizeProfile = (profile: RequestProfile | null | undefined) => ({
  channel: profile?.channel ?? null,
  paramCount: profile ? Object.keys(profile.params).length : 0,
  uid: profile ? pick(profile.params, 'uid') : '',
  model: profile ? pick(profile.params, 'model') : '',
  platType: profile ? pick(profile.params, 'plat_type') : '',
  path: profile?.path || '',
})

/**
 * 生成 GET 接口的查询串（SKU 详情 / 收藏夹）
 *
 * 这两个接口是 GET，没法放 body，因此把完整的 adapterConfig 序列化进单个
 * query 参数；服务端的 readAdapterConfigFromQuery 会解析并兼容旧散字段。
 * 与改造前一样，登录态信息会出现在 URL 里（同安全边界），但不再散落成十几个参数。
 */
export const adapterConfigToQuery = (
  adapterConfig: AdapterConfigPayload,
  extra: Record<string, string> = {}
): string => {
  const params = new URLSearchParams(extra)
  params.set('adapterConfig', JSON.stringify(adapterConfig))
  return params.toString()
}
