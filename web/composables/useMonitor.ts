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
  taskCount: number
  interval: number
  duration: number
}

// 任务状态响应类型
interface TaskStatusResponse {
  id: string
  status: 'running' | 'stopped' | 'completed'
  taskCount: number
  config: MonitorConfig
  createdAt: Date
  results?: any[]
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
   * 创建监控任务
   */
  const createMonitorTask = async (
    products: Array<{ productId: string; productName: string; productImage?: string }>,
    config?: MonitorConfig
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
        duration: config?.duration || 3600,
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
          products,
          config: monitorConfig,
        },
      })

      if (response.success && response.data) {
        toast.success(`已创建监控任务，共 ${response.data.taskCount} 个商品`)
        return response.data.taskId
      } else {
        const errorMsg = response.error?.message || '创建任务失败'
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
   * 为所有无货商品创建监控任务
   */
  const monitorAllOutOfStock = async (
    outOfStockItems: Array<{
      productId: string
      productName: string
      productImage?: string
    }>
  ): Promise<string | null> => {
    if (outOfStockItems.length === 0) {
      toast.warning('没有无货商品需要监控')
      return null
    }

    return createMonitorTask(outOfStockItems)
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
