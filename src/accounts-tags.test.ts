/**
 * 账号标签相关纯逻辑测试（表单校验 / 脱敏视图）
 *
 * 放在 src 下复用现有 vitest 配置，避免把 .test.ts 放进 Nuxt 的
 * server/utils 自动导入目录；被测模块只做 type-only import，不会触发 db 初始化。
 */

import { describe, expect, it } from 'vitest'
import { parseAccountInput } from '../web/server/utils/accountValidate'
import { maskPassword, maskToken, toAccountView } from '../web/server/utils/accountMask'
import type { AccountRecord } from '../web/server/utils/accountStore'

describe('parseAccountInput - 账号标签', () => {
  it('三个标签支持布尔与 Switch 的 "1"/"0"', () => {
    const result = parseAccountInput({
      phone: '13800138000',
      isVerified: true,
      isNewUser: false,
      hasOrdered: '1',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.isVerified).toBe(true)
      expect(result.value.isNewUser).toBe(false)
      expect(result.value.hasOrdered).toBe(true)
    }
  })

  it('"0" / 0 / false 都解析为 false，不会被当成「有值」', () => {
    const result = parseAccountInput({
      phone: '13800138000',
      isVerified: '0',
      isNewUser: 0,
      hasOrdered: false,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.isVerified).toBe(false)
      expect(result.value.isNewUser).toBe(false)
      expect(result.value.hasOrdered).toBe(false)
    }
  })

  it('标签字段缺失时不写入 value，更新时才能保持原值', () => {
    const result = parseAccountInput({ phone: '13800138000', remark: '主号' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect('isVerified' in result.value).toBe(false)
      expect('isNewUser' in result.value).toBe(false)
      expect('hasOrdered' in result.value).toBe(false)
    }
  })

  it('标题会 trim 并透传，超长报错', () => {
    const result = parseAccountInput({ phone: '13800138000', title: '  主号  ' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.title).toBe('主号')
    }

    const tooLong = parseAccountInput({ phone: '13800138000', title: 'a'.repeat(61) })
    expect(tooLong.ok).toBe(false)
    if (!tooLong.ok) {
      expect(tooLong.error).toContain('标题')
    }
  })

  it('非法标签值忽略；手机号仍是必填；密码不做 trim', () => {
    const invalid = parseAccountInput({ phone: '13800138000', isNewUser: 'yes' })
    expect(invalid.ok).toBe(true)
    if (invalid.ok) {
      expect(invalid.value.isNewUser).toBeUndefined()
    }

    expect(parseAccountInput({ phone: '  ' }).ok).toBe(false)

    const withPassword = parseAccountInput({ phone: '13800138000', password: '  p@ss  ' })
    expect(withPassword.ok).toBe(true)
    if (withPassword.ok) {
      expect(withPassword.value.password).toBe('  p@ss  ')
    }
  })
})

describe('toAccountView - 标签与掩码', () => {
  const base: AccountRecord = {
    id: 'acc_1',
    userId: 'tester',
    phone: '13800138000',
    title: '主号',
    password: 'secret',
    uin: '20478621',
    token: 'a878dabfb1eaf3d4acf19fa3f81f9cef',
    remark: '主号',
    isVerified: true,
    isNewUser: false,
    hasOrdered: true,
    isActive: false,
    requestProfile: null,
    createdAt: new Date('2026-11-11T00:00:00.000Z'),
    updatedAt: new Date('2026-11-11T01:00:00.000Z'),
  }

  it('列表视图透出三个标签，且不含明文凭据', () => {
    const view = toAccountView(base)

    expect(view.title).toBe('主号')
    expect(view.isVerified).toBe(true)
    expect(view.isNewUser).toBe(false)
    expect(view.hasOrdered).toBe(true)
    expect(view.hasPassword).toBe(true)
    expect(view.hasToken).toBe(true)
    expect(JSON.stringify(view)).not.toContain('secret')
    expect(JSON.stringify(view)).not.toContain(base.token)
  })

  it('掩码不泄露密码长度，长 token 仅露首尾', () => {
    expect(maskPassword('')).toBe('')
    expect(maskPassword('abc')).toBe('••••••••')
    expect(maskToken('short')).toBe('••••••••')
    expect(maskToken('a878dabfb1eaf3d4acf19fa3f81f9cef')).toBe('a878••••9cef')
  })

  it('抓包快照进入列表视图时 token 被打码，其它参数原样透出', () => {
    const view = toAccountView({
      ...base,
      requestProfile: {
        channel: 'app',
        params: {
          uid: '20478621',
          token: 'a878dabfb1eaf3d4acf19fa3f81f9cef',
          udid: 'udid-xyz',
          model: 'Pixel 7',
        },
        headers: { 'User-Agent': 'okhttp/3.14.9' },
        path: '/goods/get_goods_info_v2',
      },
    })

    expect(view.hasRequestProfile).toBe(true)
    expect(view.requestChannel).toBe('app')
    expect(view.requestParamCount).toBe(4)
    expect(view.requestPath).toBe('/goods/get_goods_info_v2')
    expect(view.requestParams.udid).toBe('udid-xyz')
    expect(view.requestParams.token).toBe('a878••••9cef')
    expect(JSON.stringify(view)).not.toContain('a878dabfb1eaf3d4acf19fa3f81f9cef')
  })
})
