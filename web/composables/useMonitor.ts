import type { UserConfig } from '@/types'

// 监控任务类型
interface MonitorTask {
  request: {
    platform: string
    productId: string
  }
  recipient: string
  subject?: string
}

// 监控配置类型
interface MonitorConfig {
  interval?: number
  duration?: number
  adapterConfig?: Record<string, any>
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
  const configStore = useConfigStore()
  const { user, isLoggedIn, checkAuth } = useAuth()
  const toast = useToast()

  const isLoading = ref(false)
  const error = ref<string | null>(null)

  /**
   * 检查配置是否有效
   */
  const checkConfig = (): UserConfig | null => {
    const config = configStore.getConfigForApi()
    if (!config) {
      toast.warning('请先完成配置')
      return null
    }
    return config
  }

  /**
   * 创建监控任务（一个任务只监控一个商品）
   */
  const createMonitorTask = async (
    product: { productId: string; productName: string; productImage?: string },
    config?: MonitorConfig,
    options: { silent?: boolean } = {}
  ): Promise<string | null> => {
    const userConfig = checkConfig()
    if (!userConfig) {
      return null
    }

    // 确保用户已登录
    await checkAuth()

    if (!user.value || !user.value.email) {
      toast.warning('请先登录并配置邮箱地址')
      return null
    }

    isLoading.value = true
    error.value = null

    try {
      // 构建监控配置
      const monitorConfig: MonitorConfig = {
        interval: config?.interval || 1,
        duration: config?.duration || 3 * 60 * 60,
        adapterConfig: {
          // 暂时不使用登录态
          // uid: userConfig.uid || '',
          // token: userConfig.token || '',
          openid: userConfig.openid || '',
          model: userConfig.model || '',
          version: userConfig.version || '',
          version_name: userConfig.version_name || '',
          wx_version_name: userConfig.wx_version_name || '',
          proxyUrl: userConfig.proxyUrl,
          proxyEnabled: userConfig.proxyEnabled || '0',
        },
      }

      // 调用 API 创建任务
      const response = await $fetch<ApiResponse<CreateTaskResponse>>('/api/monitor/create', {
        method: 'POST',
        body: {
          product,
          config: monitorConfig,
        },
      })

      if (response.success && response.data) {
        if (!options.silent) {
          toast.success('已创建到货监控任务')
        }
        return response.data.taskId
      } else {
        const errorMsg = response.error?.message || '创建任务失败'
        error.value = errorMsg
        if (!options.silent) {
          toast.error(errorMsg)
        }
        return null
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '网络请求失败'
      error.value = errorMsg
      if (!options.silent) {
        toast.error(errorMsg)
      }
      return null
    } finally {
      isLoading.value = false
    }
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
      const taskId = await createMonitorTask(item, undefined, { silent: true })
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
  const getTaskStatus = async (taskId: string): Promise<TaskStatusResponse | null> => {
    try {
      const response = await $fetch<ApiResponse<TaskStatusResponse>>(
        `/api/monitor/status?taskId=${taskId}`
      )

      if (response.success && response.data) {
        return response.data
      } else {
        const errorMsg = response.error?.message || '查询失败'
        toast.error(errorMsg)
        return null
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '网络请求失败'
      toast.error(errorMsg)
      return null
    }
  }

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
