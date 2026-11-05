/**
 * 店铺评分持久化存储（node:sqlite）
 *
 * 单表 shops：一个用户一条记录就是一家店，含星级、备注、可选链接。
 * 数据量小、查询简单，直接同步读写，不做内存缓存。
 */

import { randomBytes } from 'node:crypto'
import { getDb } from './db'

/** 店铺记录 */
export interface ShopRecord {
  id: string
  userId: string
  /** 店铺名称 */
  name: string
  /** 星级 1-5 */
  rating: number
  /** 备注 */
  note: string
  /** 店铺链接（可为空） */
  url: string
  createdAt: Date
  updatedAt: Date
}

/** 新建 / 更新时的输入 */
export interface ShopInput {
  name: string
  rating: number
  note?: string
  url?: string
}

/** 数据库行 */
interface ShopRow {
  id: string
  user_id: string
  name: string
  rating: number
  note: string
  url: string
  created_at: number
  updated_at: number
}

/** 行转记录 */
const toRecord = (row: ShopRow): ShopRecord => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  rating: row.rating,
  note: row.note ?? '',
  url: row.url ?? '',
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
})

/** 生成记录 ID */
const generateId = (): string => `shop_${Date.now()}_${randomBytes(4).toString('hex')}`

/**
 * 查询用户的全部店铺（最近更新的在前）
 */
export const listShops = (userId: string): ShopRecord[] => {
  const db = getDb()
  if (!db) {
    return []
  }

  try {
    const rows = db
      .prepare('SELECT * FROM shops WHERE user_id = ? ORDER BY updated_at DESC, created_at DESC')
      .all(userId) as ShopRow[]

    return rows.map(toRecord)
  } catch (error) {
    console.error('[ShopStore] 查询店铺列表失败:', error)
    return []
  }
}

/**
 * 查询单个店铺
 */
export const getShop = (id: string): ShopRecord | null => {
  const db = getDb()
  if (!db) {
    return null
  }

  try {
    const row = db.prepare('SELECT * FROM shops WHERE id = ?').get(id) as ShopRow | undefined
    return row ? toRecord(row) : null
  } catch (error) {
    console.error(`[ShopStore] 查询店铺 ${id} 失败:`, error)
    return null
  }
}

/**
 * 新增店铺
 */
export const createShop = (userId: string, input: ShopInput): ShopRecord | null => {
  const db = getDb()
  if (!db) {
    return null
  }

  const id = generateId()
  const now = Date.now()

  try {
    db.prepare(`
      INSERT INTO shops (id, user_id, name, rating, note, url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      input.name,
      input.rating,
      input.note ?? '',
      input.url ?? '',
      now,
      now
    )

    return {
      id,
      userId,
      name: input.name,
      rating: input.rating,
      note: input.note ?? '',
      url: input.url ?? '',
      createdAt: new Date(now),
      updatedAt: new Date(now),
    }
  } catch (error) {
    console.error('[ShopStore] 新增店铺失败:', error)
    return null
  }
}

/**
 * 更新店铺
 */
export const updateShop = (id: string, input: ShopInput): ShopRecord | null => {
  const db = getDb()
  if (!db) {
    return null
  }

  try {
    const result = db
      .prepare(`
        UPDATE shops
        SET name = ?, rating = ?, note = ?, url = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(input.name, input.rating, input.note ?? '', input.url ?? '', Date.now(), id) as {
      changes?: number
    }

    if (typeof result?.changes === 'number' && result.changes === 0) {
      return null
    }

    return getShop(id)
  } catch (error) {
    console.error(`[ShopStore] 更新店铺 ${id} 失败:`, error)
    return null
  }
}

/**
 * 删除店铺
 */
export const deleteShop = (id: string): boolean => {
  const db = getDb()
  if (!db) {
    return false
  }

  try {
    const result = db.prepare('DELETE FROM shops WHERE id = ?').run(id) as { changes?: number }
    return typeof result?.changes !== 'number' || result.changes > 0
  } catch (error) {
    console.error(`[ShopStore] 删除店铺 ${id} 失败:`, error)
    return false
  }
}
