/**
 * 服务启动时恢复监控任务
 *
 * 进程重启后，从 SQLite 取出仍处于 running 的任务：
 * 1. 剩余时长按「原始创建时间 + 配置时长」重新计算，已到期的标记完成
 * 2. 未到期的交回各 definition 续跑，进度沿用重启前的数据
 *
 * 具体逻辑都在 TaskService.restoreAll，这里只做遍历与退出刷盘。
 */

import { closeDb } from '../utils/db'
import { flushTasks } from '../tasks/engine/store'
import { taskServices } from '../tasks/kinds'

/** 避免开发环境热更新时重复执行 */
let restored = false

const restoreAllTasks = () => {
  if (restored) return
  restored = true

  try {
    const counts: Record<string, number> = {}
    let total = 0

    for (const service of taskServices) {
      const count = service.restoreAll()
      counts[service.definition.label] = count
      total += count
    }

    if (total > 0) {
      const detail = Object.entries(counts)
        .filter(([, count]) => count > 0)
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

  // 进程退出前把节流中的数据刷盘并关闭数据库
  const flush = () => {
    try {
      flushTasks()
      closeDb()
    } catch {
      // 忽略退出异常
    }
  }

  process.once('SIGINT', flush)
  process.once('SIGTERM', flush)
  process.once('beforeExit', flush)
})
