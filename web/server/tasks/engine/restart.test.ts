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
  checkCount: number
}

const makeDefinition = (removeOriginalOnRestart: boolean) => {
  const definition = {
    kind: 'stock',
    label: '测试',
    version: 1,
    removeOriginalOnRestart,
    resolveAccount: () => ({ accountId: '', hasCredential: false }),
    restart: (record: TaskRecordBase<FakeState>) => ({
      state: { config: record.state.config, checkCount: 0 },
    }),
    durationOf: (record: TaskRecordBase<FakeState>) => record.state.config.duration,
    run: () => {
      const controller = new AbortController()
      const promise = new Promise<void>(resolve => {
        const timer = setTimeout(resolve, 60_000)
        controller.signal.addEventListener('abort', () => {
          clearTimeout(timer)
          resolve()
        }, { once: true })
      })
      return { controller, promise }
    },
    project: () => ({}) as never,
  } as unknown as TaskKindDefinition<FakeState>
  return definition
}

const makeRecord = (id = 'stock_test_1', status: 'stopped' | 'completed' = 'stopped'): TaskRecordBase<FakeState> => ({
  id,
  kind: 'stock',
  userId: 'u1',
  userEmail: 'a@b.c',
  status,
  createdAt: new Date(Date.now() - 60 * 1000),
  updatedAt: new Date(Date.now() - 60 * 1000),
  version: 1,
  state: { config: { duration: 3600 }, checkCount: 5 },
})

describe('TaskService.restart 原地重建语义', () => {
  it('removeOriginalOnRestart=true 时移除原任务并新建 running 任务', async () => {
    const registry = new TaskRegistry<FakeState>('stock')
    const service = new TaskService(makeDefinition(true), registry)
    const original = makeRecord()
    registry.add(original)

    const next = await service.restart('u1', original.id)

    expect(next.id).not.toBe(original.id)
    expect(next.status).toBe('running')
    expect((next.state as FakeState).checkCount).toBe(0)
    expect(registry.get(original.id)).toBeNull()
    expect(registry.get(next.id)).not.toBeNull()
  })

  it('removeOriginalOnRestart 未开启时保留原任务记录', async () => {
    const registry = new TaskRegistry<FakeState>('stock')
    const service = new TaskService(makeDefinition(false), registry)
    const original = makeRecord()
    registry.add(original)

    const next = await service.restart('u1', original.id)

    expect(next.id).not.toBe(original.id)
    expect(registry.get(original.id)).not.toBeNull()
  })

  it('未实现 resolveRestartAccount 时沿用原任务账号（订单续期语义）', async () => {
    const registry = new TaskRegistry<FakeState>('stock')
    const service = new TaskService(makeDefinition(true), registry)
    const original = { ...makeRecord(), accountId: 'old-account' }
    registry.add(original)

    const next = await service.restart('u1', original.id)

    expect(next.accountId).toBe('old-account')
  })

  it('实现 resolveRestartAccount 时切到解析出的当前账号', async () => {
    const registry = new TaskRegistry<FakeState>('stock')
    const definition = makeDefinition(true)
    definition.resolveRestartAccount = ({ user }) => ({
      accountId: `current-${user.username}`,
      secret: { uid: 'new-uid', token: 'new-token' },
      hasCredential: true,
    })
    const service = new TaskService(definition, registry)
    const original = { ...makeRecord(), accountId: 'old-account', secret: { uid: 'old' } }
    registry.add(original)

    const next = await service.restart('u1', original.id)

    expect(next.accountId).toBe('current-u1')
    expect(next.secret).toEqual({ uid: 'new-uid', token: 'new-token' })
  })
})
