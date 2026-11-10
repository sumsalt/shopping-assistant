/**
 * 创建监控任务 API
 * POST /api/monitor/create
 *
 * 一个任务只监控一个商品；需要监控多个商品时由前端分别创建多个任务。
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
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { persistTask, persistTaskSoon, type StoredTaskBase } from '../../utils/taskStore'

// 商品信息接口
interface ProductInfo {
  productId: string
  productName: string
  productImage?: string
}

// 监控任务记录
export interface MonitorTaskRecord extends StoredTaskBase {
  product: ProductInfo
  config: StockMonitorConfig
  result?: MonitorResult
  controller?: AbortController
}

// 监控任务存储：内存作为运行时副本，落盘由 taskStore 负责
export const monitorTasks = new Map<string, MonitorTaskRecord>()

// 生成任务 ID
const generateTaskId = (): string => {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * 启动监控任务
 */
export const startMonitorTask = (
  taskId: string,
  task: MonitorTask,
  config: StockMonitorConfig
): { controller: AbortController; promise: Promise<MonitorResult> } => {
  const taskData = monitorTasks.get(taskId)
  if (taskData) {
    // 续跑时保留已有结果，避免重启后进度被清空
    if (!taskData.result) {
      taskData.result = {
        productId: task.request.productId,
        productName: '',
        detected: false,
        checkCount: 0,
        errorCount: 0,
      }
    }
    persistTaskSoon('stock', taskData)
  }

  // 在后台启动监控任务（不等待结果）
  const { controller, promise } = createCancellableMonitor(
    task,
    config,
    (progress) => {
      console.log(`任务 ${taskId} 进度:`, progress)
    },
    (result) => {
      const record = monitorTasks.get(taskId)
      if (record) {
        record.result = result
        persistTaskSoon('stock', record)
      }
    }
  )

  // 保存控制器以便停止任务
  const record = monitorTasks.get(taskId)
  if (record) {
    record.controller = controller
  }

  promise
    .then((result) => {
      const current = monitorTasks.get(taskId)
      if (current) {
        current.status = 'completed'
        current.result = result
        current.controller = undefined
        persistTask('stock', current)
      }
    })
    .catch((error) => {
      console.error(`任务 ${taskId} 失败:`, error)
      const current = monitorTasks.get(taskId)
      if (current) {
        current.status = 'stopped'
        current.controller = undefined
        persistTask('stock', current)
      }
    })

  return { controller, promise }
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

    // 验证必需参数（一个任务只接受一个商品）
    const product = body?.product as ProductInfo | undefined
    if (!product || !product.productId) {
      return createErrorResponse(
        ErrorCode.INVALID_PARAMS,
        '请指定要监控的商品（一个任务只能监控一个商品）'
      )
    }

    // 构建监控任务
    const task: MonitorTask = {
      request: {
        platform: 'yishou',
        productId: product.productId,
      },
      recipient: currentUser.email,
      subject: `🔔 ${product.productName} 已到货`,
      productImage: product.productImage,
    }

    // 校验间隔（硬下限 2 秒）
    const rawInterval = body.config?.interval
    const interval =
      rawInterval === undefined || rawInterval === null || rawInterval === ''
        ? MIN_STOCK_MONITOR_INTERVAL
        : Number(rawInterval)
    if (!Number.isFinite(interval) || interval < MIN_STOCK_MONITOR_INTERVAL) {
      return createErrorResponse(
        ErrorCode.INVALID_PARAMS,
        `检测间隔不能小于 ${MIN_STOCK_MONITOR_INTERVAL} 秒`
      )
    }

    const adapterConfig = body.config?.adapterConfig || {}

    // 自动下单配置校验：需要登录态、件数合法；没有凭证时直接拒绝，避免任务启动后才失败
    let autoOrder: AutoOrderConfig | undefined
    const rawAutoOrder = body.config?.autoOrder

    if (rawAutoOrder?.enabled) {
      if (!adapterConfig.uid || !adapterConfig.token) {
        return createErrorResponse(
          ErrorCode.AUTH_REQUIRED,
          '自动下单需要一手登录态，请先在系统配置中填写 uid 和 token'
        )
      }

      const num = Number(rawAutoOrder.num ?? 1)
      if (!Number.isFinite(num) || num < 1 || num > MAX_AUTO_ORDER_NUM) {
        return createErrorResponse(
          ErrorCode.INVALID_PARAMS,
          `购买件数需在 1~${MAX_AUTO_ORDER_NUM} 之间`
        )
      }

      autoOrder = {
        enabled: true,
        num: Math.floor(num),
        payTool: rawAutoOrder.payTool === '1' ? '1' : '4',
        ...(rawAutoOrder.addressId ? { addressId: String(rawAutoOrder.addressId) } : {}),
      }

      // 同一商品只允许存在一个运行中的自动下单任务，防止重复建单
      const duplicate = Array.from(monitorTasks.values()).find(
        task =>
          task.userId === currentUser.username &&
          task.status === 'running' &&
          task.config.autoOrder?.enabled &&
          String(task.product.productId) === String(product.productId)
      )

      if (duplicate) {
        return createErrorResponse(
          ErrorCode.INVALID_PARAMS,
          '该商品已有自动下单任务在运行，请先在任务列表里删除'
        )
      }
    }

    // 构建监控配置
    const config: StockMonitorConfig = {
      interval,
      duration: body.config?.duration || 3 * 60 * 60,
      adapterConfig,
      ...(autoOrder ? { autoOrder } : {}),
    }

    // 生成任务 ID
    const taskId = generateTaskId()

    // 存储任务信息
    const taskRecord: MonitorTaskRecord = {
      id: taskId,
      userId: currentUser.username,
      userEmail: currentUser.email,
      product,
      config,
      status: 'running',
      createdAt: new Date(),
    }

    monitorTasks.set(taskId, taskRecord)
    persistTask('stock', taskRecord)

    // 启动监控任务
    // 让任务内的请求带上闸门上下文（用户手动操作不带上下文，不受限流）
    config.taskId = taskId
    startMonitorTask(taskId, task, config)

    // 返回任务 ID
    return createSuccessResponse({
      taskId,
      status: 'started',
      message: '监控任务已启动',
      interval: config.interval,
      duration: config.duration,
    })
  } catch (error: unknown) {
    console.error('创建监控任务失败:', error)
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return createErrorResponse(ErrorCode.UNKNOWN_ERROR, errorMessage)
  }
})
