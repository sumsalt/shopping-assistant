/**
 * 账号凭据持久化存储（node:sqlite）
 *
 * 单表 accounts：一个账号一条记录，存手机号、密码、一手 uid（uin）、token、备注、
 * 三个账号标签，以及一次抓包得到的完整请求快照 requestProfile。
 * 数据按登录用户隔离（user_id），列表接口只返回掩码，明文由 reveal / active 接口单独取。
 *
 * 安全边界：凭据以明文落库（与项目现有 uid/token 配置一致），
 * 依赖 data 目录 700 权限 + 登录态鉴权，不做额外加密，避免密钥丢失导致数据不可读。
 */

import { randomBytes } from 'node:crypto'
import { getDb } from './db'

/** 一手请求通道 */
export type RequestChannel = 'wx' | 'app'

/**
 * 一次抓包的完整请求快照
 *
 * params 是公共参数（含 uid/token/udid/openid 等，不含 t_t/sign 与业务参数）；
 * headers 是关键请求头（User-Agent / Content-Type / equipmd5 等）。
 * 发请求时以 params/headers 为基础，只覆盖动态 t_t 与签名。
 */
export interface AccountRequestProfile {
  channel: RequestChannel
  params: Record<string, string>
  headers: Record<string, string>
  path?: string
}

/** 账号记录 */
export interface AccountRecord {
  id: string
  userId: string
  /** 手机号（账号主标识） */
  phone: string
  /** 显示标题；为空时前端回退显示手机号 */
  title: string
  /** 密码 */
  password: string
  /** 一手 uid（文档/接口里叫 uid，这里按用户习惯叫 uin） */
  uin: string
  /** 一手 token */
  token: string
  /** 备注 */
  remark: string
  /** 标签：是否认证 */
  isVerified: boolean
  /** 标签：是否是新用户 */
  isNewUser: boolean
  /** 标签：是否已下单 */
  hasOrdered: boolean
  /** 是否为当前使用账号（同一登录用户至多一条） */
  isActive: boolean
  /** 抓包得到的完整请求快照；没有则为 null */
  requestProfile: AccountRequestProfile | null
  createdAt: Date
  updatedAt: Date
}

/** 新增 / 更新入参 */
export interface AccountInput {
  phone: string
  title?: string
  password?: string
  uin?: string
  token?: string
  remark?: string
  /** 三个标签：更新时未传表示保持原值 */
  isVerified?: boolean
  isNewUser?: boolean
  hasOrdered?: boolean
  /**
   * 抓包请求快照：
   * - undefined：更新时保持原值（新增时为空）
   * - null：清空
   * - 对象：整体替换
   */
  requestProfile?: AccountRequestProfile | null
}

/** 数据库行 */
interface AccountRow {
  id: string
  user_id: string
  phone: string
  title: string
  password: string
  uin: string
  token: string
  remark: string
  is_verified: number
  is_new_user: number
  has_ordered: number
  is_active: number
  request_profile: string
  created_at: number
  updated_at: number
}

/** 解析落库的请求快照（容错：脏数据当作没有） */
export const decodeRequestProfile = (raw: string | null | undefined): AccountRequestProfile | null => {
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      (parsed.channel === 'wx' || parsed.channel === 'app') &&
      parsed.params && typeof parsed.params === 'object' &&
      parsed.headers && typeof parsed.headers === 'object'
    ) {
      return {
        channel: parsed.channel,
        params: parsed.params as Record<string, string>,
        headers: parsed.headers as Record<string, string>,
        ...(typeof parsed.path === 'string' ? { path: parsed.path } : {}),
      }
    }
  } catch {
    // ignore
  }
  return null
}

/** 序列化请求快照 */
const encodeRequestProfile = (profile: AccountRequestProfile | null): string =>
  profile ? JSON.stringify(profile) : ''

/** 行转记录 */
const toRecord = (row: AccountRow): AccountRecord => ({
  id: row.id,
  userId: row.user_id,
  phone: row.phone,
  title: row.title ?? '',
  password: row.password ?? '',
  uin: row.uin ?? '',
  token: row.token ?? '',
  remark: row.remark ?? '',
  isVerified: Boolean(row.is_verified),
  isNewUser: Boolean(row.is_new_user),
  hasOrdered: Boolean(row.has_ordered),
  isActive: Boolean(row.is_active),
  requestProfile: decodeRequestProfile(row.request_profile),
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
})

/** 生成记录 ID */
const generateId = (): string => `acc_${Date.now()}_${randomBytes(4).toString('hex')}`

/**
 * 查询用户的全部账号（最近更新的在前）
 *
 * @param userId 登录用户名
 * @param keyword 可选，按手机号 / uin / 备注模糊筛选
 */
export const listAccounts = (userId: string, keyword?: string): AccountRecord[] => {
  const db = getDb()
  if (!db) {
    return []
  }

  try {
    const trimmed = keyword?.trim()
    if (trimmed) {
      const like = `%${trimmed}%`
      const rows = db
        .prepare(
          `SELECT * FROM accounts
           WHERE user_id = ? AND (phone LIKE ? OR uin LIKE ? OR remark LIKE ?)
           ORDER BY updated_at DESC, created_at DESC`
        )
        .all(userId, like, like, like) as AccountRow[]
      return rows.map(toRecord)
    }

    const rows = db
      .prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY updated_at DESC, created_at DESC')
      .all(userId) as AccountRow[]

    return rows.map(toRecord)
  } catch (error) {
    console.error('[AccountStore] 查询账号列表失败:', error)
    return []
  }
}

/**
 * 查询单个账号
 */
export const getAccount = (id: string): AccountRecord | null => {
  const db = getDb()
  if (!db) {
    return null
  }

  try {
    const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRow | undefined
    return row ? toRecord(row) : null
  } catch (error) {
    console.error(`[AccountStore] 查询账号 ${id} 失败:`, error)
    return null
  }
}

/**
 * 按手机号查同一用户下的账号（用于创建 / 改手机号时的防重复校验）
 */
export const getAccountByPhone = (userId: string, phone: string): AccountRecord | null => {
  const db = getDb()
  if (!db) {
    return null
  }

  try {
    const row = db
      .prepare('SELECT * FROM accounts WHERE user_id = ? AND phone = ? LIMIT 1')
      .get(userId, phone) as AccountRow | undefined
    return row ? toRecord(row) : null
  } catch (error) {
    console.error(`[AccountStore] 按手机号查询账号 ${phone} 失败:`, error)
    return null
  }
}

/**
 * 新增账号
 */
export const createAccount = (userId: string, input: AccountInput): AccountRecord | null => {
  const db = getDb()
  if (!db) {
    return null
  }

  const id = generateId()
  const now = Date.now()
  const title = input.title ?? ''
  const password = input.password ?? ''
  const uin = input.uin ?? ''
  const token = input.token ?? ''
  const remark = input.remark ?? ''
  const isVerified = Boolean(input.isVerified)
  const isNewUser = Boolean(input.isNewUser)
  const hasOrdered = Boolean(input.hasOrdered)
  const requestProfile = input.requestProfile ?? null

  try {
    db.prepare(`
      INSERT INTO accounts (
        id, user_id, phone, title, password, uin, token, remark,
        is_verified, is_new_user, has_ordered, request_profile, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, userId, input.phone, title, password, uin, token, remark,
      isVerified ? 1 : 0, isNewUser ? 1 : 0, hasOrdered ? 1 : 0,
      encodeRequestProfile(requestProfile), now, now
    )

    return {
      id,
      userId,
      phone: input.phone,
      title,
      password,
      uin,
      token,
      remark,
      isVerified,
      isNewUser,
      hasOrdered,
      isActive: false,
      requestProfile,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    }
  } catch (error) {
    console.error('[AccountStore] 新增账号失败:', error)
    return null
  }
}

/**
 * 更新账号
 *
 * password / token 传空字符串表示「不修改」，避免编辑资料时被迫重填凭据。
 */
export const updateAccount = (id: string, input: AccountInput): AccountRecord | null => {
  const db = getDb()
  if (!db) {
    return null
  }

  const existing = getAccount(id)
  if (!existing) {
    return null
  }

  const title = input.title !== undefined ? input.title : existing.title
  const password = input.password ? input.password : existing.password
  const token = input.token ? input.token : existing.token
  const uin = input.uin !== undefined ? input.uin : existing.uin
  const remark = input.remark !== undefined ? input.remark : existing.remark
  // 标签是显式布尔：不传保持原值，传 false 就真的取消勾选
  const isVerified = input.isVerified !== undefined ? input.isVerified : existing.isVerified
  const isNewUser = input.isNewUser !== undefined ? input.isNewUser : existing.isNewUser
  const hasOrdered = input.hasOrdered !== undefined ? input.hasOrdered : existing.hasOrdered
  // 抓包快照：undefined 保持原值，null 清空，对象整体替换
  const requestProfile =
    input.requestProfile === undefined
      ? existing.requestProfile
      : input.requestProfile

  try {
    const result = db
      .prepare(`
        UPDATE accounts
        SET phone = ?, title = ?, password = ?, uin = ?, token = ?, remark = ?,
            is_verified = ?, is_new_user = ?, has_ordered = ?, request_profile = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(
        input.phone, title, password, uin, token, remark,
        isVerified ? 1 : 0, isNewUser ? 1 : 0, hasOrdered ? 1 : 0,
        encodeRequestProfile(requestProfile), Date.now(), id
      ) as { changes?: number }

    if (typeof result?.changes === 'number' && result.changes === 0) {
      return null
    }

    return getAccount(id)
  } catch (error) {
    console.error(`[AccountStore] 更新账号 ${id} 失败:`, error)
    return null
  }
}

/**
 * 查询登录用户当前选用的账号
 *
 * 「当前账号」是服务端状态：前端不再回传 uid/token，所有需要账号的请求
 * 都由服务端按登录用户取这一条。
 */
export const getActiveAccount = (userId: string): AccountRecord | null => {
  const db = getDb()
  if (!db) {
    return null
  }

  try {
    const row = db
      .prepare('SELECT * FROM accounts WHERE user_id = ? AND is_active = 1 LIMIT 1')
      .get(userId) as AccountRow | undefined
    return row ? toRecord(row) : null
  } catch (error) {
    console.error('[AccountStore] 查询当前账号失败:', error)
    return null
  }
}

/**
 * 设置 / 清除当前账号
 *
 * @param userId 登录用户名
 * @param id 账号 ID；传 null 表示回到匿名模式
 * @returns 设置后的账号；清除或失败时返回 null
 */
export const setActiveAccount = (userId: string, id: string | null): AccountRecord | null => {
  const db = getDb()
  if (!db) {
    return null
  }

  // 只允许选自己名下的账号
  if (id) {
    const target = getAccount(id)
    if (!target || target.userId !== userId) {
      return null
    }
  }

  try {
    db.exec('BEGIN')
    // 先清掉该用户所有标记，保证「至多一条 is_active=1」
    db.prepare('UPDATE accounts SET is_active = 0 WHERE user_id = ? AND is_active = 1').run(userId)
    if (id) {
      db.prepare('UPDATE accounts SET is_active = 1 WHERE id = ? AND user_id = ?').run(id, userId)
    }
    db.exec('COMMIT')
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // 忽略回滚异常
    }
    console.error('[AccountStore] 设置当前账号失败:', error)
    return null
  }

  return id ? getAccount(id) : null
}

/**
 * 删除账号
 */
export const deleteAccount = (id: string): boolean => {
  const db = getDb()
  if (!db) {
    return false
  }

  try {
    const result = db.prepare('DELETE FROM accounts WHERE id = ?').run(id) as { changes?: number }
    return typeof result?.changes !== 'number' || result.changes > 0
  } catch (error) {
    console.error(`[AccountStore] 删除账号 ${id} 失败:`, error)
    return false
  }
}
