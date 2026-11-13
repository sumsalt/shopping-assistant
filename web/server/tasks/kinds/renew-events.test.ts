import { describe, expect, it, vi } from 'vitest'
import type { TaskRecordBase } from '../engine/types'
import type { RenewTaskState } from './state'

/**
 * 锁定一条容易回归的约定：monitor 回调只带「本次运行」的续期记录，
 * 写回任务时必须与历史事件合并，否则每次重启 / 每轮回调都会把旧记录冲掉。
 */
vi.mock('@core', () => ({
  getRenewAdapter: () => ({}),
  createCancellableOrderRenewMonitor: (
    _adapter: unknown,
    _config: unknown,
    onProgress: (result: unknown) => void
  ) => {
    onProgress({
      checkCount: 1,
      scannedCount: 1,
      renewedCount: 1,
      skippedCount: 0,
      finishedCount: 0,
      lastScanAt: 1_700_000_500_000,
      recentRenewals: [
        {
          orderSn: 'SN9',
          renewedAt: 1_700_000_500_000,
          remainingBefore: 120,
          expireAfter: 1_700_001_200_000,
          verified: true,
        },
      ],
    })
    return { controller: new AbortController(), promise: Promise.resolve() }
  },
}))

const { renewDefinition } = await import('./renew')

const makeRecord = (events: RenewTaskState['events']): TaskRecordBase<RenewTaskState> =>
  ({
    id: 'renew_test',
    kind: 'renew',
    userId: 'u1',
    userEmail: 'a@b.c',
    status: 'running',
    createdAt: new Date(1_700_000_000_000),
    updatedAt: new Date(1_700_000_000_000),
    version: 2,
    secret: { uid: 'u', token: 't' },
    state: {
      account: { id: 'acc1', phone: '', title: '' },
      source: 'manual',
      config: { duration: 3600 },
      checkCount: 3,
      scannedCount: 3,
      renewedCount: 2,
      skippedCount: 0,
      finishedCount: 0,
      events,
    },
  }) as TaskRecordBase<RenewTaskState>

describe('续期事件写回', () => {
  it('本次运行的续期记录与历史事件合并，不会覆盖历史', () => {
    const record = makeRecord([
      {
        id: 'evt_old_1',
        type: 'renew.succeeded',
        at: 1_700_000_100_000,
        title: '已刷新支付有效期',
        tone: 'success',
        orderSn: 'SN1',
      },
      {
        id: 'evt_old_2',
        type: 'renew.succeeded',
        at: 1_700_000_200_000,
        title: '已刷新支付有效期',
        tone: 'success',
        orderSn: 'SN2',
      },
    ])

    const ctx = {
      durationSeconds: 3600,
      save: () => {},
      resume: () => {},
      log: () => {},
    } as any

    renewDefinition.run(record, ctx)

    expect(record.state.events).toHaveLength(3)
    expect(record.state.events.map(item => item.orderSn)).toEqual(['SN9', 'SN2', 'SN1'])
    // 累计统计同样保留历史值
    expect(record.state.checkCount).toBe(4)
    expect(record.state.renewedCount).toBe(3)
  })
})
