
// 库存查询结果类型
interface StockCheckResult {
  platform: string
  productId: string
  productName: string
  productNo: string
  inStock: boolean
  price: number
  /** 价格口径说明，如匿名查询降级后的「游客参考价」 */
  priceNote?: string
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

  /** 当前账号是否带登录态（服务端也会兜底校验） */
  const hasCredential = computed(() => Boolean(configStore.activeAccount?.hasCredential))

  /**
   * 查询单品库存（匿名：剔除 uid/token）
   */
  const checkStock = async (productId: string): Promise<StockCheckResult | null> => {
    isCheckingStock.value = true
    stockError.value = null
    stockResult.value = null
    batchStockResults.value = null

    try {
      const response = await $fetch<ApiResponse<StockCheckResult>>('/api/stock/check', {
        method: 'POST',
        body: { productId },
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
   * 批量查询商品库存（匿名：剔除 uid/token）
   */
  const checkStockBatch = async (
    productIds: string[],
    skus?: string[]
  ): Promise<BatchStockCheckResult | null> => {
    isCheckingStock.value = true
    stockError.value = null
    stockResult.value = null
    batchStockResults.value = null

    try {
      const response = await $fetch<ApiResponse<BatchStockCheckResult>>('/api/stock/check', {
        method: 'POST',
        body: {
          productId: productIds,
          ...(skus ? { sku: skus } : {}),
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
   * 获取商品 SKU 列表（需要登录态）
   */
  const getProductSkus = async (productNo: string): Promise<ProductSkuResult | null> => {
    isLoadingSkus.value = true
    skuError.value = null
    skuResult.value = null

    try {
      // 直接刷新 /stock/xxx 时，页面的首个请求往往早于启动插件的配置拉取完成，
      // 此时 activeAccount 还是空，会被误判成「没有登录态」。
      // load() 是幂等的：已加载立即返回，加载中会等同一份结果。
      if (!configStore.isInitialized) {
        await configStore.load()
      }

      // add_cart_goods_info 必须带登录态，缺凭证时一手直接返回「请登录」，
      // 这里提前拦下来给出可操作的提示，不用等接口失败
      if (!hasCredential.value) {
        const message = '查看 SKU 详情需要登录态，请先在账号管理中选择带登录态的账号'
        skuError.value = message
        toast.warning(message)
        return null
      }

      const response = await $fetch<ApiResponse<ProductSkuResult>>(
        `/api/stock/skus/${productNo}`
      )

      if (response.success && response.data) {
        skuResult.value = response.data
        return response.data
      } else {
        const rawError = response.error?.message || '查询失败'
        // 登录态失效时一手只回「请登录」，补一句下一步该怎么办
        const errorMsg = rawError.includes('登录')
          ? `${rawError}（一手登录态缺失或已失效，请到账号管理重新选择账号或更新抓包）`
          : rawError
        skuError.value = errorMsg
        toast.error(errorMsg)
        return null
      }
    } catch (error) {
      const rawError = error instanceof Error ? error.message : '网络请求失败'
      const errorMsg = rawError.includes('登录')
        ? `${rawError}（一手登录态缺失或已失效，请到账号管理重新选择账号或更新抓包）`
        : rawError
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
