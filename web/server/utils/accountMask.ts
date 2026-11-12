/**
 * 账号记录的对外视图（脱敏）
 *
 * 列表接口不返回密码和 token 明文，只给掩码 + 是否已填；
 * 需要明文时单独调 /api/accounts/reveal，降低随手截图 / 列表接口泄露的风险。
 */

import type { AccountRecord, RequestChannel } from './accountStore'

/** 返回给前端的账号结构 */
export interface AccountView {
  id: string
  phone: string
  /** 显示标题；为空时前端回退显示手机号 */
  title: string
  uin: string
  remark: string
  /** 是否已保存密码 */
  hasPassword: boolean
  /** 是否已保存 token */
  hasToken: boolean
  /** 密码掩码（固定圆点，不暴露长度以外的信息） */
  passwordMask: string
  /** token 掩码（保留首尾各 4 位，便于区分是哪个账号的） */
  tokenMask: string
  /** 标签：是否认证 */
  isVerified: boolean
  /** 标签：是否是新用户 */
  isNewUser: boolean
  /** 标签：是否已下单 */
  hasOrdered: boolean
  /** 是否为当前使用账号 */
  isActive: boolean
  /** 是否具备登录态（uid + token 同时存在），决定能否下单 / 价格监控 */
  hasCredential: boolean
  /** 是否保存了抓包请求快照 */
  hasRequestProfile: boolean
  /** 抓包通道 */
  requestChannel: RequestChannel | null
  /** 抓包里的请求路径（仅展示） */
  requestPath?: string
  /** 公共参数（脱敏副本：token 打码），用于列表折叠展示 */
  requestParams: Record<string, string>
  /** 关键请求头（脱敏副本） */
  requestHeaders: Record<string, string>
  /** 抓包参数个数 */
  requestParamCount: number
  createdAt: string
  updatedAt: string
}

/** 密码掩码 */
export const maskPassword = (value: string): string => (value ? '••••••••' : '')

/** token 掩码：短 token 全部遮掉，长 token 露首尾 */
export const maskToken = (value: string): string => {
  if (!value) {
    return ''
  }
  if (value.length <= 8) {
    return '••••••••'
  }
  return `${value.slice(0, 4)}••••${value.slice(-4)}`
}

/** 请求参数里需要打码的敏感字段（大小写不敏感） */
const PROFILE_SENSITIVE_KEYS = new Set(['token'])

/** 生成脱敏副本：列表接口不返回明文 token */
const maskProfileParams = (params: Record<string, string>): Record<string, string> => {
  const masked: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    masked[key] = PROFILE_SENSITIVE_KEYS.has(key.toLowerCase()) ? maskToken(value) : value
  }
  return masked
}

/** 从抓包参数里取值（大小写不敏感） */
const pickParam = (params: Record<string, string>, key: string): string => {
  const target = key.toLowerCase()
  for (const [name, value] of Object.entries(params)) {
    if (name.toLowerCase() === target) {
      return value
    }
  }
  return ''
}

/**
 * 账号是否可用作登录态
 *
 * 以抓包快照里的 uid/token 为准（发请求时用的就是它们）；
 * 没有快照时退回账号主字段，避免老数据无法判断。
 */
export const hasLoginCredential = (record: AccountRecord): boolean => {
  const params = record.requestProfile?.params
  const uid = params ? pickParam(params, 'uid') : record.uin
  const token = params ? pickParam(params, 'token') : record.token
  return Boolean(uid && token)
}

/** 记录转视图 */
export const toAccountView = (record: AccountRecord): AccountView => {
  const profile = record.requestProfile
  return {
    id: record.id,
    phone: record.phone,
    title: record.title,
    uin: record.uin,
    remark: record.remark,
    hasPassword: Boolean(record.password),
    hasToken: Boolean(record.token),
    passwordMask: maskPassword(record.password),
    tokenMask: maskToken(record.token),
    isVerified: record.isVerified,
    isNewUser: record.isNewUser,
    hasOrdered: record.hasOrdered,
    isActive: record.isActive,
    hasCredential: hasLoginCredential(record),
    hasRequestProfile: Boolean(profile),
    requestChannel: profile?.channel ?? null,
    ...(profile?.path ? { requestPath: profile.path } : {}),
    requestParams: profile ? maskProfileParams(profile.params) : {},
    requestHeaders: profile ? { ...profile.headers } : {},
    requestParamCount: profile ? Object.keys(profile.params).length : 0,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}
