/**
 * 价格监控组合式函数
 *
 * 只监控登录态（uid + token）下的 shop_price，创建前会强制校验登录态与邮箱
 */

import { useTaskSubmit } from './useTaskSubmit'

/** 检测间隔硬下限（秒） */
export const MIN_PRICE_MONITOR_INTERVAL = 60

/** 默认检测间隔（秒） */
export const DEFAULT_PRICE_MONITOR_INTERVAL = 60

/** 默认监控时长（秒），3 小时 */
export const DEFAULT_PRICE_MONITOR_DURATION = 3 * 60 * 60

/** 通知条件 */
export type PriceNotifyOn = 'any' | 'drop' | 'rise'

/** 待监控商品 */
export interface PriceMonitorProduct {
  productId: string
  productName?: string
  productImage?: string
  /** 商品货号（下单链路查 SKU 用，缺失时由服务端查询） */
  productNo?: string
}

/** 价格到点自动下单 */
export interface PriceAutoOrderOptions {
  /** 是否启用自动下单（开关打开时必为 true，服务端据此落库配置） */
  enabled: boolean
  /** 拿货价低于或等于该价格时自动下单 */
  targetPrice: number
  /** 购买件数 */
  num?: number
  /** 支付方式：1 支付宝 / 4 微信 */
  payTool?: '1' | '4'
  /** 收货地址，缺省用账号默认地址 */
  addressId?: string
  /** 只在这些规格里下单，空表示全部 */
  skus?: string[]
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
  /** 价格到点自动下单（可选） */
  autoOrder?: PriceAutoOrderOptions
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

/** 创建价格监控任务 */
export const usePriceMonitor = () => {
  const configStore = useConfigStore()
  const { user, checkAuth } = useAuth()
  const toast = useToast()
  const { isLoading, error, submit } = useTaskSubmit()

  /**
   * 价格监控必须有登录态（服务端也会兜底）
   *
   * 直接刷新页面后立刻创建任务时，配置可能还在拉取中，
   * 先等一次 load() 再判断，避免误报「没有登录态」。
   */
  const checkConfig = async (): Promise<boolean> => {
    if (!configStore.isInitialized) {
      await configStore.load()
    }
    if (!configStore.activeAccount?.hasCredential) {
      toast.warning('价格监控需要登录态，请先在账号管理中选择带登录态的账号')
      return false
    }
    return true
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

    if (!(await checkConfig())) {
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

    const data = await submit<CreatePriceTaskResponse>(
      '/api/price-monitor/create',
      {
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
          ...(options.autoOrder ? { autoOrder: options.autoOrder } : {}),
        },
      },
      { successMessage: '已创建价格监控任务', failureMessage: '创建价格监控失败' }
    )

    return data?.taskId ?? null
  }

  return {
    // 状态
    isLoading,
    error,

    // 方法
    createPriceMonitorTask,
  }
}
