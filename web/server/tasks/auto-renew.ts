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

/** 续期任务保障结果：新建 / 已延长 / 跳过（无账号或异常） */
export type RenewEnsureAction = 'created' | 'extended' | 'skipped'

interface EnsureRenewInput {
  userId: string
  email: string
  accountId?: string | null
  sourceTaskId?: string
}

/** 把运行中的续期任务时长重置为 12 小时（失败只记日志） */
const extendRenewTo12h = (record: TaskRecordBase<RenewTaskState>): RenewEnsureAction => {
  try {
    renewService.extend(record.userId, record.id, AUTO_RENEW_DURATION_SECONDS)
    return 'extended'
  } catch (error) {
    console.error(`[自动续期] 延长任务失败（任务 ${record.id}）:`, error)
    return 'skipped'
  }
}

/**
 * 确保账号有 12 小时续期任务：
 *   - 无运行中任务 → 新建（created）
 *   - 已有运行中任务 → 将其时长重置为 12 小时（extended），不新建
 *   - 无账号 / 异常 → skipped
 *
 * 全程吞掉异常，绝不打断调用方（下单或监控循环）。
 */
const ensureRenewTask12h = async (input: EnsureRenewInput): Promise<RenewEnsureAction> => {
  if (!input.accountId) return 'skipped'

  const running = findRunningRenewForAccount(input.userId, input.accountId)
  if (running) return extendRenewTo12h(running)

  try {
    await createRenewTaskForAccount({
      username: input.userId,
      email: input.email,
      accountId: input.accountId,
      duration: AUTO_RENEW_DURATION_SECONDS,
      source: 'auto',
      ...(input.sourceTaskId ? { sourceTaskId: input.sourceTaskId } : {}),
    })
    return 'created'
  } catch (error) {
    // 并发下刚好被别的请求建出来了：改为延长，不再当异常
    if (error instanceof TaskApiError && error.code === ErrorCode.DUPLICATE) {
      const again = findRunningRenewForAccount(input.userId, input.accountId)
      if (again) return extendRenewTo12h(again)
      return 'skipped'
    }
    console.error(`[自动续期] 创建失败（账号 ${input.accountId}）:`, error)
    return 'skipped'
  }
}

/**
 * 自动下单成功后调用：为该账号补一个 12 小时续期任务。
 * 已有运行中的任务时改为「把时长重置为 12 小时」。
 * 成功 / 延长 都会置位守卫；明确失败时保留守卫为 false 以便下一轮重试。
 */
export const ensureAutoRenewFromOrder = async (
  record: AutoRenewSourceRecord,
  touch: () => void
): Promise<void> => {
  if (record.autoRenewTriggered) return

  const action = await ensureRenewTask12h({
    userId: record.userId,
    email: record.userEmail,
    accountId: record.accountId,
    sourceTaskId: record.id,
  })

  if (action !== 'skipped' || !record.accountId) {
    record.autoRenewTriggered = true
  }
  touch()

  if (action === 'created') {
    console.log(`[自动续期] 已为账号 ${record.accountId} 创建 12 小时任务（来源 ${record.id}）`)
  } else if (action === 'extended') {
    console.log(`[自动续期] 账号 ${record.accountId} 已有任务，已重置为 12 小时（来源 ${record.id}）`)
  }
}

/**
 * 手动下单成功后调用：为该账号补一个 12 小时续期任务。
 *
 * 规则与自动下单保持一致：
 *   - 时长同为 12 小时（AUTO_RENEW_DURATION_SECONDS）
 *   - 已有运行中的续期任务时，把该任务时长重置为 12 小时，不再跳过
 *   - 任何异常只记日志并返回 skipped，绝不影响下单结果
 *
 * 与自动下单的唯一差别是没有来源任务 record，因此不传 sourceTaskId。
 */
export const ensureRenewAfterManualOrder = async (input: {
  userId: string
  email: string
  accountId?: string | null
}): Promise<RenewEnsureAction> => {
  const action = await ensureRenewTask12h({
    userId: input.userId,
    email: input.email,
    accountId: input.accountId,
  })

  if (action === 'created') {
    console.log(`[自动续期] 手动下单后已为账号 ${input.accountId} 创建 12 小时任务`)
  } else if (action === 'extended') {
    console.log(`[自动续期] 手动下单后账号 ${input.accountId} 已有任务，已重置为 12 小时`)
  }
  return action
}
