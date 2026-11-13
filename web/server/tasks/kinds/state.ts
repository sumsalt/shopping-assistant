/**
 * 四类任务的业务状态（落盘结构 v2）
 *
 * 约束：
 * 1. 只放业务数据，不放凭证（凭证在 tasks.secret 列）；
 * 2. 所有字段都是 JSON 可序列化的；
 * 3. 历史兼容只在 migrate 阶段处理，运行期不再做 `?? []` 兜底；
 * 4. 事件列表是唯一的历史记录来源，列表/详情都从它投影。
 */

import type {
  AccountRef,
  AutoOrderPolicy,
  OrderBrief,
  ProductRef,
  TabRef,
  TaskEvent,
} from '@core/contract'

/** 到货任务的落盘状态 */
export interface StockTaskState {
  product: ProductRef
  config: {
    interval: number
    duration: number
    /** 限定规格；为空表示全部规格 */
    skus?: string[]
    autoOrder?: AutoOrderPolicy
  }
  result: {
    checkCount: number
    errorCount: number
    detected: boolean
    matchedSkus?: string[]
    matchedSkuLabel?: string
    skuWaiting?: boolean
    emailSent?: boolean
    error?: string
    order?: OrderBrief
    orderError?: string
    orderStage?: string
    orderUncertain?: boolean
    orderAttempts?: number
  }
  events: TaskEvent[]
  /** 自动续期钩子的一次性守卫 */
  autoRenewTriggered?: boolean
}

/** 价格任务的落盘状态 */
export interface PriceTaskState {
  product: ProductRef
  config: {
    interval: number
    duration?: number
    notifyOn: 'any' | 'drop' | 'rise'
    minPriceDelta: number
    autoOrder?: AutoOrderPolicy
  }
  checkCount: number
  detectedCount: number
  /** 最近一次快照，用于列表展示与重启基线 */
  snapshot?: {
    productId: string
    productName: string
    productNo?: string
    productImage?: string
    shopPrice: number
    checkedAt: number
  }
  order?: OrderBrief
  orderError?: string
  orderSkipped?: 'no_stock'
  lastError?: string
  events: TaskEvent[]
  autoRenewTriggered?: boolean
}

/** Tab 已见商品（与核心库 TabSeenProduct 对齐，独立声明避免 server 依赖核心实现） */
export interface TabSeenItem {
  productId: string
  productName: string
  productNo?: string
  shortName?: string
  price: number
  productImage?: string
  productUrl?: string
  supplyId?: string
  shopName?: string
  marketName?: string
  /** ISO 字符串 */
  firstSeenAt: string
}

/** Tab 任务的落盘状态 */
export interface TabTaskState {
  tab: TabRef
  config: {
    mode: 'accumulate' | 'diff'
    interval: number
    duration: number
    activeWindow?: { start: string; end: string }
    page?: number
    pageSize?: number
    sort?: number
    minPrice?: number
    maxPrice?: number
    minChangeCount?: number
    dailyResetEnabled?: boolean
    dailyResetHour?: number
  }
  checkCount: number
  detectedCount: number
  currentTotal: number
  lastDetectedAt?: number
  seenProductIds?: string[]
  seenProducts?: TabSeenItem[]
  events: TaskEvent[]
}

/** 续期任务的落盘状态 */
export interface RenewTaskState {
  account: AccountRef
  source: 'manual' | 'auto'
  sourceTaskId?: string
  config: {
    duration: number
  }
  checkCount: number
  scannedCount: number
  renewedCount: number
  skippedCount: number
  finishedCount: number
  lastError?: string
  lastScanAt?: number
  events: TaskEvent[]
}
