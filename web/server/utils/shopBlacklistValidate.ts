/**
 * 店铺黑名单表单校验与规范化
 */

import type { ShopBlacklistInput } from './shopBlacklistStore'

/** 校验结果 */
export type ParseBlacklistResult =
  | { ok: true; value: ShopBlacklistInput }
  | { ok: false; error: string }

/** 供应商标识最大长度 */
const SUPPLY_ID_MAX = 32
/** 名称最大长度 */
const NAME_MAX = 40
/** 市场名最大长度 */
const MARKET_MAX = 40
/** 备注最大长度 */
const NOTE_MAX = 200

/**
 * 校验并整理加入黑名单的入参
 */
export const parseBlacklistInput = (body: unknown): ParseBlacklistResult => {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: '参数格式不正确' }
  }

  const raw = body as Record<string, unknown>

  const supplyId = typeof raw.supplyId === 'string' ? raw.supplyId.trim() : String(raw.supplyId ?? '').trim()
  if (!supplyId) {
    return { ok: false, error: '请填写供应商标识' }
  }
  if (!/^[0-9A-Za-z_-]+$/.test(supplyId)) {
    return { ok: false, error: '供应商标识只能是数字、字母、下划线或短横线' }
  }
  if (supplyId.length > SUPPLY_ID_MAX) {
    return { ok: false, error: `供应商标识不能超过 ${SUPPLY_ID_MAX} 个字符` }
  }

  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (name.length > NAME_MAX) {
    return { ok: false, error: `名称不能超过 ${NAME_MAX} 个字符` }
  }

  const marketName = typeof raw.marketName === 'string' ? raw.marketName.trim() : ''
  if (marketName.length > MARKET_MAX) {
    return { ok: false, error: `市场名不能超过 ${MARKET_MAX} 个字符` }
  }

  const note = typeof raw.note === 'string' ? raw.note.trim() : ''
  if (note.length > NOTE_MAX) {
    return { ok: false, error: `备注不能超过 ${NOTE_MAX} 个字符` }
  }

  return {
    ok: true,
    value: {
      supplyId,
      ...(name ? { name } : {}),
      ...(marketName ? { marketName } : {}),
      ...(note ? { note } : {}),
    },
  }
}
