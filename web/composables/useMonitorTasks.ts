/**
 * 到货监控任务列表
 *
 * 通用列表逻辑在 useTaskCollection，这里只保留到货监控特有的类型与展示函数。
 */

import { useTaskCollection } from './useTaskCollection'
import {
  formatAmount,
  formatExpire,
  formatTime,
  getStatusColor,
  getStatusText,
} from '@/utils/taskFormat'

export interface MonitorTaskItem {
  id: string
  product: {
    productId: string
    productName: string
    productImage?: string
  }
  status: 'running' | 'stopped' | 'completed'
  interval: number
  duration: number
  /** 自动下单配置：非空表示这是一条自动下单任务 */
  autoOrder?: {
    enabled: boolean
    num?: number
    payTool?: string
    addressId?: string
  } | null
  createdAt: Date
  result?: {
    productId: string
    productName: string
    detected: boolean
    emailSent?: boolean
    error?: string
    checkCount: number
    errorCount?: number
    /** 自动下单成功的订单号 */
    orderSn?: string
    /** 订单金额 */
    orderAmount?: number
    /** 支付截止时间 */
    orderExpireAt?: number
    /** 下单规格 */
    orderSkuLabel?: string
    /** 下单失败原因 */
    orderError?: string
    /** 失败阶段 */
    orderStage?: string
    /** 下单结果未知 */
    orderUncertain?: boolean
    /** 下单尝试次数 */
    orderAttempts?: number
  }
}

export const useMonitorTasks = () => {
  const collection = useTaskCollection<MonitorTaskItem>({
    baseUrl: '/api/monitor',
    deleteMessage: '任务已删除',
    restartMessage: '监控任务已重新发起',
  })

  return {
    ...collection,
    getStatusText,
    getStatusColor,
    formatTime,
    formatAmount,
    formatExpire,
    getTotalRequestCount: (task: MonitorTaskItem) => task.result?.checkCount || 0,
    getFailedRequestCount: (task: MonitorTaskItem) => task.result?.errorCount || 0,
  }
}
