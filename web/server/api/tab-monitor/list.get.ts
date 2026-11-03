/**
 * 查询当前用户的 Tab 监控任务列表 API
 * GET /api/tab-monitor/list
 */

import { tabMonitorTasks, type TabMonitorTaskRecord } from './create.post'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { listTasks } from '../../utils/taskStore'

export default defineEventHandler(async (event) => {
  try {
    // 获取当前用户
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    // 内存中的任务（含最新进度）
    const liveTasks = Array.from(tabMonitorTasks.values())
      .filter(task => task.userId === currentUser.username)

    // 仅存在于数据库中的任务（进程重启后依然可查看）
    const liveIds = new Set(liveTasks.map(task => task.id))
    const restoredTasks = listTasks<TabMonitorTaskRecord>('tab', currentUser.username)
      .filter(task => !liveIds.has(task.id))

    // 筛选当前用户的任务
    const userTasks = [...liveTasks, ...restoredTasks]
      .map(task => ({
        id: task.id,
        tabId: task.tabId,
        tabName: task.tabName,
        status: task.status,
        interval: task.config.interval,
        duration: task.config.duration,
        activeWindow: task.config.activeWindow,
        createdAt: task.createdAt,
        checkCount: task.checkCount,
        detectedCount: task.detectedCount,
        currentTotal: task.currentTotal,
        lastDetectedAt: task.lastDetectedAt,
        recipient: task.userEmail,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

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
