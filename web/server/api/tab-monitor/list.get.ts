/**
 * 查询当前用户的 Tab 监控任务列表 API
 * GET /api/tab-monitor/list
 */

import { tabMonitorTasks, type TabMonitorTaskRecord } from './create.post'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { listTasks } from '../../utils/taskStore'
import { listBlacklistedSupplyIds } from '../../utils/shopBlacklistStore'

export default defineEventHandler(async (event) => {
  try {
    // 获取当前用户
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    // 店铺黑名单：卡片上的「已记录商品」要和弹窗里看到的一致，先把黑名单商品排除
    const blacklisted = new Set(listBlacklistedSupplyIds(currentUser.username))

    // 统计累计商品数（黑名单店铺的商品不展示，也不计入）
    const countSeen = (task: TabMonitorTaskRecord): number => {
      if (task.seenProducts?.length) {
        return blacklisted.size
          ? task.seenProducts.filter(
              item => !item.supplyId || !blacklisted.has(item.supplyId)
            ).length
          : task.seenProducts.length
      }
      return task.seenProductIds?.length ?? 0
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
        mode: task.config.mode ?? 'accumulate',
        interval: task.config.interval,
        pageCount: task.config.pageCount ?? 1,
        duration: task.config.duration,
        activeWindow: task.config.activeWindow,
        createdAt: task.createdAt,
        checkCount: task.checkCount,
        detectedCount: task.detectedCount,
        currentTotal: task.currentTotal,
        seenCount: countSeen(task),
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
