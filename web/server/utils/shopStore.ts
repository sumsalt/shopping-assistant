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
  /** 星级 1-5（1 星即视为拉黑） */
  rating: number
  /** 备注 */
  note: string
  /** 店铺链接（可为空） */
  url: string
  /** 供应商标识（一手 supply_id，为空表示手填店铺，不参与过滤） */
  supplyId: string
  /** 市场名称（辅助识别） */
  marketName: string
  /** 店铺图标 URL（详情页评分时自动保存） */
  image: string
  createdAt: Date
  updatedAt: Date
}

/** 新建 / 更新时的输入 */
export interface ShopInput {
  name: string
  rating: number
  note?: string
  url?: string
  supplyId?: string
  marketName?: string
  image?: string
}

/** 详情页评分用的输入（按 supplyId 幂等 upsert） */
export interface ShopRatingInput {
  supplyId: string
  name: string
  marketName: string
  image: string
  rating: number
  note?: string
}

/** 数据库行 */
interface ShopRow {
  id: string
  user_id: string
  name: string
  rating: number
  note: string
  url: string
  supply_id?: string
  market_name?: string
  image?: string
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
  supplyId: row.supply_id ?? '',
  marketName: row.market_name ?? '',
  image: row.image ?? '',
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
      INSERT INTO shops (id, user_id, name, rating, note, url, supply_id, market_name, image, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      input.name,
      input.rating,
      input.note ?? '',
      input.url ?? '',
      input.supplyId ?? '',
      input.marketName ?? '',
      input.image ?? '',
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
      supplyId: input.supplyId ?? '',
      marketName: input.marketName ?? '',
      image: input.image ?? '',
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
        SET name = ?, rating = ?, note = ?, url = ?, supply_id = ?, market_name = ?, image = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(
        input.name,
        input.rating,
        input.note ?? '',
        input.url ?? '',
        input.supplyId ?? '',
        input.marketName ?? '',
        input.image ?? '',
        Date.now(),
        id
      ) as { changes?: number }

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

/**
 * 被拉黑（1 星）的供应商 ID 集合（监控过滤用）
 *
 * 保留此函数名与签名，供 Tab 抓取 / 累计商品展示过滤使用（原黑名单表的替代）。
 * 只取有 supply_id 的记录——手填店铺没有供应商标识，不参与过滤。
 */
export const listBlacklistedSupplyIds = (userId: string): string[] => {
  const db = getDb()
  if (!db) {
    return []
  }

  try {
    const rows = db
      .prepare("SELECT supply_id FROM shops WHERE user_id = ? AND rating = 1 AND supply_id <> ''")
      .all(userId) as Array<{ supply_id: string }>
    return rows.map(row => row.supply_id).filter(Boolean)
  } catch (error) {
    console.error('[ShopStore] 查询拉黑供应商 ID 失败:', error)
    return []
  }
}

/** 按供应商标识查询某用户的店铺评分记录 */
export const getShopBySupplyId = (userId: string, supplyId: string): ShopRecord | null => {
  const db = getDb()
  if (!db) {
    return null
  }

  try {
    const row = db
      .prepare('SELECT * FROM shops WHERE user_id = ? AND supply_id = ?')
      .get(userId, supplyId) as ShopRow | undefined
    return row ? toRecord(row) : null
  } catch (error) {
    console.error(`[ShopStore] 按供应商查询店铺失败: ${supplyId}`, error)
    return null
  }
}

/**
 * 详情页评分：按 supply_id 幂等 upsert
 *
 * 同一用户同一供应商只保留一条；重复评分覆盖星级 / 名称 / 市场 / 图标 / 备注。
 * rating=1 即进入拉黑过滤，改成 2-5 星自动解除。
 */
export const upsertShopRating = (
  userId: string,
  input: ShopRatingInput
): ShopRecord | null => {
  const db = getDb()
  if (!db) {
    return null
  }

  try {
    const existing = getShopBySupplyId(userId, input.supplyId)
    const now = Date.now()

    if (existing) {
      db.prepare(`
        UPDATE shops
        SET name = ?, market_name = ?, image = ?, rating = ?, note = ?, updated_at = ?
        WHERE id = ?
      `).run(
        input.name || existing.name,
        input.marketName || existing.marketName,
        input.image || existing.image,
        input.rating,
        input.note ?? existing.note,
        now,
        existing.id
      )
      return getShop(existing.id)
    }

    const id = generateId()
    db.prepare(`
      INSERT INTO shops (id, user_id, name, rating, note, url, supply_id, market_name, image, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      input.name,
      input.rating,
      input.note ?? '',
      input.supplyId,
      input.marketName,
      input.image,
      now,
      now
    )
    return getShop(id)
  } catch (error) {
    console.error(`[ShopStore] 保存店铺评分失败: ${input.supplyId}`, error)
    return null
  }
}
