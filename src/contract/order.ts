/**
 * 订单相关的共享契约
 */

/** 自动下单的展示配置（只读投影，不含任何凭证） */
export interface AutoOrderView {
  enabled: boolean
  /** 购买件数 */
  num?: number
  /** 支付方式：1 支付宝 / 4 微信 */
  payTool?: string
  addressId?: string
  /** 触发方式（价格任务）：按目标价或按折扣 */
  trigger?: 'price' | 'discount'
  targetPrice?: number
  targetDiscount?: number
  /** 指定规格（为空表示全部） */
  skus?: string[]
}

/**
 * 自动下单策略（落盘的用户配置）
 *
 * 与 AutoOrderView 的区别：这是创建时保存的原始策略，字段名与核心库一致；
 * 展示时由 project 转成 AutoOrderView。
 */
export interface AutoOrderPolicy {
  enabled: boolean
  num?: number
  addressId?: string
  payTool?: '1' | '4'
  /** 指定 SKU（旧字段，兼容用） */
  sku?: string
  /** 价格任务：触发方式 */
  triggerMode?: 'price' | 'discount'
  targetPrice?: number
  targetDiscount?: number
  /** 指定规格（多选） */
  skus?: string[]
}

/** 订单摘要（下单成功后展示） */
export interface OrderBrief {
  orderSn: string
  amount?: number
  /** 总件数 */
  num?: number
  /** 规格文案（单规格时使用） */
  skuLabel?: string
  /** 多规格合单明细 */
  items?: Array<{ sku: string; skuLabel: string; num: number }>
  /** 支付截止时间（毫秒时间戳） */
  expireAt?: number
  /** 下单时间（毫秒时间戳） */
  placedAt?: number
}

/** 自动下单预检结果（创建任务前试跑一次链路） */
export interface PrecheckView {
  success: boolean
  stage?: string
  message?: string
  skuLabel?: string
  num?: number
  requestedNum?: number
  numReduced?: boolean
  goodsAmount?: number
  shippingFee?: number
  items?: Array<{ sku: string; skuLabel: string; num: number }>
}
