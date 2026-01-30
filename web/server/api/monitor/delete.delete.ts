/**
 * 删除监控任务 API
 * DELETE /api/monitor/delete
 */

import { monitorTasks } from './create.post'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'

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

    // 查询任务
    const task = monitorTasks.get(taskId)

    if (!task) {
      return createErrorResponse('NOT_FOUND', '任务不存在')
    }

    // 验证任务所有权
    if (task.userId !== currentUser.username) {
      return createErrorResponse('FORBIDDEN', '无权删除此任务')
    }

    // 删除任务
    monitorTasks.delete(taskId)

    return createSuccessResponse({
      message: '任务已删除',
      taskId,
    })
  } catch (error: unknown) {
    console.error('删除任务失败:', error)
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return createErrorResponse('UNKNOWN_ERROR', errorMessage)
  }
})
