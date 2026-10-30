/**
 * 查询 Tab 监控任务状态 API
 * GET /api/tab-monitor/status
 */

import { tabMonitorTasks, type TabMonitorTaskRecord } from './create.post'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { getTask } from '../../utils/taskStore'

export default defineEventHandler(async (event) => {
  try {
    // 获取当前用户
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    // 获取任务 ID
    const query = getQuery(event)
    const taskId = query.taskId as string

    if (!taskId) {
      return createErrorResponse('INVALID_PARAMS', '缺少任务 ID')
    }

    // 查询任务（内存优先，重启后从数据库补）
    const task = tabMonitorTasks.get(taskId)
      ?? getTask<TabMonitorTaskRecord>('tab', taskId)

    if (!task) {
      return createErrorResponse('NOT_FOUND', '任务不存在')
    }

    // 验证任务所有权
    if (task.userId !== currentUser.username) {
      return createErrorResponse('FORBIDDEN', '无权查询此任务')
    }

    return createSuccessResponse({
      id: task.id,
      status: task.status,
      tabId: task.tabId,
      tabName: task.tabName,
      config: task.config,
      createdAt: task.createdAt,
      checkCount: task.checkCount,
      detectedCount: task.detectedCount,
      currentTotal: task.currentTotal,
      lastDetectedAt: task.lastDetectedAt,
    })
  } catch (error: unknown) {
    console.error('查询 Tab 监控任务状态失败:', error)
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return createErrorResponse('UNKNOWN_ERROR', errorMessage)
  }
})
