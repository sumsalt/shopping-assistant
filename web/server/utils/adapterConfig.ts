/**
 * 请求里的 adapterConfig 归一化（服务端共享）
 *
 * 背景：设备 / 登录参数已迁到「账号管理」，前端统一用
 * web/utils/adapterConfig.ts#buildAdapterConfig 生成完整的 AdapterConfigPayload：
 *   - 顶层标量（uid/token/openid/...）：供需要登录态的接口校验
 *   - requestParams / requestHeaders / channel：抓包快照，适配器原样回放
 *
 * 传输方式：
 *   - POST 接口：body.adapterConfig（对象）
 *   - GET 接口：?adapterConfig=<JSON 字符串>（Nuxt getQuery 会自动 decode）
 *
 * 兼容旧形态：直接访问旧 URL / 老前端传的散字段（body.config 或 query 上的
 * uid/token/openid/model/...），避免改造后老链接立刻失效。
 *
 * 这里只做类型清洗与长度限制，不猜参数、不补默认值：没有账号时适配器自己
 * 有一套与改造前一致的默认 wx 匿名参数。
 */

import type { AdapterConfig } from '@core'

/** 允许透传的字符串字段 */
const STRING_FIELDS = [
  'uid', 'token', 'openid', 'model', 'version', 'version_name',
  'wx_version_name', 'plat_type', 'proxyUrl', 'sign',
] as const

/** 单个值 / 整个 map 的上限，防止把超大对象塞进请求 */
const MAX_VALUE_LEN = 2048
const MAX_MAP_KEYS = 120

/** 清洗 string map：只留合法键值，超长项丢弃 */
const cleanStringMap = (raw: unknown): Record<string, string> | undefined => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined
  }
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(result).length >= MAX_MAP_KEYS) {
      break
    }
    if (typeof value === 'string' && key.length <= 64 && value.length <= MAX_VALUE_LEN) {
      result[key] = value
    }
  }
  return result
}

/**
 * 归一化 adapterConfig
 *
 * @param raw 对象或 JSON 字符串；非法输入返回空对象（适配器走默认匿名参数）
 */
export const normalizeAdapterConfig = (raw: unknown): AdapterConfig => {
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return {}
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {}
  }

  const obj = parsed as Record<string, unknown>
  const config: AdapterConfig = {}

  for (const field of STRING_FIELDS) {
    const value = obj[field]
    if (typeof value === 'string' && value.length <= MAX_VALUE_LEN) {
      ;(config as unknown as Record<string, unknown>)[field] = value
    }
  }

  if (obj.channel === 'wx' || obj.channel === 'app') {
    config.channel = obj.channel
  }
  if (obj.proxyEnabled === '1' || obj.proxyEnabled === '0') {
    config.proxyEnabled = obj.proxyEnabled
  }
  if (typeof obj.timestamp === 'number' && Number.isFinite(obj.timestamp)) {
    config.timestamp = obj.timestamp
  }

  const requestParams = cleanStringMap(obj.requestParams)
  if (requestParams && Object.keys(requestParams).length > 0) {
    config.requestParams = requestParams
  }
  const requestHeaders = cleanStringMap(obj.requestHeaders)
  if (requestHeaders && Object.keys(requestHeaders).length > 0) {
    config.requestHeaders = requestHeaders
  }

  return config
}

/**
 * 兼容旧散字段形态（body.config 或 query 上直接摊平的 uid/token/openid/...）
 */
export const legacyAdapterConfig = (raw: Record<string, unknown>): AdapterConfig => {
  const pick = (key: string): string =>
    typeof raw[key] === 'string' ? (raw[key] as string) : ''
  const config: AdapterConfig = {
    openid: pick('openid'),
    model: pick('model'),
    version: pick('version'),
    version_name: pick('version_name'),
    wx_version_name: pick('wx_version_name'),
    plat_type: pick('plat_type'),
    proxyEnabled: pick('proxyEnabled') === '1' ? '1' : '0',
  }
  const uid = pick('uid')
  const token = pick('token')
  const proxyUrl = pick('proxyUrl')
  if (uid) {
    config.uid = uid
  }
  if (token) {
    config.token = token
  }
  if (proxyUrl) {
    config.proxyUrl = proxyUrl
  }
  return config
}

/**
 * 从 POST body 里读 adapterConfig：优先新字段，回退旧形态
 */
export const readAdapterConfigFromBody = (body: unknown): AdapterConfig => {
  const obj = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  if (obj.adapterConfig !== undefined) {
    return normalizeAdapterConfig(obj.adapterConfig)
  }
  const legacy = obj.config && typeof obj.config === 'object' && !Array.isArray(obj.config)
    ? (obj.config as Record<string, unknown>)
    : obj
  return legacyAdapterConfig(legacy)
}

/**
 * 从 GET query 里读 adapterConfig：优先新字段，回退旧形态
 */
export const readAdapterConfigFromQuery = (query: Record<string, unknown>): AdapterConfig =>
  query.adapterConfig !== undefined
    ? normalizeAdapterConfig(query.adapterConfig)
    : legacyAdapterConfig(query)

/** 账号里保存的请求快照（与 accountStore.AccountRequestProfile 结构一致） */
export interface StoredRequestProfile {
  channel?: 'wx' | 'app'
  params?: Record<string, string>
  headers?: Record<string, string>
}

/** 大小写不敏感地取快照参数 */
const pickParam = (params: Record<string, string>, key: string): string => {
  for (const [name, value] of Object.entries(params)) {
    if (name.toLowerCase() === key) return value
  }
  return ''
}

/**
 * 把账号里落盘的请求快照转成 AdapterConfig
 *
 * 用于服务端自己发起的一手请求（登录态自检、下单预检等）：
 * 这类请求没有前端传来的 adapterConfig，只能从库里读账号快照。
 */
export const profileToAdapterConfig = (
  profile: StoredRequestProfile | null | undefined,
  extra: Record<string, unknown> = {}
): AdapterConfig => {
  if (!profile?.params || Object.keys(profile.params).length === 0) {
    return normalizeAdapterConfig(extra)
  }

  return normalizeAdapterConfig({
    ...extra,
    channel: profile.channel,
    requestParams: profile.params,
    requestHeaders: profile.headers,
    // 顶层 uid/token 供适配器做登录态判断（快照里没有时为空）
    uid: pickParam(profile.params, 'uid'),
    token: pickParam(profile.params, 'token'),
  })
}
