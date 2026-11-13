/**
 * Tab 商品列表监控任务定义
 *
 * 循环继续复用核心库 createCancellableTabMonitor；这里只负责：
 * 输入校验、已见集合落盘、统一事件与视图。
 */

import {
  createCancellableTabMonitor,
  MAX_TAB_SEEN_PRODUCTS,
  normalizeActiveWindow,
  type TabMonitorConfig,
  type TabMonitorTask,
  type TabSeenProduct,
} from '@core'
import type { TaskKind, TaskSummary, Tone } from '@core/contract'
import { ErrorCode } from '../../utils/response'
import { listBlacklistedSupplyIds } from '../../utils/shopBlacklistStore'
import { TaskApiError, capEvents, makeEvent } from '../engine/types'
import type { TaskKindDefinition, TaskRecordBase, TaskRunContext } from '../engine/types'
import { countVisibleSeen } from './tab-seen'
import type { TabTaskState } from './state'

const KIND: TaskKind = 'tab'
const VERSION = 2
const MAX_EVENTS = 50
const LIST_EVENT_LIMIT = 5

const num = (value: unknown, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const pushEvent = (state: TabTaskState, event: ReturnType<typeof makeEvent>): void => {
  const key = `${event.type}:${Math.floor(event.at / 1000)}`
  if (state.events.some(item => `${item.type}:${Math.floor(item.at / 1000)}` === key)) return
  state.events = capEvents([event, ...state.events], MAX_EVENTS)
}

export const tabDefinition: TaskKindDefinition<TabTaskState> = {
  kind: KIND,
  label: 'Tab 监控',
  version: VERSION,

  // Tab 列表接口匿名可用
  requiresAuth: () => false,

  create({ body, user }) {
    if (!body?.tabId) throw new TaskApiError(ErrorCode.INVALID_PARAMS, 'Tab ID 不能为空')
    if (!body?.tabName) throw new TaskApiError(ErrorCode.INVALID_PARAMS, 'Tab 名称不能为空')

    const activeWindow = normalizeActiveWindow(body?.config?.activeWindow)
    if (body?.config?.activeWindow && !activeWindow) {
      throw new TaskApiError(
        ErrorCode.INVALID_PARAMS,
        '生效时段格式不正确，应为 HH:mm（如 09:00），且开始与结束时间不能相同'
      )
    }

    void user

    return {
      state: {
        tab: { id: String(body.tabId), name: String(body.tabName) },
        config: {
          mode: body?.config?.mode === 'diff' ? 'diff' : 'accumulate',
          interval: num(body?.config?.interval, 300),
          duration: num(body?.config?.duration, 3 * 60 * 60),
          ...(activeWindow ? { activeWindow } : {}),
          ...(body?.config?.page !== undefined ? { page: num(body.config.page, 1) } : {}),
          ...(body?.config?.pageSize !== undefined ? { pageSize: num(body.config.pageSize, 20) } : {}),
          ...(body?.config?.sort !== undefined ? { sort: num(body.config.sort, 1) } : {}),
          ...(body?.config?.minPrice !== undefined ? { minPrice: num(body.config.minPrice, 0) } : {}),
          ...(body?.config?.maxPrice !== undefined ? { maxPrice: num(body.config.maxPrice, 0) } : {}),
          ...(body?.config?.minChangeCount !== undefined
            ? { minChangeCount: num(body.config.minChangeCount, 10) }
            : {}),
          ...(body?.config?.dailyResetEnabled !== undefined
            ? { dailyResetEnabled: Boolean(body.config.dailyResetEnabled) }
            : {}),
          ...(typeof body?.config?.dailyResetHour === 'number'
            ? { dailyResetHour: Math.min(23, Math.max(0, Math.floor(body.config.dailyResetHour))) }
            : {}),
        },
        checkCount: 0,
        detectedCount: 0,
        currentTotal: 0,
        seenProductIds: [],
        seenProducts: [],
        events: [],
      },
    }
  },

  run(record: TaskRecordBase<TabTaskState>, ctx: TaskRunContext) {
    const state = record.state
    const task: TabMonitorTask = {
      recipient: record.userEmail,
      tabName: state.tab.name,
    }

    // 新建 / 重启从零开始；续跑保留重启前的统计
    if (!ctx.resume) {
      state.checkCount = 0
      state.detectedCount = 0
      state.currentTotal = 0
      state.lastDetectedAt = undefined
      state.events = []
    }

    const config: TabMonitorConfig = {
      ...state.config,
      tabId: state.tab.id,
      taskId: record.id,
      ...(ctx.durationSeconds !== undefined ? { duration: ctx.durationSeconds } : {}),
      initialCheckCount: state.checkCount,
      initialDetectedCount: state.detectedCount,
      // 每轮实时读取黑名单：运行中拉黑也能立刻生效
      getBlacklistedSuppliers: () => listBlacklistedSupplyIds(record.userId),
      ...(ctx.resume
        ? {
            fullInitialScan: false,
            initialSeenProducts: state.seenProducts ?? [],
            initialSeenProductIds: state.seenProductIds ?? [],
          }
        : { fullInitialScan: true }),
    }

    return createCancellableTabMonitor(
      task,
      config,
      progress => {
        state.checkCount = progress.checkCount
        state.detectedCount = progress.detectedCount
        state.currentTotal = progress.currentTotal

        // 已见集合平时只增不减；每日重建时 resetSeen=true 必须整体替换
        if (progress.resetSeen || progress.newlySeenProducts?.length) {
          const seen = progress.resetSeen ? new Set<string>() : new Set(state.seenProductIds ?? [])
          const products = progress.resetSeen ? [] : [...(state.seenProducts ?? [])]

          for (const item of progress.newlySeenProducts ?? []) {
            seen.add(item.productId)
            if (products.length < MAX_TAB_SEEN_PRODUCTS) products.push(item as TabSeenProduct)
          }

          state.seenProductIds = [...seen]
          state.seenProducts = products
        }

        ctx.save()
      },
      result => {
        if (result.detected && result.changeInfo) {
          state.lastDetectedAt = Date.now()
          const info = result.changeInfo
          const newProducts = info.newProducts ?? []
          const titles = newProducts
            .slice(0, 5)
            .map(item => item.productNameWithoutBrand || item.productName)
            .filter(Boolean)

          pushEvent(
            state,
            makeEvent('tab.new_items', {
              title:
                info.mode === 'accumulate'
                  ? `发现 ${newProducts.length} 个新商品`
                  : `列表变化：新增 ${newProducts.length} / 下架 ${info.removedProducts?.length ?? 0}`,
              ...(titles.length ? { detail: titles.join('、') } : {}),
              tone: 'success',
              emailSent: Boolean(result.emailSent),
              count: newProducts.length,
              items: newProducts.slice(0, 10).map(item => ({
                productId: item.productId,
                productName: item.productNameWithoutBrand || item.productName,
                price: item.price,
                ...(item.productNo ? { productNo: item.productNo } : {}),
              })),
            })
          )
        }
        ctx.save()
      }
    )
  },

  project(record, options = {}) {
    const state = record.state
    const seenProducts = state.seenProducts ?? []
    // 与「累计商品」弹窗同一口径：先记录后拉黑的商品不再计数
    const seenCount =
      seenProducts.length > 0
        ? countVisibleSeen(seenProducts, listBlacklistedSupplyIds(record.userId))
        : (state.seenProductIds?.length ?? 0)
    const events = options.full ? state.events : state.events.slice(0, LIST_EVENT_LIMIT)

    return {
      id: record.id,
      kind: KIND,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      target: {
        type: 'tab',
        id: state.tab.id,
        name: state.tab.name,
        subtitle: `Tab ID：${state.tab.id}`,
      },
      badges: [
        {
          text: state.config.mode === 'diff' ? '逐轮对比' : '累计新商品',
          tone: state.config.mode === 'diff' ? 'info' : 'success',
        },
        ...(state.config.activeWindow
          ? [
              {
                text: `生效 ${state.config.activeWindow.start}–${state.config.activeWindow.end}`,
                tone: 'neutral' as Tone,
              },
            ]
          : []),
      ],
      stats: [
        { key: 'checks', label: '次检测', value: state.checkCount },
        { key: 'detected', label: '次提醒', value: state.detectedCount },
        { key: 'total', label: '本轮抓取', value: state.currentTotal },
        { key: 'seen', label: '已记录商品', value: seenCount },
      ],
      config: {
        interval: state.config.interval,
        duration: state.config.duration,
        mode: state.config.mode,
        ...(state.config.activeWindow ? { activeWindow: state.config.activeWindow } : {}),
      },
      events,
      order: null,
      notice: null,
    } satisfies TaskSummary
  },

  restart(record) {
    const state = record.state
    return {
      state: {
        tab: state.tab,
        config: state.config,
        checkCount: 0,
        detectedCount: 0,
        currentTotal: 0,
        seenProductIds: [],
        seenProducts: [],
        events: [],
      },
    }
  },

  durationOf(record) {
    return record.state.config.duration
  },

  activeWindowOf(record) {
    return record.state.config.activeWindow
  },

  restore(record) {
    // 老任务只存了 ID：补出详情，保证「查看累计商品」有内容
    if (!record.state.seenProducts?.length && record.state.seenProductIds?.length) {
      const firstSeenAt = record.createdAt.toISOString()
      record.state.seenProducts = record.state.seenProductIds.map(productId => ({
        productId,
        productName: '',
        price: 0,
        firstSeenAt,
      }))
    }
    return true
  },
}
