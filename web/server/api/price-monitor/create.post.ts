/**
 * 创建价格监控任务 API
 * POST /api/price-monitor/create
 *
 * 说明：
 * 1. 只监控登录态（uid + token）下的 shop_price，创建时同步拉一次基线，凭证异常直接失败
 * 2. 检测间隔硬下限 60 秒
 * 3. 一个任务只监控一个商品
 */

import {
  createCancellablePriceMonitor,
  getAdapter,
  MIN_PRICE_MONITOR_INTERVAL,
  DEFAULT_PRICE_MONITOR_INTERVAL,
  DEFAULT_MIN_PRICE_DELTA,
  type AdapterConfig,
  type CouponInfo,
  type CouponNewInfo,
  type PriceChangeInfo,
  type PriceMonitorConfig,
  type PriceMonitorTask,
  type PriceNotifyOn,
  type PriceSnapshot,
} from '@core'
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { persistTask, persistTaskSoon, type StoredTaskBase } from '../../utils/taskStore'

/** 商品信息 */
interface PriceProductInfo {
  productId: string
  productName?: string
  productImage?: string
}

/** 最近一次快照（用于列表展示） */
export interface PriceSnapshotSummary {
  productId: string
  productName: string
  shopPrice: number
  checkedAt: number
  /** 最近一次快照的红包列表（续跑时重建基线用） */
  coupons?: CouponInfo[]
  /** 最近一次快照的满减券列表 */
  couponsNew?: CouponNewInfo[]
}

/** 价格变化记录 */
export interface PriceChangeRecord extends PriceChangeInfo {
  emailSent: boolean
  currency?: string
}

/** 优惠券变化记录 */
export interface PriceCouponChangeRecord {
  added: Array<{ kind: string; label: string }>
  removed: Array<{ kind: string; label: string }>
  detectedAt: number
  emailSent: boolean
}

/** 价格监控任务记录 */
export interface PriceMonitorTaskRecord extends StoredTaskBase {
  product: PriceProductInfo
  config: PriceMonitorConfig
  checkCount: number
  detectedCount: number
  lastError?: string
  changes: PriceChangeRecord[]
  couponChanges: PriceCouponChangeRecord[]
  snapshot?: PriceSnapshotSummary
  controller?: AbortController
}

/** 价格监控任务存储：内存作为运行时副本，落盘由 taskStore 负责 */
export const priceMonitorTasks = new Map<string, PriceMonitorTaskRecord>()

/** 生成任务 ID */
const generateTaskId = (): string => {
  return `price_task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * 启动价格监控任务
 */
export const startPriceMonitorTask = (
  taskId: string,
  task: PriceMonitorTask,
  config: PriceMonitorConfig
): { controller: AbortController; promise: Promise<unknown> } => {
  const { controller, promise } = createCancellablePriceMonitor(
    task,
    config,
    (progress) => {
      const record = priceMonitorTasks.get(taskId)
      if (!record) {
        return
      }
      record.checkCount = progress.checkCount
      record.detectedCount = progress.detectedCount
      persistTaskSoon('price', record)
    },
    (result) => {
      const record = priceMonitorTasks.get(taskId)
      if (!record) {
        return
      }

      const checkedAt = Date.now()

      if (result.currentPrice !== undefined) {
        record.snapshot = {
          productId: result.productId,
          productName: result.productName,
          shopPrice: result.currentPrice,
          checkedAt,
          coupons: result.coupons,
          couponsNew: result.couponsNew,
        }
      }

      if (result.error) {
        record.lastError = result.error
      }

      if (result.detected && result.changeInfo) {
        record.changes.unshift({
          ...result.changeInfo,
          emailSent: Boolean(result.emailSent),
        })
        // 只保留最近 50 条，避免内存无限增长
        record.changes = record.changes.slice(0, 50)
      }

      if (result.detected && result.couponChangeInfo) {
        record.couponChanges = record.couponChanges ?? []
        record.couponChanges.unshift({
          added: result.couponChangeInfo.added,
          removed: result.couponChangeInfo.removed,
          detectedAt: result.couponChangeInfo.detectedAt,
          emailSent: Boolean(result.emailSent),
        })
        record.couponChanges = record.couponChanges.slice(0, 50)
      }

      persistTaskSoon('price', record)
    }
  )

  const stored = priceMonitorTasks.get(taskId)
  if (stored) {
    stored.controller = controller
  }

  promise
    .then(() => {
      const record = priceMonitorTasks.get(taskId)
      if (record) {
        record.status = 'completed'
        record.controller = undefined
        persistTask('price', record)
      }
    })
    .catch((error) => {
      console.error(`[价格监控] 任务 ${taskId} 结束:`, error)
      const record = priceMonitorTasks.get(taskId)
      if (record) {
        record.status = 'stopped'
        record.lastError = error instanceof Error ? error.message : String(error)
        record.controller = undefined
        persistTask('price', record)
      }
    })

  return { controller, promise }
}

/**
 * 从错误中提取错误码
 */
const getErrorCode = (error: unknown): string => {
  if (error && typeof error === 'object' && 'type' in error) {
    return String((error as { type: unknown }).type)
  }
  return ErrorCode.UNKNOWN_ERROR
}

/**
 * 归一化通知条件
 */
const normalizeNotifyOn = (value: unknown): PriceNotifyOn => {
  return value === 'drop' || value === 'rise' ? value : 'any'
}

/**
 * 归一化正数配置
 */
const normalizePositiveNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export default defineEventHandler(async (event) => {
  try {
    // 获取当前用户
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    // 获取请求体
    const body = await readBody(event)

    // 校验商品（一个任务只能有一个商品）
    const product = body?.product as PriceProductInfo | undefined
    if (!product || !product.productId) {
      return createErrorResponse(
        ErrorCode.INVALID_PARAMS,
        '请指定要监控的商品（一个任务只能监控一个商品）'
      )
    }

    const productId = String(product.productId)

    // 校验间隔（硬下限 60 秒）
    const interval = Number(body?.config?.interval ?? DEFAULT_PRICE_MONITOR_INTERVAL)
    if (!Number.isFinite(interval) || interval < MIN_PRICE_MONITOR_INTERVAL) {
      return createErrorResponse(
        ErrorCode.INVALID_PARAMS,
        `检测间隔不能小于 ${MIN_PRICE_MONITOR_INTERVAL} 秒`
      )
    }

    // 校验时长
    const duration = body?.config?.duration === undefined ? undefined : Number(body.config.duration)
    if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0)) {
      return createErrorResponse(ErrorCode.INVALID_PARAMS, '监控时长必须大于 0')
    }

    // 校验登录态
    const adapterConfig: AdapterConfig = body?.config?.adapterConfig || {}
    if (!adapterConfig.uid || !adapterConfig.token) {
      return createErrorResponse(
        ErrorCode.AUTH_REQUIRED,
        '价格监控需要登录态，请先在系统配置中填写 uid 和 token'
      )
    }

    // 校验重复任务（同一商品不能同时被两个运行中的任务监控）
    const duplicateTask = Array.from(priceMonitorTasks.values()).find(
      task =>
        task.userId === currentUser.username &&
        task.status === 'running' &&
        String(task.product?.productId) === productId
    )

    if (duplicateTask) {
      return createErrorResponse(ErrorCode.DUPLICATE, `商品 ${productId} 已在价格监控中`)
    }

    // 同步建立基线：凭证失效 / 商品不存在时直接失败，不创建“跑不起来”的任务
    const adapter = getAdapter('yishou', adapterConfig)
    let initialSnapshot: PriceSnapshot

    try {
      initialSnapshot = await adapter.getPriceInfo(productId)
    } catch (error) {
      return createErrorResponse(
        getErrorCode(error),
        error instanceof Error ? error.message : '获取商品价格失败'
      )
    }

    // 构建监控配置
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
    }

    // 构建监控任务
    const task: PriceMonitorTask = {
      request: {
        platform: 'yishou',
        productId,
      },
      recipient: currentUser.email,
      productName: product.productName || initialSnapshot.productName,
      productImage: product.productImage || initialSnapshot.productImage,
    }

    // 生成任务 ID
    const taskId = generateTaskId()

    // 最近一次快照（列表展示用）
    const snapshot: PriceSnapshotSummary = {
      productId: initialSnapshot.productId,
      productName: initialSnapshot.productName,
      shopPrice: initialSnapshot.shopPrice,
      checkedAt: initialSnapshot.capturedAt,
      coupons: initialSnapshot.coupons,
      couponsNew: initialSnapshot.couponsNew,
    }

    const taskRecord: PriceMonitorTaskRecord = {
      id: taskId,
      userId: currentUser.username,
      userEmail: currentUser.email,
      product,
      config,
      status: 'running',
      createdAt: new Date(),
      checkCount: 0,
      detectedCount: 0,
      changes: [],
      couponChanges: [],
      snapshot,
    }

    priceMonitorTasks.set(taskId, taskRecord)
    persistTask('price', taskRecord)

    // 启动后台监控（基线已建立，只有真实价格变动才会通知）
    // 让任务内的请求带上闸门上下文（用户手动操作不带上下文，不受限流）
    config.taskId = taskId
    startPriceMonitorTask(taskId, task, config)

    return createSuccessResponse({
      taskId,
      status: 'started',
      message: '价格监控任务已启动',
      interval: config.interval,
      duration: config.duration,
      snapshot,
    })
  } catch (error: unknown) {
    console.error('创建价格监控任务失败:', error)
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return createErrorResponse(getErrorCode(error), errorMessage)
  }
})
