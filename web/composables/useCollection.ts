import type { ApiResponse } from '@/types'

// 收藏夹商品类型
interface CollectionItem {
  productId: string
  productName: string
  brandName: string
  productNo: string
  inStock: boolean
  price: number
  productUrl: string
  productImage: string
  marketName: string
  salesOf7: number
  message: string
  collectId: string
}

// 收藏夹查询结果
interface CollectionResult {
  inStockItems: CollectionItem[]
  outOfStockItems: CollectionItem[]
  total: number
  inStockCount: number
  outOfStockCount: number
  page: number
  pageSize: number
  hasMore: boolean
}

// API 响应类型
/**
 * 收藏夹管理组合式函数
 */
export const useCollection = () => {
  const toast = useToast()
  const router = useRouter()

  // 收藏夹状态
  const collectionResult = ref<CollectionResult | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // 分页状态
  const currentPage = ref(1)
  const pageSize = ref(20)
  const hasMore = ref(false)

  // 所有已加载的商品
  const allInStockItems = ref<CollectionItem[]>([])
  const allOutOfStockItems = ref<CollectionItem[]>([])

  /**
   * 查询收藏夹
   */
  const fetchCollection = async (page: number = 1, append: boolean = false): Promise<CollectionResult | null> => {
    isLoading.value = true
    error.value = null

    try {
      // 收藏夹需要登录态，账号快照由服务端按当前账号取
      const response = await $fetch<ApiResponse<CollectionResult>>('/api/collection', {
        query: { page: String(page), pageSize: String(pageSize.value) },
      })

      if (response.success && response.data) {
        collectionResult.value = response.data
        currentPage.value = page
        hasMore.value = response.data.hasMore

        // 累加或重置商品列表
        if (append) {
          allInStockItems.value = [...allInStockItems.value, ...response.data.inStockItems]
          allOutOfStockItems.value = [...allOutOfStockItems.value, ...response.data.outOfStockItems]
        } else {
          allInStockItems.value = response.data.inStockItems
          allOutOfStockItems.value = response.data.outOfStockItems
        }

        return response.data
      } else {
        const errorMsg = response.error?.message || '查询失败'
        error.value = errorMsg
        toast.error(errorMsg)
        return null
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '网络请求失败'
      error.value = errorMsg
      toast.error(errorMsg)
      return null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 刷新收藏夹
   */
  const refresh = async () => {
    currentPage.value = 1
    allInStockItems.value = []
    allOutOfStockItems.value = []
    await fetchCollection(1, false)
  }

  /**
   * 加载更多
   */
  const loadMore = async () => {
    if (!hasMore.value || isLoading.value) {
      return
    }
    await fetchCollection(currentPage.value + 1, true)
  }

  /**
   * 跳转到商品详情页
   */
  const goToProductDetail = (productNo: string) => {
    router.push(`/stock/${productNo}`)
  }

  /**
   * 重置状态
   */
  const reset = () => {
    collectionResult.value = null
    error.value = null
    currentPage.value = 1
    hasMore.value = false
    allInStockItems.value = []
    allOutOfStockItems.value = []
  }

  return {
    // 状态
    collectionResult,
    isLoading,
    error,
    currentPage,
    pageSize,
    hasMore,
    allInStockItems,
    allOutOfStockItems,

    // 方法
    fetchCollection,
    refresh,
    loadMore,
    goToProductDetail,
    reset,
  }
}
