import { DEFAULT_STOCK_MONITOR_DURATION } from '@/utils/stockMonitorConfig'
import { useTaskSubmit } from './useTaskSubmit'

/** 库存监控的最小检测间隔（秒），与后端 MIN_STOCK_MONITOR_INTERVAL 保持一致 */
export const MIN_STOCK_MONITOR_INTERVAL = 2

// 监控任务类型
interface MonitorTask {
  request: {
    platform: string
    productId: string
  }
  recipient: string
  subject?: string
}

// 自动下单配置
export interface AutoOrderSettings {
  enabled: boolean
  /** 购买件数 */
  num?: number
  /** 收货地址 ID，不传则用账号默认地址 */
  addressId?: string
  /** 支付方式：1 支付宝 / 4 微信 */
  payTool?: '1' | '4'
}

// 监控配置类型
interface MonitorConfig {
  interval?: number
  duration?: number
  /** 有货自动下单（需要登录态） */
  autoOrder?: AutoOrderSettings
}

// 创建任务响应类型
interface CreateTaskResponse {
  taskId: string
  status: string
  message: string
  interval: number
  duration: number
}

// 任务状态响应类型
interface TaskStatusResponse {
  id: string
  status: 'running' | 'stopped' | 'completed'
  product: {
    productId: string
    productName: string
    productImage?: string
  }
  config: MonitorConfig
  createdAt: Date
  result?: {
    productId: string
    productName: string
    detected: boolean
    emailSent?: boolean
    error?: string
    checkCount: number
    errorCount?: number
  }
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
 * 监控任务管理组合式函数
 */
export const useMonitor = () => {
  const { user, isLoggedIn, checkAuth } = useAuth()
  const toast = useToast()
  const { isLoading, error, submit, fetchStatus } = useTaskSubmit()

  /**
   * 创建监控任务（一个任务只监控一个商品）
   */
  const createMonitorTask = async (
    product: { productId: string; productName: string; productImage?: string },
    config?: MonitorConfig,
    options: { silent?: boolean } = {}
  ): Promise<string | null> => {
    // 确保用户已登录
    await checkAuth()

    if (!user.value || !user.value.email) {
      toast.warning('请先登录并配置邮箱地址')
      return null
    }

    // 账号快照由服务端解析：自动下单取登录态，纯提醒取匿名快照（服务端按 needsAuth 判断）
    const monitorConfig: MonitorConfig = {
      interval: config?.interval || MIN_STOCK_MONITOR_INTERVAL,
      duration: config?.duration || DEFAULT_STOCK_MONITOR_DURATION,
      ...(config?.autoOrder ? { autoOrder: config.autoOrder } : {}),
    }

    const data = await submit<CreateTaskResponse>(
      '/api/monitor/create',
      { product, config: monitorConfig },
      {
        successMessage: config?.autoOrder?.enabled
          ? '已创建到货监控任务（有货自动下单）'
          : '已创建到货监控任务（仅邮件提醒）',
        failureMessage: '创建任务失败',
        silent: options.silent,
      }
    )

    return data?.taskId ?? null
  }

  /**
   * 为多个无货商品分别创建监控任务（一个商品一个任务）
   *
   * @returns 成功创建的任务数
   */
  const monitorAllOutOfStock = async (
    outOfStockItems: Array<{
      productId: string
      productName: string
      productImage?: string
    }>
  ): Promise<number> => {
    if (outOfStockItems.length === 0) {
      toast.warning('没有无货商品需要监控')
      return 0
    }

    let created = 0
    let failed = 0

    for (const item of outOfStockItems) {
      const taskId = await createMonitorTask(
        item,
        { duration: DEFAULT_STOCK_MONITOR_DURATION },
        { silent: true }
      )
      if (taskId) {
        created++
      } else {
        failed++
      }
    }

    if (created > 0) {
      toast.success(
        failed > 0
          ? `已创建 ${created} 个监控任务，${failed} 个失败`
          : `已创建 ${created} 个监控任务`
      )
    } else {
      toast.error('创建监控任务失败')
    }

    return created
  }

  /**
   * 查询任务状态
   */
  const getTaskStatus = (taskId: string): Promise<TaskStatusResponse | null> =>
    fetchStatus<TaskStatusResponse>('/api/monitor/status', taskId)

  return {
    // 状态
    isLoading,
    error,

    // 方法
    createMonitorTask,
    monitorAllOutOfStock,
    getTaskStatus,
  }
}
