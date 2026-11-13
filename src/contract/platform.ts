/**
 * 平台与账号的共享契约
 *
 * 这一层只有「类型与常量」，不依赖任何运行时（node / vue / nitro 都不能 import）。
 * core、server、web 三端共用同一份定义，避免前端手抄 DTO。
 */

/** 支持的商品平台（当前只有一手） */
export type Platform = 'yishou' | 'jd' | 'pdd'

/** 平台请求配置（由账号抓包快照解析而来，含登录态时属于敏感数据） */
export interface AdapterConfig {
  uid?: string
  token?: string
  timestamp?: number
  sign?: string
  openid?: string
  model?: string
  version?: string
  version_name?: string
  wx_version_name?: string
  plat_type?: string
  /** 抓包公共参数快照（含 uid/token/udid 等），发请求时作为基底 */
  requestParams?: Record<string, string>
  /** 抓包关键请求头 */
  requestHeaders?: Record<string, string>
  /** 抓包通道：决定 UA、t_t 单位与签名首段 */
  channel?: 'wx' | 'app'
  proxyUrl?: string
  proxyEnabled?: '1' | '0'
}

/** 商品引用：任务的目标，创建时落库，之后原样透传 */
export interface ProductRef {
  productId: string
  productName?: string
  productImage?: string
  /** 商品货号：存在时可跳转站内商品详情页 */
  productNo?: string
}

/** 账号引用（任务绑定账号时展示用） */
export interface AccountRef {
  id: string
  phone: string
  title: string
}

/** Tab 引用 */
export interface TabRef {
  id: string
  name: string
}

/** 任务目标：商品 / Tab / 账号，三选一 */
export interface TaskTarget {
  type: 'product' | 'tab' | 'account'
  id: string
  name: string
  image?: string
  /** 商品货号，仅商品目标有值；有值才允许跳详情 */
  productNo?: string
  /** 副标题：商品 ID / Tab ID / 账号手机号 */
  subtitle?: string
}
