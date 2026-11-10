/**
 * 监控任务列表管理组合式函数
 */

// 监控任务类型
interface MonitorTaskItem {
  id: string
  product: {
    productId: string
    productName: string
    productImage?: string
  }
  status: 'running' | 'stopped' | 'completed'
  interval: number
  duration: number
  /** 自动下单配置：非空表示这是一条自动下单任务 */
  autoOrder?: {
    enabled: boolean
    num?: number
    payTool?: string
    addressId?: string
  } | null
  createdAt: Date
  result?: {
    productId: string
    productName: string
    detected: boolean
    emailSent?: boolean
    error?: string
    checkCount: number
    errorCount?: number
    /** 自动下单成功的订单号 */
    orderSn?: string
    /** 订单金额 */
    orderAmount?: number
    /** 支付截止时间 */
    orderExpireAt?: number
    /** 下单规格 */
    orderSkuLabel?: string
    /** 下单失败原因 */
    orderError?: string
    /** 失败阶段 */
    orderStage?: string
    /** 下单结果未知 */
    orderUncertain?: boolean
    /** 下单尝试次数 */
    orderAttempts?: number
  }
}

// 任务列表响应类型
interface TaskListResponse {
  tasks: MonitorTaskItem[]
  total: number
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

export const useMonitorTasks = () => {
  const toast = useToast()

  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // 任务列表
  const tasks = ref<MonitorTaskItem[]>([])

  // 展开的任务 ID 集合

  /**
   * 加载任务列表
   */
  const fetchTasks = async (): Promise<boolean> => {
    isLoading.value = true
    error.value = null

    try {
      const response = await $fetch<ApiResponse<TaskListResponse>>('/api/monitor/list')

      if (response.success && response.data) {
        tasks.value = response.data.tasks
        return true
      } else {
        const errorMsg = response.error?.message || '加载失败'
        error.value = errorMsg
        toast.error(errorMsg)
        return false
      }
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
      const response = await $fetch<ApiResponse<{ message: string; taskId: string }>>('/api/monitor/delete', {
        method: 'DELETE',
        query: { taskId },
      })

      if (response.success) {
        // 从列表中移除任务
        tasks.value = tasks.value.filter(t => t.id !== taskId)
        toast.success('任务已删除')
        return true
      } else {
        const errorMsg = response.error?.message || '删除失败'
        error.value = errorMsg
        toast.error(errorMsg)
        return false
      }
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
      const response = await $fetch<ApiResponse<{ taskId: string; message: string }>>('/api/monitor/restart', {
        method: 'POST',
        body: { taskId },
      })

      if (response.success) {
        // 刷新任务列表
        await fetchTasks()
        toast.success('监控任务已重新发起')
        return true
      } else {
        const errorMsg = response.error?.message || '重新发起失败'
        error.value = errorMsg
        toast.error(errorMsg)
        return false
      }
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
  const getStatusColor = (status: string): string => {
    const colorMap: Record<string, string> = {
      running: 'info',
      stopped: 'default',
      completed: 'success',
    }
    return colorMap[status] || 'default'
  }

  /**
   * 格式化时间
   */
  const formatTime = (date: Date): string => {
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes} 分钟前`
    if (hours < 24) return `${hours} 小时前`
    if (days < 7) return `${days} 天前`

    return d.toLocaleDateString('zh-CN')
  }

  /**
   * 格式化金额
   */
  const formatAmount = (amount?: number): string => {
    if (amount === undefined || amount === null || Number.isNaN(amount)) {
      return '-'
    }
    return `¥${amount.toFixed(2)}`
  }

  /**
   * 格式化支付截止时间
   */
  const formatExpire = (expireAt?: number): string => {
    if (!expireAt) {
      return ''
    }
    const date = new Date(expireAt)
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  /**
   * 计算请求总次数
   */
  const getTotalRequestCount = (task: MonitorTaskItem): number => {
    return task.result?.checkCount || 0
  }

  /**
   * 计算请求失败次数
   */
  const getFailedRequestCount = (task: MonitorTaskItem): number => {
    return task.result?.errorCount || 0
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
    formatAmount,
    formatExpire,
    getTotalRequestCount,
    getFailedRequestCount,
  }
}
