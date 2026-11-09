/**
 * Tab 监控任务列表管理组合式函数
 */

// Tab 监控任务类型
interface TabMonitorTaskItem {
  id: string
  tabId: string
  tabName: string
  status: 'running' | 'stopped' | 'completed'
  /** 监控模式：accumulate 累计新商品 / diff 逐轮对比 */
  mode?: 'accumulate' | 'diff'
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

/** 任务累计记录的商品（用于「查看累计商品」） */
export interface TabSeenProductItem {
  productId: string
  productName: string
  /** 卡片展示用的短名称（不带店铺名，由接口计算） */
  displayName?: string
  /** 不带店铺名的商品名称（新记录） */
  shortName?: string
  /** 商品货号（用于跳转系统内 SKU 详情页） */
  productNo?: string
  price: number
  productImage?: string
  productUrl?: string
  /** 供应商标识（用于店铺黑名单） */
  supplyId?: string
  /** 店铺名称 */
  shopName?: string
  /** 市场名称（辅助识别店铺） */
  marketName?: string
  /** 首次发现时间（ISO 字符串） */
  firstSeenAt: string
}

// 累计商品列表响应类型
interface TabSeenListResponse {
  taskId: string
  tabName: string
  total: number
  offset: number
  limit: number
  hasMore: boolean
  items: TabSeenProductItem[]
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
   * 查询任务累计记录的商品（按首次发现时间倒序）
   */
  const fetchSeenProducts = async (
    taskId: string,
    offset = 0,
    limit = 50
  ): Promise<TabSeenListResponse | null> => {
    try {
      const response = await $fetch<ApiResponse<TabSeenListResponse>>('/api/tab-monitor/seen', {
        query: { taskId, offset, limit },
      })

      if (response.success && response.data) {
        return response.data
      }

      toast.error(response.error?.message || '加载累计商品失败')
      return null
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '网络请求失败')
      return null
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
    fetchSeenProducts,
    refresh,
    toggleExpand,
    isExpanded,
    getStatusText,
    getStatusColor,
    formatTime,
    formatLastDetected,
  }
}
