/**
 * 重新发起监控任务 API
 * POST /api/monitor/restart
 */

import { monitorTasks, startMonitorTask } from './create.post'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import type { MonitorTask, StockMonitorConfig } from '@core'

export default defineEventHandler(async (event) => {
  try {
    // 获取当前用户
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    // 获取请求体
    const body = await readBody(event)
    const taskId = body.taskId as string

    if (!taskId) {
      return createErrorResponse('INVALID_PARAMS', '缺少任务 ID')
    }

    // 查询原任务
    const originalTask = monitorTasks.get(taskId)

    if (!originalTask) {
      return createErrorResponse('NOT_FOUND', '任务不存在')
    }

    // 验证任务所有权
    if (originalTask.userId !== currentUser.username) {
      return createErrorResponse('FORBIDDEN', '无权操作此任务')
    }

    // 生成新任务 ID
    const newTaskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    // 构建监控任务列表
    const tasks: MonitorTask[] = originalTask.products.map((product) => ({
      request: {
        platform: 'yishou',
        productId: product.productId,
      },
      recipient: originalTask.userEmail,
      subject: `🔔 ${product.productName} 已到货`,
      productImage: product.productImage,
    }))

    // 使用原任务的配置
    const config: StockMonitorConfig = {
      interval: originalTask.config.interval,
      duration: originalTask.config.duration,
      adapterConfig: {
        ...originalTask.config.adapterConfig,
      },
    }

    // 创建新任务
    monitorTasks.set(newTaskId, {
      id: newTaskId,
      userId: originalTask.userId,
      userEmail: originalTask.userEmail,
      products: originalTask.products,
      config,
      status: 'running',
      createdAt: new Date(),
    })

    // 启动监控任务
    startMonitorTask(newTaskId, tasks, config)

    // 返回新任务 ID
    return createSuccessResponse({
      taskId: newTaskId,
      status: 'started',
      message: '监控任务已重新发起',
      taskCount: tasks.length,
      interval: config.interval,
      duration: config.duration,
    })
  } catch (error: unknown) {
    console.error('重新发起监控任务失败:', error)
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return createErrorResponse('UNKNOWN_ERROR', errorMessage)
  }
})
