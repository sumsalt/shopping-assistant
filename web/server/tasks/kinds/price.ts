/**
 * 价格监控任务定义
 *
 * 只做四件事：校验输入、建立基线、驱动核心循环、把状态投影成统一视图。
 * 视图不再区分 list/status：同一个 project()，差异只有事件条数。
 */

import {
  createCancellablePriceMonitor,
  DEFAULT_MIN_PRICE_DELTA,
  DEFAULT_PRICE_MONITOR_INTERVAL,
  getAdapter,
  MIN_PRICE_MONITOR_INTERVAL,
  type AutoOrderConfig,
  type PriceMonitorConfig,
  type PriceMonitorResult,
  type PriceMonitorTask,
  type PriceSnapshot,
} from '@core'
import type {
  AutoOrderPolicy,
  TaskEvent,
  TaskKind,
  TaskSummary,
  Tone,
} from '@core/contract'
import { ErrorCode } from '../../utils/response'
import { ensureAutoRenewFromOrder } from '../auto-renew'
import { TaskApiError, capEvents, makeEvent } from '../engine/types'
import type { TaskKindDefinition, TaskRecordBase, TaskRunContext } from '../engine/types'
import type { PriceTaskState } from './state'

const KIND: TaskKind = 'price'
const VERSION = 2

const MAX_EVENTS = 50
const LIST_EVENT_LIMIT = 5

const num = (value: unknown, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const notifyOnOf = (value: unknown): 'any' | 'drop' | 'rise' =>
  value === 'drop' || value === 'rise' ? value : 'any'

/** 校验并归一化自动下单配置 */
const parseAutoOrder = (raw: any): AutoOrderPolicy | undefined => {
  if (!raw?.enabled) return undefined

  const triggerMode = raw.triggerMode === 'discount' ? 'discount' : 'price'
  let targetPrice: number | undefined
  let targetDiscount: number | undefined

  if (triggerMode === 'discount') {
    targetDiscount = Number(raw.targetDiscount)
    if (!Number.isFinite(targetDiscount) || targetDiscount <= 0 || targetDiscount >= 10) {
      throw new TaskApiError(
        ErrorCode.INVALID_PARAMS,
        '目标折扣需大于 0 且小于 10（例如 2.4 表示 2.4 折）'
      )
    }
  } else {
    targetPrice = Number(raw.targetPrice)
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      throw new TaskApiError(ErrorCode.INVALID_PARAMS, '价格到点自动下单需要设置大于 0 的目标价')
    }
  }

  const numRaw = Number(raw.num ?? 1)
  if (!Number.isFinite(numRaw) || numRaw < 1) {
    throw new TaskApiError(ErrorCode.INVALID_PARAMS, '购买件数需大于 0')
  }

  const skus = Array.isArray(raw.skus)
    ? raw.skus.map((item: unknown) => String(item ?? '').trim()).filter(Boolean).slice(0, 50)
    : []

  return {
    enabled: true,
    triggerMode,
    ...(triggerMode === 'price'
      ? { targetPrice: Math.round(targetPrice! * 100) / 100 }
      : { targetDiscount: Math.round(targetDiscount! * 10) / 10 }),
    num: Math.min(Math.floor(numRaw), 99),
    payTool: raw.payTool === '1' ? '1' : '4',
    ...(raw.addressId ? { addressId: String(raw.addressId) } : {}),
    ...(skus.length ? { skus } : {}),
  }
}

/** state.snapshot → 核心循环的基线快照 */
const rebuildSnapshot = (state: PriceTaskState): PriceSnapshot | undefined => {
  const snapshot = state.snapshot
  if (!snapshot) return undefined
  return {
    platform: 'yishou',
    productId: snapshot.productId,
    productName: snapshot.productName,
    productNo: snapshot.productNo ?? state.product.productNo ?? '',
    productImage: snapshot.productImage ?? state.product.productImage ?? '',
    productUrl: '',
    shopPrice: snapshot.shopPrice,
    authState: 'logged_in',
    coupons: snapshot.coupons ?? [],
    couponsNew: snapshot.couponsNew ?? [],
    capturedAt: snapshot.checkedAt,
  }
}

/** 自动下单策略 → 核心库配置 */
const toCoreAutoOrder = (policy: AutoOrderPolicy): AutoOrderConfig => ({
  enabled: true,
  num: policy.num ?? 1,
  payTool: policy.payTool ?? '4',
  ...(policy.addressId ? { addressId: policy.addressId } : {}),
})

const orderPolicyText = (policy: AutoOrderPolicy): string =>
  policy.triggerMode === 'discount'
    ? `≤ ${policy.targetDiscount} 折自动下单 × ${policy.num ?? 1}`
    : `≤ ¥${(policy.targetPrice ?? 0).toFixed(2)} 自动下单 × ${policy.num ?? 1}`

const notifyText = (value: 'any' | 'drop' | 'rise'): string =>
  value === 'drop' ? '仅降价通知' : value === 'rise' ? '仅涨价通知' : '涨跌都通知'

const toAutoOrderView = (policy: AutoOrderPolicy | undefined) =>
  policy
    ? {
        enabled: true,
        num: policy.num ?? 1,
        payTool: policy.payTool ?? '4',
        ...(policy.addressId ? { addressId: policy.addressId } : {}),
        trigger: policy.triggerMode ?? 'price',
        ...(policy.targetPrice !== undefined ? { targetPrice: policy.targetPrice } : {}),
        ...(policy.targetDiscount !== undefined ? { targetDiscount: policy.targetDiscount } : {}),
        ...(policy.skus ? { skus: policy.skus } : {}),
      }
    : {
        enabled: false,
      }

/** 最近一轮价格变化 → 事件 */
const priceEvent = (state: PriceTaskState, result: PriceMonitorResult): TaskEvent | null => {
  const change = result.changeInfo
  if (!result.detected || !change) return null

  const direction = change.direction === 'down' ? 'down' : 'up'
  return makeEvent('price.changed', {
    at: change.detectedAt,
    title: `${direction === 'down' ? '降价' : '涨价'} ¥${change.previousPrice.toFixed(2)} → ¥${change.currentPrice.toFixed(2)}`,
    detail: `${change.delta > 0 ? '+' : ''}${change.delta.toFixed(2)}（${change.deltaPercent > 0 ? '+' : ''}${change.deltaPercent.toFixed(2)}%）`,
    tone: (direction === 'down' ? 'down' : 'up') as Tone,
    emailSent: Boolean(result.emailSent),
    previousPrice: change.previousPrice,
    currentPrice: change.currentPrice,
    delta: change.delta,
    deltaPercent: change.deltaPercent,
    direction,
  })
}

const couponEvent = (state: PriceTaskState, result: PriceMonitorResult): TaskEvent | null => {
  const change = result.couponChangeInfo
  if (!result.detected || !change) return null

  const parts: string[] = []
  if (change.added.length) parts.push(`新增 ${change.added.map(item => item.label).join('、')}`)
  if (change.removed.length) parts.push(`失效 ${change.removed.map(item => item.label).join('、')}`)

  return makeEvent('coupon.changed', {
    at: change.detectedAt,
    title: '优惠券变化',
    detail: parts.join('；'),
    tone: 'info',
    emailSent: Boolean(result.emailSent),
    added: change.added.map(item => ({ kind: item.kind, label: item.label })),
    removed: change.removed.map(item => ({ kind: item.kind, label: item.label })),
  })
}

const pushEvent = (state: PriceTaskState, event: TaskEvent | null): void => {
  if (!event) return
  // 同一轮可能多次回调：同类型 + 同秒视为同一条
  const key = `${event.type}:${Math.floor(event.at / 1000)}`
  if (state.events.some(item => `${item.type}:${Math.floor(item.at / 1000)}` === key)) return
  state.events = capEvents([event, ...state.events], MAX_EVENTS)
}

export const priceDefinition: TaskKindDefinition<PriceTaskState> = {
  kind: KIND,
  label: '价格监控',
  version: VERSION,
  removeOriginalOnRestart: true,

  // 比价必须用登录态拿货价，游客价口径不同
  requiresAuth: () => true,

  async create({ body, secret, accountId }) {
    const product = body?.product
    if (!product?.productId) {
      throw new TaskApiError(
        ErrorCode.INVALID_PARAMS,
        '请指定要监控的商品（一个任务只能监控一个商品）'
      )
    }

    const productId = String(product.productId)
    const interval = num(body?.config?.interval, DEFAULT_PRICE_MONITOR_INTERVAL)
    if (interval < MIN_PRICE_MONITOR_INTERVAL) {
      throw new TaskApiError(
        ErrorCode.INVALID_PARAMS,
        `检测间隔不能小于 ${MIN_PRICE_MONITOR_INTERVAL} 秒`
      )
    }

    const duration =
      body?.config?.duration === undefined ? undefined : Number(body.config.duration)
    if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0)) {
      throw new TaskApiError(ErrorCode.INVALID_PARAMS, '监控时长必须大于 0')
    }

    if (!secret.uid || !secret.token) {
      throw new TaskApiError(
        ErrorCode.AUTH_REQUIRED,
        '价格监控需要登录态，请先在账号管理中选择带登录态的账号'
      )
    }

    // 同步建立基线：凭证失效 / 商品不存在时直接失败，不创建跑不起来的任务
    let initialSnapshot: PriceSnapshot
    try {
      initialSnapshot = await getAdapter('yishou', secret).getPriceInfo(productId)
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'type' in error
          ? String((error as { type: unknown }).type)
          : ErrorCode.UNKNOWN_ERROR
      throw new TaskApiError(code, error instanceof Error ? error.message : '获取商品价格失败')
    }

    const autoOrder = parseAutoOrder(body?.config?.autoOrder)
    if (
      autoOrder?.triggerMode === 'discount' &&
      !(initialSnapshot.shoppePrice && initialSnapshot.shoppePrice > 0)
    ) {
      throw new TaskApiError(
        ErrorCode.INVALID_PARAMS,
        '该商品没有提供档口价/门市价，无法按折扣触发自动下单，请改用目标价'
      )
    }

    void accountId

    return {
      state: {
        product: {
          productId,
          ...(product.productName || initialSnapshot.productName
            ? { productName: product.productName || initialSnapshot.productName }
            : {}),
          ...(product.productImage || initialSnapshot.productImage
            ? { productImage: product.productImage || initialSnapshot.productImage }
            : {}),
          ...(product.productNo || initialSnapshot.productNo
            ? { productNo: product.productNo || initialSnapshot.productNo }
            : {}),
        },
        config: {
          interval,
          ...(duration !== undefined ? { duration } : {}),
          notifyOn: notifyOnOf(body?.config?.notifyOn),
          minPriceDelta: num(body?.config?.minPriceDelta, DEFAULT_MIN_PRICE_DELTA),
          ...(autoOrder ? { autoOrder } : {}),
        },
        checkCount: 0,
        detectedCount: 0,
        snapshot: {
          productId,
          productName: initialSnapshot.productName,
          productNo: initialSnapshot.productNo,
          productImage: product.productImage || initialSnapshot.productImage,
          shopPrice: initialSnapshot.shopPrice,
          checkedAt: initialSnapshot.capturedAt,
          coupons: initialSnapshot.coupons,
          couponsNew: initialSnapshot.couponsNew,
        },
        events: [],
      },
    }
  },

  run(record: TaskRecordBase<PriceTaskState>, ctx: TaskRunContext) {
    const state = record.state
    const adapterConfig = record.secret
    if (!adapterConfig) {
      throw new TaskApiError(ErrorCode.AUTH_REQUIRED, '任务缺少登录态，无法继续监控')
    }

    const duration = ctx.durationSeconds ?? state.config.duration
    const task: PriceMonitorTask = {
      request: { platform: 'yishou', productId: state.product.productId },
      recipient: record.userEmail,
      productName: state.product.productName,
      productImage: state.product.productImage,
    }

    const config: PriceMonitorConfig = {
      interval: state.config.interval,
      ...(duration !== undefined ? { duration } : {}),
      adapterConfig,
      notifyOn: state.config.notifyOn,
      minPriceDelta: state.config.minPriceDelta,
      ...(state.config.autoOrder
        ? {
            autoOrder: {
              ...toCoreAutoOrder(state.config.autoOrder),
              triggerMode: state.config.autoOrder.triggerMode,
              ...(state.config.autoOrder.targetPrice !== undefined
                ? { targetPrice: state.config.autoOrder.targetPrice }
                : {}),
              ...(state.config.autoOrder.targetDiscount !== undefined
                ? { targetDiscount: state.config.autoOrder.targetDiscount }
                : {}),
              ...(state.config.autoOrder.skus ? { skus: state.config.autoOrder.skus } : {}),
            },
          }
        : {}),
      initialSnapshot: rebuildSnapshot(state),
      initialCheckCount: state.checkCount,
      initialDetectedCount: state.detectedCount,
      taskId: record.id,
    }

    const monitor = createCancellablePriceMonitor(
      task,
      config,
      progress => {
        state.checkCount = progress.checkCount
        state.detectedCount = progress.detectedCount
        ctx.save()
      },
      result => {
        if (result.currentPrice !== undefined) {
          state.snapshot = {
            productId: result.productId,
            productName: result.productName,
            ...(state.product.productNo ? { productNo: state.product.productNo } : {}),
            ...(state.product.productImage ? { productImage: state.product.productImage } : {}),
            shopPrice: result.currentPrice,
            checkedAt: Date.now(),
            ...(result.coupons ? { coupons: result.coupons } : {}),
            ...(result.couponsNew ? { couponsNew: result.couponsNew } : {}),
          }
        }

        state.lastError = result.error

        if (result.orderSn && state.order?.orderSn !== result.orderSn) {
          state.order = {
            orderSn: result.orderSn,
            ...(result.orderAmount !== undefined ? { amount: result.orderAmount } : {}),
            ...(result.orderSkuLabel ? { skuLabel: result.orderSkuLabel } : {}),
            ...(result.orderItems ? { items: result.orderItems } : {}),
            ...(result.orderNum !== undefined ? { num: result.orderNum } : {}),
            ...(result.orderExpireAt !== undefined ? { expireAt: result.orderExpireAt } : {}),
            placedAt: Date.now(),
          }
          state.events = capEvents(
            [
              makeEvent('order.created', {
                title: '价格到点已自动下单',
                detail: `订单 ${result.orderSn}`,
                tone: 'success',
                orderSn: result.orderSn,
                ...(result.orderAmount !== undefined ? { amount: result.orderAmount } : {}),
              }),
              ...state.events,
            ],
            MAX_EVENTS
          )

          // 自动下单成功：为对应账号补一个 12 小时续期任务（一次性守卫）
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

        state.orderError = result.orderError
        state.orderSkipped = result.orderSkipped

        if (!result.orderSn && result.orderError) {
          const existing = state.events.find(
            item => item.type === 'order.failed' && item.detail === result.orderError
          )
          if (!existing) {
            state.events = capEvents(
              [
                makeEvent('order.failed', {
                  title: '自动下单未成功',
                  detail: result.orderError,
                  tone: result.orderSkipped === 'no_stock' ? 'warning' : 'danger',
                }),
                ...state.events,
              ],
              MAX_EVENTS
            )
          }
        }

        pushEvent(state, priceEvent(state, result))
        pushEvent(state, couponEvent(state, result))
        ctx.save()
      }
    )

    return monitor
  },

  project(record, options = {}) {
    const state = record.state
    const policy = state.config.autoOrder
    const events = options.full ? state.events : state.events.slice(0, LIST_EVENT_LIMIT)

    const priceCount = state.events.filter(item => item.type === 'price.changed').length
    const couponCount = state.events.filter(item => item.type === 'coupon.changed').length

    return {
      id: record.id,
      kind: KIND,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      target: {
        type: 'product',
        id: state.product.productId,
        name: state.product.productName || state.snapshot?.productName || state.product.productId,
        ...(state.product.productImage ? { image: state.product.productImage } : {}),
        ...(state.product.productNo ? { productNo: state.product.productNo } : {}),
        subtitle: `ID：${state.product.productId}`,
      },
      badges: [
        { text: notifyText(state.config.notifyOn), tone: 'neutral' },
        ...(policy
          ? [{ text: orderPolicyText(policy), tone: 'warning' as Tone }]
          : []),
      ],
      stats: [
        { key: 'checks', label: '次检测', value: state.checkCount },
        { key: 'price', label: '次价格变化', value: priceCount, tone: priceCount ? 'up' : 'neutral' },
        { key: 'coupon', label: '次优惠变化', value: couponCount, tone: couponCount ? 'info' : 'neutral' },
        ...(state.snapshot
          ? [
              {
                key: 'current',
                label: '当前价',
                value: `¥${state.snapshot.shopPrice.toFixed(2)}`,
                tone: 'up' as Tone,
              },
            ]
          : []),
      ],
      config: {
        interval: state.config.interval,
        ...(state.config.duration !== undefined ? { duration: state.config.duration } : {}),
        notifyOn: state.config.notifyOn,
        minPriceDelta: state.config.minPriceDelta,
        autoOrder: toAutoOrderView(policy),
      },
      events,
      eventCount: state.events.length,
      order: state.order ?? null,
      notice:
        state.orderError && !state.order
          ? {
              type: state.orderSkipped === 'no_stock' ? 'no_stock' : 'order_failed',
              title:
                state.orderSkipped === 'no_stock'
                  ? '已到目标价，等待补货'
                  : '已到目标价，但自动下单未成功',
              detail: state.orderError,
              tone: state.orderSkipped === 'no_stock' ? 'warning' : 'danger',
            }
          : null,
      ...(state.lastError ? { lastError: state.lastError } : {}),
    } satisfies TaskSummary
  },

  restart(record) {
    const state = record.state
    return {
      state: {
        product: state.product,
        config: state.config,
        checkCount: 0,
        detectedCount: 0,
        ...(state.snapshot ? { snapshot: state.snapshot } : {}),
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
        (item.state as PriceTaskState).product?.productId === productId
    )
    if (duplicate) {
      throw new TaskApiError(ErrorCode.DUPLICATE, `商品 ${productId} 已在价格监控中`)
    }
  },

  restore(record) {
    // 已下单的任务不续跑：重启后重跑会再下一单
    if (record.state.order) {
      record.status = 'completed'
      return false
    }
    return true
  },
}
