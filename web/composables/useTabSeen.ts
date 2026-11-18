/**
 * Tab 任务「累计商品」分页查询
 *
 * 与任务列表解耦：列表页只需要 TaskSummary，这个接口只在打开弹窗时调用。
 */

import type { ApiResponse } from '@/types'
import { useToast } from '@/composables/useToast'

export interface TabSeenProductItem {
  productId: string
  productName: string
  displayName?: string
  shortName?: string
  productNo?: string
  price: number
  /** 原价（划线价/门市价，高于现价时可算折扣） */
  originalPrice?: number
  productImage?: string
  productUrl?: string
  supplyId?: string
  shopName?: string
  marketName?: string
  /** 抓取时的收藏状态：'0' 未收藏、非 0 已收藏、undefined 未知（老记录） */
  collectId?: string
  firstSeenAt: string
}

export interface TabSeenListResponse {
  taskId: string
  tabName: string
  /** 当前任务累计商品涉及的市场（已排除黑名单、去重排序），用于筛选下拉 */
  markets: string[]
  /** 未做市场筛选的总数 */
  totalAll: number
  total: number
  offset: number
  limit: number
  hasMore: boolean
  items: TabSeenProductItem[]
}

export const useTabSeen = () => {
  const toast = useToast()

  const fetchSeenProducts = async (
    taskId: string,
    offset = 0,
    limit = 50,
    sort: 'recent' | 'discount' = 'recent',
    market = 'all'
  ): Promise<TabSeenListResponse | null> => {
    try {
      const response = await $fetch<ApiResponse<TabSeenListResponse>>('/api/tab-monitor/seen', {
        query: { taskId, offset, limit, sort, market },
      })
      if (response.success && response.data) return response.data

      toast.error(response.error?.message || '加载累计商品失败')
      return null
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '网络请求失败')
      return null
    }
  }

  return { fetchSeenProducts }
}
