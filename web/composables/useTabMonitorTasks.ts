/**
 * Tab 监控任务列表管理组合式函数
 */

// Tab 监控任务类型
interface TabMonitorTaskItem {
  id: string
  tabId: string
  tabName: string
  status: 'running' | 'stopped' | 'completed'
  interval: number
  duration: number
  createdAt: Date
  checkCount: number
  detectedCount: number
  currentTotal: number
  /** 任务累计记录过的商品数（去重） */
  seenCount?: number
  lastDetectedAt?: Date
  recipient: string
  /** 每日生效时段（可选） */
  activeWindow?: { start: string; end: string }
}

// 任务列表响应类型
interface TabTaskListResponse {
  tasks: TabMonitorTaskItem[]
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

export const useTabMonitorTasks = () => {
  const toast = useToast()

  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // 任务列表
  const tasks = ref<TabMonitorTaskItem[]>([])

  // 展开的任务 ID 集合
  const expandedTaskIds = ref<Set<string>>(new Set())

  /**
   * 加载任务列表
   */
  const fetchTasks = async (): Promise<boolean> => {
    isLoading.value = true
    error.value = null

    try {
      const response = await $fetch<ApiResponse<TabTaskListResponse>>('/api/tab-monitor/list')

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
      const response = await $fetch<ApiResponse<{ message: string; taskId: string }>>('/api/tab-monitor/delete', {
        method: 'DELETE',
        query: { taskId },
      })

      if (response.success) {
        // 从列表中移除任务
        tasks.value = tasks.value.filter(t => t.id !== taskId)
        expandedTaskIds.value.delete(taskId)
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
      const response = await $fetch<ApiResponse<{ taskId: string; message: string }>>('/api/tab-monitor/restart', {
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
   * 切换展开/收起
   */
  const toggleExpand = (taskId: string) => {
    if (expandedTaskIds.value.has(taskId)) {
      expandedTaskIds.value.delete(taskId)
    } else {
      expandedTaskIds.value.add(taskId)
    }
  }

  /**
   * 判断是否展开
   */
  const isExpanded = (taskId: string): boolean => {
    return expandedTaskIds.value.has(taskId)
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
   * 格式化最后检测时间
   */
  const formatLastDetected = (date?: Date): string => {
    if (!date) return '-'
    const d = new Date(date)
    return d.toLocaleString('zh-CN')
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
    toggleExpand,
    isExpanded,
    getStatusText,
    getStatusColor,
    formatTime,
    formatLastDetected,
  }
}
