/**
 * 店铺黑名单持久化存储（node:sqlite）
 *
 * 黑名单以「供应商 ID（一手 supply_id）」为键：Tab 列表接口只暴露供应商标识，
 * 没有店铺名称，所以名称由用户自己填（或从商品卡片一键拉黑时自动生成），
 * 同时记录市场名辅助识别。
 *
 * 一个用户对同一供应商只有一条记录（user_id + supply_id 唯一）。
 */

import { randomBytes } from 'node:crypto'
import { getDb } from './db'

/** 黑名单记录 */
export interface ShopBlacklistRecord {
  id: string
  userId: string
  /** 供应商标识 */
  supplyId: string
  /** 展示名称（用户自定义，可为空） */
  name: string
  /** 市场名称（辅助识别） */
  marketName: string
  /** 备注 */
  note: string
  createdAt: Date
}

/** 新增 / 覆盖时的输入 */
export interface ShopBlacklistInput {
  supplyId: string
  name?: string
  marketName?: string
  note?: string
}

/** 数据库行 */
interface ShopBlacklistRow {
  id: string
  user_id: string
  supply_id: string
  name: string
  market_name: string
  note: string
  created_at: number
}

/** 行转记录 */
const toRecord = (row: ShopBlacklistRow): ShopBlacklistRecord => ({
  id: row.id,
  userId: row.user_id,
  supplyId: row.supply_id,
  name: row.name ?? '',
  marketName: row.market_name ?? '',
  note: row.note ?? '',
  createdAt: new Date(row.created_at),
})

/** 生成记录 ID */
const generateId = (): string => `blk_${Date.now()}_${randomBytes(4).toString('hex')}`

/**
 * 查询用户的黑名单（最近加入的在前）
 */
export const listBlacklist = (userId: string): ShopBlacklistRecord[] => {
  const db = getDb()
  if (!db) {
    return []
  }

  try {
    const rows = db
      .prepare('SELECT * FROM shop_blacklist WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as ShopBlacklistRow[]

    return rows.map(toRecord)
  } catch (error) {
    console.error('[ShopBlacklist] 查询黑名单失败:', error)
    return []
  }
}

/**
 * 只取供应商 ID 集合（监控过滤用，避免每轮构造完整记录）
 */
export const listBlacklistedSupplyIds = (userId: string): string[] => {
  const db = getDb()
  if (!db) {
    return []
  }

  try {
    const rows = db
      .prepare('SELECT supply_id FROM shop_blacklist WHERE user_id = ?')
      .all(userId) as Array<{ supply_id: string }>

    return rows.map(row => row.supply_id).filter(Boolean)
  } catch (error) {
    console.error('[ShopBlacklist] 查询黑名单 ID 失败:', error)
    return []
  }
}

/**
 * 加入黑名单（同一供应商重复加入时覆盖名称 / 备注，不产生重复记录）
 */
export const addToBlacklist = (
  userId: string,
  input: ShopBlacklistInput
): ShopBlacklistRecord | null => {
  const db = getDb()
  if (!db) {
    return null
  }

  try {
    const existing = db
      .prepare('SELECT * FROM shop_blacklist WHERE user_id = ? AND supply_id = ?')
      .get(userId, input.supplyId) as ShopBlacklistRow | undefined

    if (existing) {
      db.prepare(`
        UPDATE shop_blacklist
        SET name = ?, market_name = ?, note = ?
        WHERE id = ?
      `).run(
        input.name || existing.name,
        input.marketName || existing.market_name,
        input.note ?? existing.note,
        existing.id
      )

      return toRecord({
        ...existing,
        name: input.name || existing.name,
        market_name: input.marketName || existing.market_name,
        note: input.note ?? existing.note,
      })
    }

    const id = generateId()
    const now = Date.now()

    db.prepare(`
      INSERT INTO shop_blacklist (id, user_id, supply_id, name, market_name, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      input.supplyId,
      input.name ?? '',
      input.marketName ?? '',
      input.note ?? '',
      now
    )

    return {
      id,
      userId,
      supplyId: input.supplyId,
      name: input.name ?? '',
      marketName: input.marketName ?? '',
      note: input.note ?? '',
      createdAt: new Date(now),
    }
  } catch (error) {
    console.error('[ShopBlacklist] 加入黑名单失败:', error)
    return null
  }
}

/**
 * 移出黑名单
 */
export const removeFromBlacklist = (userId: string, id: string): boolean => {
  const db = getDb()
  if (!db) {
    return false
  }

  try {
    const result = db
      .prepare('DELETE FROM shop_blacklist WHERE user_id = ? AND id = ?')
      .run(userId, id) as { changes?: number }

    return typeof result?.changes !== 'number' || result.changes > 0
  } catch (error) {
    console.error(`[ShopBlacklist] 移出黑名单 ${id} 失败:`, error)
    return false
  }
}
