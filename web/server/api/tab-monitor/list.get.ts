/**
 * 查询当前用户的 Tab 监控任务列表 API
 * GET /api/tab-monitor/list
 */

import { tabMonitorTasks } from './create.post'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'

export default defineEventHandler(async (event) => {
  try {
    // 获取当前用户
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    // 筛选当前用户的任务
    const userTasks = Array.from(tabMonitorTasks.values())
      .filter(task => task.userId === currentUser.username)
      .map(task => ({
        id: task.id,
        tabId: task.tabId,
        tabName: task.tabName,
        status: task.status,
        interval: task.config.interval,
        duration: task.config.duration,
        createdAt: task.createdAt,
        checkCount: task.checkCount,
        detectedCount: task.detectedCount,
        currentTotal: task.currentTotal,
        lastDetectedAt: task.lastDetectedAt,
        recipient: task.userEmail,
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    return createSuccessResponse({
      tasks: userTasks,
      total: userTasks.length,
    })
  } catch (error: unknown) {
    console.error('查询 Tab 监控任务列表失败:', error)
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return createErrorResponse('UNKNOWN_ERROR', errorMessage)
  }
})
