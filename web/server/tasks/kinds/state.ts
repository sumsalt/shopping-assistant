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

/**
 * 收藏夹通道的任务托管信息
 *
 * 仅作诊断展示：加收藏 / 删收藏 / 脏数据清理都由共享收藏夹引擎负责，
 * 任务本身不持有收藏夹账号，也不用这里的 collectId 做清理。
 */
export interface CollectionCustody {
  /** 商品货号（一手收藏按 goods_no 定位） */
  productNo: string
  /** 收藏条目 ID（创建时记录，便于排查） */
  collectId: string
}

/** 到货任务的落盘状态 */
export interface StockTaskState {
  product: ProductRef
  config: {
    interval: number
    duration: number
    /** 限定规格；为空表示全部规格 */
    skus?: string[]
    autoOrder?: AutoOrderPolicy
    /** 检测通道：normal=各自循环；collection=共享收藏夹循环 */
    channel?: 'normal' | 'collection'
  }
  /** 收藏夹通道的托管信息（仅 channel=collection 时有值） */
  collection?: CollectionCustody
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
    /** 检测通道：normal=各自循环；collection=共享收藏夹循环 */
    channel?: 'normal' | 'collection'
  }
  /** 收藏夹通道的托管信息（仅 channel=collection 时有值） */
  collection?: CollectionCustody
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
    /** 最近一轮的商品级库存状态（与价格同源），列表据此展示「有货/无货」 */
    inStock?: boolean
    /** 无货原因（缺货 / 已下架 / 已停售） */
    stockMessage?: string
    /** 重启后复用，避免把已有优惠券当成「新增」再提醒一次 */
    coupons?: Array<{ couponId: string; typeTitle: string; title: string }>
    couponsNew?: Array<{ couponId: string; threshold: number; reduce: number }>
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
    page?: number
    pageSize?: number
    sort?: number
    minPrice?: number
    maxPrice?: number
    minChangeCount?: number
    dailyResetEnabled?: boolean
    dailyResetHours?: number[]
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
  /** 已发「即将结束」提醒所对应的计时起点（createdAt 毫秒）；延长任务重置计时后会自动失效 */
  endingSoonNotifiedForCreatedAt?: number
  /** 上次尝试发提醒的时间（毫秒），用于发信失败后的节流重试 */
  endingSoonLastAttemptAt?: number
}
