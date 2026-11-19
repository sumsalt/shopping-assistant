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
    resolveAccount: () => ({ accountId: '', hasCredential: false }),
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

const makeRecord = (): TaskRecordBase<FakeState> => ({
  id: 'renew_test_1',
  kind: 'renew',
  userId: 'u1',
  userEmail: 'a@b.c',
  status: 'running',
  createdAt: new Date(Date.now() - 60 * 1000),
  updatedAt: new Date(Date.now() - 60 * 1000),
  version: 1,
  state: { config: { duration: 3600 } },
})

describe('TaskService.stop', () => {
  it('中止运行循环并落 stopped，且 promise 收尾不覆盖为 completed', async () => {
    const registry = new TaskRegistry<FakeState>('renew')
    const { definition, runs } = makeDefinition()
    const service = new TaskService(definition, registry)

    const record = makeRecord()
    registry.add(record)
    service.start(record)

    expect(record.status).toBe('running')
    expect(runs).toHaveLength(1)
    expect(record.controller).toBeTruthy()

    service.stop('u1', record.id)

    // 循环被 abort，状态落 stopped，controller 被清空
    expect(runs[0].aborted).toBe(true)
    expect(record.status).toBe('stopped')
    expect(record.controller).toBeUndefined()

    // 等 abort 触发的 promise resolve 收尾跑完，确认未把状态改成 completed
    await Promise.resolve()
    await Promise.resolve()
    expect(record.status).toBe('stopped')
  })

  it('非所有者的任务不允许停止', () => {
    const registry = new TaskRegistry<FakeState>('renew')
    const { definition } = makeDefinition()
    const service = new TaskService(definition, registry)

    const record = makeRecord()
    registry.add(record)

    expect(() => service.stop('someone-else', record.id)).toThrow()
    expect(record.status).toBe('running')
  })

  it('非运行中的任务拒绝停止', () => {
    const registry = new TaskRegistry<FakeState>('renew')
    const { definition } = makeDefinition()
    const service = new TaskService(definition, registry)

    const record = makeRecord()
    record.status = 'completed'
    registry.add(record)

    expect(() => service.stop('u1', record.id)).toThrow()
  })
})
