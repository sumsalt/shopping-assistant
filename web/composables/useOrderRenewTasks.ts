/**
 * 订单续期任务列表
 *
 * 通用列表逻辑（拉取 / 删除 / 重新发起）在 useTaskCollection，
 * 这里只保留续期任务特有的类型与展示函数。
 */

import { useTaskCollection } from './useTaskCollection'
import {
  formatAmount,
  formatExpire,
  formatTime,
  formatDuration,
  getStatusColor,
  getStatusText,
} from '@/utils/taskFormat'

/** 任务绑定的账号摘要 */
export interface RenewTaskAccount {
  id: string
  phone: string
  title: string
}

/** 一条续期记录 */
export interface RenewTaskRenewal {
  orderSn: string
  renewedAt: number
  remainingBefore?: number
  expireBefore?: number
  expireAfter?: number
  verified?: boolean
  orderAmount?: number
  finishedReason?: string
}

/** 订单续期任务 */
export interface OrderRenewTaskItem {
  id: string
  account: RenewTaskAccount | null
  source: 'manual' | 'auto'
  sourceTaskId?: string | null
  status: 'running' | 'stopped' | 'completed'
  duration?: number
  createdAt: string
  checkCount: number
  scannedCount: number
  renewedCount: number
  skippedCount: number
  finishedCount: number
  lastError?: string | null
  lastScanAt?: number | null
  recentRenewals: RenewTaskRenewal[]
}

/** 每分钟扫描一次 */
const getCycleText = (): string => '每分钟 1 次'

export const useOrderRenewTasks = () => {
  const collection = useTaskCollection<OrderRenewTaskItem>({
    baseUrl: '/api/order-renew',
    deleteMessage: '订单续期任务已删除',
    restartMessage: '订单续期任务已重新发起',
  })

  return {
    ...collection,
    getStatusText,
    getStatusColor,
    formatTime,
    formatDuration,
    formatAmount,
    formatExpire,
    getCycleText,
  }
}
