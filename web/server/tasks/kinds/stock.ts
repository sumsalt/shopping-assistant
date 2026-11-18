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
  assertOrderAddress,
  resolveOrderAccount,
  resolveOrderCredentials,
  subscribeCollection,
  unsubscribeCollection,
} from './collection-support'
import { ensureCollected, releaseCollected } from '../collection-engine-service'

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

  resolveAccount({ body, user }) {
    // 收藏夹通道：监控由全局收藏夹账号执行（引擎持有），任务只快照「下单账号」= 当前激活账号。
    // 不下发 secret：任务不落任何凭证，下单时按 accountId 现取。
    if (body?.config?.channel === 'collection') {
      const base = resolveAdapterConfigForUser(user.username)
      if (body?.config?.autoOrder?.enabled && (!base.hasCredential || !base.account?.id)) {
        throw new TaskApiError(
          ErrorCode.AUTH_REQUIRED,
          '收藏夹通道自动下单需要一个带登录态的当前账号'
        )
      }
      return { accountId: base.account?.id ?? '', hasCredential: base.hasCredential }
    }
    // 普通通道：跟随当前激活账号——有登录态就带凭证，匿名模式则快照匿名配置
    const resolved = resolveAdapterConfigForUser(user.username)
    return { accountId: resolved.account?.id ?? '', secret: resolved.config, hasCredential: resolved.hasCredential }
  },

  async create({ body, secret, accountId }) {
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

    // 收藏夹通道：不能用 SKU；收藏由引擎托管，任务只快照下单账号
    const isCollection = channel === 'collection'
    const skus = isCollection ? [] : readSkus(body?.config?.skus)
    let autoOrder: StockTaskState['config']['autoOrder']
    let custody: StockTaskState['collection']

    if (isCollection) {
      const productNo = String(product.productNo || '').trim()
      if (!productNo) {
        throw new TaskApiError(
          ErrorCode.INVALID_PARAMS,
          '收藏夹通道需要商品货号（productNo），请从收藏夹 / 详情页选择商品'
        )
      }

      // 下单账号：创建时快照当前激活账号；开自动下单时校验登录态与收货地址
      const orderAccount = resolveOrderAccount(accountId)
      if (body?.config?.autoOrder?.enabled) {
        if (!orderAccount) {
          throw new TaskApiError(
            ErrorCode.AUTH_REQUIRED,
            '收藏夹通道自动下单需要一个带登录态的当前账号'
          )
        }
        await assertOrderAddress(orderAccount.adapterConfig)
      }
      autoOrder = readAutoOrder(body?.config?.autoOrder, orderAccount?.adapterConfig ?? {})

      // 收藏夹全权托管：幂等加入收藏夹；失败则创建失败，避免创建出扫不到数据的任务
      try {
        const collectId = await ensureCollected(productNo)
        custody = { productNo, collectId }
      } catch (error) {
        throw new TaskApiError(
          ErrorCode.INVALID_PARAMS,
          `加入收藏夹失败：${error instanceof Error ? error.message : String(error)}`
        )
      }
    } else {
      autoOrder = readAutoOrder(body?.config?.autoOrder, secret ?? {})
    }

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

    // 收藏夹通道：不启动自身循环，订阅共享收藏夹引擎；不依赖任务 secret
    if (state.config.channel === 'collection') {
      return runCollectionStockMonitor(record, state, ctx)
    }

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
        // 老任务没有 channel 字段，按普通通道处理
        channel: state.config.channel === 'collection' ? 'collection' : 'normal',
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
        // 保留收藏夹托管信息：restart 不会走 create 的 ensureCollected，
        // 必须在 run 里据此把商品重新加回收藏夹引擎，否则扫不到、checkCount 永远 0
        ...(state.collection ? { collection: state.collection } : {}),
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
    if (state.config.channel !== 'collection') return

    const productNo = String(state.product.productNo || state.collection?.productNo || '').trim()
    if (!productNo) return

    // 先移除收藏（引擎此时可能还在跑），再注销订阅；顺序反了引擎会先停、没人执行清理
    await releaseCollected(productNo)
    unsubscribeCollection(productNo)
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
  ctx: TaskRunContext
) => {
  const controller = new AbortController()
  const productNo = state.collection?.productNo || state.product.productNo || ''
  let settled = false

  const promise = new Promise<void>(resolve => {
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(durationTimer)
      // 自然结束 / 删除都走这里：先移除收藏（引擎此时还在跑），再注销订阅
      void releaseCollected(productNo).finally(() => unsubscribeCollection(productNo))
      resolve()
    }

    const orderPolicy = state.config.autoOrder
    // 下单凭证不落盘：按创建时快照的下单账号现取；取不到时只通知并告警
    const orderAdapter = orderPolicy?.enabled
      ? (() => {
          const config = resolveOrderCredentials(record.accountId)
          return config ? getOrderAdapter('yishou', config) : null
        })()
      : null
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
        if (orderPolicy?.enabled && !orderAdapter) {
          // 下单账号不可用（被删 / 掉登录态）：只通知并明确告警，不影响本次到货提醒
          result.detected = true
          result.orderError = '下单账号不可用（已删除或登录态失效），本次仅通知'
          ctx.log(result.orderError, 'warn')
          const email = await sendEmail({
            to: record.userEmail,
            subject: `🎉 已到货（收藏夹监控，自动下单已跳过）：${result.productName}`,
            html: createBackInStockTemplate(
              result.productName,
              item.price,
              item.productImage || state.product.productImage
            ),
          })
          result.emailSent = email.success
        } else if (orderAdapter && orderPolicy && Date.now() >= orderCooldownUntil) {
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

    // restart / restore 的任务不会走 create 里的 ensureCollected，而商品很可能已被
    // 上一个同商品任务 finish() 时的 releaseCollected 移出收藏夹。引擎每轮是从账号收藏夹
    // 列表拉取商品，商品不在列表里就永远不会推给 handler——checkCount 会一直停在 0。
    // 所以订阅前必须先 ensureCollected 把商品重新加回收藏夹引擎。
    void ensureCollected(productNo)
      .then(collectId => {
        // await 期间任务可能已被删除或超时结束，此时只做清理，不再订阅
        if (settled || controller.signal.aborted) {
          void releaseCollected(productNo)
          return
        }
        if (collectId && state.collection?.collectId !== collectId) {
          state.collection = { productNo, collectId }
          ctx.save()
        }
        subscribeCollection(productNo, handler)
      })
      .catch(error => {
        ctx.log(
          `重新加入收藏夹失败，监控无法启动：${error instanceof Error ? error.message : String(error)}`,
          'error'
        )
        finish()
      })

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
