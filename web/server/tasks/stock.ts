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
import { TaskApiError, type StartOverrides, type TaskDefinition, type TaskUser } from './types'

export interface StockProductInfo {
  productId: string
  productName: string
  productImage?: string
}

export interface StockTaskRecord extends StoredTaskBase {
  product: StockProductInfo
  config: StockMonitorConfig
  result?: MonitorResult
  controller?: AbortController
}

export const stockTasks = new TaskRegistry<StockTaskRecord>('stock')

/** 默认监控时长：24 小时（与前端选项一致） */
const DEFAULT_DURATION = 24 * 60 * 60

/** 校验并归一化自动下单配置 */
const readAutoOrder = (
  raw: any,
  adapterConfig: { uid?: string; token?: string },
  user: TaskUser,
  productId: string
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

  // 同一商品只允许存在一个运行中的自动下单任务，防止重复建单
  const duplicate = stockTasks
    .all()
    .find(
      task =>
        task.userId === user.username &&
        task.status === 'running' &&
        task.config.autoOrder?.enabled &&
        String(task.product.productId) === String(productId)
    )

  if (duplicate) {
    throw new TaskApiError(
      ErrorCode.INVALID_PARAMS,
      '该商品已有自动下单任务在运行，请先在任务列表里删除'
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
    const autoOrder = readAutoOrder(body?.config?.autoOrder, adapterConfig, user, product.productId)

    const config: StockMonitorConfig = {
      interval,
      duration: body?.config?.duration || DEFAULT_DURATION,
      adapterConfig,
      ...(autoOrder ? { autoOrder } : {}),
    }

    return { product, config }
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
            stockTasks.touch(record)
          }
        )
    )
  },

  async restart(original) {
    // 已经自动下单成功的任务不能再发一次，否则会重复建单
    if (original.result?.orderSn) {
      throw new TaskApiError(ErrorCode.INVALID_PARAMS, '该任务已自动下单成功，不能重复发起')
    }

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
      autoOrder: task.config.autoOrder ?? null,
      createdAt: task.createdAt,
      result: task.result,
    }
  },

  statusView(task) {
    return {
      id: task.id,
      status: task.status,
      product: task.product,
      config: task.config,
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
