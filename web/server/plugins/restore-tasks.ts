/**
 * 服务启动时恢复监控任务
 *
 * 进程重启（PM2 restart / 服务器重启）后，从 SQLite 取出仍处于 running 的任务：
 * 1. 剩余时长按「原始创建时间 + 配置时长」重新计算，已到期的直接标记完成
 * 2. 未到期的交回各类任务的 definition 续跑，进度沿用重启前的数据
 *
 * 这里只负责通用的「剩余时长」与遍历，具体怎么续跑由 definition.restore 决定。
 */

import { activeSecondsBetween, normalizeActiveWindow, type ActiveWindow } from '@core'
import { priceDefinition, priceTasks } from '../tasks/price'
import { stockDefinition, stockTasks } from '../tasks/stock'
import { tabDefinition, tabTasks } from '../tasks/tab'
import type { TaskRegistry } from '../tasks/registry'
import type { TaskDefinition } from '../tasks/types'
import { closeTaskStore, listRunningTasks, persistTask, type StoredTaskBase } from '../utils/taskStore'

/** 避免开发环境热更新时重复执行 */
let restored = false

/** 计算剩余监控时长（秒），无限时长返回 Infinity */
const getRemainingSeconds = (task: StoredTaskBase): number => {
  const config = (task as { config?: { duration?: number; activeWindow?: unknown } }).config
  const duration = config?.duration

  if (!duration || !Number.isFinite(duration)) {
    return Number.POSITIVE_INFINITY
  }

  const createdAt = new Date(task.createdAt)
  const now = new Date()

  // 配了生效时段的任务，休眠时间不消耗时长，按「时段内累计秒数」计算已运行时间
  const window = normalizeActiveWindow(config?.activeWindow as ActiveWindow | null | undefined)
  const elapsed = window
    ? activeSecondsBetween(createdAt, now, window)
    : (now.getTime() - createdAt.getTime()) / 1000

  return Math.max(0, duration - elapsed)
}

const resumeKind = <R extends StoredTaskBase>(
  definition: TaskDefinition<R>,
  registry: TaskRegistry<R>
): number => {
  let resumed = 0

  for (const task of listRunningTasks<R>(definition.kind)) {
    try {
      const ok = definition.restore?.(task, getRemainingSeconds(task)) ?? false
      if (ok) resumed++
    } catch (error) {
      console.error(`[Restore] 恢复${definition.label}任务 ${task.id} 失败:`, error)
      task.status = 'stopped'
      persistTask(definition.kind, task)
    }
  }

  return resumed
}

const restoreAllTasks = () => {
  if (restored) return
  restored = true

  try {
    const counts = {
      到货: resumeKind(stockDefinition, stockTasks),
      Tab: resumeKind(tabDefinition, tabTasks),
      价格: resumeKind(priceDefinition, priceTasks),
    }

    const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
    if (total > 0) {
      const detail = Object.entries(counts)
        .map(([label, count]) => `${label} ${count} 个`)
        .join(' / ')
      console.log(`[Restore] 已续跑任务：${detail}`)
    }
  } catch (error) {
    console.error('[Restore] 恢复任务失败:', error)
  }
}

export default defineNitroPlugin(() => {
  // 等服务器初始化完成再拉起任务，避免阻塞启动
  const timer = setTimeout(restoreAllTasks, 1500)
  if (typeof timer.unref === 'function') {
    timer.unref()
  }

  // 进程退出前把节流中的数据刷盘
  const flush = () => {
    try {
      closeTaskStore()
    } catch {
      // 忽略退出异常
    }
  }

  process.once('SIGINT', flush)
  process.once('SIGTERM', flush)
  process.once('beforeExit', flush)
})
