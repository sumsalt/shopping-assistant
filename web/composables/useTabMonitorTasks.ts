/**
 * Tab 监控任务列表
 *
 * 通用列表逻辑在 useTaskCollection，这里保留 Tab 特有的
 * 「累计商品分页」「展开状态」与展示函数。
 */

import { useTaskCollection } from './useTaskCollection'
import { formatDuration, formatTime, getStatusColor, getStatusText } from '@/utils/taskFormat'

/** Tab 监控任务 */
export interface TabMonitorTaskItem {
  id: string
  tabId: string
  tabName: string
  status: 'running' | 'stopped' | 'completed'
  /** 监控模式：accumulate 累计新商品 / diff 逐轮对比 */
  mode?: 'accumulate' | 'diff'
  interval: number
  duration: number
  createdAt: Date
  checkCount: number
  detectedCount: number
  currentTotal: number
  /** 任务累计记录过的商品数（去重） */
  seenCount?: number
  lastDetectedAt?: Date
  recipient: string
  /** 每日生效时段（可选） */
  activeWindow?: { start: string; end: string }
}

/** 任务累计记录的商品（用于「查看累计商品」） */
export interface TabSeenProductItem {
  productId: string
  productName: string
  /** 卡片展示用的短名称（不带店铺名，由接口计算） */
  displayName?: string
  /** 不带店铺名的商品名称（新记录） */
  shortName?: string
  /** 商品货号（用于跳转系统内 SKU 详情页） */
  productNo?: string
  price: number
  productImage?: string
  productUrl?: string
  /** 供应商标识（用于店铺黑名单） */
  supplyId?: string
  /** 店铺名称 */
  shopName?: string
  /** 市场名称（辅助识别店铺） */
  marketName?: string
  /** 首次发现时间（ISO 字符串） */
  firstSeenAt: string
}

interface TabSeenListResponse {
  taskId: string
  tabName: string
  total: number
  offset: number
  limit: number
  hasMore: boolean
  items: TabSeenProductItem[]
}

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: { code: string; message: string }
}

export const useTabMonitorTasks = () => {
  const toast = useToast()
  const collection = useTaskCollection<TabMonitorTaskItem>({
    baseUrl: '/api/tab-monitor',
    deleteMessage: 'Tab 监控任务已删除',
    restartMessage: 'Tab 监控任务已重新发起',
  })

  /** 展开的任务 ID 集合 */
  const expandedTaskIds = ref<Set<string>>(new Set())

  /** 分页查询任务累计记录的商品（按首次发现时间倒序） */
  const fetchSeenProducts = async (
    taskId: string,
    offset = 0,
    limit = 50
  ): Promise<TabSeenListResponse | null> => {
    try {
      const response = await $fetch<ApiResponse<TabSeenListResponse>>('/api/tab-monitor/seen', {
        query: { taskId, offset, limit },
      })

      if (response.success && response.data) {
        return response.data
      }

      toast.error(response.error?.message || '加载累计商品失败')
      return null
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '网络请求失败')
      return null
    }
  }

  const toggleExpand = (taskId: string) => {
    if (expandedTaskIds.value.has(taskId)) {
      expandedTaskIds.value.delete(taskId)
    } else {
      expandedTaskIds.value.add(taskId)
    }
  }

  const isExpanded = (taskId: string): boolean => expandedTaskIds.value.has(taskId)

  /** 最后检测时间：绝对时间，便于核对 */
  const formatLastDetected = (date?: Date): string =>
    date ? new Date(date).toLocaleString('zh-CN') : '-'

  return {
    ...collection,
    fetchSeenProducts,
    toggleExpand,
    isExpanded,
    getStatusText,
    getStatusColor,
    formatTime,
    formatDuration,
    formatLastDetected,
  }
}
