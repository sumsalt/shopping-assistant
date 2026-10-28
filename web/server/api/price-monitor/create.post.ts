/**
 * 创建价格监控任务 API
 * POST /api/price-monitor/create
 *
 * 说明：
 * 1. 只监控登录态（uid + token）下的 shop_price，创建时同步拉一次基线，凭证异常直接失败
 * 2. 检测间隔硬下限 60 秒
 * 3. 多商品串行，商品之间随机间隔 10~20 秒
 */

import {
  createCancellablePriceMonitor,
  getAdapter,
  MIN_PRICE_MONITOR_INTERVAL,
  DEFAULT_PRICE_MONITOR_INTERVAL,
  DEFAULT_NOTIFY_COOLDOWN,
  DEFAULT_MIN_PRICE_DELTA,
  DEFAULT_PRODUCT_GAP_MIN,
  DEFAULT_PRODUCT_GAP_MAX,
  type AdapterConfig,
  type PriceChangeInfo,
  type PriceMonitorConfig,
  type PriceMonitorTask,
  type PriceNotifyOn,
  type PriceSnapshot,
} from '@core'
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'

/** 单次最多创建的商品数量 */
const MAX_PRODUCTS_PER_TASK = 20

/** 创建任务时建立基线，商品之间仅等待 200ms，避免创建请求过慢 */
const BASELINE_GAP_MS = 200

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
}

/** 价格变化记录 */
export interface PriceChangeRecord extends PriceChangeInfo {
  emailSent: boolean
  currency?: string
}

/** 价格监控任务存储（生产环境应使用数据库或 Redis） */
export const priceMonitorTasks = new Map<
  string,
  {
    id: string
    userId: string
    userEmail: string
    products: PriceProductInfo[]
    config: PriceMonitorConfig
    status: 'running' | 'stopped' | 'completed'
    createdAt: Date
    checkCount: number
    detectedCount: number
    lastError?: string
    changes: PriceChangeRecord[]
    snapshots: Record<string, PriceSnapshotSummary>
    controller?: AbortController
  }
>()

/** 生成任务 ID */
const generateTaskId = (): string => {
  return `price_task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/** 睡眠 */
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/**
 * 启动价格监控任务
 */
export const startPriceMonitorTask = (
  taskId: string,
  tasks: PriceMonitorTask[],
  config: PriceMonitorConfig
): { controller: AbortController; promise: Promise<unknown> } => {
  const { controller, promise } = createCancellablePriceMonitor(
    tasks,
    config,
    (progress) => {
      const task = priceMonitorTasks.get(taskId)
      if (!task) {
        return
      }
      task.checkCount = progress.checkCount
      task.detectedCount = progress.detectedCount
    },
    (result) => {
      const task = priceMonitorTasks.get(taskId)
      if (!task) {
        return
      }

      const checkedAt = Date.now()

      if (result.currentPrice !== undefined) {
        task.snapshots[result.productId] = {
          productId: result.productId,
          productName: result.productName,
          shopPrice: result.currentPrice,
          checkedAt,
        }
      }

      if (result.error) {
        task.lastError = result.error
      }

      if (result.detected && result.changeInfo) {
        task.changes.unshift({
          ...result.changeInfo,
          emailSent: Boolean(result.emailSent),
        })
        // 只保留最近 50 条，避免内存无限增长
        task.changes = task.changes.slice(0, 50)
      }
    }
  )

  const storedTask = priceMonitorTasks.get(taskId)
  if (storedTask) {
    storedTask.controller = controller
  }

  promise
    .then(() => {
      const task = priceMonitorTasks.get(taskId)
      if (task) {
        task.status = 'completed'
        task.controller = undefined
      }
    })
    .catch((error) => {
      console.error(`[价格监控] 任务 ${taskId} 结束:`, error)
      const task = priceMonitorTasks.get(taskId)
      if (task) {
        task.status = 'stopped'
        task.lastError = error instanceof Error ? error.message : String(error)
        task.controller = undefined
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

    // 校验商品列表
    const products: PriceProductInfo[] = Array.isArray(body?.products) ? body.products : []
    if (products.length === 0) {
      return createErrorResponse(ErrorCode.INVALID_PARAMS, '监控商品列表不能为空')
    }

    if (products.length > MAX_PRODUCTS_PER_TASK) {
      return createErrorResponse(
        ErrorCode.INVALID_PARAMS,
        `单次最多创建 ${MAX_PRODUCTS_PER_TASK} 个商品的价格监控`
      )
    }

    for (const product of products) {
      if (!product || !product.productId) {
        return createErrorResponse(ErrorCode.INVALID_PARAMS, '商品必须包含有效的 productId')
      }
    }

    const productIds = products.map(product => String(product.productId))

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

    // 校验重复任务
    const duplicateTask = Array.from(priceMonitorTasks.values()).find(
      task =>
        task.userId === currentUser.username &&
        task.status === 'running' &&
        task.products.some(product => productIds.includes(String(product.productId)))
    )

    if (duplicateTask) {
      const duplicatedIds = duplicateTask.products
        .map(product => String(product.productId))
        .filter(id => productIds.includes(id))

      return createErrorResponse(
        ErrorCode.DUPLICATE,
        `商品 ${duplicatedIds.join(', ')} 已在价格监控中`
      )
    }

    // 同步建立基线：凭证失效 / 商品不存在时直接失败，不创建“跑不起来”的任务
    const adapter = getAdapter('yishou', adapterConfig)
    const initialSnapshots: Record<string, PriceSnapshot> = {}

    for (let index = 0; index < products.length; index++) {
      const product = products[index]

      try {
        initialSnapshots[String(product.productId)] = await adapter.getPriceInfo(
          String(product.productId)
        )
      } catch (error) {
        return createErrorResponse(
          getErrorCode(error),
          error instanceof Error ? error.message : '获取商品价格失败'
        )
      }

      if (index < products.length - 1) {
        await sleep(BASELINE_GAP_MS)
      }
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
      notifyCooldown: normalizePositiveNumber(
        body?.config?.notifyCooldown,
        DEFAULT_NOTIFY_COOLDOWN
      ),
      productGapMin: DEFAULT_PRODUCT_GAP_MIN,
      productGapMax: DEFAULT_PRODUCT_GAP_MAX,
      adapterConfig,
      initialSnapshots,
    }

    // 构建监控任务
    const tasks: PriceMonitorTask[] = products.map((product) => {
      const snapshot = initialSnapshots[String(product.productId)]

      return {
        request: {
          platform: 'yishou',
          productId: String(product.productId),
        },
        recipient: currentUser.email,
        subject: `价格变动提醒：${snapshot?.productName || product.productName || product.productId}`,
        productName: product.productName || snapshot?.productName,
        productImage: product.productImage || snapshot?.productImage,
      }
    })

    // 生成任务 ID
    const taskId = generateTaskId()

    // 存储任务信息
    const snapshots: Record<string, PriceSnapshotSummary> = {}
    products.forEach((product) => {
      const snapshot = initialSnapshots[String(product.productId)]
      if (snapshot) {
        snapshots[String(product.productId)] = {
          productId: snapshot.productId,
          productName: snapshot.productName,
          shopPrice: snapshot.shopPrice,
          checkedAt: snapshot.capturedAt,
        }
      }
    })

    priceMonitorTasks.set(taskId, {
      id: taskId,
      userId: currentUser.username,
      userEmail: currentUser.email,
      products,
      config,
      status: 'running',
      createdAt: new Date(),
      checkCount: 0,
      detectedCount: 0,
      changes: [],
      snapshots,
    })

    // 启动后台监控（基线已建立，只有真实价格变动才会通知）
    startPriceMonitorTask(taskId, tasks, config)

    return createSuccessResponse({
      taskId,
      status: 'started',
      message: '价格监控任务已启动',
      productCount: products.length,
      interval: config.interval,
      duration: config.duration,
      snapshots,
    })
  } catch (error: unknown) {
    console.error('创建价格监控任务失败:', error)
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return createErrorResponse(getErrorCode(error), errorMessage)
  }
})
