/**
 * 任务列表的通用逻辑
 *
 * 四类任务的列表接口形状完全一致：
 *   GET    {base}/list    -> { tasks: TaskSummary[], total }
 *   DELETE {base}/delete  -> { taskId, message }
 *   POST   {base}/restart -> { taskId, task, message }
 *
 * 页面只关心「拿到的统一视图」，不再各自手写 DTO。
 */

import type { ApiResponse } from '@/types'
import type { TaskListPayload, TaskSummary } from '@core/contract'
import { useToast } from '@/composables/useToast'

export interface UseTaskListOptions {
  /** 自动刷新间隔（毫秒），传 0 关闭；默认 10 秒 */
  pollMs?: number
}

export const useTaskList = (
  baseUrl: string,
  options: UseTaskListOptions = {}
) => {
  const toast = useToast()

  const pollMs = options.pollMs ?? 10_000

  const tasks = ref<TaskSummary[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  /** 正在操作的任务 id（删除 / 重启） */
  const busyId = ref('')

  /**
   * 拉取列表
   *
   * silent 用于轮询：不置 loading、不弹 toast，失败时保留上一次的数据，
   * 避免网络抖动把页面变成错误态。
   */
  const fetchTasks = async (silent = false): Promise<void> => {
    if (!silent) {
      isLoading.value = true
      error.value = null
    }

    try {
      const response = await $fetch<ApiResponse<TaskListPayload>>(`${baseUrl}/list`)
      if (response.success && response.data) {
        tasks.value = response.data.tasks
        error.value = null
        return
      }
      const message = response.error?.message || '加载失败'
      if (silent) return
      error.value = message
      toast.error(message)
    } catch (err) {
      if (silent) return
      const message = err instanceof Error ? err.message : '网络请求失败'
      error.value = message
      toast.error(message)
    } finally {
      if (!silent) isLoading.value = false
    }
  }

  const remove = async (task: TaskSummary): Promise<boolean> => {
    busyId.value = task.id
    try {
      const response = await $fetch<ApiResponse<{ taskId: string; message: string }>>(
        `${baseUrl}/delete`,
        { method: 'DELETE', query: { taskId: task.id } }
      )
      if (!response.success) {
        toast.error(response.error?.message || '删除失败')
        return false
      }
      tasks.value = tasks.value.filter(item => item.id !== task.id)
      toast.success('任务已删除')
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '网络请求失败')
      return false
    } finally {
      busyId.value = ''
    }
  }

  const restart = async (task: TaskSummary): Promise<boolean> => {
    busyId.value = task.id
    try {
      const response = await $fetch<ApiResponse<{ taskId: string }>>(`${baseUrl}/restart`, {
        method: 'POST',
        body: { taskId: task.id },
      })
      if (!response.success) {
        toast.error(response.error?.message || '重新发起失败')
        return false
      }
      await fetchTasks()
      toast.success('任务已重新发起')
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '网络请求失败')
      return false
    } finally {
      busyId.value = ''
    }
  }

  // 任务在服务端持续跑，页面停留时静默对齐一次，避免只看到打开瞬间的快照
  let timer: ReturnType<typeof setInterval> | null = null

  onMounted(() => {
    if (pollMs <= 0) return
    timer = setInterval(() => {
      // 正在删除/重启时跳过，避免把中间态刷掉
      if (busyId.value || document.visibilityState === 'hidden') return
      void fetchTasks(true)
    }, pollMs)
  })

  onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
    timer = null
  })

  return { tasks, isLoading, error, busyId, fetchTasks, remove, restart }
}
