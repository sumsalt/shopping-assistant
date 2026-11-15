import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../utils/http', () => ({ httpPost: vi.fn() }))

import { httpPost } from '../../utils/http'
import { StockCheckError, StockCheckErrorType } from '../../types'
import { md5 } from '../../utils/crypto'
import {
  buildYishouDeviceParams,
  extractYishouDevice,
  generateYishouDeviceProfile,
  loginYishouByPassword,
} from './login'

const mockedPost = vi.mocked(httpPost)

/** 固定随机序列，产出可预测的设备 */
const fixedRandom = (values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}

describe('一手密码登录', () => {
  beforeEach(() => {
    mockedPost.mockReset()
  })

  it('随机设备：udid 16 位 hex、广告 ID 32 位 hex、机型套装一致', () => {
    const device = generateYishouDeviceProfile(fixedRandom([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]))

    expect(device.udid).toMatch(/^[0-9a-f]{16}$/)
    expect(device.adIdMd5).toMatch(/^[0-9a-f]{32}$/)
    expect(device.model).toBe('SO-51B')
    expect(device.manufacturer).toBe('Sony')
    expect(device.screenWidth).toBe('1080')
    expect(device.screenHeight).toBe('2204')
    expect(device.osVersion).toBe('15')
    expect(['中国电信', '中国联通', '中国移动']).toContain(device.carrier)
  })

  it('登录请求：密码按 md5 提交，设备三处 ID 同源，签名 32 位', async () => {
    mockedPost.mockResolvedValue({
      code: '200',
      msg: 'success',
      data: { user_id: '19456111', user_name: '测试号', token: 'a'.repeat(32) },
    })

    const device = generateYishouDeviceProfile(fixedRandom([0, 0, 0, 0, 0, 0, 0]))
    const result = await loginYishouByPassword({
      phone: '15928169484',
      password: 'wj635761',
      device,
    })

    expect(result.ok).toBe(true)
    const [, body, headers] = mockedPost.mock.calls[0] as [
      string,
      Record<string, string>,
      Record<string, string>,
    ]
    expect(body.password).toBe(md5('wj635761'))
    expect(body.mobile).toBe('15928169484')
    expect(body.udid).toBe(device.udid)
    expect(body.device_id).toBe(device.udid)
    expect(body.android_id).toBe(device.udid)
    expect(body.plat_type).toBe('Android')
    expect(Number(body.t_t)).toBeGreaterThan(1_600_000_000)
    expect(headers.sign).toMatch(/^[0-9a-f]{32}$/)
    expect(headers.equipmd5).toBe(md5(device.udid))

    if (result.ok) {
      expect(result.uid).toBe('19456111')
      expect(result.userName).toBe('测试号')
      expect(result.profile.channel).toBe('app')
      expect(result.profile.params.uid).toBe('19456111')
      expect(result.profile.params.token).toBe('a'.repeat(32))
    }
  })

  it('已存 32 位 MD5 时不二次哈希', async () => {
    mockedPost.mockResolvedValue({
      code: '200',
      msg: 'success',
      data: { user_id: '1', token: 'b'.repeat(32) },
    })
    const hashed = md5('wj635761')

    await loginYishouByPassword({ phone: '15928169484', password: hashed })

    const [, body] = mockedPost.mock.calls[0] as [string, Record<string, string>]
    expect(body.password).toBe(hashed)
  })

  it('密码错误映射成友好提示', async () => {
    mockedPost.mockRejectedValue(
      new StockCheckError(StockCheckErrorType.API_ERROR, '一手平台 API 错误: 密码错误')
    )

    const result = await loginYishouByPassword({ phone: '15928169484', password: 'bad' })

    expect(result).toMatchObject({ ok: false, reason: 'PASSWORD', message: '手机号或密码错误' })
  })

  it('返回缺少 token 视为失败，不写入半截登录态', async () => {
    mockedPost.mockResolvedValue({ code: '200', msg: 'success', data: { user_id: '1' } })

    const result = await loginYishouByPassword({ phone: '15928169484', password: 'x' })

    expect(result.ok).toBe(false)
  })

  it('从已有快照还原设备，缺字段时返回 null', () => {
    const params = buildYishouDeviceParams(
      {
        udid: 'c8a000bd786f3a37',
        model: 'SO-51B',
        manufacturer: 'Sony',
        osVersion: '15',
        screenWidth: '1080',
        screenHeight: '2204',
        carrier: '中国电信',
        adIdMd5: 'f'.repeat(32),
      },
      '15928169484'
    )

    expect(extractYishouDevice(params)).toMatchObject({
      udid: 'c8a000bd786f3a37',
      model: 'SO-51B',
      osVersion: '15',
      adIdMd5: 'f'.repeat(32),
    })
    expect(extractYishouDevice({ model: 'SO-51B' })).toBeNull()
    expect(extractYishouDevice(null)).toBeNull()
  })
})
