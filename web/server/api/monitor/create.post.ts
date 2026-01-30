/**
 * 创建监控任务 API
 * POST /api/monitor/create
 */

import { createCancellableMonitor, type MonitorTask, type StockMonitorConfig } from '@core'
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'

// 商品信息接口
interface ProductInfo {
  productId: string
  productName: string
  productImage?: string
}

// 监控任务存储（生产环境应使用数据库或 Redis）
export const monitorTasks = new Map<string, {
  id: string
  userId: string
  userEmail: string
  products: ProductInfo[]
  config: StockMonitorConfig
  status: 'running' | 'stopped' | 'completed'
  createdAt: Date
  results?: any[]
  controller?: AbortController
}>()

// 生成任务 ID
const generateTaskId = (): string => {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
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
    }))

    // 构建监控配置
    const config: StockMonitorConfig = {
      interval: body.config?.interval || 60,
      duration: body.config?.duration || 3600,
      adapterConfig: body.config?.adapterConfig || {},
    }

    // 生成任务 ID
    const taskId = generateTaskId()

    // 存储任务信息
    monitorTasks.set(taskId, {
      id: taskId,
      userId: currentUser.username,
      userEmail: currentUser.email,
      products: body.products,
      config,
      status: 'running',
      createdAt: new Date(),
    })

    // 在后台启动监控任务（不等待结果）
    const { controller, promise } = createCancellableMonitor(
      tasks,
      config,
      (progress) => {
        console.log(`任务 ${taskId} 进度:`, progress)
      },
      (result) => {
        console.log(`任务 ${taskId} 结果:`, result)
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
      }
    }).catch((error) => {
      console.error(`任务 ${taskId} 失败:`, error)
      const task = monitorTasks.get(taskId)
      if (task) {
        task.status = 'stopped'
        task.controller = undefined
      }
    })

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
