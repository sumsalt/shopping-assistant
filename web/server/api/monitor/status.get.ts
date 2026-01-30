/**
 * 查询监控任务状态 API
 * GET /api/monitor/status
 */

import { monitorTasks } from './create.post'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'

export default defineEventHandler(async (event) => {
  try {
    // 获取查询参数
    const query = getQuery(event)
    const taskId = query.taskId as string

    // 验证任务 ID
    if (!taskId) {
      return createErrorResponse('INVALID_PARAMS', '缺少任务 ID')
    }

    // 查询任务
    const task = monitorTasks.get(taskId)

    if (!task) {
      return createErrorResponse('NOT_FOUND', '任务不存在')
    }

    // 返回任务状态
    return createSuccessResponse({
      id: task.id,
      status: task.status,
      taskCount: task.tasks.length,
      config: task.config,
      createdAt: task.createdAt,
      results: task.results,
    })
  } catch (error: unknown) {
    console.error('查询任务状态失败:', error)
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return createErrorResponse('UNKNOWN_ERROR', errorMessage)
  }
})
