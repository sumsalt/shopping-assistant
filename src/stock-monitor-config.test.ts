/**
 * 到货监控统一配置的纯函数测试
 *
 * 自动下单只是到货监控的一个可选开关：关闭时不能把 autoOrder 传给后端，
 * 否则会被当成下单任务（要求登录态、任务列表也会打上下单标签）。
 */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STOCK_MONITOR_DURATION,
  STOCK_MONITOR_DURATION_OPTIONS,
  buildStockMonitorConfig,
  formatMonitorDuration,
} from '../web/utils/stockMonitorConfig'

const baseValues = {
  duration: 10800,
  autoOrderEnabled: false,
  num: 1,
  payTool: '4' as const,
}

describe('buildStockMonitorConfig', () => {
  it('普通到货监控：只带时长，不带 autoOrder', () => {
    const config = buildStockMonitorConfig({ ...baseValues, duration: 21600 })

    expect(config).toEqual({ duration: 21600 })
    expect('autoOrder' in config).toBe(false)
  })

  it('开启自动下单：带上完整下单参数', () => {
    const config = buildStockMonitorConfig({
      duration: 43200,
      autoOrderEnabled: true,
      num: 2,
      payTool: '1',
      addressId: '9706970',
    })

    expect(config).toEqual({
      duration: 43200,
      autoOrder: {
        enabled: true,
        num: 2,
        payTool: '1',
        addressId: '9706970',
      },
    })
  })

  it('未选地址时不写 addressId，让服务端用默认地址', () => {
    const config = buildStockMonitorConfig({
      ...baseValues,
      autoOrderEnabled: true,
    })

    expect(config.autoOrder).toEqual({ enabled: true, num: 1, payTool: '4' })
  })

  it('件数钳制在 1~99，非法支付方式回落到微信', () => {
    const tooMany = buildStockMonitorConfig({
      duration: 3600,
      autoOrderEnabled: true,
      num: 999,
      payTool: '9' as '1' | '4',
    })
    expect(tooMany.autoOrder?.num).toBe(99)
    expect(tooMany.autoOrder?.payTool).toBe('4')

    const zero = buildStockMonitorConfig({
      duration: 3600,
      autoOrderEnabled: true,
      num: 0,
      payTool: '4',
    })
    expect(zero.autoOrder?.num).toBe(1)
  })

  it('不选规格时不写 skus，默认监控全部规格', () => {
    const config = buildStockMonitorConfig({ ...baseValues })
    expect('skus' in config).toBe(false)

    const empty = buildStockMonitorConfig({ ...baseValues, skus: [] })
    expect('skus' in empty).toBe(false)
  })

  it('选了规格时去重、去空后带上 skus，纯提醒与自动下单都生效', () => {
    const plain = buildStockMonitorConfig({
      ...baseValues,
      skus: ['850001', ' 850001 ', '', '850002'],
    })
    expect(plain.skus).toEqual(['850001', '850002'])

    const withOrder = buildStockMonitorConfig({
      ...baseValues,
      autoOrderEnabled: true,
      skus: ['850001'],
    })
    expect(withOrder.skus).toEqual(['850001'])
    expect(withOrder.autoOrder?.enabled).toBe(true)
  })

  it('时长非法时回落到 3 小时默认值', () => {
    expect(buildStockMonitorConfig({ ...baseValues, duration: 0 }).duration).toBe(
      DEFAULT_STOCK_MONITOR_DURATION
    )
    expect(
      buildStockMonitorConfig({ ...baseValues, duration: Number.NaN }).duration
    ).toBe(DEFAULT_STOCK_MONITOR_DURATION)
  })

  it('默认时长与价格监控一致，且出现在可选列表里', () => {
    expect(DEFAULT_STOCK_MONITOR_DURATION).toBe(10800)
    expect(STOCK_MONITOR_DURATION_OPTIONS.some(o => o.value === DEFAULT_STOCK_MONITOR_DURATION)).toBe(
      true
    )
  })
})

describe('formatMonitorDuration', () => {
  it('按天 / 小时 / 分钟自适应', () => {
    expect(formatMonitorDuration(86400)).toBe('1 天')
    expect(formatMonitorDuration(604800)).toBe('7 天')
    expect(formatMonitorDuration(21600)).toBe('6 小时')
    expect(formatMonitorDuration(1800)).toBe('30 分钟')
    expect(formatMonitorDuration(90)).toBe('90 秒')
  })

  it('空值 / 非法值显示不限时长', () => {
    expect(formatMonitorDuration()).toBe('不限时长')
    expect(formatMonitorDuration(0)).toBe('不限时长')
    expect(formatMonitorDuration(Number.POSITIVE_INFINITY)).toBe('不限时长')
  })
})
