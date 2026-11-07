/**
 * 店铺黑名单管理组合式函数
 *
 * 黑名单以「供应商标识」为键：Tab 商品列表接口只给出 supply_id，
 * 没有店铺名称，所以名称是可选的（不填就显示「供应商 xxxx」）。
 */

import { ref } from 'vue'

/** 黑名单记录 */
export interface ShopBlacklistItem {
  id: string
  supplyId: string
  name: string
  marketName: string
  note: string
  createdAt: string
}

/** 新增入参 */
export interface ShopBlacklistPayload {
  supplyId: string
  name?: string
  marketName?: string
  note?: string
}

/** API 响应 */
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

/** 提交结果 */
export interface BlacklistSubmitResult {
  success: boolean
  error?: string
}

/** 记录的展示名称 */
export const blacklistDisplayName = (item: ShopBlacklistItem): string =>
  item.name || `供应商 ${item.supplyId}`

export const useShopBlacklist = () => {
  const toast = useToast()

  const items = ref<ShopBlacklistItem[]>([])
  const isLoading = ref(true)
  const isSubmitting = ref(false)
  const error = ref<string | null>(null)

  /**
   * 拉取黑名单
   */
  const fetchBlacklist = async (): Promise<void> => {
    isLoading.value = true
    error.value = null

    try {
      const response = await $fetch<ApiResponse<{ items: ShopBlacklistItem[] }>>(
        '/api/shops/blacklist/list'
      )

      if (response.success && response.data) {
        items.value = response.data.items
      } else {
        const message = response.error?.message || '加载黑名单失败'
        error.value = message
        toast.error(message)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '网络请求失败'
      error.value = message
      toast.error(message)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 加入黑名单
   */
  const addBlacklist = async (payload: ShopBlacklistPayload): Promise<BlacklistSubmitResult> => {
    isSubmitting.value = true

    try {
      const response = await $fetch<ApiResponse<{ item: ShopBlacklistItem }>>(
        '/api/shops/blacklist/create',
        {
          method: 'POST',
          body: payload,
        }
      )

      if (!response.success) {
        return { success: false, error: response.error?.message || '保存失败' }
      }

      await fetchBlacklist()
      toast.success('已加入黑名单')
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '网络请求失败' }
    } finally {
      isSubmitting.value = false
    }
  }

  /**
   * 移出黑名单
   */
  const removeBlacklist = async (id: string): Promise<BlacklistSubmitResult> => {
    try {
      const response = await $fetch<ApiResponse<{ id: string }>>('/api/shops/blacklist/delete', {
        method: 'DELETE',
        query: { id },
      })

      if (!response.success) {
        const message = response.error?.message || '移出失败'
        toast.error(message)
        return { success: false, error: message }
      }

      items.value = items.value.filter(item => item.id !== id)
      toast.success('已移出黑名单')
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : '网络请求失败'
      toast.error(message)
      return { success: false, error: message }
    }
  }

  return {
    items,
    isLoading,
    isSubmitting,
    error,
    fetchBlacklist,
    addBlacklist,
    removeBlacklist,
  }
}
