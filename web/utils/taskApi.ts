/**
 * 任务接口地址表
 *
 * 四类任务的路由形状完全一致（list / status / delete / restart），
 * 只有前缀不同。把「kind → 前缀」固定在这一处，页面和卡片都从这里取，
 * 避免每个页面各写一份字符串。
 */

import type { TaskKind, TaskSummary } from '@core/contract'
import type { ApiResponse } from '@/types'

export const TASK_ENDPOINTS: Record<TaskKind, string> = {
  stock: '/api/monitor',
  price: '/api/price-monitor',
  tab: '/api/tab-monitor',
  renew: '/api/order-renew',
}

export const taskEndpoint = (kind: TaskKind): string => TASK_ENDPOINTS[kind]

/**
 * 读取任务详情（events 为全量，最多 50 条）
 *
 * 列表接口为了控制体积只回最近 5 条，卡片上「查看全部」走这里补全。
 */
export const fetchTaskDetail = async (kind: TaskKind, taskId: string): Promise<TaskSummary> => {
  const response = await $fetch<ApiResponse<{ task: TaskSummary }>>(
    `${TASK_ENDPOINTS[kind]}/status`,
    { query: { taskId } }
  )

  if (!response.success || !response.data) {
    throw new Error(response.error?.message || '读取任务详情失败')
  }

  return response.data.task
}
