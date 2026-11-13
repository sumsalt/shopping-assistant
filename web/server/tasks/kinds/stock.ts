/**
 * 到货监控任务定义
 *
 * 循环仍由核心库 createCancellableMonitor 驱动（下一迭代再切到 runMonitorLoop），
 * 这里只做输入校验、状态映射与统一视图投影。
 */

import {
  createCancellableMonitor,
  MAX_AUTO_ORDER_NUM,
  MIN_STOCK_MONITOR_INTERVAL,
  type AutoOrderConfig,
  type MonitorResult,
  type MonitorTask,
  type StockMonitorConfig,
} from '@core'
import type { TaskKind, TaskSummary, Tone } from '@core/contract'
import { ErrorCode } from '../../utils/response'
import { ensureAutoRenewFromOrder } from '../auto-renew'
import { TaskApiError, capEvents, makeEvent } from '../engine/types'
import type { TaskKindDefinition, TaskRecordBase, TaskRunContext } from '../engine/types'
import type { StockTaskState } from './state'

const KIND: TaskKind = 'stock'
const VERSION = 2
const MAX_EVENTS = 50
const LIST_EVENT_LIMIT = 5
const MAX_MONITOR_SKUS = 50
const DEFAULT_DURATION = 3 * 60 * 60

const num = (value: unknown, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const readSkus = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.map(item => String(item ?? '').trim()).filter(Boolean))].slice(
    0,
    MAX_MONITOR_SKUS
  )
}

const readAutoOrder = (
  raw: any,
  secret: { uid?: string; token?: string }
): StockTaskState['config']['autoOrder'] => {
  if (!raw?.enabled) return undefined
  if (!secret.uid || !secret.token) {
    throw new TaskApiError(
      ErrorCode.AUTH_REQUIRED,
      '自动下单需要一手登录态，请先在账号管理中选择带登录态的账号'
    )
  }

  const count = Number(raw.num ?? 1)
  if (!Number.isFinite(count) || count < 1 || count > MAX_AUTO_ORDER_NUM) {
    throw new TaskApiError(
      ErrorCode.INVALID_PARAMS,
      `购买件数需在 1~${MAX_AUTO_ORDER_NUM} 之间`
    )
  }

  return {
    enabled: true,
    num: Math.floor(count),
    payTool: raw.payTool === '1' ? '1' : '4',
    ...(raw.addressId ? { addressId: String(raw.addressId) } : {}),
  }
}

const toCoreAutoOrder = (state: StockTaskState): AutoOrderConfig | undefined => {
  const policy = state.config.autoOrder
  if (!policy) return undefined
  return {
    enabled: true,
    num: policy.num ?? 1,
    payTool: policy.payTool ?? '4',
    ...(policy.addressId ? { addressId: policy.addressId } : {}),
    ...(policy.sku ? { sku: policy.sku } : {}),
  }
}

const pushEvent = (state: StockTaskState, event: ReturnType<typeof makeEvent>): void => {
  const key = `${event.type}:${Math.floor(event.at / 1000)}`
  if (state.events.some(item => `${item.type}:${Math.floor(item.at / 1000)}` === key)) return
  state.events = capEvents([event, ...state.events], MAX_EVENTS)
}

export const stockDefinition: TaskKindDefinition<StockTaskState> = {
  kind: KIND,
  label: '到货监控',
  version: VERSION,

  // 自动下单要拿真实库存并下单；按规格监控要查 SKU 明细（拒绝匿名）
  requiresAuth: body =>
    Boolean(body?.config?.autoOrder?.enabled || body?.config?.skus?.length),

  create({ body, secret }) {
    const product = body?.product
    if (!product?.productId) {
      throw new TaskApiError(
        ErrorCode.INVALID_PARAMS,
        '请指定要监控的商品（一个任务只能监控一个商品）'
      )
    }

    const rawInterval = body?.config?.interval
    const interval =
      rawInterval === undefined || rawInterval === null || rawInterval === ''
        ? MIN_STOCK_MONITOR_INTERVAL
        : Number(rawInterval)

    if (!Number.isFinite(interval) || interval < MIN_STOCK_MONITOR_INTERVAL) {
      throw new TaskApiError(
        ErrorCode.INVALID_PARAMS,
        `检测间隔不能小于 ${MIN_STOCK_MONITOR_INTERVAL} 秒`
      )
    }

    const skus = readSkus(body?.config?.skus)
    const autoOrder = readAutoOrder(body?.config?.autoOrder, secret)

    return {
      state: {
        product: {
          productId: String(product.productId),
          ...(product.productName ? { productName: String(product.productName) } : {}),
          ...(product.productImage ? { productImage: String(product.productImage) } : {}),
          ...(product.productNo ? { productNo: String(product.productNo) } : {}),
        },
        config: {
          interval,
          duration: num(body?.config?.duration, DEFAULT_DURATION),
          ...(skus.length ? { skus } : {}),
          ...(autoOrder ? { autoOrder } : {}),
        },
        result: {
          checkCount: 0,
          errorCount: 0,
          detected: false,
        },
        events: [],
      },
    }
  },

  run(record: TaskRecordBase<StockTaskState>, ctx: TaskRunContext) {
    const state = record.state
    const adapterConfig = record.secret
    if (!adapterConfig) {
      throw new TaskApiError(ErrorCode.AUTH_REQUIRED, '任务缺少账号快照，无法继续监控')
    }

    const task: MonitorTask = {
      request: { platform: 'yishou', productId: state.product.productId },
      recipient: record.userEmail,
      subject: `🔔 ${state.product.productName ?? state.product.productId} 已到货`,
      productImage: state.product.productImage,
    }

    const config: StockMonitorConfig = {
      interval: state.config.interval,
      duration: ctx.durationSeconds ?? state.config.duration,
      adapterConfig,
      ...(state.config.skus ? { skus: state.config.skus } : {}),
      ...(toCoreAutoOrder(state) ? { autoOrder: toCoreAutoOrder(state) } : {}),
      initialCheckCount: state.result.checkCount,
      initialErrorCount: state.result.errorCount,
      taskId: record.id,
    }

    return createCancellableMonitor(
      task,
      config,
      progress => {
        state.result.checkCount = progress.checkCount
        ctx.save()
      },
      result => {
        applyResult(record, state, result, ctx)
        ctx.save()
      }
    )
  },

  project(record, options = {}) {
    const state = record.state
    const policy = state.config.autoOrder
    const events = options.full ? state.events : state.events.slice(0, LIST_EVENT_LIMIT)

    return {
      id: record.id,
      kind: KIND,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      target: {
        type: 'product',
        id: state.product.productId,
        name: state.product.productName || state.product.productId,
        ...(state.product.productImage ? { image: state.product.productImage } : {}),
        ...(state.product.productNo ? { productNo: state.product.productNo } : {}),
        subtitle: `ID：${state.product.productId}`,
      },
      badges: [
        ...(state.config.skus?.length
          ? [{ text: `限定 ${state.config.skus.length} 个规格`, tone: 'info' as Tone }]
          : []),
        ...(policy
          ? [
              {
                text: `有货自动下单 × ${policy.num ?? 1}`,
                tone: 'warning' as Tone,
              },
            ]
          : []),
      ],
      stats: [
        { key: 'checks', label: '次请求', value: state.result.checkCount },
        {
          key: 'errors',
          label: '次失败',
          value: state.result.errorCount,
          tone: state.result.errorCount > 0 ? 'danger' : 'neutral',
        },
      ],
      config: {
        interval: state.config.interval,
        duration: state.config.duration,
        skus: state.config.skus ?? null,
        autoOrder: policy
          ? {
              enabled: true,
              num: policy.num ?? 1,
              payTool: policy.payTool ?? '4',
              ...(policy.addressId ? { addressId: policy.addressId } : {}),
            }
          : { enabled: false },
      },
      events,
      order: state.result.order ?? null,
      notice: buildNotice(state),
      ...(state.result.error ? { lastError: state.result.error } : {}),
    } satisfies TaskSummary
  },

  restart(record) {
    if (record.status === 'running') {
      throw new TaskApiError(ErrorCode.INVALID_PARAMS, '该任务正在运行，请先删除后再重新发起')
    }
    const state = record.state
    return {
      state: {
        product: state.product,
        config: state.config,
        result: { checkCount: 0, errorCount: 0, detected: false },
        events: [],
      },
    }
  },

  durationOf(record) {
    return record.state.config.duration
  },

  uniqueness(record, all) {
    const productId = record.state.product.productId
    const duplicate = all.find(
      item =>
        item.userId === record.userId &&
        item.status === 'running' &&
        (item.state as StockTaskState).product?.productId === productId
    )
    if (duplicate) {
      throw new TaskApiError(
        ErrorCode.INVALID_PARAMS,
        '该商品已有到货监控任务在运行，请先删除后再发起'
      )
    }
  },

  restore(record) {
    // 已经下过单 / 下单结果未知：重启后重跑会再下一单
    if (record.state.result.order || record.state.result.orderUncertain) {
      record.status = 'completed'
      return false
    }
    // 历史任务的间隔可能低于新下限
    if (record.state.config.interval < MIN_STOCK_MONITOR_INTERVAL) {
      record.state.config.interval = MIN_STOCK_MONITOR_INTERVAL
    }
    return true
  },
}

/** 把一轮结果映射到 state + 事件 */
const applyResult = (
  record: TaskRecordBase<StockTaskState>,
  state: StockTaskState,
  result: MonitorResult,
  ctx: TaskRunContext
): void => {
  state.result.checkCount = result.checkCount
  state.result.errorCount = result.errorCount ?? state.result.errorCount
  state.result.detected = result.detected
  state.result.error = result.error
  state.result.matchedSkus = result.matchedSkus
  state.result.matchedSkuLabel = result.matchedSkuLabel
  state.result.skuWaiting = result.skuWaiting
  state.result.emailSent = result.emailSent
  state.result.orderError = result.orderError
  state.result.orderStage = result.orderStage
  state.result.orderUncertain = result.orderUncertain
  state.result.orderAttempts = result.orderAttempts

  if (result.detected && result.orderSn) {
    state.result.order = {
      orderSn: result.orderSn,
      ...(result.orderAmount !== undefined ? { amount: result.orderAmount } : {}),
      ...(result.orderSkuLabel ? { skuLabel: result.orderSkuLabel } : {}),
      ...(result.orderItems ? { items: result.orderItems } : {}),
      ...(result.orderNum !== undefined ? { num: result.orderNum } : {}),
      ...(result.orderExpireAt !== undefined ? { expireAt: result.orderExpireAt } : {}),
      placedAt: Date.now(),
    }
    pushEvent(
      state,
      makeEvent('order.created', {
        title: '有货已自动下单',
        detail: `订单 ${result.orderSn}`,
        tone: 'success',
        orderSn: result.orderSn,
        ...(result.orderAmount !== undefined ? { amount: result.orderAmount } : {}),
      })
    )

    const guard = {
      accountId: record.accountId,
      autoRenewTriggered: state.autoRenewTriggered,
      userId: record.userId,
      userEmail: record.userEmail,
      id: record.id,
    }
    void ensureAutoRenewFromOrder(guard, () => ctx.save('soon')).then(() => {
      state.autoRenewTriggered = guard.autoRenewTriggered
    })
  }

  if (result.detected && !result.orderSn) {
    pushEvent(
      state,
      makeEvent('stock.arrived', {
        title: '检测到有货',
        ...(result.matchedSkuLabel ? { detail: `规格：${result.matchedSkuLabel}` } : {}),
        tone: 'success',
        emailSent: Boolean(result.emailSent),
      })
    )
  }

  if (result.skuWaiting) {
    pushEvent(
      state,
      makeEvent('stock.sku_waiting', {
        title: '商品有货，等待所选规格',
        detail: '商品整体已补货，但所选规格仍无库存',
        tone: 'warning',
      })
    )
  }

  if (!result.orderSn && result.orderError) {
    const existing = state.events.find(
      item => item.type === 'order.failed' && item.detail === result.orderError
    )
    if (!existing) {
      pushEvent(
        state,
        makeEvent('order.failed', {
          title: '自动下单未成功',
          detail: result.orderError,
          tone: result.orderUncertain ? 'danger' : 'warning',
        })
      )
    }
  }
}

const buildNotice = (state: StockTaskState): TaskSummary['notice'] => {
  const result = state.result
  if (result.orderUncertain) {
    return {
      type: 'uncertain',
      title: '下单结果未知，请人工核对',
      detail: '请求中断时订单可能已生成，任务已停止，不会自动重试',
      tone: 'danger',
    }
  }
  if (result.orderError && !result.order) {
    return {
      type: 'order_failed',
      title: '已检测到有货，但自动下单未成功',
      detail: result.orderError,
      tone: 'warning',
    }
  }
  if (result.skuWaiting) {
    return {
      type: 'sku_waiting',
      title: '商品已补货，等待所选规格',
      detail: '所选规格仍无库存，补货后会自动提醒',
      tone: 'warning',
    }
  }
  return null
}
