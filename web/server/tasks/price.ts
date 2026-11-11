/**
 * 价格监控任务
 *
 * 只监控登录态下的拿货价；创建时同步拉一次基线，凭证异常直接失败。
 */

import {
  getAdapter,
  createCancellablePriceMonitor,
  MIN_PRICE_MONITOR_INTERVAL,
  DEFAULT_PRICE_MONITOR_INTERVAL,
  DEFAULT_MIN_PRICE_DELTA,
  MAX_AUTO_ORDER_NUM,
  type AdapterConfig,
  type AutoOrderItem,
  type CouponInfo,
  type CouponNewInfo,
  type PriceAutoOrderConfig,
  type PriceChangeInfo,
  type PriceMonitorConfig,
  type PriceMonitorTask,
  type PriceNotifyOn,
  type PriceSnapshot,
} from '@core'
import { ErrorCode } from '../utils/response'
import { persistTask, type StoredTaskBase } from '../utils/taskStore'
import { TaskRegistry } from './registry'
import { TaskApiError, type StartOverrides, type TaskDefinition } from './types'

export interface PriceProductInfo {
  productId: string
  productName?: string
  productImage?: string
}

/** 最近一次快照（用于列表展示与续跑基线） */
export interface PriceSnapshotSummary {
  productId: string
  productName: string
  shopPrice: number
  checkedAt: number
  coupons?: CouponInfo[]
  couponsNew?: CouponNewInfo[]
}

export interface PriceChangeRecord extends PriceChangeInfo {
  emailSent: boolean
  currency?: string
}

export interface PriceCouponChangeRecord {
  added: Array<{ kind: string; label: string }>
  removed: Array<{ kind: string; label: string }>
  detectedAt: number
  emailSent: boolean
}

/** 价格到点自动下单的成功记录 */
export interface PriceOrderRecord {
  orderSn: string
  orderAmount?: number
  skuLabel?: string
  items?: AutoOrderItem[]
  num?: number
  expireAt?: number
  orderedAt: number
}

export interface PriceTaskRecord extends StoredTaskBase {
  product: PriceProductInfo
  config: PriceMonitorConfig
  checkCount: number
  detectedCount: number
  lastError?: string
  changes: PriceChangeRecord[]
  couponChanges: PriceCouponChangeRecord[]
  snapshot?: PriceSnapshotSummary
  /** 已成功自动下单（价格到点触发） */
  order?: PriceOrderRecord
  /** 最近一次自动下单失败原因 */
  orderError?: string
  controller?: AbortController
}

export const priceTasks = new TaskRegistry<PriceTaskRecord>('price')

const getErrorCode = (error: unknown): string =>
  error && typeof error === 'object' && 'type' in error
    ? String((error as { type: unknown }).type)
    : ErrorCode.UNKNOWN_ERROR

const normalizeNotifyOn = (value: unknown): PriceNotifyOn =>
  value === 'drop' || value === 'rise' ? value : 'any'

const normalizePositiveNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/** 校验并归一化「价格到点自动下单」配置 */
const readAutoOrder = (raw: unknown): PriceAutoOrderConfig | undefined => {
  const source = raw as
    | {
        enabled?: unknown
        targetPrice?: unknown
        num?: unknown
        payTool?: unknown
        addressId?: unknown
        skus?: unknown
      }
    | undefined

  if (!source?.enabled) {
    return undefined
  }

  const targetPrice = Number(source.targetPrice)
  if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
    throw new TaskApiError(ErrorCode.INVALID_PARAMS, '价格到点自动下单需要设置大于 0 的目标价')
  }

  const rawNum = Number(source.num ?? 1)
  if (!Number.isFinite(rawNum) || rawNum < 1) {
    throw new TaskApiError(ErrorCode.INVALID_PARAMS, '购买件数需大于 0')
  }

  const addressId = source.addressId ? String(source.addressId) : ''
  const skus = Array.isArray(source.skus)
    ? source.skus.map(item => String(item ?? '').trim()).filter(Boolean).slice(0, 50)
    : []

  return {
    enabled: true,
    // 目标价保留两位小数，避免前端传 99.999 这种值
    targetPrice: Math.round(targetPrice * 100) / 100,
    num: Math.min(Math.floor(rawNum), MAX_AUTO_ORDER_NUM),
    payTool: source.payTool === '1' ? '1' : '4',
    ...(addressId ? { addressId } : {}),
    ...(skus.length > 0 ? { skus } : {}),
  }
}

/** 用落盘快照重建监控基线，避免重启后把已发生过的变化再提醒一次 */
const rebuildSnapshot = (summary: PriceSnapshotSummary | undefined, image?: string): PriceSnapshot | undefined => {
  if (!summary) return undefined
  return {
    platform: 'yishou',
    productId: String(summary.productId),
    productName: summary.productName,
    productNo: '',
    productImage: image || '',
    productUrl: '',
    shopPrice: summary.shopPrice,
    authState: 'logged_in',
    coupons: summary.coupons ?? [],
    couponsNew: summary.couponsNew ?? [],
    capturedAt: summary.checkedAt,
  }
}

export const priceDefinition: TaskDefinition<PriceTaskRecord> = {
  kind: 'price',
  label: '价格监控',
  // 比价必须用登录态拿货价，游客价（单独购买价）口径不同
  needsAuth: () => true,
  removeOriginalOnRestart: true,

  async create({ body, user }) {
    const product = body?.product as PriceProductInfo | undefined
    if (!product?.productId) {
      throw new TaskApiError(
        ErrorCode.INVALID_PARAMS,
        '请指定要监控的商品（一个任务只能监控一个商品）'
      )
    }

    const productId = String(product.productId)

    const interval = Number(body?.config?.interval ?? DEFAULT_PRICE_MONITOR_INTERVAL)
    if (!Number.isFinite(interval) || interval < MIN_PRICE_MONITOR_INTERVAL) {
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

    const adapterConfig: AdapterConfig = body?.config?.adapterConfig || {}
    if (!adapterConfig.uid || !adapterConfig.token) {
      throw new TaskApiError(
        ErrorCode.AUTH_REQUIRED,
        '价格监控需要登录态，请先在账号管理中选择带登录态的账号'
      )
    }

    const duplicate = priceTasks
      .all()
      .find(
        task =>
          task.userId === user.username &&
          task.status === 'running' &&
          String(task.product?.productId) === productId
      )
    if (duplicate) {
      throw new TaskApiError(ErrorCode.DUPLICATE, `商品 ${productId} 已在价格监控中`)
    }

    // 同步建立基线：凭证失效 / 商品不存在时直接失败，不创建「跑不起来」的任务
    let initialSnapshot: PriceSnapshot
    try {
      initialSnapshot = await getAdapter('yishou', adapterConfig).getPriceInfo(productId)
    } catch (error) {
      throw new TaskApiError(
        getErrorCode(error),
        error instanceof Error ? error.message : '获取商品价格失败'
      )
    }

    const autoOrder = readAutoOrder(body?.config?.autoOrder)

    const config: PriceMonitorConfig = {
      interval,
      duration,
      notifyOn: normalizeNotifyOn(body?.config?.notifyOn),
      minPriceDelta: normalizePositiveNumber(
        body?.config?.minPriceDelta,
        DEFAULT_MIN_PRICE_DELTA
      ),
      adapterConfig,
      initialSnapshot,
      ...(autoOrder ? { autoOrder } : {}),
    }

    const snapshot: PriceSnapshotSummary = {
      productId: initialSnapshot.productId,
      productName: initialSnapshot.productName,
      shopPrice: initialSnapshot.shopPrice,
      checkedAt: initialSnapshot.capturedAt,
      coupons: initialSnapshot.coupons,
      couponsNew: initialSnapshot.couponsNew,
    }

    return {
      product: {
        productId,
        productName: product.productName || initialSnapshot.productName,
        productImage: product.productImage || initialSnapshot.productImage,
      },
      config,
      checkCount: 0,
      detectedCount: 0,
      changes: [],
      couponChanges: [],
      snapshot,
    }
  },

  start(record, overrides: StartOverrides = {}) {
    const task: PriceMonitorTask = {
      request: { platform: 'yishou', productId: String(record.product.productId) },
      recipient: record.userEmail,
      productName: record.product.productName || record.snapshot?.productName,
      productImage: record.product.productImage,
    }

    const config: PriceMonitorConfig = {
      ...record.config,
      taskId: record.id,
      ...(overrides.duration !== undefined ? { duration: overrides.duration } : {}),
      ...(overrides.initialCheckCount !== undefined
        ? { initialCheckCount: overrides.initialCheckCount }
        : {}),
      ...(overrides.initialDetectedCount !== undefined
        ? { initialDetectedCount: overrides.initialDetectedCount }
        : {}),
    }

    priceTasks.launch(
      record,
      () =>
        createCancellablePriceMonitor(
          task,
          config,
          progress => {
            record.checkCount = progress.checkCount
            record.detectedCount = progress.detectedCount
            priceTasks.touch(record)
          },
          result => {
            if (result.currentPrice !== undefined) {
              record.snapshot = {
                productId: result.productId,
                productName: result.productName,
                shopPrice: result.currentPrice,
                checkedAt: Date.now(),
                coupons: result.coupons,
                couponsNew: result.couponsNew,
              }
            }

            // 每轮覆盖：成功轮的 error 为空会顺手清掉上一轮错误，
            // 否则一次 502 会一直挂在卡片上
            record.lastError = result.error

            if (result.orderSn) {
              record.order = {
                orderSn: result.orderSn,
                orderAmount: result.orderAmount,
                skuLabel: result.orderSkuLabel,
                items: result.orderItems,
                num: result.orderNum,
                expireAt: result.orderExpireAt,
                orderedAt: Date.now(),
              }
            }
            record.orderError = result.orderError

            if (result.detected && result.changeInfo) {
              record.changes.unshift({ ...result.changeInfo, emailSent: Boolean(result.emailSent) })
              record.changes = record.changes.slice(0, 50)
            }

            if (result.detected && result.couponChangeInfo) {
              record.couponChanges.unshift({
                added: result.couponChangeInfo.added,
                removed: result.couponChangeInfo.removed,
                detectedAt: result.couponChangeInfo.detectedAt,
                emailSent: Boolean(result.emailSent),
              })
              record.couponChanges = record.couponChanges.slice(0, 50)
            }

            priceTasks.touch(record)
          }
        ),
      error => {
        record.lastError = error instanceof Error ? error.message : String(error)
      }
    )
  },

  restart(original) {
    return {
      product: original.product,
      config: {
        ...original.config,
        // 不带初始快照，由监控循环重新建立基线
        initialSnapshot: undefined,
      },
      checkCount: 0,
      detectedCount: 0,
      changes: [],
      couponChanges: [],
      snapshot: original.snapshot,
    }
  },

  listView(task) {
    return {
      id: task.id,
      product: task.product,
      status: task.status,
      interval: task.config.interval,
      duration: task.config.duration,
      notifyOn: task.config.notifyOn,
      minPriceDelta: task.config.minPriceDelta,
      autoOrder: task.config.autoOrder ?? null,
      createdAt: task.createdAt,
      checkCount: task.checkCount,
      detectedCount: task.detectedCount,
      lastError: task.lastError,
      orderError: task.orderError,
      order: task.order ?? null,
      snapshot: task.snapshot,
      changes: task.changes,
    }
  },

  statusView(task) {
    return {
      id: task.id,
      product: task.product,
      status: task.status,
      interval: task.config.interval,
      duration: task.config.duration,
      notifyOn: task.config.notifyOn,
      minPriceDelta: task.config.minPriceDelta,
      autoOrder: task.config.autoOrder ?? null,
      createdAt: task.createdAt,
      checkCount: task.checkCount,
      detectedCount: task.detectedCount,
      lastError: task.lastError,
      orderError: task.orderError,
      order: task.order ?? null,
      snapshot: task.snapshot,
      changes: task.changes,
    }
  },

  createdView(record, action) {
    return {
      taskId: record.id,
      status: 'started',
      message: action === 'restarted' ? '价格监控任务已重新发起' : '价格监控任务已启动',
      interval: record.config.interval,
      duration: record.config.duration,
      snapshot: record.snapshot,
    }
  },

  restore(task, remainingSeconds) {
    if (Number.isFinite(remainingSeconds) && remainingSeconds <= 0) {
      task.status = 'completed'
      persistTask('price', task)
      return false
    }

    task.status = 'running'
    task.controller = undefined
    task.changes = Array.isArray(task.changes) ? task.changes : []
    task.couponChanges = Array.isArray(task.couponChanges) ? task.couponChanges : []

    // 续跑用最后一次落盘的快照做基线（创建时的价格可能已经过时），必须在 start 前替换
    task.config.initialSnapshot =
      rebuildSnapshot(task.snapshot, task.product.productImage) ?? task.config.initialSnapshot

    priceTasks.add(task)

    priceDefinition.start(task, {
      resume: true,
      duration: Number.isFinite(remainingSeconds) ? Math.floor(remainingSeconds) : undefined,
      initialCheckCount: task.checkCount ?? 0,
      initialDetectedCount: task.detectedCount ?? 0,
    })

    return true
  },
}
