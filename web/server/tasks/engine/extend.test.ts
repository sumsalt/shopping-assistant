import { describe, expect, it, vi } from 'vitest'

// 阻断 SQLite 落盘：只测内存注册表 + 运行时行为
vi.mock('./store', () => ({
  getTask: () => null,
  listTasks: () => [],
  listRunningTasks: () => [],
  saveTask: () => {},
  saveTaskSoon: () => {},
  removeTask: () => {},
}))

import { TaskService } from './service'
import { TaskRegistry } from './registry'
import type { TaskKindDefinition, TaskRecordBase } from './types'

interface FakeState {
  config: { duration: number }
}

/** 每次 run 返回一个可被 abort 打断的长任务，记录是否被中止 */
const makeDefinition = () => {
  const runs: Array<{ aborted: boolean }> = []

  const definition = {
    kind: 'renew',
    label: '测试',
    version: 1,
    requiresAuth: () => false,
    durationOf: (record: TaskRecordBase<FakeState>) => record.state.config.duration,
    run: () => {
      const controller = new AbortController()
      const info = { aborted: false }
      runs.push(info)
      const promise = new Promise<void>(resolve => {
        const timer = setTimeout(resolve, 60_000)
        controller.signal.addEventListener(
          'abort',
          () => {
            info.aborted = true
            clearTimeout(timer)
            resolve()
          },
          { once: true }
        )
      })
      return { controller, promise }
    },
    project: () => ({}) as never,
  } as unknown as TaskKindDefinition<FakeState>

  return { definition, runs }
}

const makeRecord = (now: number): TaskRecordBase<FakeState> => ({
  id: 'renew_test_1',
  kind: 'renew',
  userId: 'u1',
  userEmail: 'a@b.c',
  status: 'running',
  createdAt: new Date(now - 60 * 60 * 1000),
  updatedAt: new Date(now - 60 * 60 * 1000),
  version: 1,
  state: { config: { duration: 3600 } },
})

describe('TaskService.extend', () => {
  it('把运行中任务的时长重置为 12 小时并重启循环，保留 running 状态', async () => {
    const registry = new TaskRegistry<FakeState>('renew')
    const { definition, runs } = makeDefinition()
    const service = new TaskService(definition, registry)

    const record = makeRecord(Date.now())
    const originalCreatedAt = record.createdAt.getTime()
    registry.add(record)
    service.start(record)

    expect(runs).toHaveLength(1)
    expect(record.state.config.duration).toBe(3600)

    service.extend('u1', record.id, 12 * 60 * 60)

    // 时长更新、计时起点重置为当前时刻
    expect(record.state.config.duration).toBe(12 * 60 * 60)
    expect(record.createdAt.getTime()).toBeGreaterThan(originalCreatedAt)

    // 旧循环被中止，新循环已启动；旧 promise 收尾不得把状态改成 completed
    expect(runs).toHaveLength(2)
    expect(runs[0].aborted).toBe(true)
    expect(record.status).toBe('running')

    // 等旧 promise 的 then 微任务跑完，确认未覆盖状态
    await Promise.resolve()
    await Promise.resolve()
    expect(record.status).toBe('running')
    expect(record.controller).toBeTruthy()

    // 收尾：中止新循环，避免测试结束后还有挂起的计时器
    registry.abort(record.id)
  })

  it('任务不在运行时拒绝延长', () => {
    const registry = new TaskRegistry<FakeState>('renew')
    const { definition } = makeDefinition()
    const service = new TaskService(definition, registry)

    const record = makeRecord(Date.now())
    record.status = 'completed'
    registry.add(record)

    expect(() => service.extend('u1', record.id, 7200)).toThrow()
  })
})
