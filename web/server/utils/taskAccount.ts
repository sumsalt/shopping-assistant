/**
 * 任务绑定账号的展示信息
 *
 * 任务在创建时把当时的激活账号凭证固化进 `secret`，之后切换账号不会影响运行中的任务。
 * 这里只负责把 `accountId` 翻译成可展示的标签（纯读，不改变任何运行逻辑）。
 */

import type { AdapterConfig } from '@core'
import type { TaskAccountBrief } from '@core/contract'
import { getAccount, getActiveAccount, type AccountRecord } from './accountStore'
import { resolveAdapterConfigForUser } from './adapterConfig'

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

/** 解析结果：与 TaskKindDefinition.resolveAccount 同形，便于创建与重发共用 */
export interface CurrentTaskAccount {
  accountId: string
  secret?: AdapterConfig
  hasCredential: boolean
}

/**
 * 把「当前激活账号」解析为任务账号（创建 / 重发共用的唯一入口）
 *
 * - 收藏夹通道：只快照下单账号 ID，不落 secret（凭证运行时按 ID 现取）
 * - 普通通道 / Tab：快照账号 ID + 请求凭证
 *
 * 重发时调用它即可让任务跟随用户当前选中的账号；订单续期不调用（账号是续期对象）。
 */
export const resolveCurrentTaskAccount = (
  username: string,
  channel?: 'normal' | 'collection'
): CurrentTaskAccount => {
  const base = resolveAdapterConfigForUser(username)
  if (channel === 'collection') {
    return { accountId: base.account?.id ?? '', hasCredential: base.hasCredential }
  }
  return {
    accountId: base.account?.id ?? '',
    secret: base.config,
    hasCredential: base.hasCredential,
  }
}
