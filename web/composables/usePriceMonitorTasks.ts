/**
 * 价格监控任务列表
 *
 * 通用列表逻辑在 useTaskCollection，这里只保留价格监控特有的类型与展示函数。
 */

import { useTaskCollection } from './useTaskCollection'
import { formatAmount, formatDuration, formatExpire, formatTime, getStatusColor, getStatusText } from '@/utils/taskFormat'

/** 商品信息 */
export interface PriceTaskProduct {
  productId: string
  productName?: string
  productImage?: string
  /** 商品货号，存在时可跳转商品详情页；历史任务缺失则降级为不可跳 */
  productNo?: string
}

/** 最近一次价格快照 */
export interface PriceSnapshotSummary {
  productId: string
  productName: string
  shopPrice: number
  checkedAt: number
}

/** 价格变化记录 */
export interface PriceChangeRecord {
  productId: string
  productName: string
  previousPrice: number
  currentPrice: number
  delta: number
  deltaPercent: number
  direction: 'up' | 'down'
  detectedAt: number
  emailSent: boolean
}

/** 优惠券变化记录 */
export interface CouponChangeRecord {
  added: Array<{ kind: string; label: string }>
  removed: Array<{ kind: string; label: string }>
  detectedAt: number
  emailSent: boolean
}

/** 价格到点自动下单配置 */
export interface PriceAutoOrderConfig {
  enabled: boolean
  /** 触发方式：按目标价（price）或按折扣（discount），默认 price */
  triggerMode?: 'price' | 'discount'
  targetPrice?: number
  /** 目标折扣（如 2.4 表示 2.4 折），triggerMode=discount 时生效 */
  targetDiscount?: number
  num?: number
  payTool?: string
  addressId?: string
  skus?: string[]
}

/** 自动下单成功记录 */
export interface PriceOrderRecord {
  orderSn: string
  orderAmount?: number
  skuLabel?: string
  items?: Array<{ sku: string; skuLabel: string; num: number }>
  num?: number
  expireAt?: number
  orderedAt: number
}

/** 价格监控任务 */
export interface PriceMonitorTaskItem {
  id: string
  product: PriceTaskProduct
  status: 'running' | 'stopped' | 'completed'
  interval?: number
  duration?: number
  notifyOn?: 'any' | 'drop' | 'rise'
  minPriceDelta?: number
  autoOrder?: PriceAutoOrderConfig | null
  createdAt: string
  checkCount: number
  detectedCount: number
  lastError?: string
  order?: PriceOrderRecord | null
  orderError?: string
  /** 本轮因商品无货跳过了下单（未真正发起下单请求） */
  orderSkipped?: 'no_stock'
  snapshot?: PriceSnapshotSummary
  changes: PriceChangeRecord[]
  couponChanges?: CouponChangeRecord[]
}

/** 监控条件文案 */
const getNotifyOnText = (notifyOn?: string): string => {
  if (notifyOn === 'drop') return '仅降价通知'
  if (notifyOn === 'rise') return '仅涨价通知'
  return '涨跌都通知'
}

/** 平均检测周期文案 */
const getCycleText = (task: PriceMonitorTaskItem): string => `约 ${task.interval || 60} 秒/次`

export const usePriceMonitorTasks = () => {
  const collection = useTaskCollection<PriceMonitorTaskItem>({
    baseUrl: '/api/price-monitor',
    deleteMessage: '价格监控任务已删除',
    restartMessage: '价格监控任务已重新发起',
  })

  return {
    ...collection,
    getStatusText,
    getStatusColor,
    formatTime,
    getNotifyOnText,
    getCycleText,
    formatDuration,
    formatAmount,
    formatExpire,
  }
}
