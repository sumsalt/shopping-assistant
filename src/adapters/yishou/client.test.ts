/**
 * 适配器客户端的限流分桶
 *
 * 桶必须跟着「这次请求实际带的凭证」走：带 uid+token 进账号桶（5s），
 * 不带进匿名桶（1s）。任务层不参与决策，避免两处口径对不上。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ httpPost: vi.fn() }))

vi.mock('../../utils/http', () => ({ httpPost: mocks.httpPost }))

import { YishouClient } from './client'

const baseParams = {
  openid: 'oXxx123',
  plat_type: 'wx',
  model: 'iPhone 14 Pro<iPhone15,2>',
  version: '8.0.60',
  version_name: '4.9.0',
}

const authedConfig = {
  uid: '20536811',
  token: 'tok',
  channel: 'wx' as const,
  requestParams: { ...baseParams, uid: '20536811', token: 'tok' },
  requestHeaders: { 'User-Agent': 'Mozilla/5.0 MicroMessenger/8.0.60' },
}

/** 取第 n 次请求的选项 */
const optionsOf = (index = 0) =>
  mocks.httpPost.mock.calls[index]?.[3] as { accountKey?: string; skipGate?: boolean }

describe('YishouClient 限流分桶', () => {
  beforeEach(() => {
    mocks.httpPost.mockReset()
    mocks.httpPost.mockResolvedValue({ code: '200', msg: '', data: {} })
  })

  it('带 uid+token 的请求按账号分桶', async () => {
    await new YishouClient(authedConfig).request('https://example.com/goods')
    expect(optionsOf().accountKey).toBe('20536811')
  })

  it('凭证被剔除后按匿名分桶', async () => {
    const anonymous = {
      ...authedConfig,
      uid: undefined,
      token: undefined,
      requestParams: { ...baseParams },
    }
    await new YishouClient(anonymous).request('https://example.com/goods')
    expect(optionsOf().accountKey).toBe('')
  })

  it('只有 uid 没有 token 时仍算匿名', async () => {
    const halfAuth = {
      ...authedConfig,
      token: undefined,
      requestParams: { ...baseParams, uid: '20536811' },
    }
    await new YishouClient(halfAuth).request('https://example.com/goods')
    expect(optionsOf().accountKey).toBe('')
  })
})
