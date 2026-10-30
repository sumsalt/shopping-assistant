/**
 * 价格监控任务列表管理组合式函数
 */

/** 商品信息 */
export interface PriceTaskProduct {
  productId: string
  productName?: string
  productImage?: string
}

/** 最近一次价格快照 */
export interface PriceSnapshotSummary {
  productId: string
  productName: string
  shopPrice: number
  checkedAt: number
}

/** 价格变化记录 */
export interface PriceChangeRecord {
  productId: string
  productName: string
  previousPrice: number
  currentPrice: number
  delta: number
  deltaPercent: number
  direction: 'up' | 'down'
  detectedAt: number
  emailSent: boolean
}

/** 价格监控任务 */
export interface PriceMonitorTaskItem {
  id: string
  product: PriceTaskProduct
  status: 'running' | 'stopped' | 'completed'
  interval?: number
  duration?: number
  notifyOn?: 'any' | 'drop' | 'rise'
  minPriceDelta?: number
  createdAt: string
  checkCount: number
  detectedCount: number
  lastError?: string
  snapshot?: PriceSnapshotSummary
  changes: PriceChangeRecord[]
}

/** 任务列表响应 */
interface PriceTaskListResponse {
  tasks: PriceMonitorTaskItem[]
  total: number
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

export const usePriceMonitorTasks = () => {
  const toast = useToast()

  const isLoading = ref(false)
  const error = ref<string | null>(null)

  /** 任务列表 */
  const tasks = ref<PriceMonitorTaskItem[]>([])

  /**
   * 加载任务列表
   */
  const fetchTasks = async (): Promise<boolean> => {
    isLoading.value = true
    error.value = null

    try {
      const response = await $fetch<ApiResponse<PriceTaskListResponse>>(
        '/api/price-monitor/list'
      )

      if (response.success && response.data) {
        tasks.value = response.data.tasks
        return true
      }

      const errorMsg = response.error?.message || '加载失败'
      error.value = errorMsg
      toast.error(errorMsg)
      return false
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '网络请求失败'
      error.value = errorMsg
      toast.error(errorMsg)
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 删除任务
   */
  const deleteTask = async (taskId: string): Promise<boolean> => {
    isLoading.value = true
    error.value = null

    try {
      const response = await $fetch<ApiResponse<{ message: string; taskId: string }>>(
        '/api/price-monitor/delete',
        {
          method: 'DELETE',
          query: { taskId },
        }
      )

      if (response.success) {
        tasks.value = tasks.value.filter(task => task.id !== taskId)
        toast.success('任务已删除')
        return true
      }

      const errorMsg = response.error?.message || '删除失败'
      error.value = errorMsg
      toast.error(errorMsg)
      return false
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '网络请求失败'
      error.value = errorMsg
      toast.error(errorMsg)
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 重新发起监控任务
   */
  const restartTask = async (taskId: string): Promise<boolean> => {
    isLoading.value = true
    error.value = null

    try {
      const response = await $fetch<ApiResponse<{ taskId: string; message: string }>>(
        '/api/price-monitor/restart',
        {
          method: 'POST',
          body: { taskId },
        }
      )

      if (response.success) {
        await fetchTasks()
        toast.success('价格监控任务已重新发起')
        return true
      }

      const errorMsg = response.error?.message || '重新发起失败'
      error.value = errorMsg
      toast.error(errorMsg)
      return false
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '网络请求失败'
      error.value = errorMsg
      toast.error(errorMsg)
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 刷新任务列表
   */
  const refresh = () => {
    fetchTasks()
  }

  /**
   * 获取状态文本
   */
  const getStatusText = (status: string): string => {
    const statusMap: Record<string, string> = {
      running: '监控中',
      stopped: '已停止',
      completed: '已完成',
    }
    return statusMap[status] || status
  }

  /**
   * 获取状态颜色
   */
  const getStatusColor = (status: string): 'default' | 'success' | 'warning' | 'danger' | 'info' => {
    const colorMap: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
      running: 'info',
      stopped: 'default',
      completed: 'success',
    }
    return colorMap[status] || 'default'
  }

  /**
   * 格式化时间
   */
  const formatTime = (date: string | number | Date): string => {
    const target = new Date(date)
    const now = new Date()
    const diff = now.getTime() - target.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes} 分钟前`
    if (hours < 24) return `${hours} 小时前`
    if (days < 7) return `${days} 天前`

    return target.toLocaleDateString('zh-CN')
  }

  /**
   * 获取监控条件文本
   */
  const getNotifyOnText = (notifyOn?: string): string => {
    if (notifyOn === 'drop') return '仅降价通知'
    if (notifyOn === 'rise') return '仅涨价通知'
    return '涨跌都通知'
  }

  /**
   * 获取任务的平均检测周期文案
   */
  const getCycleText = (task: PriceMonitorTaskItem): string => {
    const interval = task.interval || 60
    return `约 ${interval} 秒/次`
  }

  /**
   * 秒数格式化为可读时长
   */
  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '不限时'
    if (seconds < 60) return `${seconds} 秒`
    if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`
    return `${(seconds / 3600).toFixed(seconds % 3600 === 0 ? 0 : 1)} 小时`
  }

  return {
    // 状态
    tasks,
    isLoading,
    error,

    // 方法
    fetchTasks,
    deleteTask,
    restartTask,
    refresh,
    getStatusText,
    getStatusColor,
    formatTime,
    getNotifyOnText,
    getCycleText,
    formatDuration,
  }
}
