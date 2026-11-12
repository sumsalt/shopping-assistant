/**
 * 待支付订单自动续期任务
 *
 * 与 stock/price/tab 同构，实现 TaskDefinition 一个接口即可复用 5 个通用路由、
 * 注册表与恢复流程。差异只在：任务按「账号」维度唯一、每分钟扫一次待支付订单、
 * 由 src/order-renew-monitor.ts 的核心循环驱动。
 *
 * 账号口径：record.accountId 是 accounts 表主键，config.adapterConfig 是创建时
 * 固化下来的登录态快照。两者都在创建时确定，之后切换「当前账号」不影响已建任务。
 */

import {
  createCancellableOrderRenewMonitor,
  getRenewAdapter,
  type AdapterConfig,
  type OrderRenewalRecord,
} from '@core'
import { ErrorCode } from '../utils/response'
import { getAccount } from '../utils/accountStore'
import { persistTask, type StoredTaskBase } from '../utils/taskStore'
import { TaskRegistry } from './registry'
import { TaskApiError, type StartOverrides, type TaskDefinition } from './types'

/** 自动创建续期任务的固定时长：12 小时 */
export const AUTO_RENEW_DURATION_SECONDS = 12 * 60 * 60

/** 手动创建的默认时长：12 小时（与自动创建一致） */
export const DEFAULT_RENEW_DURATION_SECONDS = 12 * 60 * 60

export type RenewTaskSource = 'manual' | 'auto'

export interface RenewTaskConfig {
  /** 任务持续时长（秒）；restore-tasks 的 getRemainingSeconds 读它 */
  duration: number
  /** 创建时固化的登录态快照 */
  adapterConfig: AdapterConfig
}

export interface RenewTaskRecord extends StoredTaskBase {
  /** accounts 表主键：任务的唯一维度 */
  accountId: string
  /** 账号摘要（列表展示用，创建时固化，避免每轮查库） */
  accountPhone: string
  accountTitle: string
  /** 手动创建 / 自动下单后自动创建 */
  source: RenewTaskSource
  /** 自动创建时记录来源监控任务 ID，便于排查 */
  sourceTaskId?: string
  config: RenewTaskConfig
  checkCount: number
  scannedCount: number
  renewedCount: number
  skippedCount: number
  finishedCount: number
  lastError?: string
  lastScanAt?: number
  recentRenewals: OrderRenewalRecord[]
  controller?: AbortController
}

export const renewTasks = new TaskRegistry<RenewTaskRecord>('renew')

const MAX_RECENT_RENEWALS = 50

/** 查重：同一用户 + 同一账号，是否已有运行中的续期任务（内存 + DB） */
export const findRunningRenewForAccount = (
  userId: string,
  accountId: string
): RenewTaskRecord | undefined =>
  renewTasks
    .listFor(userId)
    .find(task => task.accountId === accountId && task.status === 'running')

const accountSummary = (accountId: string) => {
  const account = getAccount(accountId)
  return {
    accountPhone: account?.phone ?? '',
    accountTitle: account?.title ?? '',
  }
}

/**
 * 列表 / 详情共用的视图投影
 *
 * 只依赖 record，不依赖 ListContext：抽成独立纯函数后，statusView 不必
 * 反调 listView（后者按契约必须带 ctx），也不会把凭证带进响应。
 */
const toRenewView = (task: RenewTaskRecord): Record<string, unknown> => ({
  id: task.id,
  account: {
    id: task.accountId,
    phone: task.accountPhone,
    title: task.accountTitle,
  },
  source: task.source,
  sourceTaskId: task.sourceTaskId ?? null,
  status: task.status,
  duration: task.config.duration,
  createdAt: task.createdAt,
  checkCount: task.checkCount,
  scannedCount: task.scannedCount,
  renewedCount: task.renewedCount,
  skippedCount: task.skippedCount,
  finishedCount: task.finishedCount,
  lastError: task.lastError ?? null,
  lastScanAt: task.lastScanAt ?? null,
  recentRenewals: task.recentRenewals,
})

export const renewDefinition: TaskDefinition<RenewTaskRecord> = {
  kind: 'renew',
  label: '订单续期',
  // 续期必须带登录态；专用 create 路由会自行解析账号，这里仅作语义声明
  needsAuth: () => true,
  // 同账号只能有一个任务：重新发起前先删原任务，避免两个循环同时续期
  removeOriginalOnRestart: true,

  create({ body }) {
    const accountId = String(body?.accountId ?? '').trim()
    if (!accountId) {
      throw new TaskApiError(ErrorCode.INVALID_PARAMS, '请选择要续期的账号')
    }

    const duration = Number(body?.config?.duration ?? DEFAULT_RENEW_DURATION_SECONDS)
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new TaskApiError(ErrorCode.INVALID_PARAMS, '任务持续时长必须大于 0')
    }

    const adapterConfig: AdapterConfig = body?.config?.adapterConfig || {}

    return {
      accountId,
      ...accountSummary(accountId),
      source: body?.source === 'auto' ? 'auto' : 'manual',
      ...(body?.sourceTaskId ? { sourceTaskId: String(body.sourceTaskId) } : {}),
      config: { duration, adapterConfig },
      checkCount: 0,
      scannedCount: 0,
      renewedCount: 0,
      skippedCount: 0,
      finishedCount: 0,
      recentRenewals: [],
    }
  },

  start(record, overrides: StartOverrides = {}) {
    const adapter = getRenewAdapter('yishou', record.config.adapterConfig)
    if (!adapter) {
      throw new TaskApiError(ErrorCode.PLATFORM_NOT_SUPPORTED, '当前平台不支持订单续期')
    }

    const duration =
      overrides.duration !== undefined ? overrides.duration : record.config.duration

    renewTasks.launch(record, () =>
      createCancellableOrderRenewMonitor(
        adapter,
        { duration, adapterConfig: record.config.adapterConfig },
        result => {
          record.checkCount = result.checkCount
          record.scannedCount = result.scannedCount
          record.renewedCount = result.renewedCount
          record.skippedCount = result.skippedCount
          record.finishedCount = result.finishedCount
          record.lastError = result.error
          record.lastScanAt = result.lastScanAt
          record.recentRenewals = result.recentRenewals.slice(0, MAX_RECENT_RENEWALS)
          renewTasks.touch(record)
        }
      )
    )
  },

  restart(original) {
    if (original.status === 'running') {
      throw new TaskApiError(
        ErrorCode.INVALID_PARAMS,
        '该任务正在运行，请先删除后再重新发起'
      )
    }
    return {
      accountId: original.accountId,
      accountPhone: original.accountPhone,
      accountTitle: original.accountTitle,
      source: 'manual' as RenewTaskSource,
      config: { ...original.config, adapterConfig: { ...original.config.adapterConfig } },
      checkCount: 0,
      scannedCount: 0,
      renewedCount: 0,
      skippedCount: 0,
      finishedCount: 0,
      recentRenewals: [],
    }
  },

  listView(task) {
    return toRenewView(task)
  },

  statusView(task) {
    return {
      ...toRenewView(task),
      // 状态视图也剔除凭证：config 只暴露时长
      config: { duration: task.config.duration },
    }
  },

  createdView(record, action) {
    return {
      taskId: record.id,
      status: 'started',
      message: action === 'restarted' ? '订单续期任务已重新发起' : '订单续期任务已启动',
      duration: record.config.duration,
      accountId: record.accountId,
    }
  },

  restore(task, remainingSeconds) {
    if (Number.isFinite(remainingSeconds) && remainingSeconds <= 0) {
      task.status = 'completed'
      persistTask('renew', task)
      return false
    }

    // 脏数据防护：同一账号已有别的运行任务时不重复拉起
    const existing = renewTasks
      .all()
      .find(t => t.id !== task.id && t.userId === task.userId &&
        t.accountId === task.accountId && t.status === 'running')
    if (existing) {
      task.status = 'stopped'
      persistTask('renew', task)
      return false
    }

    task.status = 'running'
    task.controller = undefined
    task.recentRenewals = Array.isArray(task.recentRenewals) ? task.recentRenewals : []

    renewTasks.add(task)
    renewDefinition.start(task, {
      resume: true,
      duration: Number.isFinite(remainingSeconds) ? Math.floor(remainingSeconds) : undefined,
    })
    return true
  },
}
