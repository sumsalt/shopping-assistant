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
import { YISHOU_DEVICE_POOL } from './device-pool'

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

  it('随机设备：udid 16 位 hex、广告 ID 32 位 hex、字段成套来自设备池', () => {
    const device = generateYishouDeviceProfile(fixedRandom([0]))
    const preset = YISHOU_DEVICE_POOL[0]!

    expect(device.udid).toMatch(/^[0-9a-f]{16}$/)
    expect(device.adIdMd5).toMatch(/^[0-9a-f]{32}$/)
    // 机型 / 厂商 / 分辨率 / 系统版本必须来自同一条池子记录，不能拼
    expect(device.model).toBe(preset.model)
    expect(device.manufacturer).toBe(preset.manufacturer)
    expect(device.screenWidth).toBe(preset.screenWidth)
    expect(device.screenHeight).toBe(preset.screenHeight)
    expect(preset.osVersions).toContain(device.osVersion)
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

  it('快照只保留业务公共参数，登录专属字段不落库', async () => {
    mockedPost.mockResolvedValue({
      code: '200',
      msg: 'success',
      data: { user_id: '19456111', token: 'c'.repeat(32) },
    })

    const result = await loginYishouByPassword({ phone: '15928169484', password: 'wj635761' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // 与真机业务请求对齐：手机号、渠道、WebView UA、事件 ID、android_id 都不该带
    for (const key of ['mobile', 'channel', 'ua', 'event_id', 'android_id']) {
      expect(result.profile.params).not.toHaveProperty(key)
    }
    // 签名四要素与设备指纹必须保留，否则后续请求签名对不上
    expect(result.profile.params).toMatchObject({
      model: expect.any(String),
      udid: expect.any(String),
      version: expect.any(String),
      version_name: expect.any(String),
      device_id: result.profile.params.udid,
      plat_type: 'Android',
    })
    expect(result.profile.params.uid).toBe('19456111')
    expect(result.profile.params.token).toBe('c'.repeat(32))
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
