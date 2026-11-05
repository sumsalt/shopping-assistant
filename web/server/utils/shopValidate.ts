/**
 * 店铺表单校验与规范化
 */

import type { ShopInput } from './shopStore'

/** 校验结果 */
export type ParseShopResult =
  | { ok: true; value: ShopInput }
  | { ok: false; error: string }

/** 名称最大长度 */
const NAME_MAX = 40
/** 备注最大长度 */
const NOTE_MAX = 2000
/** 链接最大长度 */
const URL_MAX = 500

/**
 * 规范化链接：没有协议时按 https 补全
 */
const normalizeUrl = (raw: string): string => {
  const value = raw.trim()
  if (!value) {
    return ''
  }
  if (/^https?:\/\//i.test(value)) {
    return value
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return value
  }
  return `https://${value}`
}

/**
 * 校验并整理创建 / 更新入参
 */
export const parseShopInput = (body: unknown): ParseShopResult => {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: '参数格式不正确' }
  }

  const raw = body as Record<string, unknown>

  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) {
    return { ok: false, error: '请填写店铺名称' }
  }
  if (name.length > NAME_MAX) {
    return { ok: false, error: `店铺名称不能超过 ${NAME_MAX} 个字符` }
  }

  const ratingNumber = typeof raw.rating === 'string' ? Number(raw.rating) : raw.rating
  if (typeof ratingNumber !== 'number' || !Number.isFinite(ratingNumber)) {
    return { ok: false, error: '请选择星级' }
  }
  const rating = Math.round(ratingNumber)
  if (rating < 1 || rating > 5) {
    return { ok: false, error: '星级需在 1-5 之间' }
  }

  const note = typeof raw.note === 'string' ? raw.note.trim() : ''
  if (note.length > NOTE_MAX) {
    return { ok: false, error: `备注不能超过 ${NOTE_MAX} 个字符` }
  }

  const url = normalizeUrl(typeof raw.url === 'string' ? raw.url : '')
  if (url.length > URL_MAX) {
    return { ok: false, error: `链接不能超过 ${URL_MAX} 个字符` }
  }
  if (url) {
    try {
      const parsed = new URL(url)
      if (!/^https?:$/.test(parsed.protocol)) {
        return { ok: false, error: '仅支持 http / https 链接' }
      }
    } catch {
      return { ok: false, error: '链接格式不正确' }
    }
  }

  return { ok: true, value: { name, rating, note, url } }
}
