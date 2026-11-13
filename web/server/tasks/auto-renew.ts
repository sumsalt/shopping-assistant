/**
 * 自动续期任务的创建入口
 *
 * 两处复用：
 *   - POST /api/order-renew/create（用户显式选账号）
 *   - stock / price 自动下单成功后的钩子（自动建 12 小时任务）
 *
 * 账号归属与凭证解析统一由 renewDefinition.resolveAccount / TaskService 处理，
 * 这里只做「同 tick 去重」和「不打断监控循环」。
 */

import { ErrorCode } from '../utils/response'
import { renewService } from './kinds/renew-service'
import { AUTO_RENEW_DURATION_SECONDS } from './kinds/renew'
import type { RenewTaskState } from './kinds/state'
import { TaskApiError } from './engine/types'
import type { TaskRecordBase } from './engine/types'

export interface CreateRenewTaskInput {
  username: string
  email: string
  accountId: string
  duration?: number
  source?: 'manual' | 'auto'
  sourceTaskId?: string
}

/** 同 tick 并发去重：key = 用户 + 账号 */
const pending = new Set<string>()

/** 查重：同一用户 + 同一账号是否已有运行中的续期任务 */
export const findRunningRenewForAccount = (
  userId: string,
  accountId: string
): TaskRecordBase<RenewTaskState> | undefined =>
  renewService.registry
    .listFor(userId)
    .find(
      task =>
        task.status === 'running' &&
        (task.state as RenewTaskState).account?.id === accountId
    )

/** 创建续期任务（手动 / 自动共用） */
export const createRenewTaskForAccount = async (
  input: CreateRenewTaskInput
): Promise<TaskRecordBase<RenewTaskState>> => {
  const key = `${input.username}:${input.accountId}`

  if (findRunningRenewForAccount(input.username, input.accountId)) {
    throw new TaskApiError(ErrorCode.DUPLICATE, '该账号已有订单续期任务在运行')
  }
  if (pending.has(key)) {
    throw new TaskApiError(ErrorCode.DUPLICATE, '该账号的续期任务正在创建中')
  }

  pending.add(key)
  try {
    return await renewService.create({
      body: {
        accountId: input.accountId,
        source: input.source ?? 'manual',
        ...(input.sourceTaskId ? { sourceTaskId: input.sourceTaskId } : {}),
        config: { duration: input.duration ?? AUTO_RENEW_DURATION_SECONDS },
      },
      user: { username: input.username, email: input.email },
    })
  } finally {
    pending.delete(key)
  }
}

/** 自动下单钩子可传入的最小上下文（必须是内存里的原 record） */
export interface AutoRenewSourceRecord {
  accountId?: string
  autoRenewTriggered?: boolean
  userId: string
  userEmail: string
  id: string
}

/**
 * 自动下单成功后调用：若账号无续期任务，静默建一个 12 小时任务。
 * 成功 / 已有 running / 老任务跳过 都会置位守卫；任何异常只记日志。
 */
export const ensureAutoRenewFromOrder = async (
  record: AutoRenewSourceRecord,
  touch: () => void
): Promise<void> => {
  if (record.autoRenewTriggered) return
  if (!record.accountId) {
    record.autoRenewTriggered = true
    touch()
    return
  }

  try {
    if (findRunningRenewForAccount(record.userId, record.accountId)) {
      record.autoRenewTriggered = true
      touch()
      return
    }

    await createRenewTaskForAccount({
      username: record.userId,
      email: record.userEmail,
      accountId: record.accountId,
      duration: AUTO_RENEW_DURATION_SECONDS,
      source: 'auto',
      sourceTaskId: record.id,
    })

    record.autoRenewTriggered = true
    touch()
    console.log(`[自动续期] 已为账号 ${record.accountId} 创建 12 小时任务（来源 ${record.id}）`)
  } catch (error) {
    console.error(`[自动续期] 创建失败（来源 ${record.id}）:`, error)
  }
}
