/**
 * 账号凭据持久化存储（node:sqlite）
 *
 * 单表 accounts：一个账号一条记录，存手机号、密码、一手 uid（uin）、token 和备注。
 * 数据按登录用户隔离（user_id），列表接口只返回掩码，明文由 reveal 接口单独取。
 *
 * 安全边界：凭据以明文落库（与项目现有 uid/token 配置一致），
 * 依赖 data 目录 700 权限 + 登录态鉴权，不做额外加密，避免密钥丢失导致数据不可读。
 */

import { randomBytes } from 'node:crypto'
import { getDb } from './db'

/** 账号记录 */
export interface AccountRecord {
  id: string
  userId: string
  /** 手机号（账号主标识） */
  phone: string
  /** 密码 */
  password: string
  /** 一手 uid（文档/接口里叫 uid，这里按用户习惯叫 uin） */
  uin: string
  /** 一手 token */
  token: string
  /** 备注 */
  remark: string
  createdAt: Date
  updatedAt: Date
}

/** 新增 / 更新入参 */
export interface AccountInput {
  phone: string
  password?: string
  uin?: string
  token?: string
  remark?: string
}

/** 数据库行 */
interface AccountRow {
  id: string
  user_id: string
  phone: string
  password: string
  uin: string
  token: string
  remark: string
  created_at: number
  updated_at: number
}

/** 行转记录 */
const toRecord = (row: AccountRow): AccountRecord => ({
  id: row.id,
  userId: row.user_id,
  phone: row.phone,
  password: row.password ?? '',
  uin: row.uin ?? '',
  token: row.token ?? '',
  remark: row.remark ?? '',
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
 * 新增账号
 */
export const createAccount = (userId: string, input: AccountInput): AccountRecord | null => {
  const db = getDb()
  if (!db) {
    return null
  }

  const id = generateId()
  const now = Date.now()
  const password = input.password ?? ''
  const uin = input.uin ?? ''
  const token = input.token ?? ''
  const remark = input.remark ?? ''

  try {
    db.prepare(`
      INSERT INTO accounts (id, user_id, phone, password, uin, token, remark, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, input.phone, password, uin, token, remark, now, now)

    return {
      id,
      userId,
      phone: input.phone,
      password,
      uin,
      token,
      remark,
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

  const password = input.password ? input.password : existing.password
  const token = input.token ? input.token : existing.token
  const uin = input.uin !== undefined ? input.uin : existing.uin
  const remark = input.remark !== undefined ? input.remark : existing.remark

  try {
    const result = db
      .prepare(`
        UPDATE accounts
        SET phone = ?, password = ?, uin = ?, token = ?, remark = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(input.phone, password, uin, token, remark, Date.now(), id) as { changes?: number }

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
