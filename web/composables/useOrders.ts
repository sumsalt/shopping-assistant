import type { Ref } from 'vue'
import type { ApiResponse } from '@/types'
import type { OrderListItem } from '@core'

/** 本次查询使用的账号摘要（脱敏） */
export interface OrderAccount {
  id: string
  phone: string
}

/** 服务端返回的订单分页数据 */
interface OrderListPayload {
  items: OrderListItem[]
  page: number
  pageSize: number
  hasMore: boolean
  /** 本次查询使用的账号；未选中账号时为 null */
  account?: OrderAccount | null
}

/**
 * 订单列表组合式函数
 *
 * 一手每页最多 10 条且不返回总数，hasMore 由服务端按「本页是否满页」给出，
 * 前端只负责累加，不做本地切片。
 *
 * @param accountId 指定账号 ID（通常来自路由 query）；为空时查看当前账号的订单
 */
export const useOrders = (accountId?: Ref<string | null>) => {
  const requestedAccountId = computed(() => accountId?.value?.trim() || null)
  const toast = useToast()

  const orders = ref<OrderListItem[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const currentPage = ref(1)
  const hasMore = ref(false)
  const account = ref<OrderAccount | null>(null)

  /**
   * 查询订单
   */
  const fetchOrders = async (page: number = 1, append: boolean = false): Promise<void> => {
    isLoading.value = true
    error.value = null

    try {
      const response = await $fetch<ApiResponse<OrderListPayload>>('/api/orders', {
        query: {
          page: String(page),
          ...(requestedAccountId.value ? { accountId: requestedAccountId.value } : {}),
        },
      })

      if (response.success && response.data) {
        orders.value = append ? [...orders.value, ...response.data.items] : response.data.items
        currentPage.value = response.data.page
        hasMore.value = response.data.hasMore
        account.value = response.data.account ?? null
      } else {
        const errorMsg = response.error?.message || '订单加载失败'
        error.value = errorMsg
        toast.error(errorMsg)
      }
    } catch (err) {
      // Nuxt $fetch 会把服务端响应体挂在 data 上，优先用它给出具体原因
      const responseMessage = (err as { data?: { error?: { message?: string } } })?.data?.error?.message
      const errorMsg = responseMessage || (err instanceof Error ? err.message : '网络请求失败')
      error.value = errorMsg
      toast.error(errorMsg)
    } finally {
      isLoading.value = false
    }
  }

  /** 刷新：重置分页并清空上一账号的订单 */
  const refresh = async () => {
    orders.value = []
    currentPage.value = 1
    hasMore.value = false
    await fetchOrders(1, false)
  }

  /** 加载更多 */
  const loadMore = async () => {
    if (!hasMore.value || isLoading.value) {
      return
    }
    await fetchOrders(currentPage.value + 1, true)
  }

  return {
    orders,
    isLoading,
    error,
    currentPage,
    hasMore,
    account,

    fetchOrders,
    refresh,
    loadMore,
  }
}
