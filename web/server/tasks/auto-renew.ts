/**
 * 自动续期任务的创建入口
 *
 * 两处复用同一套逻辑：
 *   - 专用路由 POST /api/order-renew/create（用户手动选账号）
 *   - stock / price 自动下单成功后的钩子（自动建 12 小时任务）
 *
 * 关键约束：
 *   - accountId 归属校验在服务端做，adapterConfig 绝不信任前端回传
 *   - 同账号已有 running 任务：手动创建返回 DUPLICATE，自动创建静默跳过（用户确认「不改动、不延长」）
 *   - 改造前的老监控任务 payload 里没有 accountId：钩子直接跳过，不做 uid 反查（用户确认「仅新任务生效」）
 *   - pending Set 挡住同一 tick 内两次下单同时触发；全程 try/catch，绝不打断监控循环
 */

import { getAccount } from '../utils/accountStore'
import { resolveAdapterConfigForAccount } from '../utils/adapterConfig'
import { ErrorCode } from '../utils/response'
import { createTaskFromDefinition } from './registry'
import {
  AUTO_RENEW_DURATION_SECONDS,
  findRunningRenewForAccount,
  renewDefinition,
  renewTasks,
  type RenewTaskRecord,
  type RenewTaskSource,
} from './renew'
import { TaskApiError } from './types'

export interface CreateRenewTaskInput {
  username: string
  email: string
  accountId: string
  duration?: number
  source?: RenewTaskSource
  sourceTaskId?: string
}

/** 同 tick 并发去重：key = 用户 + 账号 */
const pending = new Set<string>()

/**
 * 创建续期任务（手动 / 自动共用）
 *
 * @throws TaskApiError 校验不通过或已有 running 任务
 */
export const createRenewTaskForAccount = async (
  input: CreateRenewTaskInput
): Promise<RenewTaskRecord> => {
  const key = `${input.username}:${input.accountId}`

  const account = getAccount(input.accountId)
  if (!account || account.userId !== input.username) {
    throw new TaskApiError(ErrorCode.INVALID_PARAMS, '账号不存在或无权操作')
  }
  const resolved = resolveAdapterConfigForAccount(account, true)
  if (!resolved.hasCredential) {
    throw new TaskApiError(
      ErrorCode.AUTH_REQUIRED,
      '该账号没有登录态（uid/token 不完整），无法续期订单'
    )
  }

  if (findRunningRenewForAccount(input.username, input.accountId)) {
    throw new TaskApiError(ErrorCode.DUPLICATE, '该账号已有订单续期任务在运行')
  }
  if (pending.has(key)) {
    throw new TaskApiError(ErrorCode.DUPLICATE, '该账号的续期任务正在创建中')
  }

  pending.add(key)
  try {
    return await createTaskFromDefinition(renewDefinition, renewTasks, {
      body: {
        accountId: input.accountId,
        source: input.source ?? 'manual',
        ...(input.sourceTaskId ? { sourceTaskId: input.sourceTaskId } : {}),
        config: {
          duration: input.duration ?? AUTO_RENEW_DURATION_SECONDS,
          adapterConfig: resolved.config,
        },
      },
      user: { username: input.username, email: input.email },
    })
  } finally {
    pending.delete(key)
  }
}

/** 自动下单钩子可传入的最小上下文（必须是内存里的原 record，守卫要写回） */
export interface AutoRenewSourceRecord {
  /** 老任务没有此字段 → 跳过 */
  accountId?: string
  /** 一次性守卫：下单成功后只触发一次 */
  autoRenewTriggered?: boolean
  userId: string
  userEmail: string
  id: string
}

/**
 * 自动下单成功后调用：若账号无续期任务，静默建一个 12 小时任务。
 *
 * 成功 / 已有 running / 老任务跳过 都会置位守卫，避免每轮重复尝试。
 * 任何异常只记日志，绝不向上抛（否则会打断监控循环）。
 *
 * @param record 监控任务的内存 record（直接改写守卫字段）
 * @param touch  落盘回调，通常是 `() => xxxTasks.touch(record)`
 */
export const ensureAutoRenewFromOrder = async (
  record: AutoRenewSourceRecord,
  touch: () => void
): Promise<void> => {
  if (record.autoRenewTriggered) return
  // 改造前的老任务没有 accountId：按用户决策跳过
  if (!record.accountId) {
    record.autoRenewTriggered = true
    touch()
    return
  }

  try {
    if (findRunningRenewForAccount(record.userId, record.accountId)) {
      // 已有 running：跳过、不改动、不延长
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
    // 不置位守卫：下一轮可重试；但也不能让异常打断监控
    console.error(`[自动续期] 创建失败（来源 ${record.id}）:`, error)
  }
}
