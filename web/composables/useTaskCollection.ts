/**
 * 任务列表通用逻辑
 *
 * 三类任务（到货 / Tab / 价格）的列表接口形状一致：
 *   GET  {base}/list    -> { tasks, total }
 *   DEL  {base}/delete  -> { message, taskId }
 *   POST {base}/restart -> { taskId, message }
 *
 * 这里只保留这一份实现，各自的 composable 变成「类型 + 专属方法」的薄壳。
 */

import type { Ref } from 'vue'

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: { code: string; message: string }
}

interface TaskListResponse<T> {
  tasks: T[]
  total: number
}

export interface TaskCollectionOptions {
  /** 接口前缀，例如 /api/monitor */
  baseUrl: string
  /** 删除成功提示 */
  deleteMessage?: string
  /** 重启成功提示 */
  restartMessage?: string
}

export const useTaskCollection = <T extends { id: string }>(
  options: TaskCollectionOptions
) => {
  const toast = useToast()

  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const tasks = ref<T[]>([]) as Ref<T[]>

  /** 统一的错误提示 + 状态写入 */
  const fail = (err: unknown, fallback: string): false => {
    const message = err instanceof Error ? err.message : fallback
    error.value = message
    toast.error(message)
    return false
  }

  const fetchTasks = async (): Promise<boolean> => {
    isLoading.value = true
    error.value = null

    try {
      const response = await $fetch<ApiResponse<TaskListResponse<T>>>(
        `${options.baseUrl}/list`
      )

      if (response.success && response.data) {
        tasks.value = response.data.tasks
        return true
      }

      const message = response.error?.message || '加载失败'
      error.value = message
      toast.error(message)
      return false
    } catch (err) {
      return fail(err, '网络请求失败')
    } finally {
      isLoading.value = false
    }
  }

  const request = async (
    action: 'delete' | 'restart',
    taskId: string
  ): Promise<boolean> => {
    isLoading.value = true
    // 注意：删除 / 重启失败只弹提示，不写 error —— 它驱动的是整页「加载失败」，
    // 一次操作被拒不该把列表打成错误态

    try {
      const response = await $fetch<ApiResponse<{ taskId: string; message: string }>>(
        `${options.baseUrl}/${action}`,
        action === 'delete'
          ? { method: 'DELETE', query: { taskId } }
          : { method: 'POST', body: { taskId } }
      )

      if (!response.success) {
        const message =
          response.error?.message || (action === 'delete' ? '删除失败' : '重新发起失败')
        toast.error(message)
        return false
      }

      if (action === 'delete') {
        tasks.value = tasks.value.filter(task => task.id !== taskId)
        toast.success(options.deleteMessage ?? '任务已删除')
        return true
      }

      await fetchTasks()
      toast.success(options.restartMessage ?? '监控任务已重新发起')
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '网络请求失败')
      return false
    } finally {
      isLoading.value = false
    }
  }

  const deleteTask = (taskId: string) => request('delete', taskId)
  const restartTask = (taskId: string) => request('restart', taskId)
  const refresh = () => {
    fetchTasks()
  }

  return { tasks, isLoading, error, fetchTasks, deleteTask, restartTask, refresh }
}
