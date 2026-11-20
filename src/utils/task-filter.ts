/**
 * 任务列表的状态筛选（纯函数，供 composable / 单测复用）
 *
 * 四类任务的列表页都按同一套状态筛选，逻辑收敛在这里，避免每个页面各写一遍。
 * 状态文案由展示层（taskFormat.getStatusText）提供，这里只负责取值与过滤。
 */

import type { TaskStatus, TaskSummary } from '../contract/task'

/** 账号筛选项：'all'=全部；'__none__'=未绑定账号；其余为账号记录 ID */
export const NO_ACCOUNT_FILTER = '__none__'
export type TaskAccountFilter = string

/** 账号筛选下拉的一个选项 */
export interface TaskAccountOption {
  value: TaskAccountFilter
  label: string
  count: number
}

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

/**
 * 从任务列表聚合账号筛选项
 *
 * 只统计当前列表里出现的账号（零额外请求）；账号被删除的任务按 label 原样成项，
 * 未绑定账号的任务归入 "__none__"。按任务数降序，便于常用账号排在前面。
 */
export const collectAccountOptions = (tasks: TaskSummary[]): TaskAccountOption[] => {
  const counter = new Map<string, { label: string; count: number }>()
  for (const task of tasks) {
    const id = task.account?.id || NO_ACCOUNT_FILTER
    const label = task.account?.label ?? '未绑定账号'
    const entry = counter.get(id)
    if (entry) entry.count += 1
    else counter.set(id, { label, count: 1 })
  }
  return [...counter.entries()]
    .map(([value, { label, count }]) => ({ value, label, count }))
    .sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0))
}

/** 按账号过滤；'all' 直接返回原数组，'__none__' 匹配未绑定账号的任务 */
export const filterTasksByAccount = (
  tasks: TaskSummary[],
  filter: TaskAccountFilter
): TaskSummary[] => {
  if (filter === 'all') return tasks
  if (filter === NO_ACCOUNT_FILTER) return tasks.filter(task => !task.account?.id)
  return tasks.filter(task => task.account?.id === filter)
}
