/**
 * 一手抓包请求解析（纯函数，无 Nuxt / DOM 依赖，便于单测）
 *
 * 兼容两种抓包内容：
 * - App 通道：plat_type=Android、udid/device_id、User-Agent=okhttp/x.y.z、t_t 为秒级
 * - 小程序 / H5 通道：plat_type=wx、openid、微信 MicroMessenger UA、t_t 为毫秒级
 *
 * 输入可以是完整的 HTTP 请求文本（请求行 + 请求头 + 空行 + form body），
 * 也可以只有一行 urlencoded body。只保留「公共参数 + 关键请求头」，
 * 业务参数（goods_id / rec_ids / selected ...）与动态字段（t_t / sign）一律丢弃，
 * 由发请求时重新生成，避免把某次抓包的业务参数带到别的接口上。
 */

/** 抓包所属通道 */
export type CaptureChannel = 'wx' | 'app'

/** 账号保存下来的请求快照 */
export interface YishouRequestProfile {
  /** 通道：决定 UA、plat_type、t_t 单位、签名首段 */
  channel: CaptureChannel
  /** 公共参数（静态值，含 uid/token/udid/openid 等；不含 t_t/sign 与业务参数） */
  params: Record<string, string>
  /** 关键请求头（User-Agent / Content-Type / equipmd5 等；不含 sign） */
  headers: Record<string, string>
  /** 抓包里的请求路径，仅作展示备查 */
  path?: string
}

/** 解析结果 */
export interface CaptureParseResult {
  ok: boolean
  error?: string
  profile?: YishouRequestProfile
  /** 从 body 提取的 uid，用于回填账号主字段 uin */
  uid: string
  /** 从 body 提取的 token，用于回填账号主字段 token */
  token: string
  /** 识别到的公共参数个数 */
  matched: number
  /** 被忽略的字段（业务参数 / 动态字段），用于给用户提示 */
  ignored: string[]
  /** 软提示：例如抓包里没有登录态 */
  warnings: string[]
}

/**
 * 公共参数白名单（文档《接口请求字段与签名实测指南》1.2 + wx 通道补充）。
 * 只保留白名单内的字段，任何接口自带的业务参数都会被自动过滤。
 */
export const PUBLIC_PARAM_KEYS: readonly string[] = [
  // 登录态
  'uid', 'token', 'openid', 'udid', 'device_id',
  // 参与签名 / 网关硬门槛
  'model', 'version', 'version_name', 'plat_type',
  // 版本冗余字段
  'version_code', 'app_version', 'wx_version_name',
  // 设备信息
  'os', 'os_version', 'manufacturer', 'screen_width', 'screen_height',
  // 其它公共参数
  'network_type', 'carrier', 'oaid', 'ad_idMD5', 'equipmd5',
  'level', 'IS_PRODUCTION', '_abtest', 'source', 'push_id', 'ss_type',
]

const PUBLIC_PARAM_SET = new Set(PUBLIC_PARAM_KEYS.map(key => key.toLowerCase()))

/** 动态字段：每次请求重新生成，不保存 */
const DYNAMIC_PARAMS = new Set(['t_t', 'sign'])

/** 需要保留的请求头（其余如 Host / Content-Length / Connection 由框架生成） */
const HEADER_KEYS = new Set([
  'user-agent', 'content-type', 'accept-encoding', 'equipmd5', 'referer', 'x-forwarded-for',
])

/** 从 headers（大小写不敏感）里取值 */
const readHeader = (headers: Record<string, string>, key: string): string => {
  const target = key.toLowerCase()
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === target) {
      return value
    }
  }
  return ''
}

/** 解析请求行，取路径 */
const parsePath = (firstLine: string): string => {
  const match = firstLine.match(/^(?:GET|POST|PUT|DELETE|PATCH)\s+(\S+)\s+HTTP\/\d/i)
  return match?.[1] || ''
}

/** 是否像「请求行 / 请求头」而不是 body */
const looksLikeHeaderLine = (line: string): boolean =>
  /^(?:GET|POST|PUT|DELETE|PATCH)\s+\S+\s+HTTP\//i.test(line) ||
  /^\s*[\w-]+\s*:/.test(line)

export const parseYishouCapture = (raw: string): CaptureParseResult => {
  const empty: CaptureParseResult = {
    ok: false, uid: '', token: '', matched: 0, ignored: [], warnings: [],
  }

  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return { ...empty, error: '请先粘贴抓包内容' }
  }

  // 统一换行符；body 后面可能跟了其它内容（例如聊天里粘过来的元数据），只取第一行 form
  const text = raw.replace(/\r\n/g, '\n').trim()
  const lines = text.split('\n')

  let headerLines: string[] = []
  let bodyLine = ''

  const blankIndex = lines.findIndex(line => line.trim() === '')
  if (blankIndex >= 0) {
    headerLines = lines.slice(0, blankIndex)
    // body 可能跨多行（少见），取第一段含 '=' 的行
    bodyLine = lines.slice(blankIndex + 1).find(line => line.includes('=')) || ''
  } else {
    // 没有空行：从头找第一行「不像请求行/请求头」且含 '=' 的行作为 body
    const bodyIndex = lines.findIndex(line => line.includes('=') && !looksLikeHeaderLine(line))
    if (bodyIndex > 0) {
      headerLines = lines.slice(0, bodyIndex)
      bodyLine = lines[bodyIndex]
    } else if (bodyIndex === 0 || lines.every(line => line.includes('=') && !looksLikeHeaderLine(line))) {
      // 纯 body（可能多行拼在一起）
      bodyLine = lines.find(line => line.includes('=')) || ''
    } else {
      // 只有请求头、没有 body
      headerLines = lines
    }
  }

  // ---- 请求头 ----
  const headers: Record<string, string> = {}
  for (const line of headerLines) {
    const match = line.match(/^\s*([\w-]+)\s*:\s*(.*)$/)
    if (!match) {
      continue
    }
    const [, name, value] = match
    if (HEADER_KEYS.has(name.toLowerCase()) && value.trim()) {
      headers[name] = value.trim()
    }
  }

  const path = headerLines.length ? parsePath(headerLines[0]) : ''

  // ---- form body ----
  if (!bodyLine.includes('=')) {
    return { ...empty, error: '没有找到 form 请求体（形如 a=1&b=2 的那一行）' }
  }

  let entries: Array<[string, string]>
  try {
    // URLSearchParams 会处理 %XX 与 '+' 解码，与抓包里的 urlencoded 一致
    entries = Array.from(new URLSearchParams(bodyLine.trim()).entries())
  } catch {
    return { ...empty, error: '请求体解析失败，请确认是完整的 urlencoded 参数' }
  }

  const params: Record<string, string> = {}
  const ignored: string[] = []
  for (const [key, value] of entries) {
    const lower = key.toLowerCase()
    if (PUBLIC_PARAM_SET.has(lower)) {
      // 保留抓包里的原始 key（大小写敏感，如 ad_idMD5 / IS_PRODUCTION）
      params[key] = value
    } else if (!DYNAMIC_PARAMS.has(lower)) {
      ignored.push(key)
    }
  }

  const matched = Object.keys(params).length
  if (matched === 0) {
    return { ...empty, error: '没有识别到公共参数，请确认粘贴的是一手 App/小程序的请求' }
  }

  // ---- 通道识别：plat_type 优先，其次 UA，最后看 udid/openid ----
  const ua = readHeader(headers, 'user-agent')
  const platType = (params.plat_type || '').toLowerCase()
  const hasUdid = Boolean(params.udid || params.device_id)
  const hasOpenid = Boolean(params.openid)
  const channel: CaptureChannel =
    platType === 'android' || platType === 'ios' || /okhttp/i.test(ua) || (hasUdid && !hasOpenid)
      ? 'app'
      : 'wx'

  const uid = params.uid || ''
  const token = params.token || ''
  const warnings: string[] = []
  if (!uid || !token) {
    warnings.push('抓包里没有 uid/token，属于游客态请求，无法用于自动下单 / 价格监控')
  }
  if (channel === 'app' && !hasUdid) {
    warnings.push('App 通道但没有 udid/device_id，网关可能返回 404')
  }
  if (!ua) {
    warnings.push('没有识别到 User-Agent，将按通道默认 UA 发送')
  }

  return {
    ok: true,
    profile: { channel, params, headers, ...(path ? { path } : {}) },
    uid,
    token,
    matched,
    ignored: Array.from(new Set(ignored)),
    warnings,
  }
}

/** 从 params 里取字段（大小写不敏感） */
export const readParam = (params: Record<string, string>, key: string): string => {
  const target = key.toLowerCase()
  for (const [name, value] of Object.entries(params)) {
    if (name.toLowerCase() === target) {
      return value
    }
  }
  return ''
}

/** 展示用的字段分组 */
export interface ParamGroup {
  label: string
  keys: string[]
}

export const PROFILE_PARAM_GROUPS: ParamGroup[] = [
  { label: '登录态', keys: ['uid', 'token', 'udid', 'device_id', 'openid'] },
  { label: '设备与版本', keys: ['plat_type', 'model', 'version', 'version_name', 'version_code', 'app_version', 'wx_version_name', 'os', 'os_version', 'manufacturer', 'screen_width', 'screen_height'] },
  { label: '其它公共参数', keys: ['network_type', 'carrier', 'oaid', 'ad_idMD5', 'equipmd5', 'level', 'IS_PRODUCTION', '_abtest', 'source', 'push_id', 'ss_type'] },
]

/** 需要掩码展示的敏感字段 */
export const SENSITIVE_PARAM_KEYS = new Set(['token'])

/** 参数值展示（token 打码） */
export const displayParamValue = (key: string, value: string): string => {
  if (!value) {
    return '（空）'
  }
  if (SENSITIVE_PARAM_KEYS.has(key.toLowerCase())) {
    return value.length <= 8 ? '••••••••' : `${value.slice(0, 4)}••••${value.slice(-4)}`
  }
  return value
}
