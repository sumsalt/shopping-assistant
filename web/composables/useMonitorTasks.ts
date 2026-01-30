/**
 * 监控任务列表管理组合式函数
 */

// 监控任务类型
interface MonitorTaskItem {
  id: string
  taskCount: number
  products: Array<{
    productId: string
    platform: string
    recipient: string
    subject: string
  }>
  status: 'running' | 'stopped' | 'completed'
  interval: number
  duration: number
  createdAt: Date
  results?: any[]
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
      running: 'blue',
      stopped: 'gray',
      completed: 'green',
    }
    return colorMap[status] || 'gray'
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

  return {
    // 状态
    tasks,
    isLoading,
    error,

    // 方法
    fetchTasks,
    deleteTask,
    refresh,
    getStatusText,
    getStatusColor,
    formatTime,
  }
}
