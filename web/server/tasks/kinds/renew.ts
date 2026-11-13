/**
 * 待支付订单续期任务定义
 *
 * 与其它任务不同：账号由用户显式选择（resolveAccount），而不是当前激活账号。
 * 循环继续复用核心库 createCancellableOrderRenewMonitor。
 */

import {
  createCancellableOrderRenewMonitor,
  getRenewAdapter,
  type OrderRenewalRecord,
} from '@core'
import type { TaskEvent, TaskKind, TaskSummary, Tone } from '@core/contract'
import { ErrorCode } from '../../utils/response'
import { getAccount } from '../../utils/accountStore'
import { resolveAdapterConfigForAccount } from '../../utils/adapterConfig'
import { TaskApiError, capEvents, makeEvent } from '../engine/types'
import type { TaskKindDefinition, TaskRecordBase, TaskRunContext } from '../engine/types'
import type { RenewTaskState } from './state'

const KIND: TaskKind = 'renew'
const VERSION = 2
/**
 * 续期事件保留上限
 *
 * 续期是「同一单反复刷有效期」的高频动作（约每 15 分钟一次），
 * 50 条只够覆盖十几分钟，排查「哪单漏续」时不够用，所以单独放宽到 200 条。
 */
const MAX_EVENTS = 200
const LIST_EVENT_LIMIT = 5

export const AUTO_RENEW_DURATION_SECONDS = 12 * 60 * 60
export const DEFAULT_RENEW_DURATION_SECONDS = 12 * 60 * 60

const num = (value: unknown, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** 续期记录 → 事件（每次回调整体重建，天然去重） */
const renewalEvents = (taskId: string, renewals: OrderRenewalRecord[]): TaskEvent[] =>
  renewals.map((item, index) => {
    const finished = Boolean(item.finishedReason)
    const detail = finished
      ? String(item.finishedReason)
      : [
          item.remainingBefore !== undefined
            ? `剩 ${Math.max(0, Math.floor(item.remainingBefore / 60))} 分钟时续期`
            : '',
          item.expireAfter !== undefined
            ? `截止 ${new Date(item.expireAfter).toLocaleString('zh-CN')}`
            : '',
          item.verified === false ? '有效期未确认后移，待核对' : '',
        ]
          .filter(Boolean)
          .join(' · ')

    return makeEvent(finished ? 'renew.finished' : 'renew.succeeded', {
      id: `evt_renew_${taskId}_${item.orderSn}_${item.renewedAt}`,
      at: item.renewedAt,
      title: finished ? '订单已结束' : '已刷新支付有效期',
      ...(detail ? { detail } : {}),
      tone: (finished ? 'neutral' : item.verified === false ? 'warning' : 'success') as Tone,
      orderSn: item.orderSn,
      ...(item.orderAmount !== undefined ? { amount: item.orderAmount } : {}),
      ...(item.remainingBefore !== undefined ? { remainingBefore: item.remainingBefore } : {}),
      ...(item.expireAfter !== undefined ? { expireAfter: item.expireAfter } : {}),
      ...(item.verified !== undefined ? { verified: item.verified } : {}),
    })
  })

export const renewDefinition: TaskKindDefinition<RenewTaskState> = {
  kind: KIND,
  label: '订单续期',
  version: VERSION,
  // 同账号只能有一个任务：重新发起前先删原任务，避免两个循环同时续期
  removeOriginalOnRestart: true,
  requiresAuth: () => true,

  resolveAccount({ body, user }) {
    const accountId = String(body?.accountId ?? '').trim()
    if (!accountId) {
      throw new TaskApiError(ErrorCode.INVALID_PARAMS, '请选择要续期的账号')
    }

    const account = getAccount(accountId)
    if (!account || account.userId !== user.username) {
      throw new TaskApiError(ErrorCode.INVALID_PARAMS, '账号不存在或无权操作')
    }

    const resolved = resolveAdapterConfigForAccount(account, true)
    if (!resolved.hasCredential) {
      throw new TaskApiError(
        ErrorCode.AUTH_REQUIRED,
        '该账号没有登录态（uid/token 不完整），无法续期订单'
      )
    }

    return { accountId, secret: resolved.config, hasCredential: true }
  },

  create({ body }) {
    const accountId = String(body?.accountId ?? '').trim()
    if (!accountId) {
      throw new TaskApiError(ErrorCode.INVALID_PARAMS, '请选择要续期的账号')
    }

    const duration = num(body?.config?.duration, DEFAULT_RENEW_DURATION_SECONDS)
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new TaskApiError(ErrorCode.INVALID_PARAMS, '任务持续时长必须大于 0')
    }

    const account = getAccount(accountId)

    return {
      state: {
        account: {
          id: accountId,
          phone: account?.phone ?? '',
          title: account?.title ?? '',
        },
        source: body?.source === 'auto' ? 'auto' : 'manual',
        ...(body?.sourceTaskId ? { sourceTaskId: String(body.sourceTaskId) } : {}),
        config: { duration },
        checkCount: 0,
        scannedCount: 0,
        renewedCount: 0,
        skippedCount: 0,
        finishedCount: 0,
        events: [],
      },
    }
  },

  run(record: TaskRecordBase<RenewTaskState>, ctx: TaskRunContext) {
    const state = record.state
    const adapterConfig = record.secret
    const adapter = adapterConfig ? getRenewAdapter('yishou', adapterConfig) : null
    if (!adapter) {
      throw new TaskApiError(ErrorCode.PLATFORM_NOT_SUPPORTED, '当前平台不支持订单续期')
    }

    const duration = ctx.durationSeconds ?? state.config.duration

    // 续跑时保留历史累计：monitor 回调里的 result 只统计本次运行
    const base = {
      checkCount: state.checkCount,
      scannedCount: state.scannedCount,
      renewedCount: state.renewedCount,
      skippedCount: state.skippedCount,
      finishedCount: state.finishedCount,
    }

    return createCancellableOrderRenewMonitor(
      adapter,
      {
        duration,
        ...(adapterConfig ? { adapterConfig } : {}),
        logger: (message, level) => ctx.log(message, level),
      },
      result => {
        state.checkCount = base.checkCount + result.checkCount
        state.scannedCount = base.scannedCount + result.scannedCount
        state.renewedCount = base.renewedCount + result.renewedCount
        state.skippedCount = base.skippedCount + result.skippedCount
        state.finishedCount = base.finishedCount + result.finishedCount
        state.lastError = result.error
        state.lastScanAt = result.lastScanAt
        // 本次运行的续期记录 + 历史事件按 id 去重合并：
        // 重启后 recentRenewals 从空开始，直接覆盖会把历史续期记录抹掉
        const merged = new Map<string, TaskEvent>()
        for (const event of [
          ...renewalEvents(record.id, result.recentRenewals),
          ...state.events,
        ]) {
          if (!merged.has(event.id)) merged.set(event.id, event)
        }
        state.events = capEvents(
          [...merged.values()].sort((a, b) => b.at - a.at),
          MAX_EVENTS
        )
        ctx.save()
      },
      progress => {
        state.checkCount = base.checkCount + progress.checkCount
        ctx.save()
      }
    )
  },

  project(record, options = {}) {
    const state = record.state
    const events = options.full ? state.events : state.events.slice(0, LIST_EVENT_LIMIT)

    return {
      id: record.id,
      kind: KIND,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      target: {
        type: 'account',
        id: state.account.id,
        name: state.account.title || state.account.phone || state.account.id,
        ...(state.account.phone ? { subtitle: state.account.phone } : {}),
      },
      badges: [
        {
          text: state.source === 'auto' ? '自动创建' : '手动创建',
          tone: state.source === 'auto' ? 'info' : 'neutral',
        },
        { text: '每分钟扫描', tone: 'neutral' },
      ],
      stats: [
        { key: 'checks', label: '轮扫描', value: state.checkCount },
        { key: 'scanned', label: '单扫过', value: state.scannedCount },
        {
          key: 'renewed',
          label: '次续期',
          value: state.renewedCount,
          tone: state.renewedCount > 0 ? 'success' : 'neutral',
        },
        {
          key: 'finished',
          label: '单已结束',
          value: state.finishedCount,
          tone: state.finishedCount > 0 ? 'warning' : 'neutral',
        },
        ...(state.lastScanAt
          ? [
              {
                key: 'lastScan',
                label: '最近扫描',
                value: new Date(state.lastScanAt).toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              },
            ]
          : []),
      ],
      config: {
        duration: state.config.duration,
        source: state.source,
      },
      events,
      eventCount: state.events.length,
      order: null,
      notice: null,
      ...(state.lastError ? { lastError: state.lastError } : {}),
    } satisfies TaskSummary
  },

  restart(record) {
    const state = record.state
    return {
      state: {
        account: state.account,
        source: 'manual',
        config: state.config,
        checkCount: 0,
        scannedCount: 0,
        renewedCount: 0,
        skippedCount: 0,
        finishedCount: 0,
        events: [],
      },
    }
  },

  durationOf(record) {
    return record.state.config.duration
  },

  uniqueness(record, all) {
    const duplicate = all.find(
      item =>
        item.userId === record.userId &&
        item.status === 'running' &&
        (item.state as RenewTaskState).account?.id === record.state.account.id
    )
    if (duplicate) {
      throw new TaskApiError(ErrorCode.DUPLICATE, '该账号已有订单续期任务在运行')
    }
  },

  canRestore(record, all) {
    return !all.some(
      item =>
        item.userId === record.userId &&
        item.status === 'running' &&
        (item.state as RenewTaskState).account?.id === record.state.account.id
    )
  },
}
