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
  productImage?: string
  productUrl?: string
  supplyId?: string
  shopName?: string
  marketName?: string
  firstSeenAt: string
}

export interface TabSeenListResponse {
  taskId: string
  tabName: string
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
    limit = 50
  ): Promise<TabSeenListResponse | null> => {
    try {
      const response = await $fetch<ApiResponse<TabSeenListResponse>>('/api/tab-monitor/seen', {
        query: { taskId, offset, limit },
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
