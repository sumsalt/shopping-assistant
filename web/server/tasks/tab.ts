/**
 * Tab 商品列表监控任务
 *
 * 关注「上新」，累计已见商品；支持每日重建基线、店铺黑名单、生效时段。
 */

import {
  createCancellableTabMonitor,
  MAX_TAB_SEEN_PRODUCTS,
  normalizeActiveWindow,
  type TabMonitorConfig,
  type TabMonitorTask,
  type TabSeenProduct,
} from '@core'
import { ErrorCode } from '../utils/response'
import { persistTask, type StoredTaskBase } from '../utils/taskStore'
import { listBlacklistedSupplyIds } from '../utils/shopBlacklistStore'
import { TaskRegistry } from './registry'
import { TaskApiError, type ListContext, type StartOverrides, type TaskDefinition } from './types'

export interface TabTaskRecord extends StoredTaskBase {
  tabId: string
  tabName: string
  config: TabMonitorConfig
  checkCount: number
  detectedCount: number
  currentTotal: number
  /** 已见商品 ID（去重），重启后继续沿用，避免上下架反复提醒 */
  seenProductIds?: string[]
  /** 已见商品详情（含首次发现时间），用于「查看累计商品」 */
  seenProducts?: TabSeenProduct[]
  lastDetectedAt?: Date
  controller?: AbortController
}

export const tabTasks = new TaskRegistry<TabTaskRecord>('tab')

export const tabDefinition: TaskDefinition<TabTaskRecord> = {
  kind: 'tab',
  label: 'Tab 监控',
  // Tab 列表接口匿名可用，走匿名桶限流更宽
  needsAuth: () => false,

  create({ body, user }) {
    if (!body.tabId) throw new TaskApiError(ErrorCode.INVALID_PARAMS, 'Tab ID 不能为空')
    if (!body.tabName) throw new TaskApiError(ErrorCode.INVALID_PARAMS, 'Tab 名称不能为空')
    if (!body.recipient) {
      throw new TaskApiError(ErrorCode.INVALID_PARAMS, '收件人邮箱不能为空')
    }

    const activeWindow = normalizeActiveWindow(body.config?.activeWindow)
    if (body.config?.activeWindow && !activeWindow) {
      throw new TaskApiError(
        ErrorCode.INVALID_PARAMS,
        '生效时段格式不正确，应为 HH:mm（如 09:00），且开始与结束时间不能相同'
      )
    }

    const config: TabMonitorConfig = {
      tabId: body.tabId,
      mode: body.config?.mode === 'diff' ? 'diff' : 'accumulate',
      interval: body.config?.interval || 300,
      duration: body.config?.duration || 2 * 60 * 60,
      page: body.config?.page || 1,
      pageSize: body.config?.pageSize || 20,
      sort: body.config?.sort || 1,
      minPrice: body.config?.minPrice || 0,
      maxPrice: body.config?.maxPrice || 0,
      minChangeCount: body.config?.minChangeCount || 10,
      adapterConfig: body.config?.adapterConfig || {},
      // 新建先翻页抓全部商品记为已见，避免把已有商品当成新上架
      fullInitialScan: true,
      // 每日重建基线：默认开启，凌晨 04:00 清空已见重新开始
      dailyResetEnabled: body.config?.dailyResetEnabled !== false,
      ...(typeof body.config?.dailyResetHour === 'number'
        ? { dailyResetHour: body.config.dailyResetHour }
        : {}),
      ...(activeWindow ? { activeWindow } : {}),
      // 每轮实时读取黑名单，运行中拉黑也能立刻生效
      getBlacklistedSuppliers: () => listBlacklistedSupplyIds(user.username),
    }

    return {
      tabId: body.tabId as string,
      tabName: body.tabName as string,
      config,
      checkCount: 0,
      detectedCount: 0,
      currentTotal: 0,
      seenProductIds: [],
      seenProducts: [],
    }
  },

  start(record, overrides: StartOverrides = {}) {
    const task: TabMonitorTask = {
      recipient: record.userEmail,
      tabName: record.tabName,
    }

    // 新建 / 重启从零开始；续跑保留重启前的统计
    if (!overrides.resume) {
      record.checkCount = 0
      record.detectedCount = 0
      record.currentTotal = 0
      record.lastDetectedAt = undefined
    }

    const config: TabMonitorConfig = {
      ...record.config,
      taskId: record.id,
      ...(overrides.duration !== undefined ? { duration: overrides.duration } : {}),
      ...(overrides.initialCheckCount !== undefined
        ? { initialCheckCount: overrides.initialCheckCount }
        : {}),
      ...(overrides.initialDetectedCount !== undefined
        ? { initialDetectedCount: overrides.initialDetectedCount }
        : {}),
      ...(overrides.resume
        ? {
            // 续跑不做全量翻页，否则每次重启都要重新翻一遍
            fullInitialScan: false,
            // 沿用重启前的已见集合：重启前见过的商品不再当成新商品
            initialSeenProducts: record.seenProducts ?? [],
            initialSeenProductIds: record.seenProductIds ?? [],
          }
        : {}),
    }

    tabTasks.launch(
      record,
      () =>
        createCancellableTabMonitor(
          task,
          config,
          progress => {
            record.checkCount = progress.checkCount
            record.detectedCount = progress.detectedCount
            record.currentTotal = progress.currentTotal

            // 已见集合平时只增不减；每日重建基线时 resetSeen=true 必须整体替换，
            // 否则清空只是内存里的假象，落盘后又会被合并回来
            if (progress.resetSeen || progress.newlySeenProducts?.length) {
              const seen = progress.resetSeen
                ? new Set<string>()
                : new Set(record.seenProductIds ?? [])
              const products = progress.resetSeen ? [] : [...(record.seenProducts ?? [])]

              for (const item of progress.newlySeenProducts ?? []) {
                seen.add(item.productId)
                if (products.length < MAX_TAB_SEEN_PRODUCTS) products.push(item)
              }

              record.seenProductIds = [...seen]
              record.seenProducts = products
            }

            tabTasks.touch(record)
          },
          result => {
            if (result.detected && result.emailSent) {
              record.lastDetectedAt = new Date()
              tabTasks.touch(record)
            }
          }
        )
    )
  },

  restart(original) {
    const config: TabMonitorConfig = {
      ...original.config,
      adapterConfig: { ...original.config.adapterConfig },
      // 重新发起视为新任务，先全量建立基线
      fullInitialScan: true,
    }
    // 清理已废弃字段，避免老任务把它们带进新任务
    delete (config as unknown as Record<string, unknown>).pageCount
    delete (config as unknown as Record<string, unknown>).fullScanInterval

    return {
      tabId: original.tabId,
      tabName: original.tabName,
      config,
      checkCount: 0,
      detectedCount: 0,
      currentTotal: 0,
      seenProductIds: [],
      seenProducts: [],
    }
  },

  /** 黑名单一次查询、多次复用 */
  prepareList(userId): ListContext {
    return { blacklisted: new Set(listBlacklistedSupplyIds(userId)) }
  },

  listView(task, ctx) {
    const blacklisted = (ctx.blacklisted as Set<string> | undefined) ?? new Set<string>()

    // 卡片上的「已记录商品」要和弹窗里看到的一致：黑名单店铺的商品不展示也不计数
    const countSeen = (item: TabTaskRecord): number => {
      if (item.seenProducts?.length) {
        return blacklisted.size
          ? item.seenProducts.filter(
              seen => !seen.supplyId || !blacklisted.has(seen.supplyId)
            ).length
          : item.seenProducts.length
      }
      return item.seenProductIds?.length ?? 0
    }

    return {
      id: task.id,
      tabId: task.tabId,
      tabName: task.tabName,
      status: task.status,
      mode: task.config.mode ?? 'accumulate',
      interval: task.config.interval,
      duration: task.config.duration,
      activeWindow: task.config.activeWindow,
      createdAt: task.createdAt,
      checkCount: task.checkCount,
      detectedCount: task.detectedCount,
      currentTotal: task.currentTotal,
      seenCount: countSeen(task),
      lastDetectedAt: task.lastDetectedAt,
      recipient: task.userEmail,
    }
  },

  statusView(task) {
    return {
      id: task.id,
      status: task.status,
      tabId: task.tabId,
      tabName: task.tabName,
      config: task.config,
      createdAt: task.createdAt,
      checkCount: task.checkCount,
      detectedCount: task.detectedCount,
      currentTotal: task.currentTotal,
      lastDetectedAt: task.lastDetectedAt,
    }
  },

  createdView(record, action) {
    return {
      taskId: record.id,
      status: 'started',
      message: action === 'restarted' ? 'Tab 监控任务已重新发起' : 'Tab 监控任务已启动',
      tabId: record.tabId,
      tabName: record.tabName,
      interval: record.config.interval,
      duration: record.config.duration,
    }
  },

  restore(task, remainingSeconds) {
    if (Number.isFinite(remainingSeconds) && remainingSeconds <= 0) {
      task.status = 'completed'
      persistTask('tab', task)
      return false
    }

    // 老任务只存了商品 ID，补上详情与首次发现时间，保证「查看累计商品」有内容
    if (!task.seenProducts?.length && task.seenProductIds?.length) {
      const firstSeenAt = new Date(task.createdAt).toISOString()
      task.seenProducts = task.seenProductIds.map(productId => ({
        productId,
        productName: '',
        price: 0,
        firstSeenAt,
      }))
    }

    task.status = 'running'
    task.controller = undefined
    tabTasks.add(task)

    tabDefinition.start(task, {
      resume: true,
      duration: Number.isFinite(remainingSeconds) ? Math.floor(remainingSeconds) : undefined,
      initialCheckCount: task.checkCount ?? 0,
      initialDetectedCount: task.detectedCount ?? 0,
    })

    return true
  },
}
