import { describe, expect, it } from 'vitest'
import type { TaskSummary } from '../contract/task'
import {
  countTasksByStatus,
  filterTasksByStatus,
  TASK_STATUS_VALUES,
  type TaskStatusFilter,
} from './task-filter'

const makeTask = (status: string): TaskSummary =>
  ({ id: `task-${status}`, status }) as unknown as TaskSummary

describe('countTasksByStatus', () => {
  it('空列表各状态均为 0', () => {
    expect(countTasksByStatus([])).toEqual({
      all: 0,
      running: 0,
      stopped: 0,
      completed: 0,
    })
  })

  it('混合状态分别计数，all 为总数', () => {
    const tasks = [
      makeTask('running'),
      makeTask('running'),
      makeTask('stopped'),
      makeTask('completed'),
      makeTask('completed'),
      makeTask('completed'),
    ]
    expect(countTasksByStatus(tasks)).toEqual({
      all: 6,
      running: 2,
      stopped: 1,
      completed: 3,
    })
  })

  it('未知状态只计入 all，不污染单状态计数', () => {
    const tasks = [makeTask('running'), makeTask('unknown')]
    expect(countTasksByStatus(tasks)).toEqual({
      all: 2,
      running: 1,
      stopped: 0,
      completed: 0,
    })
  })
})

describe('filterTasksByStatus', () => {
  const tasks = [
    makeTask('running'),
    makeTask('stopped'),
    makeTask('completed'),
    makeTask('running'),
  ]

  it("'all' 返回原数组（引用相同）", () => {
    expect(filterTasksByStatus(tasks, 'all')).toBe(tasks)
  })

  it('按单个状态过滤', () => {
    expect(filterTasksByStatus(tasks, 'running')).toHaveLength(2)
    expect(filterTasksByStatus(tasks, 'stopped')).toEqual([tasks[1]])
    expect(filterTasksByStatus(tasks, 'completed')).toEqual([tasks[2]])
  })

  it('无匹配状态时返回空数组', () => {
    const onlyRunning = [makeTask('running')]
    expect(filterTasksByStatus(onlyRunning, 'completed')).toEqual([])
  })

  it('空列表任意筛选都返回空数组', () => {
    const filters: TaskStatusFilter[] = ['all', ...TASK_STATUS_VALUES]
    for (const filter of filters) {
      expect(filterTasksByStatus([], filter)).toEqual([])
    }
  })

  it('筛选条状态顺序固定为 监控中 → 已停止 → 已完成', () => {
    expect(TASK_STATUS_VALUES).toEqual(['running', 'stopped', 'completed'])
  })
})
