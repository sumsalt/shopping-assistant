/**
 * 账号表单校验与规范化
 */

import type { AccountInput } from './accountStore'

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

/** 取字符串字段并 trim */
const readField = (raw: Record<string, unknown>, key: string): string =>
  typeof raw[key] === 'string' ? (raw[key] as string).trim() : ''

/**
 * 校验并整理创建 / 更新入参
 *
 * 手机号为必填项（账号主标识），密码 / uin / token / 备注都可以留空。
 * 更新时密码和 token 传空表示保持原值，由 store 层处理。
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

  return { ok: true, value: { phone, password, uin, token, remark } }
}
