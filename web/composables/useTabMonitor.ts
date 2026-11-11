/**
 * Tab 监控任务管理组合式函数
 */

import { useTaskSubmit } from './useTaskSubmit'

// Tab 监控配置类型
interface TabMonitorConfig {
  tabId: string
  tabName: string
  interval?: number
  duration?: number
  page?: number
  pageSize?: number
  sort?: number
  minPrice?: number
  maxPrice?: number
  minChangeCount?: number
  /** 监控模式：accumulate 累计新商品 / diff 逐轮对比 */
  mode?: 'accumulate' | 'diff'
  /** 每日生效时段（可选） */
  activeWindow?: { start: string; end: string }
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

/**
 * Tab 监控任务管理组合式函数
 */
export const useTabMonitor = () => {
  const { user, checkAuth } = useAuth()
  const toast = useToast()
  const { isLoading, error, submit, fetchStatus } = useTaskSubmit()

  /**
   * 创建 Tab 监控任务
   */
  const createTabMonitorTask = async (
    config: TabMonitorConfig
  ): Promise<string | null> => {
    // 确保用户已登录
    await checkAuth()

    if (!user.value || !user.value.email) {
      toast.warning('请先登录并配置邮箱地址')
      return null
    }

    // 构建监控配置
    const monitorConfig: TabMonitorConfig = {
      tabId: config.tabId,
      tabName: config.tabName,
      interval: config.interval || 300, // 默认 5 分钟
      duration: config.duration || 2 * 60 * 60, // 默认 2 小时
      page: config.page || 1,
      pageSize: config.pageSize || 20,
      sort: config.sort || 1,
      minPrice: config.minPrice || 0,
      maxPrice: config.maxPrice || 0,
      minChangeCount: config.minChangeCount || 10,
      mode: config.mode ?? 'accumulate',
      ...(config.activeWindow ? { activeWindow: config.activeWindow } : {}),
    }

    const data = await submit<CreateTabTaskResponse>(
      '/api/tab-monitor/create',
      {
        tabId: config.tabId,
        tabName: config.tabName,
        config: monitorConfig,
        recipient: user.value.email,
      },
      { successMessage: `已创建 Tab 监控任务: ${config.tabName}`, failureMessage: '创建任务失败' }
    )

    return data?.taskId ?? null
  }

  /**
   * 查询任务状态
   */
  const getTaskStatus = (taskId: string): Promise<TabTaskStatusResponse | null> =>
    fetchStatus<TabTaskStatusResponse>('/api/tab-monitor/status', taskId)

  return {
    // 状态
    isLoading,
    error,

    // 方法
    createTabMonitorTask,
    getTaskStatus,
  }
}
