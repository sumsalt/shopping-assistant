/**
 * 运行设置（服务端全局）
 *
 * 这些设置影响的是「服务器怎么发请求」，不是某个账号的属性：
 * 代理开关与地址必须由服务端保存，不能由前端每次请求携带
 * （否则任何客户端都能把服务器的出口改到内网地址）。
 *
 * 目前只有代理；后续新增运行级配置继续放这里，key 用扁平字符串。
 */

import { getDb } from './db'

/** 运行设置结构 */
export interface RuntimeSettings {
  /** 代理地址，如 http://127.0.0.1:8080 */
  proxyUrl: string
  /** 是否启用代理 */
  proxyEnabled: boolean
}

const KEY_PROXY_URL = 'proxyUrl'
const KEY_PROXY_ENABLED = 'proxyEnabled'

const DEFAULT_SETTINGS: RuntimeSettings = {
  proxyUrl: '',
  proxyEnabled: false,
}

/** 读取全部设置 */
export const getRuntimeSettings = (): RuntimeSettings => {
  const db = getDb()
  if (!db) {
    return { ...DEFAULT_SETTINGS }
  }

  try {
    const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{
      key: string
      value: string
    }>
    const map = new Map(rows.map(row => [row.key, row.value]))
    return {
      proxyUrl: map.get(KEY_PROXY_URL) ?? DEFAULT_SETTINGS.proxyUrl,
      proxyEnabled: map.get(KEY_PROXY_ENABLED) === '1',
    }
  } catch (error) {
    console.error('[Settings] 读取运行设置失败:', error)
    return { ...DEFAULT_SETTINGS }
  }
}

/** 写入单项设置（内部） */
const put = (key: string, value: string): void => {
  getDb()
    ?.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value)
}

/**
 * 保存运行设置
 *
 * 只覆盖传入的字段，未传的保持原值。
 */
export const saveRuntimeSettings = (input: Partial<RuntimeSettings>): RuntimeSettings => {
  const db = getDb()
  if (!db) {
    return getRuntimeSettings()
  }

  try {
    db.exec('BEGIN')
    if (input.proxyUrl !== undefined) {
      put(KEY_PROXY_URL, input.proxyUrl.trim())
    }
    if (input.proxyEnabled !== undefined) {
      put(KEY_PROXY_ENABLED, input.proxyEnabled ? '1' : '0')
    }
    db.exec('COMMIT')
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // 忽略回滚异常
    }
    console.error('[Settings] 保存运行设置失败:', error)
  }

  return getRuntimeSettings()
}
