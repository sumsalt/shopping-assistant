/**
 * 创建监控任务 API
 * POST /api/monitor/create
 */

import { createCancellableMonitor, type MonitorTask, type StockMonitorConfig } from '@core'
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
  products: ProductInfo[]
  config: StockMonitorConfig
  results?: any[]
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
  tasks: MonitorTask[],
  config: StockMonitorConfig
): { controller: AbortController; promise: Promise<any[]> } => {
  // 初始化任务结果数组，为每个商品创建初始结果
  const taskData = monitorTasks.get(taskId)
  if (taskData) {
    // 续跑时保留已有结果，避免重启后进度被清空
    if (!taskData.results || taskData.results.length === 0) {
      taskData.results = tasks.map(task => ({
        productId: task.request.productId,
        productName: '',
        detected: false,
        checkCount: 0,
        errorCount: 0,
      }))
    }
    persistTaskSoon('stock', taskData)
  }

  // 在后台启动监控任务（不等待结果）
  const { controller, promise } = createCancellableMonitor(
    tasks,
    config,
    (progress) => {
      console.log(`任务 ${taskId} 进度:`, progress)
      // 这里不更新 checkCount，因为每个商品的 checkCount 在各自的 result 中
    },
    (result) => {
      console.log(`任务 ${taskId} 结果:`, result)

      // 更新商品结果
      const task = monitorTasks.get(taskId)
      if (task && task.results) {
        // 查找是否已存在该商品的结果，如果存在则更新
        const existingIndex = task.results.findIndex((r: any) => r.productId === result.productId)
        if (existingIndex >= 0) {
          task.results[existingIndex] = {
            ...task.results[existingIndex],
            ...result,
          }
        }
        persistTaskSoon('stock', task)
      }
    }
  )

  // 保存控制器以便停止任务
  const task = monitorTasks.get(taskId)
  if (task) {
    task.controller = controller
  }

  promise.then((results) => {
    const task = monitorTasks.get(taskId)
    if (task) {
      task.status = 'completed'
      task.results = results
      task.controller = undefined
      persistTask('stock', task)
    }
  }).catch((error) => {
    console.error(`任务 ${taskId} 失败:`, error)
    const task = monitorTasks.get(taskId)
    if (task) {
      task.status = 'stopped'
      task.controller = undefined
      persistTask('stock', task)
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

    // 验证必需参数
    if (!body.products || !Array.isArray(body.products) || body.products.length === 0) {
      return createErrorResponse(ErrorCode.INVALID_PARAMS, '监控商品列表不能为空')
    }

    // 验证每个商品
    for (const product of body.products) {
      if (!product.productId) {
        return createErrorResponse(ErrorCode.INVALID_PARAMS, '商品必须包含有效的 productId')
      }
    }

    // 构建监控任务
    const tasks: MonitorTask[] = body.products.map((product: any) => ({
      request: {
        platform: 'yishou',
        productId: product.productId,
      },
      recipient: currentUser.email,
      subject: `🔔 ${product.productName} 已到货`,
      productImage: product.productImage,
    }))

    // 构建监控配置
    const config: StockMonitorConfig = {
      interval: body.config?.interval || 1,
      duration: body.config?.duration || 3 * 60 * 60,
      adapterConfig: body.config?.adapterConfig || {},
    }

    // 生成任务 ID
    const taskId = generateTaskId()

    // 存储任务信息
    const taskRecord = {
      id: taskId,
      userId: currentUser.username,
      userEmail: currentUser.email,
      products: body.products,
      config,
      status: 'running' as const,
      createdAt: new Date(),
    }

    monitorTasks.set(taskId, taskRecord)
    persistTask('stock', taskRecord)

    // 启动监控任务
    startMonitorTask(taskId, tasks, config)

    // 返回任务 ID
    return createSuccessResponse({
      taskId,
      status: 'started',
      message: '监控任务已启动',
      taskCount: tasks.length,
      interval: config.interval,
      duration: config.duration,
    })
  } catch (error: unknown) {
    console.error('创建监控任务失败:', error)
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return createErrorResponse(ErrorCode.UNKNOWN_ERROR, errorMessage)
  }
})
