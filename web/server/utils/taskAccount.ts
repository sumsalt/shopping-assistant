/**
 * 任务绑定账号的展示信息
 *
 * 任务在创建时把当时的激活账号凭证固化进 `secret`，之后切换账号不会影响运行中的任务。
 * 这里只负责把 `accountId` 翻译成可展示的标签（纯读，不改变任何运行逻辑）。
 */

import type { TaskAccountBrief } from '@core/contract'
import { getAccount, getActiveAccount, type AccountRecord } from './accountStore'

/** 账号展示标签：备注优先，其次手机号尾号，避免整号暴露 */
const labelOf = (account: AccountRecord): string => {
  const title = account.title?.trim()
  if (title) {
    return title
  }

  const phone = account.phone?.trim() ?? ''
  if (phone.length >= 4) {
    return `尾号 ${phone.slice(-4)}`
  }

  return phone || '未命名账号'
}

/**
 * 解析任务绑定的账号
 *
 * @param userId 任务所属的登录用户（用于校验归属与判断是否为当前账号）
 * @param accountId 任务记录里的账号 ID；为空表示创建时未选账号
 */
export const describeTaskAccount = (
  userId: string,
  accountId?: string
): TaskAccountBrief | undefined => {
  if (!accountId) {
    return undefined
  }

  const account = getAccount(accountId)
  // 账号被删除或不属于该用户：如实告知，提示用户重建任务
  if (!account || account.userId !== userId) {
    return { id: accountId, label: '账号已删除', active: false, missing: true }
  }

  const activeAccount = getActiveAccount(userId)
  return {
    id: accountId,
    label: labelOf(account),
    active: activeAccount?.id === accountId,
  }
}
