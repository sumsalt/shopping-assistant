import type { ApiResponse } from '@/types'

/**
 * 店铺评分管理组合式函数
 */

import { ref } from 'vue'

/** 店铺记录 */
export interface ShopItem {
  id: string
  name: string
  /** 星级 1-5 */
  rating: number
  note: string
  url: string
  createdAt: string
  updatedAt: string
}

/** 新增 / 更新入参 */
export interface ShopPayload {
  name: string
  rating: number
  note?: string
  url?: string
}

/** 星级分布 */
export type RatingCounts = Record<string, number>

/** 列表响应 */
interface ShopListData {
  shops: ShopItem[]
  total: number
  averageRating: number
  ratingCounts: RatingCounts
}

/** API 响应 */
/** 提交结果 */
export interface ShopSubmitResult {
  success: boolean
  error?: string
}

/** 补零 */
const pad = (value: number): string => String(value).padStart(2, '0')

/**
 * 格式化时间（避免服务端 / 客户端本地化差异导致水合不一致）
 */
export const formatShopTime = (input?: string): string => {
  if (!input) {
    return ''
  }
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const now = new Date()
  const datePart =
    date.getFullYear() === now.getFullYear()
      ? `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
      : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `${datePart} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const useShops = () => {
  const toast = useToast()

  const shops = ref<ShopItem[]>([])
  const total = ref(0)
  const averageRating = ref(0)
  const ratingCounts = ref<RatingCounts>({})
  // 首屏直接进入加载态，避免先闪一下「暂无记录」
  const isLoading = ref(true)
  const isSubmitting = ref(false)
  const error = ref<string | null>(null)

  /**
   * 拉取店铺列表
   */
  const fetchShops = async (): Promise<void> => {
    isLoading.value = true
    error.value = null

    try {
      const response = await $fetch<ApiResponse<ShopListData>>('/api/shops/list')
      if (response.success && response.data) {
        shops.value = response.data.shops
        total.value = response.data.total
        averageRating.value = response.data.averageRating
        ratingCounts.value = response.data.ratingCounts ?? {}
      } else {
        const message = response.error?.message || '加载店铺列表失败'
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
   * 新增店铺
   */
  const createShop = async (payload: ShopPayload): Promise<ShopSubmitResult> => {
    isSubmitting.value = true

    try {
      const response = await $fetch<ApiResponse<{ shop: ShopItem }>>('/api/shops/create', {
        method: 'POST',
        body: payload,
      })

      if (!response.success) {
        return { success: false, error: response.error?.message || '保存失败' }
      }

      await fetchShops()
      toast.success('店铺已添加')
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '网络请求失败' }
    } finally {
      isSubmitting.value = false
    }
  }

  /**
   * 更新店铺
   */
  const updateShop = async (id: string, payload: ShopPayload): Promise<ShopSubmitResult> => {
    isSubmitting.value = true

    try {
      const response = await $fetch<ApiResponse<{ shop: ShopItem }>>('/api/shops/update', {
        method: 'POST',
        body: { id, ...payload },
      })

      if (!response.success) {
        return { success: false, error: response.error?.message || '保存失败' }
      }

      await fetchShops()
      toast.success('已保存修改')
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '网络请求失败' }
    } finally {
      isSubmitting.value = false
    }
  }

  /**
   * 删除店铺
   */
  const deleteShop = async (id: string): Promise<ShopSubmitResult> => {
    try {
      const response = await $fetch<ApiResponse<{ id: string }>>('/api/shops/delete', {
        method: 'DELETE',
        query: { id },
      })

      if (!response.success) {
        const message = response.error?.message || '删除失败'
        toast.error(message)
        return { success: false, error: message }
      }

      shops.value = shops.value.filter(shop => shop.id !== id)
      total.value = shops.value.length
      const sum = shops.value.reduce((acc, shop) => acc + shop.rating, 0)
      averageRating.value = shops.value.length
        ? Math.round((sum / shops.value.length) * 10) / 10
        : 0

      const counts: RatingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      for (const shop of shops.value) {
        counts[String(shop.rating)] = (counts[String(shop.rating)] ?? 0) + 1
      }
      ratingCounts.value = counts

      toast.success('店铺已删除')
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : '网络请求失败'
      toast.error(message)
      return { success: false, error: message }
    }
  }

  return {
    shops,
    total,
    averageRating,
    ratingCounts,
    isLoading,
    isSubmitting,
    error,
    fetchShops,
    createShop,
    updateShop,
    deleteShop,
  }
}
