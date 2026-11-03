/**
 * 创建 Tab 监控任务 API
 * POST /api/tab-monitor/create
 */

import {
  createCancellableTabMonitor,
  normalizeActiveWindow,
  type TabMonitorTask,
  type TabMonitorConfig,
} from '@core'
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { persistTask, persistTaskSoon, type StoredTaskBase } from '../../utils/taskStore'

/** Tab 监控任务记录 */
export interface TabMonitorTaskRecord extends StoredTaskBase {
  tabId: string
  tabName: string
  config: TabMonitorConfig
  checkCount: number
  detectedCount: number
  currentTotal: number
  lastDetectedAt?: Date
  controller?: AbortController
}

// Tab 监控任务存储：内存作为运行时副本，落盘由 taskStore 负责
export const tabMonitorTasks = new Map<string, TabMonitorTaskRecord>()

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
  config: TabMonitorConfig,
  options: { preserveState?: boolean } = {}
): { controller: AbortController; promise: Promise<any> } => {
  // 初始化任务数据（续跑时保留已有统计）
  const taskData = tabMonitorTasks.get(taskId)
  if (taskData) {
    if (!options.preserveState) {
      taskData.checkCount = 0
      taskData.detectedCount = 0
      taskData.currentTotal = 0
      taskData.lastDetectedAt = undefined
    }
    persistTaskSoon('tab', taskData)
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
        persistTaskSoon('tab', monitorTask)
      }
    },
    (result) => {
      console.log(`Tab 监控任务 ${taskId} 结果:`, result)

      // 更新任务数据
      const monitorTask = tabMonitorTasks.get(taskId)
      if (monitorTask && result.detected && result.changeInfo) {
        monitorTask.detectedCount++
        monitorTask.lastDetectedAt = new Date()
        persistTaskSoon('tab', monitorTask)
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
      persistTask('tab', monitorTask)
    }
  }).catch((error) => {
    console.error(`Tab 监控任务 ${taskId} 失败:`, error)
    const monitorTask = tabMonitorTasks.get(taskId)
    if (monitorTask) {
      monitorTask.status = 'stopped'
      monitorTask.controller = undefined
      persistTask('tab', monitorTask)
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

    // 生效时段（可选）：格式 HH:mm，允许跨天
    const activeWindow = normalizeActiveWindow(body.config?.activeWindow)
    if (body.config?.activeWindow && !activeWindow) {
      return createErrorResponse(
        ErrorCode.INVALID_PARAMS,
        '生效时段格式不正确，应为 HH:mm（如 09:00），且开始与结束时间不能相同'
      )
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
      ...(activeWindow ? { activeWindow } : {}),
    }

    // 生成任务 ID
    const taskId = generateTaskId()

    // 存储任务信息
    const taskRecord: TabMonitorTaskRecord = {
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
    }

    tabMonitorTasks.set(taskId, taskRecord)
    persistTask('tab', taskRecord)

    // 启动监控任务
    // 让任务内的请求带上闸门上下文（用户手动操作不带上下文，不受限流）
    config.taskId = taskId
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
