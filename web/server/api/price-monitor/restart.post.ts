/**
 * 重新发起价格监控任务 API
 * POST /api/price-monitor/restart
 *
 * 说明：重新发起会重建基线（首轮不通知），重启期间的价格变化不会补发。
 */

import { priceMonitorTasks, startPriceMonitorTask, type PriceMonitorTaskRecord } from './create.post'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { deleteTask, getTask, persistTask } from '../../utils/taskStore'
import type { PriceMonitorConfig, PriceMonitorTask } from '@core'

export default defineEventHandler(async (event) => {
  try {
    // 获取当前用户
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    // 获取请求体
    const body = await readBody(event)
    const taskId = body?.taskId as string

    if (!taskId) {
      return createErrorResponse('INVALID_PARAMS', '缺少任务 ID')
    }

    // 查询原任务（内存优先，重启后从数据库补）
    const originalTask = priceMonitorTasks.get(taskId)
      ?? getTask<PriceMonitorTaskRecord>('price', taskId)

    if (!originalTask) {
      return createErrorResponse('NOT_FOUND', '任务不存在')
    }

    // 验证任务所有权
    if (originalTask.userId !== currentUser.username) {
      return createErrorResponse('FORBIDDEN', '无权操作此任务')
    }

    // 停止并移除原任务，避免两个循环同时跑导致重复通知
    if (originalTask.controller && originalTask.status === 'running') {
      try {
        originalTask.controller.abort()
      } catch (error) {
        console.error('停止原价格监控任务失败:', error)
      }
    }
    priceMonitorTasks.delete(taskId)
    deleteTask('price', taskId)

    // 生成新任务 ID
    const newTaskId = `price_task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    // 复用原任务配置，但不带初始快照，由监控循环重新建立基线
    const config: PriceMonitorConfig = {
      ...originalTask.config,
      initialSnapshot: undefined,
    }

    // 构建监控任务
    const product = originalTask.product
    const snapshot = originalTask.snapshot
    const task: PriceMonitorTask = {
      request: {
        platform: 'yishou',
        productId: String(product.productId),
      },
      recipient: originalTask.userEmail,
      productName: product.productName || snapshot?.productName,
      productImage: product.productImage,
    }

    // 创建新任务
    const newTask: PriceMonitorTaskRecord = {
      id: newTaskId,
      userId: originalTask.userId,
      userEmail: originalTask.userEmail,
      product,
      config,
      status: 'running',
      createdAt: new Date(),
      checkCount: 0,
      detectedCount: 0,
      changes: [],
      couponChanges: [],
      snapshot: originalTask.snapshot,
    }

    priceMonitorTasks.set(newTaskId, newTask)
    persistTask('price', newTask)

    // 启动监控任务
    config.taskId = newTaskId
    startPriceMonitorTask(newTaskId, task, config)

    return createSuccessResponse({
      taskId: newTaskId,
      status: 'started',
      message: '价格监控任务已重新发起',
      interval: config.interval,
      duration: config.duration,
    })
  } catch (error: unknown) {
    console.error('重新发起价格监控任务失败:', error)
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return createErrorResponse('UNKNOWN_ERROR', errorMessage)
  }
})
