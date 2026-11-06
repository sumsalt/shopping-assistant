/**
 * Tab 监控任务管理组合式函数
 */

import type { UserConfig } from '@/types'

// Tab 监控配置类型
interface TabMonitorConfig {
  tabId: string
  tabName: string
  interval?: number
  duration?: number
  page?: number
  pageSize?: number
  /** 每轮抓取页数，默认 1 */
  pageCount?: number
  sort?: number
  minPrice?: number
  maxPrice?: number
  minChangeCount?: number
  /** 监控模式：accumulate 累计新商品 / diff 逐轮对比 */
  mode?: 'accumulate' | 'diff'
  /** 每日生效时段（可选） */
  activeWindow?: { start: string; end: string }
  adapterConfig?: Record<string, any>
}

// 创建任务响应类型
interface CreateTabTaskResponse {
  taskId: string
  status: string
  message: string
  tabId: string
  tabName: string
  interval: number
  duration: number
}

// 任务状态响应类型
interface TabTaskStatusResponse {
  id: string
  status: 'running' | 'stopped' | 'completed'
  tabId: string
  tabName: string
  config: TabMonitorConfig
  createdAt: Date
  checkCount: number
  detectedCount: number
  currentTotal: number
  lastDetectedAt?: Date
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
 * Tab 监控任务管理组合式函数
 */
export const useTabMonitor = () => {
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
   * 创建 Tab 监控任务
   */
  const createTabMonitorTask = async (
    config: TabMonitorConfig
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
      const monitorConfig: TabMonitorConfig = {
        tabId: config.tabId,
        tabName: config.tabName,
        interval: config.interval || 300, // 默认 5 分钟
        duration: config.duration || 2 * 60 * 60, // 默认 2 小时
        page: config.page || 1,
        pageSize: config.pageSize || 20,
        pageCount: config.pageCount || 1,
        sort: config.sort || 1,
        minPrice: config.minPrice || 0,
        maxPrice: config.maxPrice || 0,
        minChangeCount: config.minChangeCount || 10,
        mode: config.mode ?? 'accumulate',
        ...(config.activeWindow ? { activeWindow: config.activeWindow } : {}),
        adapterConfig: {
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
      const response = await $fetch<ApiResponse<CreateTabTaskResponse>>('/api/tab-monitor/create', {
        method: 'POST',
        body: {
          tabId: config.tabId,
          tabName: config.tabName,
          config: monitorConfig,
          recipient: user.value.email,
        },
      })

      if (response.success && response.data) {
        toast.success(`已创建 Tab 监控任务: ${config.tabName}`)
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
   * 查询任务状态
   */
  const getTaskStatus = async (taskId: string): Promise<TabTaskStatusResponse | null> => {
    try {
      const response = await $fetch<ApiResponse<TabTaskStatusResponse>>(
        `/api/tab-monitor/status?taskId=${taskId}`
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
    createTabMonitorTask,
    getTaskStatus,
  }
}
