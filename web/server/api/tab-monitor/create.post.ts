/**
 * 创建 Tab 监控任务 API
 * POST /api/tab-monitor/create
 */

import { createCancellableTabMonitor, type TabMonitorTask, type TabMonitorConfig } from '@core'
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'

// Tab 监控任务存储（生产环境应使用数据库或 Redis）
export const tabMonitorTasks = new Map<string, {
  id: string
  userId: string
  userEmail: string
  tabId: string
  tabName: string
  config: TabMonitorConfig
  status: 'running' | 'stopped' | 'completed'
  createdAt: Date
  checkCount: number
  detectedCount: number
  currentTotal: number
  lastDetectedAt?: Date
  controller?: AbortController
}>()

// 生成任务 ID
const generateTaskId = (): string => {
  return `tab_task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * 启动 Tab 监控任务
 */
export const startTabMonitorTask = (
  taskId: string,
  task: TabMonitorTask,
  config: TabMonitorConfig
): { controller: AbortController; promise: Promise<any> } => {
  // 初始化任务数据
  const taskData = tabMonitorTasks.get(taskId)
  if (taskData) {
    taskData.checkCount = 0
    taskData.detectedCount = 0
    taskData.currentTotal = 0
    taskData.lastDetectedAt = undefined
  }

  // 在后台启动监控任务（不等待结果）
  const { controller, promise } = createCancellableTabMonitor(
    task,
    config,
    (progress) => {
      console.log(`Tab 监控任务 ${taskId} 进度:`, progress)
      // 更新统计数据
      const monitorTask = tabMonitorTasks.get(taskId)
      if (monitorTask) {
        monitorTask.checkCount = progress.checkCount
        monitorTask.detectedCount = progress.detectedCount
        monitorTask.currentTotal = progress.currentTotal
      }
    },
    (result) => {
      console.log(`Tab 监控任务 ${taskId} 结果:`, result)

      // 更新任务数据
      const monitorTask = tabMonitorTasks.get(taskId)
      if (monitorTask && result.detected && result.changeInfo) {
        monitorTask.detectedCount++
        monitorTask.lastDetectedAt = new Date()
      }
    }
  )

  // 保存控制器以便停止任务
  const storedTask = tabMonitorTasks.get(taskId)
  if (storedTask) {
    storedTask.controller = controller
  }

  promise.then((result) => {
    const monitorTask = tabMonitorTasks.get(taskId)
    if (monitorTask) {
      monitorTask.status = 'completed'
      monitorTask.controller = undefined
    }
  }).catch((error) => {
    console.error(`Tab 监控任务 ${taskId} 失败:`, error)
    const monitorTask = tabMonitorTasks.get(taskId)
    if (monitorTask) {
      monitorTask.status = 'stopped'
      monitorTask.controller = undefined
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
    if (!body.tabId) {
      return createErrorResponse(ErrorCode.INVALID_PARAMS, 'Tab ID 不能为空')
    }

    if (!body.tabName) {
      return createErrorResponse(ErrorCode.INVALID_PARAMS, 'Tab 名称不能为空')
    }

    if (!body.recipient) {
      return createErrorResponse(ErrorCode.INVALID_PARAMS, '收件人邮箱不能为空')
    }

    // 构建监控任务
    const task: TabMonitorTask = {
      recipient: body.recipient,
      subject: body.subject || `🔔 ${body.tabName} 变化提醒`,
      tabName: body.tabName,
    }

    // 构建监控配置
    const config: TabMonitorConfig = {
      tabId: body.tabId,
      interval: body.config?.interval || 300,
      duration: body.config?.duration || 2 * 60 * 60,
      page: body.config?.page || 1,
      pageSize: body.config?.pageSize || 20,
      sort: body.config?.sort || 1,
      minPrice: body.config?.minPrice || 0,
      maxPrice: body.config?.maxPrice || 0,
      minChangeCount: body.config?.minChangeCount || 10,
      adapterConfig: body.config?.adapterConfig || {},
    }

    // 生成任务 ID
    const taskId = generateTaskId()

    // 存储任务信息
    tabMonitorTasks.set(taskId, {
      id: taskId,
      userId: currentUser.username,
      userEmail: currentUser.email,
      tabId: body.tabId,
      tabName: body.tabName,
      config,
      status: 'running',
      createdAt: new Date(),
      checkCount: 0,
      detectedCount: 0,
      currentTotal: 0,
    })

    // 启动监控任务
    startTabMonitorTask(taskId, task, config)

    // 返回任务 ID
    return createSuccessResponse({
      taskId,
      status: 'started',
      message: 'Tab 监控任务已启动',
      tabId: body.tabId,
      tabName: body.tabName,
      interval: config.interval,
      duration: config.duration,
    })
  } catch (error: unknown) {
    console.error('创建 Tab 监控任务失败:', error)
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return createErrorResponse(ErrorCode.UNKNOWN_ERROR, errorMessage)
  }
})
