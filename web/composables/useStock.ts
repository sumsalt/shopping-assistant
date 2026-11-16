import type { ApiResponse } from '@/types'

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
  /** 一手收藏标记：'0' 未收藏、非 0 已收藏、undefined 未知（未登录或接口没返回） */
  collectId?: string
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
  /** 原价（划线价 / 门市价），为空表示没有可比的原价 */
  originalPrice?: number
  /** 价格口径说明：匿名查询时为「游客参考价」 */
  priceNote?: string
  productImage: string
  productUrl: string
  /** 商品图集（去重、主图兜底） */
  images: string[]
  /** 商品视频地址 */
  videoUrl?: string
  /** 商品标签 */
  tags: string[]
  /** 商品属性列表 */
  props: Array<{ label: string; value: string }>
  /** 档口信息 */
  provider?: { name: string; market: string; address: string; image: string }
  /** 发货地文案 */
  originName?: string
  /** 拼团 / 销售文案 */
  saleNote?: string
  /** 发货 / 清仓提醒 */
  remindNote?: string
  /** 可领红包（平台/档口/专场），仅登录态返回 */
  coupons: Array<{ couponId: string; typeTitle: string; title: string }>
  /** 新版满减券（满 threshold 减 reduce），仅登录态返回 */
  couponsNew: Array<{ couponId: string; threshold: number; reduce: number }>
  sales: number
  colors: string[]
  sizes: string[]
  skuList: SkuInfo[]
  inStockSkuCount: number
  totalSkuCount: number
  restrictionNumber: number
  /** 一手收藏标记：'0' 未收藏、非 0 已收藏、undefined 未知 */
  collectId?: string
}

// API 响应类型
/**
 * 库存查询组合式函数
 */
export const useStock = () => {
  const configStore = useConfigStore()
  const toast = useToast()
  const router = useRouter()

  // 库存查询状态
  const stockResult = ref<StockCheckResult | null>(null)
  const isCheckingStock = ref(false)
  const stockError = ref<string | null>(null)

  // SKU 查询状态
  const skuResult = ref<ProductSkuResult | null>(null)
  const isLoadingSkus = ref(false)
  const skuError = ref<string | null>(null)

  /**
   * 查询单品库存（服务端按当前账号使用登录态）
   */
  const checkStock = async (productId: string): Promise<StockCheckResult | null> => {
    isCheckingStock.value = true
    stockError.value = null
    stockResult.value = null

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
   * 获取商品 SKU 列表
   *
   * 只调 `get_goods_info_v2`，匿名也能查：没有登录态时价格是游客参考价，
   * 收藏状态恒为未收藏。所以这里不再拦截「必须选带登录态的账号」。
   */
  const getProductSkus = async (productId: string): Promise<ProductSkuResult | null> => {
    isLoadingSkus.value = true
    skuError.value = null
    skuResult.value = null

    try {
      // 直接刷新 /stock/xxx 时，页面的首个请求往往早于启动插件的配置拉取完成，
      // 此时 activeAccount 还是空，价格会降级成游客参考价。
      // load() 是幂等的：已加载立即返回，加载中会等同一份结果。
      if (!configStore.isInitialized) {
        await configStore.load()
      }

      const response = await $fetch<ApiResponse<ProductSkuResult>>(
        `/api/stock/skus/${productId}`
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
   * 跳转到商品详情页（按 goods_id，与 App 详情页一致）
   */
  const goToProductDetail = (productId: string) => {
    router.push(`/stock/${productId}`)
  }

  /**
   * 重置状态
   */
  const reset = () => {
    stockResult.value = null
    stockError.value = null
    skuResult.value = null
    skuError.value = null
  }

  return {
    // 库存查询
    stockResult,
    isCheckingStock,
    stockError,
    checkStock,

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
