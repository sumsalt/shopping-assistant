/**
 * 一手抓包解析测试（纯函数）
 *
 * 放在 src 下复用现有 vitest 配置；被测模块是 web/utils 里的纯 TS，不依赖 Nuxt。
 */

import { describe, expect, it } from 'vitest'
import {
  parseYishouCapture,
  readParam,
  displayParamValue,
  PUBLIC_PARAM_KEYS,
} from '../web/utils/yishou-capture'

const APP_CAPTURE = `POST /goods/get_goods_info_v2 HTTP/1.1
sign: 13097e70a77a6ba6060f29b34d3970cd
equipmd5: bdfcecd841c3bfd822f8f06c766e45cb
Content-Type: application/x-www-form-urlencoded
Content-Length: 495
Host: api.yishouapp.com
Connection: Keep-Alive
Accept-Encoding: gzip
User-Agent: okhttp/3.14.9

_abtest=1&app_version=7.65.00&plat_type=Android&push_id=&source=56&manufacturer=Xiaomi&uid=20536811&screen_height=2115&IS_PRODUCTION=1&model=MI%208%20UD&udid=be21db39a316aafd&oaid=3ac4237be48dcacc&ss_type=0&screen_width=1080&device_id=be21db39a316aafd&os=Android&level=0&os_version=10&version_code=76500&t_t=1794395887&goods_id=339169061&version=29&token=53b3cb4ddc8cd0171cb9b6d6d1cb41ce&carrier=%E6%9C%AA%E7%9F%A5&version_name=7.65.00&ad_idMD5=bdfcecd841c3bfd822f8f06c766e45cb&network_type=WIFI`

const WX_CAPTURE = `POST /goods/get_goods_info_v2 HTTP/1.1
Host: api.yishouapp.com
Content-Type: application/x-www-form-urlencoded
User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 16_5_1 like Mac OS X) AppleWebKit/605.1.15 MicroMessenger/8.0.60(0x18003c32) NetType/4G Language/zh_CN
Referer: https://servicewechat.com/wxe9634876e78aafd5/454/page-frame.html
sign: abcdef

openid=oXxx1234567890abcdef&model=iPhone%2014%20Pro%3CiPhone15%2C2%3E&t_t=1794395887123&openid=oXxx&uid=20478621&token=a878dabfb1eaf3d4acf19fa3f81f9cef&version=8.0.60&version_name=4.9.0&wx_version_name=3.5.34&plat_type=wx&goods_id=339169061&pageidx=1`

describe('parseYishouCapture - App 通道完整请求', () => {
  it('识别为 app，提取 uid/token 与全套公共参数', () => {
    const result = parseYishouCapture(APP_CAPTURE)

    expect(result.ok).toBe(true)
    expect(result.uid).toBe('20536811')
    expect(result.token).toBe('53b3cb4ddc8cd0171cb9b6d6d1cb41ce')
    expect(result.profile?.channel).toBe('app')
    expect(result.profile?.path).toBe('/goods/get_goods_info_v2')
    expect(result.matched).toBeGreaterThan(20)
    expect(result.warnings).toEqual([])
  })

  it('URL 解码：model 的 %20、carrier 的中文', () => {
    const { profile } = parseYishouCapture(APP_CAPTURE)
    expect(profile?.params.model).toBe('MI 8 UD')
    expect(profile?.params.carrier).toBe('未知')
    expect(profile?.params.plat_type).toBe('Android')
  })

  it('保留关键请求头、丢弃 sign 与框架头', () => {
    const { profile } = parseYishouCapture(APP_CAPTURE)
    expect(profile?.headers['User-Agent']).toBe('okhttp/3.14.9')
    expect(profile?.headers.equipmd5).toBe('bdfcecd841c3bfd822f8f06c766e45cb')
    expect(profile?.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(Object.keys(profile?.headers || {}).some(k => k.toLowerCase() === 'sign')).toBe(false)
    expect(profile?.headers.Host).toBeUndefined()
    expect(profile?.headers['Content-Length']).toBeUndefined()
  })

  it('丢弃业务参数与动态字段，但记录到 ignored', () => {
    const { profile, ignored } = parseYishouCapture(APP_CAPTURE)
    expect(profile?.params.goods_id).toBeUndefined()
    expect(profile?.params.t_t).toBeUndefined()
    expect(ignored).toContain('goods_id')
    expect(ignored).not.toContain('t_t') // 动态字段不算「被忽略的业务参数」
  })

  it('空值公共参数（push_id）仍保留为空字符串', () => {
    const { profile } = parseYishouCapture(APP_CAPTURE)
    expect(profile?.params).toHaveProperty('push_id', '')
  })
})

describe('parseYishouCapture - 小程序 / H5 通道', () => {
  it('识别为 wx，保留 openid 与 wx_version_name', () => {
    const result = parseYishouCapture(WX_CAPTURE)

    expect(result.ok).toBe(true)
    expect(result.profile?.channel).toBe('wx')
    expect(result.uid).toBe('20478621')
    expect(result.profile?.params.openid).toBeTruthy()
    expect(result.profile?.params.wx_version_name).toBe('3.5.34')
    expect(result.profile?.headers['User-Agent']).toContain('MicroMessenger')
    expect(result.profile?.headers.Referer).toContain('servicewechat.com')
  })

  it('model 里的尖括号被正确解码', () => {
    const { profile } = parseYishouCapture(WX_CAPTURE)
    expect(profile?.params.model).toBe('iPhone 14 Pro<iPhone15,2>')
  })

  it('丢弃 wx 抓包里的业务参数 pageidx', () => {
    const { profile, ignored } = parseYishouCapture(WX_CAPTURE)
    expect(profile?.params.pageidx).toBeUndefined()
    expect(ignored).toContain('pageidx')
  })
})

describe('parseYishouCapture - 兼容与边界', () => {
  it('只粘贴一行 body 也能解析', () => {
    const body = APP_CAPTURE.split('\n\n')[1]
    const result = parseYishouCapture(body)
    expect(result.ok).toBe(true)
    expect(result.uid).toBe('20536811')
    expect(result.profile?.channel).toBe('app')
    // 没有 UA 时给软提示，但仍按 plat_type 判通道
    expect(result.warnings).toContain('没有识别到 User-Agent，将按通道默认 UA 发送')
  })

  it('CRLF 换行可用', () => {
    const result = parseYishouCapture(APP_CAPTURE.replace(/\n/g, '\r\n'))
    expect(result.ok).toBe(true)
    expect(result.profile?.params.uid).toBe('20536811')
  })

  it('body 后面混入其它文本时只取第一行 form', () => {
    const withTail = `${APP_CAPTURE} {"providerData":{"foo":1}}`
    const result = parseYishouCapture(withTail)
    expect(result.ok).toBe(true)
    expect(result.profile?.params.token).toBe('53b3cb4ddc8cd0171cb9b6d6d1cb41ce')
  })

  it('游客态抓包（无 uid/token）给出 warning', () => {
    const guest = APP_CAPTURE.replace(/&uid=20536811/, '').replace(/&token=[^&]+/, '')
    const result = parseYishouCapture(guest)
    expect(result.ok).toBe(true)
    expect(result.uid).toBe('')
    expect(result.warnings.join(' ')).toContain('游客态')
  })

  it('空内容 / 无 form / 无公共参数都返回明确错误', () => {
    expect(parseYishouCapture('').ok).toBe(false)
    expect(parseYishouCapture('   ').error).toContain('请先粘贴')
    expect(parseYishouCapture('POST /x HTTP/1.1\nHost: a.com').error).toContain('form 请求体')
    expect(parseYishouCapture('goods_id=123&pageidx=1').error).toContain('没有识别到公共参数')
  })

  it('白名单里的字段大小写不敏感匹配，但保留原始 key', () => {
    const result = parseYishouCapture('UDID=abcd&Model=Phone&token=xyz&plat_type=Android')
    expect(result.ok).toBe(true)
    expect(result.profile?.params.UDID).toBe('abcd')
    expect(result.profile?.params.Model).toBe('Phone')
    expect(result.profile?.channel).toBe('app')
  })
})

describe('辅助函数', () => {
  it('readParam 大小写不敏感', () => {
    expect(readParam({ UDID: 'be21db39a316aafd' }, 'udid')).toBe('be21db39a316aafd')
    expect(readParam({}, 'token')).toBe('')
  })

  it('displayParamValue 对 token 打码，空值有占位', () => {
    expect(displayParamValue('token', 'a878dabfb1eaf3d4acf19fa3f81f9cef')).toBe('a878••••9cef')
    expect(displayParamValue('token', 'short')).toBe('••••••••')
    expect(displayParamValue('model', 'MI 8 UD')).toBe('MI 8 UD')
    expect(displayParamValue('push_id', '')).toBe('（空）')
  })

  it('公共参数白名单不含动态字段', () => {
    expect(PUBLIC_PARAM_KEYS).not.toContain('t_t')
    expect(PUBLIC_PARAM_KEYS).not.toContain('sign')
    expect(PUBLIC_PARAM_KEYS).toContain('udid')
    expect(PUBLIC_PARAM_KEYS).toContain('openid')
  })
})
