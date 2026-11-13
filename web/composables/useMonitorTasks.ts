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
    /** 商品货号，存在时可跳转商品详情页；历史任务缺失则降级为不可跳 */
    productNo?: string
  }
  status: 'running' | 'stopped' | 'completed'
  interval: number
  duration: number
  /** 只监控这些规格；空表示全部规格 */
  skus?: string[] | null
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
    /** 下单规格（多规格合单时用「、」连接） */
    orderSkuLabel?: string
    /** 下单明细：多规格合单时有多行 */
    orderItems?: Array<{ sku: string; skuLabel: string; num: number }>
    /** 实际下单件数 */
    orderNum?: number
    /** 商品有货但所选规格没货 */
    skuWaiting?: boolean
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
    /** 下单明细文案：蓝色 / M × 1、蓝色 / L × 1 */
    formatOrderItems: (items?: Array<{ skuLabel: string; num: number }>) =>
      (items || []).map(item => `${item.skuLabel} × ${item.num}`).join('、'),
  }
}
