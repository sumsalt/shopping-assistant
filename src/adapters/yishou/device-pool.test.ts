import { describe, it, expect } from 'vitest'
import {
  YISHOU_DEVICE_POOL,
  pickDevicePreset,
  pickOsVersion,
  type YishouDevicePreset,
} from './device-pool'

/** 厂商上报值与品牌的合法对应关系：品牌可以多个，厂商必须对得上 */
const BRAND_BY_MANUFACTURER: Record<string, string[]> = {
  Xiaomi: ['Xiaomi', 'Redmi', 'POCO'],
  SAMSUNG: ['Samsung'],
  vivo: ['vivo', 'iQOO'],
  OPPO: ['OPPO'],
  OnePlus: ['OnePlus'],
  realme: ['realme'],
  HONOR: ['HONOR'],
  HUAWEI: ['HUAWEI'],
  Sony: ['Sony'],
  ZTE: ['REDMAGIC', 'nubia'],
  MEIZU: ['Meizu'],
  'Game phone': ['ASUS'],
}

/** 固定随机序列 */
const fixedRandom = (values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]!
}

/** 线性同余伪随机：需要大量独立抽样时用，避免固定序列重复 */
const seededRandom = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

describe('一手设备池', () => {
  it('型号唯一、必填字段齐全', () => {
    const seen = new Set<string>()
    for (const preset of YISHOU_DEVICE_POOL) {
      expect(preset.model.trim()).not.toBe('')
      expect(seen.has(preset.model)).toBe(false)
      seen.add(preset.model)

      expect(preset.manufacturer.trim()).not.toBe('')
      expect(preset.brand.trim()).not.toBe('')
    }
    expect(YISHOU_DEVICE_POOL.length).toBeGreaterThanOrEqual(20)
  })

  it('厂商与品牌对应，避免 Redmi 机型上报 OPPO 这类错配', () => {
    for (const preset of YISHOU_DEVICE_POOL) {
      const allowed = BRAND_BY_MANUFACTURER[preset.manufacturer]
      expect(allowed, `未知厂商 ${preset.manufacturer}`).toBeDefined()
      expect(allowed).toContain(preset.brand)
    }
  })

  it('分辨率是竖屏物理分辨率，数值在真实区间内', () => {
    for (const preset of YISHOU_DEVICE_POOL) {
      const width = Number(preset.screenWidth)
      const height = Number(preset.screenHeight)

      expect(Number.isInteger(width)).toBe(true)
      expect(Number.isInteger(height)).toBe(true)
      expect(width).toBeGreaterThanOrEqual(720)
      expect(width).toBeLessThanOrEqual(1800)
      expect(height).toBeGreaterThanOrEqual(1280)
      expect(height).toBeLessThanOrEqual(4000)
      expect(height).toBeGreaterThan(width)
    }
  })

  it('系统版本是 11 以上的大版本，且与上市年份不矛盾', () => {
    for (const preset of YISHOU_DEVICE_POOL) {
      expect(preset.osVersions.length).toBeGreaterThan(0)

      for (const version of preset.osVersions) {
        expect(version).toMatch(/^\d{2}$/)
        const major = Number(version)
        expect(major).toBeGreaterThanOrEqual(11)
        expect(major).toBeLessThanOrEqual(16)
      }

      // Android 版本与年份的对应：2020→11、2021→12……（version = year - 2009），
      // 允许出厂后升级 2 代，超出说明版本或年份填错了（抓包样本另当别论）
      if (preset.source !== 'capture') {
        const newest = Math.max(...preset.osVersions.map(Number))
        const shift = newest - (preset.releaseYear - 2009)
        expect(shift).toBeGreaterThanOrEqual(-2)
        expect(shift).toBeLessThanOrEqual(2)
      }

      expect(preset.releaseYear).toBeGreaterThanOrEqual(2018)
      expect(preset.releaseYear).toBeLessThanOrEqual(2026)
      expect(preset.weight).toBeGreaterThan(0)
    }
  })

  it('加权抽取：所有机型都能被抽到，版本一定来自该机型', () => {
    const hits = new Map<string, number>()
    const random = seededRandom(20261115)

    for (let i = 0; i < 5000; i += 1) {
      const preset = pickDevicePreset(random)
      hits.set(preset.model, (hits.get(preset.model) ?? 0) + 1)
      expect(preset.osVersions).toContain(pickOsVersion(preset, random))
    }

    for (const preset of YISHOU_DEVICE_POOL) {
      expect(hits.get(preset.model) ?? 0, `${preset.model} 从未被抽到`).toBeGreaterThan(0)
    }
  })

  it('权重为 0 的机型不会被抽到', () => {
    const pool: YishouDevicePreset[] = [
      { ...YISHOU_DEVICE_POOL[0]!, model: 'ZERO', weight: 0 },
      { ...YISHOU_DEVICE_POOL[1]!, model: 'ONLY', weight: 1 },
    ]
    const random = fixedRandom([0, 0.25, 0.5, 0.75, 0.99])

    for (let i = 0; i < 500; i += 1) {
      expect(pickDevicePreset(random, pool).model).toBe('ONLY')
    }
  })
})
