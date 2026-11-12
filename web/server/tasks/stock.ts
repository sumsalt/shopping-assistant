/**
 * 到货监控任务
 *
 * 一个任务只监控一个商品；可配置「有货自动下单」。
 */

import {
  createCancellableMonitor,
  MAX_AUTO_ORDER_NUM,
  MIN_STOCK_MONITOR_INTERVAL,
  type AutoOrderConfig,
  type MonitorResult,
  type MonitorTask,
  type StockMonitorConfig,
} from '@core'
import { ErrorCode } from '../utils/response'
import type { StoredTaskBase } from '../utils/taskStore'
import { persistTask } from '../utils/taskStore'
import { TaskRegistry } from './registry'
import { TaskApiError, type StartOverrides, type TaskDefinition } from './types'
import { ensureAutoRenewFromOrder } from './auto-renew'

export interface StockProductInfo {
  productId: string
  productName: string
  productImage?: string
}

export interface StockTaskRecord extends StoredTaskBase {
  product: StockProductInfo
  config: StockMonitorConfig
  result?: MonitorResult
  /** 创建时固化的账号 ID（自动下单成功后据此关联自动续期任务）；老任务为 undefined */
  accountId?: string
  /** 自动续期任务触发的一次性守卫 */
  autoRenewTriggered?: boolean
  controller?: AbortController
}

export const stockTasks = new TaskRegistry<StockTaskRecord>('stock')

/** 默认监控时长：3 小时（与前端选项一致） */
const DEFAULT_DURATION = 3 * 60 * 60

/** 同一用户下是否已有同商品的运行中任务（重启时排除自身） */
const findRunningForProduct = (userId: string, productId: string, excludeId?: string) =>
  stockTasks
    .all()
    .find(
      task =>
        task.userId === userId &&
        task.status === 'running' &&
        String(task.product.productId) === String(productId) &&
        task.id !== excludeId
    )

/**
 * 同一商品只允许一个运行中的任务
 *
 * 无论自动下单还是纯到货提醒，多开都会重复请求、重复发邮件；
 * 自动下单还会重复建单，所以统一在这里拦。
 */
const assertNoRunningForProduct = (userId: string, productId: string, excludeId?: string) => {
  if (findRunningForProduct(userId, productId, excludeId)) {
    throw new TaskApiError(
      ErrorCode.INVALID_PARAMS,
      '该商品已有到货监控任务在运行，请先删除后再发起'
    )
  }
}

/** 单个任务最多监控多少个规格（防止误传超长数组） */
const MAX_MONITOR_SKUS = 50

/** 解析监控规格：去重、去空、限长 */
const readSkuFilter = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return []
  const unique = [
    ...new Set(raw.map(item => String(item ?? '').trim()).filter(Boolean)),
  ]
  return unique.slice(0, MAX_MONITOR_SKUS)
}

/** 校验并归一化自动下单配置 */
const readAutoOrder = (
  raw: any,
  adapterConfig: { uid?: string; token?: string }
): AutoOrderConfig | undefined => {
  if (!raw?.enabled) return undefined

  if (!adapterConfig.uid || !adapterConfig.token) {
    throw new TaskApiError(
      ErrorCode.AUTH_REQUIRED,
      '自动下单需要一手登录态，请先在账号管理中选择带登录态的账号'
    )
  }

  const num = Number(raw.num ?? 1)
  if (!Number.isFinite(num) || num < 1 || num > MAX_AUTO_ORDER_NUM) {
    throw new TaskApiError(
      ErrorCode.INVALID_PARAMS,
      `购买件数需在 1~${MAX_AUTO_ORDER_NUM} 之间`
    )
  }

  return {
    enabled: true,
    num: Math.floor(num),
    payTool: raw.payTool === '1' ? '1' : '4',
    ...(raw.addressId ? { addressId: String(raw.addressId) } : {}),
  }
}

export const stockDefinition: TaskDefinition<StockTaskRecord> = {
  kind: 'stock',
  label: '到货监控',
  // 自动下单要拿库存的真实状态并下单，必须带登录态；
  // 按规格监控要查 SKU 明细（该接口拒绝匿名），同样需要登录态；纯商品级提醒走匿名桶
  needsAuth: body =>
    Boolean(body?.config?.autoOrder?.enabled || body?.config?.skus?.length),

  create({ body, user }) {
    const product = body?.product as StockProductInfo | undefined
    if (!product?.productId) {
      throw new TaskApiError(
        ErrorCode.INVALID_PARAMS,
        '请指定要监控的商品（一个任务只能监控一个商品）'
      )
    }

    const rawInterval = body?.config?.interval
    const interval =
      rawInterval === undefined || rawInterval === null || rawInterval === ''
        ? MIN_STOCK_MONITOR_INTERVAL
        : Number(rawInterval)

    if (!Number.isFinite(interval) || interval < MIN_STOCK_MONITOR_INTERVAL) {
      throw new TaskApiError(
        ErrorCode.INVALID_PARAMS,
        `检测间隔不能小于 ${MIN_STOCK_MONITOR_INTERVAL} 秒`
      )
    }

    const adapterConfig = body?.config?.adapterConfig || {}
    assertNoRunningForProduct(user.username, product.productId)
    const autoOrder = readAutoOrder(body?.config?.autoOrder, adapterConfig)
    const skus = readSkuFilter(body?.config?.skus)

    const config: StockMonitorConfig = {
      interval,
      duration: body?.config?.duration || DEFAULT_DURATION,
      adapterConfig,
      ...(skus.length ? { skus } : {}),
      ...(autoOrder ? { autoOrder } : {}),
    }

    return {
      product,
      config,
      // 由 createTaskHandler 注入；老任务没有该字段（不追溯自动续期）
      ...(body?.accountId ? { accountId: String(body.accountId) } : {}),
    }
  },

  start(record, overrides: StartOverrides = {}) {
    const task: MonitorTask = {
      request: { platform: 'yishou', productId: record.product.productId },
      recipient: record.userEmail,
      subject: `🔔 ${record.product.productName} 已到货`,
      productImage: record.product.productImage,
    }

    const config: StockMonitorConfig = {
      ...record.config,
      taskId: record.id,
      ...(overrides.duration !== undefined ? { duration: overrides.duration } : {}),
      ...(overrides.initialCheckCount !== undefined
        ? { initialCheckCount: overrides.initialCheckCount }
        : {}),
      ...(overrides.initialErrorCount !== undefined
        ? { initialErrorCount: overrides.initialErrorCount }
        : {}),
    }

    if (!record.result) {
      record.result = {
        productId: record.product.productId,
        productName: record.product.productName,
        detected: false,
        checkCount: overrides.initialCheckCount ?? 0,
        errorCount: overrides.initialErrorCount ?? 0,
      }
    }

    stockTasks.launch(
      record,
      () =>
        createCancellableMonitor(
          task,
          config,
          progress => console.log(`[到货监控] 任务 ${record.id} 进度:`, progress),
          result => {
            record.result = result
            // 自动下单成功：为对应账号补一个 12 小时续期任务（一次性、失败不影响监控）
            if (result.orderSn) {
              void ensureAutoRenewFromOrder(record, () => stockTasks.touch(record))
            }
            stockTasks.touch(record)
          }
        )
    )
  },

  restart(original) {
    // 已经下单成功的任务允许重新发起：会生成一条新任务重新盯货，原任务作为历史保留。
    // 但同商品不能同时跑两个，否则重复建单 / 重复发邮件。
    if (original.status === 'running') {
      throw new TaskApiError(
        ErrorCode.INVALID_PARAMS,
        '该任务正在运行，请先删除后再重新发起'
      )
    }
    assertNoRunningForProduct(original.userId, original.product.productId, original.id)

    return {
      product: original.product,
      config: {
        ...original.config,
        adapterConfig: { ...original.config.adapterConfig },
      },
    }
  },

  listView(task) {
    return {
      id: task.id,
      product: task.product,
      status: task.status,
      interval: task.config.interval,
      duration: task.config.duration,
      skus: task.config.skus ?? null,
      autoOrder: task.config.autoOrder ?? null,
      createdAt: task.createdAt,
      result: task.result,
    }
  },

  statusView(task) {
    // config 里固化了 adapterConfig（含 uid/token），详情接口不需要也无法再使用，
    // 前端早已不读它，这里剔除避免凭证随状态轮询反复下发
    const { adapterConfig: _ignored, ...safeConfig } = task.config
    return {
      id: task.id,
      status: task.status,
      product: task.product,
      config: safeConfig,
      createdAt: task.createdAt,
      result: task.result,
    }
  },

  createdView(record, action) {
    return {
      taskId: record.id,
      status: 'started',
      message: action === 'restarted' ? '监控任务已重新发起' : '监控任务已启动',
      interval: record.config.interval,
      duration: record.config.duration,
    }
  },

  restore(task, remainingSeconds) {
    // 已经下过单 / 下单结果未知的任务不能续跑：重启后重跑会再下一单
    if (task.result?.orderSn || task.result?.orderUncertain) {
      task.status = 'completed'
      persistTask('stock', task)
      return false
    }

    if (Number.isFinite(remainingSeconds) && remainingSeconds <= 0) {
      task.status = 'completed'
      persistTask('stock', task)
      return false
    }

    // 历史任务的间隔可能低于新下限（1 秒），续跑时统一抬到最小间隔
    if (task.config.interval !== undefined && task.config.interval < MIN_STOCK_MONITOR_INTERVAL) {
      task.config.interval = MIN_STOCK_MONITOR_INTERVAL
    }

    task.status = 'running'
    task.controller = undefined
    stockTasks.add(task)

    stockDefinition.start(task, {
      resume: true,
      duration: Number.isFinite(remainingSeconds) ? Math.floor(remainingSeconds) : undefined,
      initialCheckCount: task.result?.checkCount ?? 0,
      initialErrorCount: task.result?.errorCount ?? 0,
    })

    return true
  },
}
