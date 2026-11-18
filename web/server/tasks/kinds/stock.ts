/**
 * 到货监控任务定义
 *
 * 循环仍由核心库 createCancellableMonitor 驱动（下一迭代再切到 runMonitorLoop），
 * 这里只做输入校验、状态映射与统一视图投影。
 */

import {
  createCancellableMonitor,
  getOrderAdapter,
  placeAutoOrder,
  sendEmail,
  createBackInStockTemplate,
  createAutoOrderTemplate,
  createAutoOrderFailedTemplate,
  MAX_AUTO_ORDER_NUM,
  type AutoOrderConfig,
  type CollectionStockResult,
  type MonitorResult,
  type MonitorTask,
  type StockMonitorConfig,
} from '@core'
import type { TaskKind, TaskSummary, Tone } from '@core/contract'
import { ErrorCode } from '../../utils/response'
import { resolveAdapterConfigForUser } from '../../utils/adapterConfig'
import { ensureAutoRenewFromOrder } from '../auto-renew'
import { TaskApiError, capEvents, makeEvent } from '../engine/types'
import type { TaskKindDefinition, TaskRecordBase, TaskRunContext } from '../engine/types'
import type { StockTaskState } from './state'
import {
  requireCollectionAccount,
  requireCollectionAccountSafe,
  addToCollection,
  removeFromCollection,
  subscribeCollection,
  unsubscribeCollection,
} from './collection-support'

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

  // 自动下单要拿真实库存并下单，必须登录态；
  // 按规格监控已改走匿名 get_goods_info_v2，不再要求凭证
  requiresAuth: body => Boolean(body?.config?.autoOrder?.enabled),

  resolveAccount({ body, user }) {
    // 收藏夹通道：用专用收藏夹账号凭证（也用于下单）
    if (body?.config?.channel === 'collection') {
      const account = requireCollectionAccount()
      return { accountId: account.accountId, secret: account.adapterConfig, hasCredential: true }
    }
    // 普通通道：沿用当前激活账号
    const needAuth = Boolean(body?.config?.autoOrder?.enabled)
    const resolved = resolveAdapterConfigForUser(user.username, needAuth)
    return { accountId: resolved.account?.id ?? '', secret: resolved.config, hasCredential: resolved.hasCredential }
  },

  async create({ body, secret }) {
    const product = body?.product
    if (!product?.productId) {
      throw new TaskApiError(
        ErrorCode.INVALID_PARAMS,
        '请指定要监控的商品（一个任务只能监控一个商品）'
      )
    }

    const channel: 'normal' | 'collection' = body?.config?.channel === 'collection' ? 'collection' : 'normal'

    const rawInterval = body?.config?.interval
    // 实验分支：节奏由双层闸门控制，interval 仅作时长边界预估；缺省记为 0（自动设置）。
    const interval =
      rawInterval === undefined || rawInterval === null || rawInterval === ''
        ? 0
        : Number(rawInterval)

    if (!Number.isFinite(interval) || interval < 0) {
      throw new TaskApiError(ErrorCode.INVALID_PARAMS, '检测间隔不能为负数')
    }

    // 收藏夹通道：不能用 SKU，用专用账号凭证校验下单配置，并把商品加入收藏夹
    const isCollection = channel === 'collection'
    const skus = isCollection ? [] : readSkus(body?.config?.skus)
    let orderSecret = secret
    let custody: StockTaskState['collection']

    if (isCollection) {
      const collectionAccount = requireCollectionAccount()
      orderSecret = collectionAccount.adapterConfig
      if (!product.productNo) {
        throw new TaskApiError(
          ErrorCode.INVALID_PARAMS,
          '收藏夹通道需要商品货号（productNo），请从收藏夹 / 详情页选择商品'
        )
      }
      const collectId = await addToCollection(String(product.productNo), collectionAccount.adapterConfig)
      custody = { productNo: String(product.productNo), collectId }
    }

    const autoOrder = readAutoOrder(body?.config?.autoOrder, orderSecret)

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
          channel,
        },
        ...(custody ? { collection: custody } : {}),
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

    // 收藏夹通道：不启动自身循环，订阅共享收藏夹引擎
    if (state.config.channel === 'collection') {
      return runCollectionStockMonitor(record, state, ctx, adapterConfig)
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
    // 实验分支：interval 不再驱动 sleep，允许 0；仅把负数等非法历史值纠正为 0
    if (!Number.isFinite(record.state.config.interval) || record.state.config.interval < 0) {
      record.state.config.interval = 0
    }
    return true
  },

  async onRemove(record) {
    const state = record.state
    if (state.config.channel !== 'collection' || !state.collection) return
    unsubscribeCollection(state.collection.productNo)
    const config = requireCollectionAccountSafe() ?? record.secret
    if (config) {
      await removeFromCollection(
        state.collection.productNo,
        state.collection.collectId,
        state.product.productId,
        config
      )
    }
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

/**
 * 收藏夹通道的到货监控 runner。
 *
 * 不自己轮询，而是订阅共享收藏夹引擎；引擎每轮把该商品的最新状态推到 handler。
 * 命中到货后复用普通通道的下单 / 邮件逻辑，然后注销订阅、结束任务。
 */
const runCollectionStockMonitor = (
  record: TaskRecordBase<StockTaskState>,
  state: StockTaskState,
  ctx: TaskRunContext,
  adapterConfig: NonNullable<TaskRecordBase<StockTaskState>['secret']>
) => {
  const controller = new AbortController()
  const productNo = state.collection?.productNo || state.product.productNo || ''
  let settled = false

  const promise = new Promise<void>(resolve => {
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(durationTimer)
      unsubscribeCollection(productNo)
      resolve()
    }

    const orderPolicy = state.config.autoOrder
    const orderAdapter = orderPolicy?.enabled ? getOrderAdapter('yishou', adapterConfig) : null
    let orderCooldownUntil = 0

    const handler = async (item: CollectionStockResult) => {
      if (settled || controller.signal.aborted || state.result.detected) return

      state.result.checkCount++
      ctx.save()

      if (!item.inStock) {
        // 仍无货：不触发，等下一轮
        return
      }

      // 到货：命中。收藏夹通道不支持 SKU，直接按商品级状态触发
      const result: MonitorResult = {
        productId: item.productId,
        productName: item.productName || state.product.productName || item.productId,
        detected: false,
        checkCount: state.result.checkCount,
      }

      try {
        if (orderAdapter && orderPolicy && Date.now() >= orderCooldownUntil) {
          const orderResult = await placeAutoOrder(orderAdapter, {
            goodsId: item.productId,
            goodsNo: item.productNo,
            config: toCoreAutoOrder(state) || { enabled: true },
            skus: [],
          })
          result.orderAttempts = (result.orderAttempts || 0) + 1
          result.orderStage = orderResult.stage
          if (!orderResult.success && orderResult.cooldownMs) {
            orderCooldownUntil = Date.now() + orderResult.cooldownMs
          }
          if (orderResult.success) {
            result.detected = true
            result.orderSn = orderResult.orderSn
            result.orderAmount = orderResult.orderAmount
            result.orderExpireAt = orderResult.expireAt
            result.orderSkuLabel = orderResult.skuLabel
            result.orderItems = orderResult.items
            result.orderNum = orderResult.num
            const email = await sendEmail({
              to: record.userEmail,
              subject: `✅ 已自动下单（收藏夹监控）：${result.productName}（订单 ${orderResult.orderSn}）`,
              html: createAutoOrderTemplate({
                productName: result.productName,
                productImage: item.productImage || state.product.productImage,
                orderSn: orderResult.orderSn,
                orderAmount: orderResult.orderAmount,
                skuLabel: orderResult.skuLabel,
                items: orderResult.items,
                num: orderResult.num,
                requestedNum: orderResult.requestedNum,
                payTool: orderResult.payTool,
                expireAt: orderResult.expireAt,
              }),
            })
            result.emailSent = email.success
          } else {
            result.orderError = orderResult.message
            result.orderUncertain = orderResult.uncertain
            ctx.log(`收藏夹通道下单失败：${orderResult.message}`, 'warn')
            // 可重试 / 冷却中：本轮不结束任务，下一轮再试
            applyResult(record, state, result, ctx)
            ctx.save()
            return
          }
        } else {
          // 纯到货通知
          result.detected = true
          const email = await sendEmail({
            to: record.userEmail,
            subject: `🎉 已到货（收藏夹监控）：${result.productName}`,
            html: createBackInStockTemplate(
              result.productName,
              item.price,
              item.productImage || state.product.productImage
            ),
          })
          result.emailSent = email.success
        }

        applyResult(record, state, result, ctx)
        ctx.save()
        // 命中到货：任务完成，注销订阅并结束
        finish()
      } catch (error) {
        result.error = error instanceof Error ? error.message : String(error)
        applyResult(record, state, result, ctx)
        ctx.save()
      }
    }

    subscribeCollection(productNo, handler)

    controller.signal.addEventListener('abort', () => finish())

    // 时长边界：到期自动结束（收藏夹通道靠这里控制总时长，请求节奏靠闸门）
    const durationSec = ctx.durationSeconds ?? state.config.duration
    const durationTimer = setTimeout(
      () => finish(),
      durationSec > 0 ? durationSec * 1000 : 24 * 60 * 60 * 1000
    )
    if (typeof durationTimer.unref === 'function') durationTimer.unref()
  })

  return { controller, promise }
}
