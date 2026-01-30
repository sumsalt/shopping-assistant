/**
 * 创建监控任务 API
 * POST /api/monitor/create
 */

import { monitorStock, type MonitorTask, type StockMonitorConfig } from '@core'
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'

// 监控任务存储（生产环境应使用数据库或 Redis）
export const monitorTasks = new Map<string, {
  id: string
  userId: string
  userEmail: string
  tasks: MonitorTask[]
  config: StockMonitorConfig
  status: 'running' | 'stopped' | 'completed'
  createdAt: Date
  results?: any[]
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
    if (!body.tasks || !Array.isArray(body.tasks) || body.tasks.length === 0) {
      return createErrorResponse(ErrorCode.INVALID_PARAMS, '监控任务列表不能为空')
    }

    // 验证每个任务
    for (const task of body.tasks) {
      if (!task.request || !task.request.platform || !task.request.productId) {
        return createErrorResponse(ErrorCode.INVALID_PARAMS, '任务必须包含有效的 request.platform 和 request.productId')
      }
      if (!task.recipient) {
        return createErrorResponse(ErrorCode.INVALID_PARAMS, '任务必须包含收件人邮箱地址 recipient')
      }
    }

    // 构建监控任务
    const tasks: MonitorTask[] = body.tasks.map((task: any) => ({
      request: {
        platform: task.request.platform,
        productId: task.request.productId,
      },
      recipient: task.recipient,
      subject: task.subject || '🔔 商品到货提醒',
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
      tasks,
      config,
      status: 'running',
      createdAt: new Date(),
    })

    // 在后台启动监控任务（不等待结果）
    monitorStock(
      tasks,
      config,
      (progress) => {
        console.log(`任务 ${taskId} 进度:`, progress)
      },
      (result) => {
        console.log(`任务 ${taskId} 结果:`, result)
      }
    ).then((results) => {
      const task = monitorTasks.get(taskId)
      if (task) {
        task.status = 'completed'
        task.results = results
      }
    }).catch((error) => {
      console.error(`任务 ${taskId} 失败:`, error)
      const task = monitorTasks.get(taskId)
      if (task) {
        task.status = 'stopped'
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
