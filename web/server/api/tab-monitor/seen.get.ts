/**
 * 查询 Tab 监控任务累计记录的商品 API
 * GET /api/tab-monitor/seen?taskId=xxx&offset=0&limit=50
 *
 * 按首次发现时间倒序返回，用于任务卡片上的「查看累计商品」。
 * 只返回当前用户自己的任务。
 */

import type { TabSeenProduct } from '@core'
import { tabMonitorTasks, type TabMonitorTaskRecord } from './create.post'
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { listTasks } from '../../utils/taskStore'

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    const query = getQuery(event)
    const taskId = String(query.taskId || '').trim()
    if (!taskId) {
      return createErrorResponse(ErrorCode.INVALID_PARAMS, '任务 ID 不能为空')
    }

    // 优先取内存中的实时任务，进程重启后从数据库取
    let task: TabMonitorTaskRecord | undefined = tabMonitorTasks.get(taskId)
    if (!task || task.userId !== currentUser.username) {
      task = listTasks<TabMonitorTaskRecord>('tab', currentUser.username).find(
        item => item.id === taskId
      )
    }

    if (!task || task.userId !== currentUser.username) {
      return createErrorResponse('NOT_FOUND', '任务不存在')
    }

    // 老任务只有 ID 列表，补成没有名称的记录，保证至少能看到记录数
    const products: TabSeenProduct[] = task.seenProducts?.length
      ? task.seenProducts
      : (task.seenProductIds ?? []).map(productId => ({
          productId,
          productName: '',
          price: 0,
          firstSeenAt: new Date(task!.createdAt).toISOString(),
        }))

    // 按首次发现时间倒序（同一轮发现的保持原有顺序）
    const sorted = [...products].sort(
      (a, b) => new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime()
    )

    const rawOffset = Number(query.offset)
    const rawLimit = Number(query.limit)
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(200, Math.floor(rawLimit)) : 50

    return createSuccessResponse({
      taskId,
      tabName: task.tabName,
      total: sorted.length,
      offset,
      limit,
      hasMore: offset + limit < sorted.length,
      items: sorted.slice(offset, offset + limit),
    })
  } catch (error: unknown) {
    console.error('查询 Tab 累计商品失败:', error)
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return createErrorResponse('UNKNOWN_ERROR', errorMessage)
  }
})
