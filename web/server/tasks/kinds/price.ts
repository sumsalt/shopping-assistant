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
  getOrderAdapter,
  placeAutoOrder,
  sendEmail,
  createAutoOrderTemplate,
  createAutoOrderFailedTemplate,
  type AutoOrderConfig,
  type CollectionStockResult,
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
import { resolveAdapterConfigForUser } from '../../utils/adapterConfig'
import { ensureAutoRenewFromOrder } from '../auto-renew'
import { TaskApiError, capEvents, makeEvent } from '../engine/types'
import type { TaskKindDefinition, TaskRecordBase, TaskRunContext } from '../engine/types'
import type { PriceTaskState } from './state'
import {
  assertOrderAddress,
  resolveOrderAccount,
  resolveOrderCredentials,
  subscribeCollection,
  unsubscribeCollection,
} from './collection-support'
import { ensureCollected, releaseCollected } from '../collection-engine-service'

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
    ...(snapshot.inStock !== undefined ? { inStock: snapshot.inStock } : {}),
    ...(snapshot.stockMessage ? { stockMessage: snapshot.stockMessage } : {}),
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

/**
 * 库存状态胶囊
 *
 * 数据来自与价格同一次详情响应（is_stockout / is_on_sale / goods_status）。
 * 老任务或适配器没返回时保持「未知」——不展示，避免误报成「无货」。
 */
const stockStat = (state: PriceTaskState) => {
  const inStock = state.snapshot?.inStock
  if (inStock === undefined) return []
  return [
    {
      key: 'stock',
      label: inStock ? '当前库存' : state.snapshot?.stockMessage || '当前库存',
      value: inStock ? '有货' : '无货',
      tone: (inStock ? 'success' : 'danger') as Tone,
    },
  ]
}

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

  resolveAccount({ body, user }) {
    // 收藏夹通道：监控由全局收藏夹账号执行，任务只快照「下单账号」= 当前激活账号；
    // 不落 secret，建立基线与下单时按 accountId 现取。
    if (body?.config?.channel === 'collection') {
      const base = resolveAdapterConfigForUser(user.username)
      return { accountId: base.account?.id ?? '', hasCredential: base.hasCredential }
    }
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

    const productId = String(product.productId)
    const interval = num(body?.config?.interval, DEFAULT_PRICE_MONITOR_INTERVAL)
    // 实验分支：节奏由双层闸门控制，interval 仅作时长边界预估；允许 0（自动设置），
    // 仍拒绝负数等非法值。MIN_PRICE_MONITOR_INTERVAL 保留给默认展示，不再作为下限。
    if (!Number.isFinite(interval) || interval < 0) {
      throw new TaskApiError(ErrorCode.INVALID_PARAMS, '检测间隔不能为负数')
    }

    const duration =
      body?.config?.duration === undefined ? undefined : Number(body.config.duration)
    if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0)) {
      throw new TaskApiError(ErrorCode.INVALID_PARAMS, '监控时长必须大于 0')
    }

    const channel: 'normal' | 'collection' =
      body?.config?.channel === 'collection' ? 'collection' : 'normal'

    // 收藏夹通道：监控由全局收藏夹账号执行；任务只快照下单账号，凭证现取。
    // 基线请求（拿货价）也用下单账号，保证与后续下单口径一致。
    let baselineConfig = secret
    if (channel === 'collection') {
      const orderAccount = resolveOrderAccount(accountId)
      if (!orderAccount) {
        throw new TaskApiError(
          ErrorCode.AUTH_REQUIRED,
          '收藏夹通道需要一个带登录态的当前账号（用于建立基线与下单）'
        )
      }
      baselineConfig = orderAccount.adapterConfig
    }

    if (!baselineConfig?.uid || !baselineConfig.token) {
      throw new TaskApiError(
        ErrorCode.AUTH_REQUIRED,
        '价格监控需要登录态，请先在账号管理中选择带登录态的账号'
      )
    }

    // 同步建立基线：凭证失效 / 商品不存在时直接失败，不创建跑不起来的任务
    let initialSnapshot: PriceSnapshot
    try {
      initialSnapshot = await getAdapter('yishou', baselineConfig).getPriceInfo(productId)
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

    let custody: PriceTaskState['collection']
    if (channel === 'collection') {
      // 收藏夹通道：不支持折扣 / 券后价计算，只支持「指定价格下单」
      if (autoOrder?.triggerMode === 'discount') {
        throw new TaskApiError(
          ErrorCode.INVALID_PARAMS,
          '收藏夹通道不支持折扣下单，请改用指定目标价'
        )
      }
      const productNo = product.productNo || initialSnapshot.productNo
      if (!productNo) {
        throw new TaskApiError(
          ErrorCode.INVALID_PARAMS,
          '收藏夹通道需要商品货号（productNo）'
        )
      }
      if (autoOrder?.enabled) {
        await assertOrderAddress(baselineConfig)
      }
      // 收藏夹全权托管：幂等加入；失败则创建失败
      try {
        const collectId = await ensureCollected(String(productNo))
        custody = { productNo: String(productNo), collectId }
      } catch (error) {
        throw new TaskApiError(
          ErrorCode.INVALID_PARAMS,
          `加入收藏夹失败：${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

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
          channel,
        },
        ...(custody ? { collection: custody } : {}),
        checkCount: 0,
        detectedCount: 0,
        snapshot: {
          productId,
          productName: initialSnapshot.productName,
          productNo: initialSnapshot.productNo,
          productImage: product.productImage || initialSnapshot.productImage,
          shopPrice: initialSnapshot.shopPrice,
          checkedAt: initialSnapshot.capturedAt,
          ...(initialSnapshot.inStock !== undefined ? { inStock: initialSnapshot.inStock } : {}),
          ...(initialSnapshot.stockMessage ? { stockMessage: initialSnapshot.stockMessage } : {}),
          coupons: initialSnapshot.coupons,
          couponsNew: initialSnapshot.couponsNew,
        },
        events: [],
      },
    }
  },

  run(record: TaskRecordBase<PriceTaskState>, ctx: TaskRunContext) {
    const state = record.state

    // 收藏夹通道：不启动自身循环，订阅共享收藏夹引擎；不依赖任务 secret
    if (state.config.channel === 'collection') {
      return runCollectionPriceMonitor(record, state, ctx)
    }

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
        applyPriceResult(record, state, result, ctx)
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
        ...stockStat(state),
      ],
      config: {
        interval: state.config.interval,
        ...(state.config.duration !== undefined ? { duration: state.config.duration } : {}),
        notifyOn: state.config.notifyOn,
        minPriceDelta: state.config.minPriceDelta,
        // 老任务没有 channel 字段，按普通通道处理
        channel: state.config.channel === 'collection' ? 'collection' : 'normal',
        autoOrder: toAutoOrderView(policy),
      },
      events,
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

/** 把一轮价格结果映射到 state + 事件（普通通道与收藏夹通道共用） */
const applyPriceResult = (
  record: TaskRecordBase<PriceTaskState>,
  state: PriceTaskState,
  result: PriceMonitorResult,
  ctx: TaskRunContext
): void => {
  if (result.currentPrice !== undefined) {
    state.snapshot = {
      productId: result.productId,
      productName: result.productName,
      ...(state.product.productNo ? { productNo: state.product.productNo } : {}),
      ...(state.product.productImage ? { productImage: state.product.productImage } : {}),
      shopPrice: result.currentPrice,
      checkedAt: Date.now(),
      ...(result.inStock !== undefined ? { inStock: result.inStock } : {}),
      ...(result.stockMessage ? { stockMessage: result.stockMessage } : {}),
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
}

/**
 * 收藏夹通道的价格监控 runner。
 *
 * 订阅共享收藏夹引擎；每轮用收藏夹的 shop_price（拿货价）与目标价比较。
 * 收藏夹通道不支持券后价 / 折扣计算，只用 shop_price ≤ targetPrice 判定。
 */
const runCollectionPriceMonitor = (
  record: TaskRecordBase<PriceTaskState>,
  state: PriceTaskState,
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

    const autoOrder = state.config.autoOrder
    // 下单凭证不落盘：按创建时快照的下单账号现取；取不到时跳过下单并告警
    const orderAdapter = autoOrder?.enabled
      ? (() => {
          const config = resolveOrderCredentials(record.accountId)
          return config ? getOrderAdapter('yishou', config) : null
        })()
      : null
    const targetPrice = autoOrder && autoOrder.triggerMode !== 'discount' ? Number(autoOrder.targetPrice) : NaN
    let orderCooldownUntil = 0

    const handler = async (item: CollectionStockResult) => {
      if (settled || controller.signal.aborted) return

      state.checkCount++
      const price = item.price

      // 更新基线快照（用收藏夹的拿货价，无券/折扣）
      state.snapshot = {
        productId: item.productId,
        productName: item.productName || state.product.productName || item.productId,
        ...(state.product.productNo ? { productNo: state.product.productNo } : {}),
        ...(state.product.productImage ? { productImage: state.product.productImage } : {}),
        shopPrice: price,
        checkedAt: Date.now(),
        ...(item.inStock !== undefined ? { inStock: item.inStock } : {}),
        ...(item.message ? { stockMessage: item.message } : {}),
      }

      const result: PriceMonitorResult = {
        productId: item.productId,
        productName: state.snapshot.productName,
        detected: false,
        currentPrice: price,
        checkCount: state.checkCount,
        // 必须带上库存：applyPriceResult 会用 result 整体覆盖上面的 state.snapshot，
        // 不带就会把刚写进去的 inStock/stockMessage 抹掉，导致卡片不显示有货/无货。
        ...(item.inStock !== undefined ? { inStock: item.inStock } : {}),
        ...(item.message ? { stockMessage: item.message } : {}),
      }

      try {
        // 价格到点（仅指定价格模式）+ 已启用自动下单
        const hit = Number.isFinite(targetPrice) && price > 0 && price <= targetPrice
        if (hit && autoOrder?.enabled && !orderAdapter) {
          // 下单账号不可用：明确告警但继续监控（用户可能只是临时切走 / 重抓中）
          result.orderError = '下单账号不可用（已删除或登录态失效），已到目标价但未下单'
          ctx.log(result.orderError, 'warn')
        } else if (hit && orderAdapter && autoOrder && Date.now() >= orderCooldownUntil) {
          if (item.inStock === false) {
            result.orderSkipped = 'no_stock'
            result.orderError = `商品当前无货（${item.message || '暂时缺货'}），已到目标价，等待补货`
          } else {
            const orderResult = await placeAutoOrder(orderAdapter, {
              goodsId: item.productId,
              goodsNo: item.productNo,
              config: autoOrder,
              skus: [],
            })
            result.orderAttempts = (result.orderAttempts || 0) + 1
            result.orderStage = orderResult.stage
            if (!orderResult.success && orderResult.cooldownMs) {
              orderCooldownUntil = Date.now() + orderResult.cooldownMs
            }
            if (orderResult.success) {
              result.orderTriggered = true
              result.orderSn = orderResult.orderSn
              result.orderAmount = orderResult.orderAmount
              result.orderExpireAt = orderResult.expireAt
              result.orderSkuLabel = orderResult.skuLabel
              result.orderItems = orderResult.items
              result.orderNum = orderResult.num
              const email = await sendEmail({
                to: record.userEmail,
                subject: `✅ 价格到点已自动下单（收藏夹监控）：${result.productName}（订单 ${orderResult.orderSn}）`,
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
                  targetPrice,
                }),
              })
              result.emailSent = email.success
            } else {
              result.orderError = orderResult.message
              result.orderUncertain = orderResult.uncertain
              ctx.log(`收藏夹通道价格下单失败：${orderResult.message}`, 'warn')
              result.emailSent = (
                await sendEmail({
                  to: record.userEmail,
                  subject: `⚠️ 价格到点下单失败（收藏夹监控）：${result.productName}`,
                  html: createAutoOrderFailedTemplate({
                    productName: result.productName,
                    message: orderResult.message || '未知原因',
                    stage: orderResult.stage,
                    uncertain: orderResult.uncertain,
                  }),
                })
              ).success
              applyPriceResult(record, state, result, ctx)
              ctx.save()
              return
            }
          }
        }

        applyPriceResult(record, state, result, ctx)
        ctx.save()

        // 下单成功 → 任务完成；否则继续盯（价格未到 / 无货 / 重试中）
        if (result.orderSn) finish()
      } catch (error) {
        result.error = error instanceof Error ? error.message : String(error)
        applyPriceResult(record, state, result, ctx)
        ctx.save()
      }
    }

    // restart / restore 的任务不会走 create 里的 ensureCollected，且本 definition 的 restart
    // 不保留 collection 字段；商品很可能已被上个同货号任务 finish() 时的 releaseCollected
    // 移出收藏夹。引擎每轮从账号收藏夹列表拉商品，商品不在列表里就永远推不到 handler，
    // checkCount 会一直停在 0。所以订阅前必须先 ensureCollected 把商品重新加回收藏夹引擎。
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

    const durationSec = ctx.durationSeconds ?? state.config.duration
    const durationTimer = setTimeout(
      () => finish(),
      durationSec && durationSec > 0 ? durationSec * 1000 : 24 * 60 * 60 * 1000
    )
    if (typeof durationTimer.unref === 'function') durationTimer.unref()
  })

  return { controller, promise }
}
