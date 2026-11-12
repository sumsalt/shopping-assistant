/**
 * 一手 App 深链构造。
 *
 * 这两条链接是「点击商品跳一手 App」的核心：详情页和 tab 监控都靠它。
 * iOS 认 ios_class_name，Android 认 android_class_name，两个都带才能双端通用。
 */

import { describe, it, expect } from 'vitest'
import {
  buildYishouDeepLink,
  buildYishouProductLink,
  YISHOU_ROUTES,
} from '../web/utils/yishou-deeplink'

describe('buildYishouDeepLink', () => {
  it('scheme 固定为 yishou://fmkj/openyishou，extra 做 percent 编码', () => {
    const link = buildYishouDeepLink(YISHOU_ROUTES.productDetail, { goods_id: '123' })

    expect(link.startsWith('yishou://fmkj/openyishou?extra=')).toBe(true)
    expect(link).toContain('FMDetailViewController')
    expect(link).toContain('GoodsDetailActivity')
  })

  it('percent 编码后的 extra 可被解码回原始 JSON', () => {
    const link = buildYishouDeepLink(YISHOU_ROUTES.productDetail, { goods_id: '123' })
    const extra = decodeURIComponent(link.split('extra=')[1])
    const parsed = JSON.parse(extra) as Record<string, string>

    expect(parsed.goods_id).toBe('123')
    expect(parsed.ios_class_name).toBe('FMDetailViewController')
  })

  it('路由表默认值之外的字段也会被带上', () => {
    const link = buildYishouDeepLink(YISHOU_ROUTES.productDetail, {
      goods_id: '123',
      extra_field: 'abc',
    })
    const parsed = JSON.parse(decodeURIComponent(link.split('extra=')[1]))

    expect(parsed.extra_field).toBe('abc')
  })

  it('encode=false 时 extra 保留 JSON 原文', () => {
    const link = buildYishouDeepLink(YISHOU_ROUTES.productDetail, { goods_id: '1' }, { encode: false })

    expect(link).toContain('?extra={"ios_class_name"')
  })
})

describe('buildYishouProductLink', () => {
  it('商品详情深链带 goods_id，无货号时 goods_no 为空串', () => {
    const link = buildYishouProductLink('339696422')
    const parsed = JSON.parse(decodeURIComponent(link.split('extra=')[1]))

    expect(parsed.goods_id).toBe('339696422')
    expect(parsed.goods_no).toBe('')
  })

  it('有货号时一并带上', () => {
    const link = buildYishouProductLink('339696422', '1373604156')
    const parsed = JSON.parse(decodeURIComponent(link.split('extra=')[1]))

    expect(parsed.goods_no).toBe('1373604156')
  })
})
