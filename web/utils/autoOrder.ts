/**
 * 自动下单弹窗共用类型与工具
 *
 * 到货监控、价格监控两个弹窗都要读取地址 / 规格、做下单预检，
 * 这些与具体任务无关的定义集中放这里，避免两边各维护一份。
 */

export interface AddressItem {
  addressId: string
  consignee: string
  mobile: string
  area: string
  address: string
  province: string
  city: string
  district: string
}

export interface SkuOption {
  skuId: string
  label: string
  saleStock: number
}

export interface PrecheckResult {
  success: boolean
  message?: string
  skuLabel?: string
  items?: Array<{ sku: string; skuLabel: string; num: number }>
  num?: number
  requestedNum?: number
  numReduced?: boolean
  goodsAmount?: number
  shippingFee?: number
  stage?: string
}

/** UiSwitch 的 modelValue 可能是布尔或字符串，统一转成布尔 */
export const toBoolean = (value: boolean | '1' | '0'): boolean =>
  value === true || value === '1'

const stageLabels: Record<string, string> = {
  address: '收货地址',
  sku: '查询规格',
  cart: '加入购物车',
  confirm: '结算确认',
  create: '创建订单',
}

export const stageText = (stage: string): string => stageLabels[stage] || stage

export const maskMobile = (mobile: string): string =>
  mobile ? mobile.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : ''
