/**
 * 价格监控组合式函数
 *
 * 只监控登录态（uid + token）下的 shop_price，创建前会强制校验登录态与邮箱
 */

import type { UserConfig } from '@/types'
import { buildAdapterConfig, hasLoginCredential } from '@/utils/adapterConfig'

/** 检测间隔硬下限（秒） */
export const MIN_PRICE_MONITOR_INTERVAL = 60

/** 默认检测间隔（秒） */
export const DEFAULT_PRICE_MONITOR_INTERVAL = 60

/** 默认监控时长（秒），24 小时 */
export const DEFAULT_PRICE_MONITOR_DURATION = 24 * 60 * 60

/** 通知条件 */
export type PriceNotifyOn = 'any' | 'drop' | 'rise'

/** 待监控商品 */
export interface PriceMonitorProduct {
  productId: string
  productName?: string
  productImage?: string
}

/** 创建价格监控的参数 */
export interface PriceMonitorOptions {
  /** 轮次间隔（秒），最小 60 */
  interval?: number
  /** 监控时长（秒） */
  duration?: number
  /** 通知条件 */
  notifyOn?: PriceNotifyOn
  /** 最小价格变动（元） */
  minPriceDelta?: number
}

/** 创建任务响应 */
interface CreatePriceTaskResponse {
  taskId: string
  status: string
  message: string
  interval: number
  duration?: number
  snapshot: {
    productId: string
    productName: string
    shopPrice: number
    checkedAt: number
  }
}

/** API 响应类型 */
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

export const usePriceMonitor = () => {
  const configStore = useConfigStore()
  const { user, checkAuth } = useAuth()
  const toast = useToast()

  const isLoading = ref(false)
  const error = ref<string | null>(null)

  /**
   * 检查配置是否有效（价格监控必须有登录态）
   */
  const checkConfig = (): UserConfig | null => {
    const config = configStore.getConfigForApi()

    if (!config) {
      toast.warning('请先完成配置')
      return null
    }

    if (!hasLoginCredential(config)) {
      toast.warning('价格监控需要登录态，请先在账号管理中选择带登录态的账号')
      return null
    }

    return config
  }

  /**
   * 创建价格监控任务
   *
   * 一个任务只监控一个商品，需要监控多个商品时分别创建任务。
   *
   * @param product 待监控商品
   * @param options 监控参数
   * @returns 任务 ID，失败返回 null
   */
  const createPriceMonitorTask = async (
    product: PriceMonitorProduct,
    options: PriceMonitorOptions = {}
  ): Promise<string | null> => {
    if (!product || !product.productId) {
      toast.warning('请选择要监控的商品')
      return null
    }

    const userConfig = checkConfig()
    if (!userConfig) {
      return null
    }

    // 确保用户已登录，邮箱用于接收通知
    await checkAuth()

    if (!user.value || !user.value.email) {
      toast.warning('请先登录并配置邮箱地址')
      return null
    }

    const interval = Math.max(
      MIN_PRICE_MONITOR_INTERVAL,
      Number(options.interval) || DEFAULT_PRICE_MONITOR_INTERVAL
    )

    isLoading.value = true
    error.value = null

    try {
      const response = await $fetch<ApiResponse<CreatePriceTaskResponse>>(
        '/api/price-monitor/create',
        {
          method: 'POST',
          body: {
            product: {
              productId: product.productId,
              productName: product.productName,
              productImage: product.productImage,
            },
            config: {
              interval,
              duration: options.duration || DEFAULT_PRICE_MONITOR_DURATION,
              notifyOn: options.notifyOn || 'any',
              minPriceDelta: options.minPriceDelta ?? 0.01,
              // 价格监控必须登录态，完整回放当前账号的抓包快照
              adapterConfig: buildAdapterConfig(userConfig, true),
            },
          },
        }
      )

      if (response.success && response.data) {
        toast.success('已创建价格监控任务')
        return response.data.taskId
      }

      const errorMsg = response.error?.message || '创建价格监控失败'
      error.value = errorMsg
      toast.error(errorMsg)
      return null
    } catch (err: any) {
      const errorMsg = err?.data?.message || err?.message || '网络请求失败'
      error.value = errorMsg
      toast.error(errorMsg)
      return null
    } finally {
      isLoading.value = false
    }
  }

  return {
    // 状态
    isLoading,
    error,

    // 方法
    createPriceMonitorTask,
  }
}
