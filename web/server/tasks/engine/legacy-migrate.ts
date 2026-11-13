/**
 * v1 扁平 payload → v2 状态
 *
 * 只做纯数据转换，不碰数据库，便于单测与离线脚本复用。
 * 约束：幂等（同一份输入多次执行结果一致）、不抛错（坏字段降级为空）。
 */

import type { AdapterConfig, OrderBrief, TaskEvent, TaskKind } from '../../../../src/contract'

type Raw = Record<string, any>

export interface MigratedTask {
  state: unknown
  secret: AdapterConfig | null
  accountId: string
}

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback

const num = (value: unknown, fallback = 0): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const arr = <T = unknown>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

const event = (
  id: string,
  data: Omit<TaskEvent, 'id'> & { id?: string }
): TaskEvent => ({ ...data, id })

const pickSecret = (raw: Raw): AdapterConfig | null => {
  const config = raw?.config
  const candidate = config?.adapterConfig
  if (candidate && typeof candidate === 'object' && Object.keys(candidate).length > 0) {
    return candidate as AdapterConfig
  }
  return null
}

/** 价格：changes / couponChanges → 事件；order 单独保留在 state.order */
export const migratePrice = (raw: Raw): MigratedTask => {
  const changes = arr<Raw>(raw.changes)
  const couponChanges = arr<Raw>(raw.couponChanges)

  const events: TaskEvent[] = []

  changes.forEach((change, index) => {
    const direction = change.direction === 'down' ? 'down' : 'up'
    const previousPrice = num(change.previousPrice)
    const currentPrice = num(change.currentPrice)
    const delta = num(change.delta)
    const deltaPercent = num(change.deltaPercent)
    events.push(
      event(`evt_mig_price_${raw.id}_${index}`, {
        type: 'price.changed',
        at: num(change.detectedAt, num(raw.createdAt ? Date.parse(raw.createdAt) : Date.now())),
        title: `${direction === 'down' ? '降价' : '涨价'} ¥${previousPrice.toFixed(2)} → ¥${currentPrice.toFixed(2)}`,
        detail: `${delta > 0 ? '+' : ''}${delta.toFixed(2)}（${deltaPercent > 0 ? '+' : ''}${deltaPercent.toFixed(2)}%）`,
        tone: direction === 'down' ? 'down' : 'up',
        emailSent: Boolean(change.emailSent),
        previousPrice,
        currentPrice,
        delta,
        deltaPercent,
        direction,
      })
    )
  })

  couponChanges.forEach((change, index) => {
    const added = arr<{ kind: string; label: string }>(change.added)
    const removed = arr<{ kind: string; label: string }>(change.removed)
    const parts: string[] = []
    if (added.length) parts.push(`新增 ${added.map(item => item.label).join('、')}`)
    if (removed.length) parts.push(`失效 ${removed.map(item => item.label).join('、')}`)
    events.push(
      event(`evt_mig_coupon_${raw.id}_${index}`, {
        type: 'coupon.changed',
        at: num(change.detectedAt, Date.now()),
        title: '优惠券变化',
        detail: parts.join('；'),
        tone: 'info',
        emailSent: Boolean(change.emailSent),
        added,
        removed,
      })
    )
  })

  events.sort((a, b) => b.at - a.at)

  return {
    state: {
      product: {
        productId: str(raw.product?.productId),
        ...(raw.product?.productName ? { productName: String(raw.product.productName) } : {}),
        ...(raw.product?.productImage ? { productImage: String(raw.product.productImage) } : {}),
        ...(raw.product?.productNo ? { productNo: String(raw.product.productNo) } : {}),
      },
      config: {
        interval: num(raw.config?.interval, 60),
        ...(raw.config?.duration !== undefined ? { duration: num(raw.config.duration) } : {}),
        notifyOn:
          raw.config?.notifyOn === 'drop' || raw.config?.notifyOn === 'rise'
            ? raw.config.notifyOn
            : 'any',
        minPriceDelta: num(raw.config?.minPriceDelta, 0.01),
        ...(raw.config?.autoOrder?.enabled
          ? { autoOrder: { ...raw.config.autoOrder } }
          : {}),
      },
      checkCount: num(raw.checkCount),
      detectedCount: num(raw.detectedCount),
      ...(raw.snapshot
        ? {
            snapshot: {
              productId: str(raw.snapshot.productId, str(raw.product?.productId)),
              productName: str(raw.snapshot.productName, str(raw.product?.productName)),
              ...(raw.product?.productNo || raw.snapshot.productNo
                ? { productNo: str(raw.snapshot.productNo, str(raw.product?.productNo)) }
                : {}),
              ...(raw.product?.productImage
                ? { productImage: String(raw.product.productImage) }
                : {}),
              shopPrice: num(raw.snapshot.shopPrice),
              checkedAt: num(raw.snapshot.checkedAt),
              ...(Array.isArray(raw.snapshot.coupons) ? { coupons: raw.snapshot.coupons } : {}),
              ...(Array.isArray(raw.snapshot.couponsNew)
                ? { couponsNew: raw.snapshot.couponsNew }
                : {}),
            },
          }
        : {}),
      ...(raw.order ? { order: raw.order as OrderBrief } : {}),
      ...(raw.orderError ? { orderError: String(raw.orderError) } : {}),
      ...(raw.orderSkipped ? { orderSkipped: 'no_stock' as const } : {}),
      ...(raw.lastError ? { lastError: String(raw.lastError) } : {}),
      events,
      ...(raw.autoRenewTriggered ? { autoRenewTriggered: true } : {}),
    },
    secret: pickSecret(raw),
    accountId: str(raw.accountId),
  }
}

/** 到货：result 原样保留；order 提成 OrderBrief */
export const migrateStock = (raw: Raw): MigratedTask => {
  const result = raw.result ?? {}
  const order: OrderBrief | undefined = result.orderSn
    ? {
        orderSn: String(result.orderSn),
        ...(result.orderAmount !== undefined ? { amount: num(result.orderAmount) } : {}),
        ...(result.orderNum !== undefined ? { num: num(result.orderNum) } : {}),
        ...(result.orderSkuLabel ? { skuLabel: String(result.orderSkuLabel) } : {}),
        ...(Array.isArray(result.orderItems) ? { items: result.orderItems } : {}),
        ...(result.orderExpireAt !== undefined ? { expireAt: num(result.orderExpireAt) } : {}),
      }
    : undefined

  return {
    state: {
      product: {
        productId: str(raw.product?.productId),
        ...(raw.product?.productName ? { productName: String(raw.product.productName) } : {}),
        ...(raw.product?.productImage ? { productImage: String(raw.product.productImage) } : {}),
        ...(raw.product?.productNo ? { productNo: String(raw.product.productNo) } : {}),
      },
      config: {
        interval: num(raw.config?.interval, 30),
        duration: num(raw.config?.duration, 3 * 60 * 60),
        ...(arr<string>(raw.config?.skus).length ? { skus: arr<string>(raw.config.skus) } : {}),
        ...(raw.config?.autoOrder?.enabled
          ? { autoOrder: { ...raw.config.autoOrder } }
          : {}),
      },
      result: {
        checkCount: num(result.checkCount),
        errorCount: num(result.errorCount),
        detected: Boolean(result.detected),
        ...(result.matchedSkus ? { matchedSkus: arr<string>(result.matchedSkus) } : {}),
        ...(result.matchedSkuLabel ? { matchedSkuLabel: String(result.matchedSkuLabel) } : {}),
        ...(result.skuWaiting ? { skuWaiting: true } : {}),
        ...(result.emailSent !== undefined ? { emailSent: Boolean(result.emailSent) } : {}),
        ...(result.error ? { error: String(result.error) } : {}),
        ...(order ? { order } : {}),
        ...(result.orderError ? { orderError: String(result.orderError) } : {}),
        ...(result.orderStage ? { orderStage: String(result.orderStage) } : {}),
        ...(result.orderUncertain ? { orderUncertain: true } : {}),
        ...(result.orderAttempts !== undefined
          ? { orderAttempts: num(result.orderAttempts) }
          : {}),
      },
      events: [],
      ...(raw.autoRenewTriggered ? { autoRenewTriggered: true } : {}),
    },
    secret: pickSecret(raw),
    accountId: str(raw.accountId),
  }
}

/** Tab：已见集合保留；只存过 ID 的老任务补一条空详情 */
export const migrateTab = (raw: Raw): MigratedTask => {
  const seenIds = arr<string>(raw.seenProductIds)
  let seenProducts = arr<Raw>(raw.seenProducts)
  if (seenProducts.length === 0 && seenIds.length > 0) {
    const firstSeenAt = str(raw.createdAt, new Date().toISOString())
    seenProducts = seenIds.map(productId => ({
      productId,
      productName: '',
      price: 0,
      firstSeenAt,
    }))
  }

  const config = raw.config ?? {}
  return {
    state: {
      tab: {
        id: str(raw.tabId, str(config.tabId)),
        name: str(raw.tabName),
      },
      config: {
        mode: config.mode === 'diff' ? 'diff' : 'accumulate',
        interval: num(config.interval, 300),
        duration: num(config.duration, 3 * 60 * 60),
        ...(config.activeWindow ? { activeWindow: config.activeWindow } : {}),
        ...(config.page !== undefined ? { page: num(config.page) } : {}),
        ...(config.pageSize !== undefined ? { pageSize: num(config.pageSize) } : {}),
        ...(config.sort !== undefined ? { sort: num(config.sort) } : {}),
        ...(config.minPrice !== undefined ? { minPrice: num(config.minPrice) } : {}),
        ...(config.maxPrice !== undefined ? { maxPrice: num(config.maxPrice) } : {}),
        ...(config.minChangeCount !== undefined
          ? { minChangeCount: num(config.minChangeCount) }
          : {}),
        ...(config.dailyResetEnabled !== undefined
          ? { dailyResetEnabled: Boolean(config.dailyResetEnabled) }
          : {}),
        ...(config.dailyResetHour !== undefined
          ? { dailyResetHour: num(config.dailyResetHour) }
          : {}),
      },
      checkCount: num(raw.checkCount),
      detectedCount: num(raw.detectedCount),
      currentTotal: num(raw.currentTotal),
      ...(raw.lastDetectedAt ? { lastDetectedAt: Date.parse(raw.lastDetectedAt) || undefined } : {}),
      seenProductIds: seenIds,
      seenProducts,
      events: [],
    },
    secret: pickSecret(raw),
    accountId: '',
  }
}

/** 续期：recentRenewals → renew.succeeded / renew.finished 事件 */
export const migrateRenew = (raw: Raw): MigratedTask => {
  const renewals = arr<Raw>(raw.recentRenewals)
  const events: TaskEvent[] = renewals.map((item, index) => {
    const finished = Boolean(item.finishedReason)
    return event(`evt_mig_renew_${raw.id}_${index}`, {
      type: finished ? 'renew.finished' : 'renew.succeeded',
      at: num(item.renewedAt),
      title: finished ? '订单已结束' : '已刷新支付有效期',
      detail: finished
        ? String(item.finishedReason)
        : [
            item.remainingBefore !== undefined ? `剩 ${Math.floor(num(item.remainingBefore) / 60)} 分钟时续期` : '',
            item.expireAfter !== undefined ? `截止 ${new Date(num(item.expireAfter)).toLocaleString('zh-CN')}` : '',
            item.verified === false ? '有效期未确认后移' : '',
          ]
            .filter(Boolean)
            .join(' · '),
      tone: finished ? 'neutral' : item.verified === false ? 'warning' : 'success',
      orderSn: str(item.orderSn),
      ...(item.orderAmount !== undefined ? { amount: num(item.orderAmount) } : {}),
      ...(item.remainingBefore !== undefined
        ? { remainingBefore: num(item.remainingBefore) }
        : {}),
      ...(item.expireAfter !== undefined ? { expireAfter: num(item.expireAfter) } : {}),
      ...(item.verified !== undefined ? { verified: Boolean(item.verified) } : {}),
    })
  })

  return {
    state: {
      account: {
        id: str(raw.accountId),
        phone: str(raw.accountPhone),
        title: str(raw.accountTitle),
      },
      source: raw.source === 'auto' ? 'auto' : 'manual',
      ...(raw.sourceTaskId ? { sourceTaskId: String(raw.sourceTaskId) } : {}),
      config: { duration: num(raw.config?.duration, 12 * 60 * 60) },
      checkCount: num(raw.checkCount),
      scannedCount: num(raw.scannedCount),
      renewedCount: num(raw.renewedCount),
      skippedCount: num(raw.skippedCount),
      finishedCount: num(raw.finishedCount),
      ...(raw.lastError ? { lastError: String(raw.lastError) } : {}),
      ...(raw.lastScanAt !== undefined ? { lastScanAt: num(raw.lastScanAt) } : {}),
      events,
    },
    secret: pickSecret(raw),
    accountId: str(raw.accountId),
  }
}

/** 按 kind 分发 */
export const migrateLegacyRecord = (kind: TaskKind, raw: Raw): MigratedTask => {
  if (kind === 'price') return migratePrice(raw)
  if (kind === 'stock') return migrateStock(raw)
  if (kind === 'tab') return migrateTab(raw)
  return migrateRenew(raw)
}
