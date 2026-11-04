/**
 * 服务启动时恢复监控任务
 *
 * 进程重启（PM2 restart / 服务器重启）后，从 SQLite 中取出仍处于 running 的任务：
 * 1. 剩余时长按「原始创建时间 + 配置时长」重新计算，已到期的直接标记完成
 * 2. 未到期的重新挂回内存并继续监控，进度沿用重启前的数据
 */

import {
  activeSecondsBetween,
  normalizeActiveWindow,
  type ActiveWindow,
  type MonitorTask,
  type PriceMonitorTask,
  type PriceSnapshot,
  type TabMonitorTask,
} from '@core'
import { monitorTasks, startMonitorTask, type MonitorTaskRecord } from '../api/monitor/create.post'
import {
  priceMonitorTasks,
  startPriceMonitorTask,
  type PriceMonitorTaskRecord,
} from '../api/price-monitor/create.post'
import {
  tabMonitorTasks,
  startTabMonitorTask,
  type TabMonitorTaskRecord,
} from '../api/tab-monitor/create.post'
import { closeTaskStore, listRunningTasks, persistTask } from '../utils/taskStore'

/** 避免开发环境热更新时重复执行 */
let restored = false

/**
 * 计算剩余监控时长（秒）
 *
 * @returns 剩余秒数；配置为无限时长时返回 Infinity
 */
const getRemainingSeconds = (task: {
  createdAt: Date
  config: { duration?: number; activeWindow?: ActiveWindow }
}): number => {
  const duration = task.config?.duration

  if (!duration || !Number.isFinite(duration)) {
    return Number.POSITIVE_INFINITY
  }

  const createdAt = new Date(task.createdAt)
  const now = new Date()

  // 配了生效时段的任务，休眠时间不消耗时长，按「时段内累计秒数」计算已运行时间
  const window = normalizeActiveWindow(task.config?.activeWindow)
  const elapsed = window
    ? activeSecondsBetween(createdAt, now, window)
    : (now.getTime() - createdAt.getTime()) / 1000

  return Math.max(0, duration - elapsed)
}

/** 恢复库存到货监控任务 */
const restoreStockTasks = (): number => {
  const tasks = listRunningTasks<MonitorTaskRecord>('stock')
  let resumed = 0

  for (const task of tasks) {
    try {
      const remaining = getRemainingSeconds(task)

      if (remaining !== Number.POSITIVE_INFINITY && remaining <= 0) {
        task.status = 'completed'
        persistTask('stock', task)
        continue
      }

      task.status = 'running'
      task.controller = undefined

      monitorTasks.set(task.id, task)

      // 重建监控请求（一个任务只监控一个商品）
      const product = task.product
      const request: MonitorTask = {
        request: {
          platform: 'yishou',
          productId: product.productId,
        },
        recipient: task.userEmail,
        subject: `🔔 ${product.productName} 已到货`,
        productImage: product.productImage,
      }

      startMonitorTask(task.id, request, {
        ...task.config,
        taskId: task.id,
        // 续跑时接着之前的统计继续累加
        initialCheckCount: task.result?.checkCount ?? 0,
        initialErrorCount: task.result?.errorCount ?? 0,
        duration: remaining === Number.POSITIVE_INFINITY ? undefined : Math.floor(remaining),
      })

      resumed++
    } catch (error) {
      console.error(`[Restore] 恢复到货监控任务 ${task.id} 失败:`, error)
      task.status = 'stopped'
      persistTask('stock', task)
    }
  }

  return resumed
}

/** 恢复价格监控任务 */
const restorePriceTasks = (): number => {
  const tasks = listRunningTasks<PriceMonitorTaskRecord>('price')
  let resumed = 0

  for (const task of tasks) {
    try {
      const remaining = getRemainingSeconds(task)

      if (remaining !== Number.POSITIVE_INFINITY && remaining <= 0) {
        task.status = 'completed'
        persistTask('price', task)
        continue
      }

      task.status = 'running'
      task.controller = undefined
      task.changes = Array.isArray(task.changes) ? task.changes : []
      task.couponChanges = Array.isArray(task.couponChanges) ? task.couponChanges : []

      priceMonitorTasks.set(task.id, task)

      // 重建监控请求（一个任务只监控一个商品）
      const product = task.product
      const snapshot = task.snapshot

      // 续跑用最后一次落盘的快照做基线：config.initialSnapshot 还是创建时的价格，
      // 拿它比对会把重启前已经发生过的变化再提醒一次
      const restoredSnapshot: PriceSnapshot | undefined = snapshot
        ? {
            platform: 'yishou',
            productId: String(snapshot.productId),
            productName: snapshot.productName,
            productNo: '',
            productImage: product.productImage || '',
            productUrl: '',
            shopPrice: snapshot.shopPrice,
            authState: 'logged_in',
            coupons: snapshot.coupons ?? [],
            couponsNew: snapshot.couponsNew ?? [],
            capturedAt: snapshot.checkedAt,
          }
        : undefined

      const request: PriceMonitorTask = {
        request: {
          platform: 'yishou',
          productId: String(product.productId),
        },
        recipient: task.userEmail,
        productName: product.productName || snapshot?.productName,
        productImage: product.productImage || undefined,
      }

      startPriceMonitorTask(task.id, request, {
        ...task.config,
        taskId: task.id,
        initialSnapshot: restoredSnapshot ?? task.config.initialSnapshot,
        initialCheckCount: task.checkCount ?? 0,
        initialDetectedCount: task.detectedCount ?? 0,
        duration: remaining === Number.POSITIVE_INFINITY ? undefined : Math.floor(remaining),
      })

      resumed++
    } catch (error) {
      console.error(`[Restore] 恢复价格监控任务 ${task.id} 失败:`, error)
      task.status = 'stopped'
      persistTask('price', task)
    }
  }

  return resumed
}

/** 恢复 Tab 商品列表监控任务 */
const restoreTabTasks = (): number => {
  const tasks = listRunningTasks<TabMonitorTaskRecord>('tab')
  let resumed = 0

  for (const task of tasks) {
    try {
      const remaining = getRemainingSeconds(task)

      if (remaining !== Number.POSITIVE_INFINITY && remaining <= 0) {
        task.status = 'completed'
        persistTask('tab', task)
        continue
      }

      task.status = 'running'
      task.controller = undefined

      tabMonitorTasks.set(task.id, task)

      const request: TabMonitorTask = {
        recipient: task.userEmail,
        tabName: task.tabName,
      }

      startTabMonitorTask(
        task.id,
        request,
        {
          ...task.config,
          taskId: task.id,
          initialCheckCount: task.checkCount ?? 0,
          initialDetectedCount: task.detectedCount ?? 0,
          // 续跑时继续沿用已见商品集合：重启前见过的商品不会再被当成新商品
          initialSeenProductIds: task.seenProductIds ?? [],
          duration: remaining === Number.POSITIVE_INFINITY ? undefined : Math.floor(remaining),
        },
        { preserveState: true }
      )

      resumed++
    } catch (error) {
      console.error(`[Restore] 恢复 Tab 监控任务 ${task.id} 失败:`, error)
      task.status = 'stopped'
      persistTask('tab', task)
    }
  }

  return resumed
}

/** 执行恢复 */
const restoreAllTasks = () => {
  if (restored) {
    return
  }
  restored = true

  try {
    const stockCount = restoreStockTasks()
    const priceCount = restorePriceTasks()
    const tabCount = restoreTabTasks()

    if (stockCount + priceCount + tabCount > 0) {
      console.log(
        `[Restore] 已续跑任务：到货 ${stockCount} 个 / 价格 ${priceCount} 个 / Tab ${tabCount} 个`
      )
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
