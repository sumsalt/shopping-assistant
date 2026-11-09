/**
 * 重新发起 Tab 监控任务 API
 * POST /api/tab-monitor/restart
 */

import { tabMonitorTasks, startTabMonitorTask, type TabMonitorTaskRecord } from './create.post'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { getTask, persistTask } from '../../utils/taskStore'
import type { TabMonitorTask, TabMonitorConfig } from '@core'

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

    // 查询原任务（内存优先，重启后从数据库补）
    const originalTask = tabMonitorTasks.get(taskId)
      ?? getTask<TabMonitorTaskRecord>('tab', taskId)

    if (!originalTask) {
      return createErrorResponse('NOT_FOUND', '任务不存在')
    }

    // 验证任务所有权
    if (originalTask.userId !== currentUser.username) {
      return createErrorResponse('FORBIDDEN', '无权操作此任务')
    }

    // 生成新任务 ID
    const newTaskId = `tab_task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    // 构建监控任务
    const task: TabMonitorTask = {
      recipient: originalTask.userEmail,
      tabName: originalTask.tabName,
    }

    // 使用原任务的配置（去掉已废弃的页数/定时全量字段），重新发起视为新任务，先全量建立基线
    const config: TabMonitorConfig = {
      ...originalTask.config,
      adapterConfig: {
        ...originalTask.config.adapterConfig,
      },
      fullInitialScan: true,
    }
    delete (config as unknown as Record<string, unknown>).pageCount
    delete (config as unknown as Record<string, unknown>).fullScanInterval

    // 创建新任务
    const newTask: TabMonitorTaskRecord = {
      id: newTaskId,
      userId: originalTask.userId,
      userEmail: originalTask.userEmail,
      tabId: originalTask.tabId,
      tabName: originalTask.tabName,
      config,
      status: 'running',
      createdAt: new Date(),
      checkCount: 0,
      detectedCount: 0,
      currentTotal: 0,
      seenProductIds: [],
      seenProducts: [],
    }

    tabMonitorTasks.set(newTaskId, newTask)
    persistTask('tab', newTask)

    // 启动监控任务
    config.taskId = newTaskId
    startTabMonitorTask(newTaskId, task, config)

    // 返回新任务 ID
    return createSuccessResponse({
      taskId: newTaskId,
      status: 'started',
      message: 'Tab 监控任务已重新发起',
      tabId: originalTask.tabId,
      tabName: originalTask.tabName,
      interval: config.interval,
      duration: config.duration,
    })
  } catch (error: unknown) {
    console.error('重新发起 Tab 监控任务失败:', error)
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return createErrorResponse('UNKNOWN_ERROR', errorMessage)
  }
})
