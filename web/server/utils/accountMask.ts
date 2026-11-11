/**
 * 账号记录的对外视图（脱敏）
 *
 * 列表接口不返回密码和 token 明文，只给掩码 + 是否已填；
 * 需要明文时单独调 /api/accounts/reveal，降低随手截图 / 列表接口泄露的风险。
 */

import type { AccountRecord } from './accountStore'

/** 返回给前端的账号结构 */
export interface AccountView {
  id: string
  phone: string
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

/** 记录转视图 */
export const toAccountView = (record: AccountRecord): AccountView => ({
  id: record.id,
  phone: record.phone,
  uin: record.uin,
  remark: record.remark,
  hasPassword: Boolean(record.password),
  hasToken: Boolean(record.token),
  passwordMask: maskPassword(record.password),
  tokenMask: maskToken(record.token),
  isVerified: record.isVerified,
  isNewUser: record.isNewUser,
  hasOrdered: record.hasOrdered,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
})
