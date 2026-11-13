/**
 * 任务列表的状态筛选（纯函数，供 composable / 单测复用）
 *
 * 四类任务的列表页都按同一套状态筛选，逻辑收敛在这里，避免每个页面各写一遍。
 * 状态文案由展示层（taskFormat.getStatusText）提供，这里只负责取值与过滤。
 */

import type { TaskStatus, TaskSummary } from '../contract/task'

/** 筛选项：'all' 表示不过滤 */
export type TaskStatusFilter = 'all' | TaskStatus

/** 筛选条上的状态顺序（与卡片状态一致） */
export const TASK_STATUS_VALUES: readonly TaskStatus[] = ['running', 'stopped', 'completed']

/** 各状态任务数量，'all' 为总数 */
export type TaskStatusCounts = Record<TaskStatusFilter, number>

/** 统计各状态数量；未知状态只计入 all，避免脏数据把筛选计数写坏 */
export const countTasksByStatus = (tasks: TaskSummary[]): TaskStatusCounts => {
  const counts: TaskStatusCounts = {
    all: tasks.length,
    running: 0,
    stopped: 0,
    completed: 0,
  }
  for (const task of tasks) {
    if (task.status === 'running' || task.status === 'stopped' || task.status === 'completed') {
      counts[task.status] += 1
    }
  }
  return counts
}

/** 按状态过滤；'all' 直接返回原数组 */
export const filterTasksByStatus = (
  tasks: TaskSummary[],
  filter: TaskStatusFilter
): TaskSummary[] => (filter === 'all' ? tasks : tasks.filter(task => task.status === filter))
