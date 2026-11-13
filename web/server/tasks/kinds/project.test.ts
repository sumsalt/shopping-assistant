import { describe, expect, it } from 'vitest'
import { priceDefinition } from './price'
import { stockDefinition } from './stock'
import { tabDefinition } from './tab'
import { renewDefinition } from './renew'
import type { TaskRecordBase } from '../engine/types'
import type { PriceTaskState, RenewTaskState, StockTaskState, TabTaskState } from './state'

const base = (overrides: Partial<TaskRecordBase<any>> = {}) => ({
  id: 'task_1',
  kind: 'price',
  userId: 'u1',
  userEmail: 'a@b.c',
  status: 'running',
  createdAt: new Date(1_700_000_000_000),
  updatedAt: new Date(1_700_000_100_000),
  version: 2,
  state: {},
  ...overrides,
}) as TaskRecordBase<any>

describe('任务视图投影', () => {
  it('price：目标/指标/事件/订单/提示齐全，且不含凭证', () => {
    const state: PriceTaskState = {
      product: { productId: '339789599', productName: '测试商品', productNo: 'PN1' },
      config: { interval: 60, duration: 3600, notifyOn: 'any', minPriceDelta: 0.01 },
      checkCount: 5,
      detectedCount: 2,
      snapshot: { productId: '339789599', productName: '测试商品', shopPrice: 199, checkedAt: 1 },
      orderError: '商品当前无货',
      orderSkipped: 'no_stock',
      events: [
        {
          id: 'e1',
          type: 'price.changed',
          at: 1,
          title: '降价 ¥204.99 → ¥199.00',
          tone: 'down',
          previousPrice: 204.99,
          currentPrice: 199,
          delta: -5.99,
          deltaPercent: -2.92,
          direction: 'down',
        },
      ],
    }
    const summary = priceDefinition.project(base({ state, secret: { uid: 'u', token: 't' } }))
    expect(summary.kind).toBe('price')
    expect(summary.target).toMatchObject({ type: 'product', productNo: 'PN1' })
    expect(summary.stats.find(s => s.key === 'price')?.value).toBe(1)
    expect(summary.events).toHaveLength(1)
    expect(summary.notice?.type).toBe('no_stock')
    expect(JSON.stringify(summary)).not.toContain('"token"')
  })

  it('stock：订单与规格等待提示', () => {
    const state: StockTaskState = {
      product: { productId: '1', productName: '到货商品', productNo: 'PN1' },
      config: { interval: 10, duration: 3600, skus: ['a', 'b'] },
      result: {
        checkCount: 3,
        errorCount: 0,
        detected: false,
        skuWaiting: true,
        order: { orderSn: 'SN1', amount: 99 },
      },
      events: [],
    }
    const summary = stockDefinition.project(base({ kind: 'stock', state }))
    expect(summary.order).toMatchObject({ orderSn: 'SN1', amount: 99 })
    expect(summary.badges.some(b => b.text.includes('限定'))).toBe(true)
    expect(summary.notice?.type).toBe('sku_waiting')
  })

  it('tab：已记录商品数与模式徽标', () => {
    const state: TabTaskState = {
      tab: { id: '146453', name: '女装' },
      config: { mode: 'diff', interval: 300, duration: 10800 },
      checkCount: 2,
      detectedCount: 1,
      currentTotal: 288,
      seenProducts: [{ productId: 'a', productName: 'A', price: 1, firstSeenAt: '2026-01-01T00:00:00.000Z' }],
      events: [],
    }
    const summary = tabDefinition.project(base({ kind: 'tab', state }))
    expect(summary.target).toMatchObject({ type: 'tab', name: '女装' })
    expect(summary.badges[0].text).toBe('逐轮对比')
    expect(summary.stats.find(s => s.key === 'seen')?.value).toBe(1)
  })

  it('renew：账号目标与续期事件', () => {
    const state: RenewTaskState = {
      account: { id: 'acc1', phone: '166****', title: '主号' },
      source: 'auto',
      config: { duration: 43200 },
      checkCount: 2,
      scannedCount: 3,
      renewedCount: 1,
      skippedCount: 1,
      finishedCount: 0,
      events: [
        { id: 'e1', type: 'renew.succeeded', at: 1, title: '已刷新支付有效期', tone: 'success', orderSn: 'SN2' },
      ],
    }
    const summary = renewDefinition.project(base({ kind: 'renew', state }))
    expect(summary.target).toMatchObject({ type: 'account', name: '主号', subtitle: '166****' })
    expect(summary.badges[0].text).toBe('自动创建')
    expect(summary.events[0].orderSn).toBe('SN2')
  })

  it('列表只返回最近 5 条事件，详情返回全部', () => {
    const events = Array.from({ length: 8 }, (_, i) => ({
      id: `e${i}`,
      type: 'price.changed' as const,
      at: i,
      title: `变化 ${i}`,
      tone: 'up' as const,
    }))
    const state: PriceTaskState = {
      product: { productId: '1' },
      config: { interval: 60, notifyOn: 'any', minPriceDelta: 0.01 },
      checkCount: 0,
      detectedCount: 0,
      events,
    }
    const record = base({ state })
    expect(priceDefinition.project(record).events).toHaveLength(5)
    expect(priceDefinition.project(record, { full: true }).events).toHaveLength(8)
  })

  it('列表被截断时带上事件总数，前端据此显示「查看全部」', () => {
    const events = Array.from({ length: 6 }, (_, i) => ({
      id: `e${i}`,
      type: 'price.changed' as const,
      at: i,
      title: `变化 ${i}`,
      tone: 'up' as const,
    }))
    const state: PriceTaskState = {
      product: { productId: '1' },
      config: { interval: 60, notifyOn: 'any', minPriceDelta: 0.01 },
      checkCount: 0,
      detectedCount: 0,
      events,
    }
    const list = priceDefinition.project(base({ state }))
    expect(list.events).toHaveLength(5)
    expect(list.eventCount).toBe(6)
    expect(priceDefinition.project(base({ state }), { full: true }).eventCount).toBe(6)
  })

  it('续期记录逐条保留：同一订单多次续期不会被合并', () => {
    const state: RenewTaskState = {
      account: { id: 'acc1', phone: '166****', title: '主号' },
      source: 'manual',
      config: { duration: 43200 },
      checkCount: 6,
      scannedCount: 3,
      renewedCount: 6,
      skippedCount: 0,
      finishedCount: 0,
      events: [
        { id: 'a1', type: 'renew.succeeded', at: 300, title: '已刷新支付有效期', tone: 'success', orderSn: 'SN1' },
        { id: 'a2', type: 'renew.succeeded', at: 240, title: '已刷新支付有效期', tone: 'success', orderSn: 'SN1' },
        { id: 'b1', type: 'renew.succeeded', at: 180, title: '已刷新支付有效期', tone: 'success', orderSn: 'SN2' },
        { id: 'b2', type: 'renew.succeeded', at: 120, title: '已刷新支付有效期', tone: 'success', orderSn: 'SN2' },
        { id: 'c1', type: 'renew.succeeded', at: 60, title: '已刷新支付有效期', tone: 'success', orderSn: 'SN3' },
        { id: 'c2', type: 'renew.succeeded', at: 30, title: '已刷新支付有效期', tone: 'success', orderSn: 'SN3' },
      ],
    }
    const summary = renewDefinition.project(base({ kind: 'renew', state }), { full: true })
    expect(summary.eventCount).toBe(6)
    expect(summary.events).toHaveLength(6)
    expect(summary.events.map(e => e.orderSn)).toEqual(['SN1', 'SN1', 'SN2', 'SN2', 'SN3', 'SN3'])
  })
})
