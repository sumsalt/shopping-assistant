/**
 * 前端类型定义
 */

/** 一手请求通道 */
export type RequestChannel = 'wx' | 'app'

/**
 * 一次抓包的完整请求快照
 *
 * params 是公共参数（含 uid/token/udid/openid 等，不含 t_t/sign 与业务参数）；
 * headers 是关键请求头。发请求时以它们为基础，只覆盖动态 t_t / 签名。
 */
export interface RequestProfile {
  channel: RequestChannel
  params: Record<string, string>
  headers: Record<string, string>
  path?: string
}

/**
 * 当前使用账号（服务端返回的脱敏摘要）
 *
 * 账号快照只存在服务端，前端拿不到 uid/token；
 * 需要「是否能登录」时看 hasCredential。
 */
export interface ActiveAccountSummary {
  id: string
  phone: string
  /** 显示标题；为空时展示手机号 */
  title: string
  uin: string
  channel: RequestChannel | null
  hasCredential: boolean
  hasRequestProfile: boolean
  /** 抓包公共参数个数（仅展示） */
  requestParamCount: number
}

/** 服务端运行设置（代理等，影响服务器出网） */
export interface RuntimeSettings {
  proxyUrl: string
  proxyEnabled: boolean
}

// API 响应基础类型
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}
