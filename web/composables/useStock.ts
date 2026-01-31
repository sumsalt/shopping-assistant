import type { UserConfig } from '@/types'

// 库存查询结果类型
interface StockCheckResult {
  platform: string
  productId: string
  productName: string
  productNo: string
  inStock: boolean
  price: number
  productUrl: string
  productImage: string
  message: string
}

// 批量库存查询结果类型
interface BatchStockCheckResult {
  platform: string
  successItems: StockCheckResult[]
  failedItems: Array<{
    productId: string
    error: string
    errorType: string
  }>
  total: number
  successCount: number
  failedCount: number
}

// SKU 信息类型
interface SkuInfo {
  skuId: string
  color: string
  colorId: string
  size: string
  stock: number
  saleStock: number
  inStock: boolean
  colorImage: string
}

// 商品 SKU 查询结果
interface ProductSkuResult {
  platform: string
  productId: string
  productName: string
  productNo: string
  price: number
  productImage: string
  productUrl: string
  sales: number
  colors: string[]
  sizes: string[]
  skuList: SkuInfo[]
  inStockSkuCount: number
  totalSkuCount: number
  restrictionNumber: number
}

// API 响应类型
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

/**
 * 库存查询组合式函数
 */
export const useStock = () => {
  const configStore = useConfigStore()
  const toast = useToast()
  const router = useRouter()

  // 库存查询状态
  const stockResult = ref<StockCheckResult | null>(null)
  const batchStockResults = ref<BatchStockCheckResult | null>(null)
  const isCheckingStock = ref(false)
  const stockError = ref<string | null>(null)

  // SKU 查询状态
  const skuResult = ref<ProductSkuResult | null>(null)
  const isLoadingSkus = ref(false)
  const skuError = ref<string | null>(null)

  /**
   * 检查配置是否有效
   */
  const checkConfig = (): UserConfig | null => {
    const config = configStore.getConfigForApi()
    if (!config) {
      toast.warning('请先完成配置')
      router.push('/settings?redirect=/stock/check')
      return null
    }
    return config
  }

  /**
   * 查询单品库存
   */
  const checkStock = async (productId: string): Promise<StockCheckResult | null> => {
    const config = checkConfig()
    if (!config) {
      return null
    }

    isCheckingStock.value = true
    stockError.value = null
    stockResult.value = null
    batchStockResults.value = null

    try {
      const response = await $fetch<ApiResponse<StockCheckResult>>('/api/stock/check', {
        method: 'POST',
        body: {
          productId,
          config,
        },
      })

      if (response.success && response.data) {
        stockResult.value = response.data
        return response.data
      } else {
        const errorMsg = response.error?.message || '查询失败'
        stockError.value = errorMsg
        toast.error(errorMsg)
        return null
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '网络请求失败'
      stockError.value = errorMsg
      toast.error(errorMsg)
      return null
    } finally {
      isCheckingStock.value = false
    }
  }

  /**
   * 批量查询商品库存
   */
  const checkStockBatch = async (
    productIds: string[],
    skus?: string[]
  ): Promise<BatchStockCheckResult | null> => {
    const config = checkConfig()
    if (!config) {
      return null
    }

    isCheckingStock.value = true
    stockError.value = null
    stockResult.value = null
    batchStockResults.value = null

    try {
      const response = await $fetch<ApiResponse<BatchStockCheckResult>>('/api/stock/check', {
        method: 'POST',
        body: {
          productId: productIds,
          sku: skus,
          config,
        },
      })

      if (response.success && response.data) {
        batchStockResults.value = response.data

        // 如果只有一个商品且查询成功，也设置到 stockResult 以兼容旧逻辑
        if (response.data.successItems.length === 1) {
          stockResult.value = response.data.successItems[0]
        }

        return response.data
      } else {
        const errorMsg = response.error?.message || '查询失败'
        stockError.value = errorMsg
        toast.error(errorMsg)
        return null
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '网络请求失败'
      stockError.value = errorMsg
      toast.error(errorMsg)
      return null
    } finally {
      isCheckingStock.value = false
    }
  }

  /**
   * 获取商品 SKU 列表
   */
  const getProductSkus = async (productNo: string): Promise<ProductSkuResult | null> => {
    const config = checkConfig()
    if (!config) {
      return null
    }

    isLoadingSkus.value = true
    skuError.value = null
    skuResult.value = null

    try {
      // 构建查询参数
      const params = new URLSearchParams({
        uid: config.uid || '',
        token: config.token || '',
        openid: config.openid || '',
        model: config.model || '',
        version: config.version || '',
        version_name: config.version_name || '',
        wx_version_name: config.wx_version_name || '',
        proxyUrl: config.proxyUrl || '',
      })

      const response = await $fetch<ApiResponse<ProductSkuResult>>(
        `/api/stock/skus/${productNo}?${params.toString()}`
      )

      if (response.success && response.data) {
        skuResult.value = response.data
        return response.data
      } else {
        const errorMsg = response.error?.message || '查询失败'
        skuError.value = errorMsg
        toast.error(errorMsg)
        return null
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '网络请求失败'
      skuError.value = errorMsg
      toast.error(errorMsg)
      return null
    } finally {
      isLoadingSkus.value = false
    }
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
    stockResult.value = null
    batchStockResults.value = null
    stockError.value = null
    skuResult.value = null
    skuError.value = null
  }

  return {
    // 库存查询
    stockResult,
    batchStockResults,
    isCheckingStock,
    stockError,
    checkStock,
    checkStockBatch,

    // SKU 查询
    skuResult,
    isLoadingSkus,
    skuError,
    getProductSkus,

    // 工具方法
    goToProductDetail,
    reset,
  }
}
