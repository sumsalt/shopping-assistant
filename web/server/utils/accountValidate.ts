/**
 * 账号表单校验与规范化
 */

import type { AccountInput, AccountRequestProfile } from './accountStore'

/** 校验结果 */
export type ParseAccountResult =
  | { ok: true; value: AccountInput }
  | { ok: false; error: string }

/** 各字段长度上限 */
const PHONE_MAX = 40
const PASSWORD_MAX = 128
const UIN_MAX = 64
const TOKEN_MAX = 256
const REMARK_MAX = 500
/** 抓包快照上限：防止塞入超大对象 */
const PROFILE_MAX_KEYS = 120
const PROFILE_VALUE_MAX = 2048
const PROFILE_PATH_MAX = 512

/** 清洗字符串 map：只保留 string 值，去掉超长项 */
const cleanStringMap = (raw: unknown): Record<string, string> | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const result: Record<string, string> = {}
  let count = 0
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= PROFILE_MAX_KEYS) {
      break
    }
    if (typeof value === 'string' && key.length <= 64 && value.length <= PROFILE_VALUE_MAX) {
      result[key] = value
      count++
    }
  }
  return result
}

/**
 * 校验抓包请求快照
 *
 * 返回 undefined 表示「未传」（更新时保持原值），null 表示「显式清空」。
 */
const readRequestProfile = (raw: Record<string, unknown>):
  | { ok: true; value: AccountRequestProfile | null | undefined }
  | { ok: false; error: string } => {
  if (!('requestProfile' in raw)) {
    return { ok: true, value: undefined }
  }
  const value = raw.requestProfile
  if (value === null) {
    return { ok: true, value: null }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: '抓包信息格式不正确' }
  }
  const obj = value as Record<string, unknown>
  if (obj.channel !== 'wx' && obj.channel !== 'app') {
    return { ok: false, error: '抓包通道只能是 wx 或 app' }
  }
  const params = cleanStringMap(obj.params)
  const headers = cleanStringMap(obj.headers)
  if (!params || !headers) {
    return { ok: false, error: '抓包参数格式不正确' }
  }
  const path =
    typeof obj.path === 'string' && obj.path.length <= PROFILE_PATH_MAX
      ? obj.path
      : undefined
  return {
    ok: true,
    value: {
      channel: obj.channel,
      params,
      headers,
      ...(path ? { path } : {}),
    },
  }
}

/** 取字符串字段并 trim */
const readField = (raw: Record<string, unknown>, key: string): string =>
  typeof raw[key] === 'string' ? (raw[key] as string).trim() : ''

/**
 * 取可选布尔字段（账号标签）
 *
 * 兼容前端 Switch 的 '1' / '0' 与常规 true / false；
 * 字段缺失或值非法时返回 undefined，让 store 层区分「没传」和「传了 false」。
 */
const readOptionalBoolean = (
  raw: Record<string, unknown>,
  key: string
): boolean | undefined => {
  const value = raw[key]
  if (value === true || value === 1 || value === '1' || value === 'true') {
    return true
  }
  if (value === false || value === 0 || value === '0' || value === 'false') {
    return false
  }
  return undefined
}

/**
 * 校验并整理创建 / 更新入参
 *
 * 手机号为必填项（账号主标识），密码 / uin / token / 备注都可以留空。
 * 更新时密码和 token 传空表示保持原值，由 store 层处理。
 * 三个账号标签为可选布尔，不传表示保持原值（新增时默认 false）。
 */
export const parseAccountInput = (body: unknown): ParseAccountResult => {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: '参数格式不正确' }
  }

  const raw = body as Record<string, unknown>

  const phone = readField(raw, 'phone')
  if (!phone) {
    return { ok: false, error: '请填写手机号' }
  }
  if (phone.length > PHONE_MAX) {
    return { ok: false, error: `手机号不能超过 ${PHONE_MAX} 个字符` }
  }

  // 密码不 trim：前后空格可能就是密码的一部分
  const password = typeof raw.password === 'string' ? raw.password : ''
  if (password.length > PASSWORD_MAX) {
    return { ok: false, error: `密码不能超过 ${PASSWORD_MAX} 个字符` }
  }

  const uin = readField(raw, 'uin')
  if (uin.length > UIN_MAX) {
    return { ok: false, error: `uin 不能超过 ${UIN_MAX} 个字符` }
  }

  const token = readField(raw, 'token')
  if (token.length > TOKEN_MAX) {
    return { ok: false, error: `token 不能超过 ${TOKEN_MAX} 个字符` }
  }

  const remark = readField(raw, 'remark')
  if (remark.length > REMARK_MAX) {
    return { ok: false, error: `备注不能超过 ${REMARK_MAX} 个字符` }
  }

  const value: AccountInput = { phone, password, uin, token, remark }
  const isVerified = readOptionalBoolean(raw, 'isVerified')
  const isNewUser = readOptionalBoolean(raw, 'isNewUser')
  const hasOrdered = readOptionalBoolean(raw, 'hasOrdered')
  if (isVerified !== undefined) {
    value.isVerified = isVerified
  }
  if (isNewUser !== undefined) {
    value.isNewUser = isNewUser
  }
  if (hasOrdered !== undefined) {
    value.hasOrdered = hasOrdered
  }

  const profile = readRequestProfile(raw)
  if (!profile.ok) {
    return { ok: false, error: profile.error }
  }
  if (profile.value !== undefined) {
    value.requestProfile = profile.value
  }

  return { ok: true, value }
}
