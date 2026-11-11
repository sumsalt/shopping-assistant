/**
 * 价格监控任务列表
 *
 * 通用列表逻辑在 useTaskCollection，这里只保留价格监控特有的类型与展示函数。
 */

import { useTaskCollection } from './useTaskCollection'
import { formatDuration, formatTime, getStatusColor, getStatusText } from '@/utils/taskFormat'

/** 商品信息 */
export interface PriceTaskProduct {
  productId: string
  productName?: string
  productImage?: string
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

/** 价格监控任务 */
export interface PriceMonitorTaskItem {
  id: string
  product: PriceTaskProduct
  status: 'running' | 'stopped' | 'completed'
  interval?: number
  duration?: number
  notifyOn?: 'any' | 'drop' | 'rise'
  minPriceDelta?: number
  createdAt: string
  checkCount: number
  detectedCount: number
  lastError?: string
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
  }
}
