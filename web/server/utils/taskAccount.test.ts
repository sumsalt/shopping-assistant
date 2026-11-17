import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AccountRecord } from './accountStore'

/** 账号表替身：只提供本模块用到的两个只读查询 */
const store = vi.hoisted(() => ({
  accounts: [] as AccountRecord[],
  active: null as AccountRecord | null,
}))

vi.mock('./accountStore', () => ({
  getAccount: (id: string) => store.accounts.find(item => item.id === id) ?? null,
  getActiveAccount: () => store.active,
}))

const { describeTaskAccount } = await import('./taskAccount')

const account = (overrides: Partial<AccountRecord> = {}): AccountRecord => ({
  id: 'acc_1',
  userId: 'u1',
  phone: '13800009571',
  title: '',
  password: '',
  uin: 'uin',
  token: 'token',
  remark: '',
  isVerified: false,
  isNewUser: false,
  hasOrdered: false,
  isActive: true,
  requestProfile: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...overrides,
})

afterEach(() => {
  store.accounts = []
  store.active = null
})

describe('任务绑定账号展示', () => {
  it('未绑定账号时不输出（匿名任务）', () => {
    expect(describeTaskAccount('u1', undefined)).toBeUndefined()
    expect(describeTaskAccount('u1', '')).toBeUndefined()
  })

  it('备注优先，其次用手机号尾号', () => {
    store.accounts = [account({ id: 'acc_1', title: '主号' }), account({ id: 'acc_2' })]
    store.active = store.accounts[1]

    expect(describeTaskAccount('u1', 'acc_1')?.label).toBe('主号')
    expect(describeTaskAccount('u1', 'acc_2')?.label).toBe('尾号 9571')
  })

  it('标记是否为当前激活账号', () => {
    store.accounts = [account({ id: 'acc_1' }), account({ id: 'acc_2', isActive: false })]
    store.active = store.accounts[0]

    expect(describeTaskAccount('u1', 'acc_1')).toMatchObject({ active: true })
    expect(describeTaskAccount('u1', 'acc_2')).toMatchObject({ active: false })
  })

  it('账号已删除或不属于该用户时给出 missing', () => {
    store.accounts = [account({ id: 'acc_1', userId: 'someone-else' })]
    store.active = store.accounts[0]

    expect(describeTaskAccount('u1', 'acc_missing')).toMatchObject({
      label: '账号已删除',
      active: false,
      missing: true,
    })
    // 越权查看他人账号同样按「不存在」处理
    expect(describeTaskAccount('u1', 'acc_1')).toMatchObject({ missing: true })
  })

  it('手机号过短时不截取尾号', () => {
    store.accounts = [account({ id: 'acc_1', phone: '123' })]
    expect(describeTaskAccount('u1', 'acc_1')?.label).toBe('123')
  })
})
