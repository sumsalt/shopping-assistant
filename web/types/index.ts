/**
 * 前端类型定义
 */

/** 一手请求通道 */
export type RequestChannel = 'wx' | 'app'

/**
 * 一次抓包的完整请求快照
 *
 * params 是公共参数（含 uid/token/udid/openid 等，不含 t_t/sign 与业务参数）；
 * headers 是关键请求头。发请求时以它们为基础，只覆盖动态 t_t / 签名。
 */
export interface RequestProfile {
  channel: RequestChannel
  params: Record<string, string>
  headers: Record<string, string>
  path?: string
}

/**
 * 用户配置
 *
 * 设备 / 登录信息已迁移到「账号管理」：这里只记当前选用的账号，
 * 并把该账号的完整请求快照缓存下来（与旧版 uid/token 明文存 localStorage 同一安全边界）。
 * 代理是全局网络设置，仍保留在这里。
 */
export interface UserConfig {
  /** 当前使用的账号 id；为空表示未选账号，走匿名默认参数 */
  activeAccountId?: string
  /** 当前账号摘要（仅用于界面展示，不参与发请求） */
  activeAccountPhone?: string
  activeAccountUin?: string
  activeAccountChannel?: RequestChannel | null
  /** 当前账号的完整请求快照（明文，选账号时从服务端取回缓存） */
  activeAccountProfile?: RequestProfile | null
  proxyUrl?: string
  proxyEnabled?: '1' | '0'
}

// API 响应基础类型
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

// 库存状态枚举
export enum StockStatus {
  Available = 'available',
  Unavailable = 'unavailable',
  Unknown = 'unknown',
}

// 商品信息类型
export interface ProductInfo {
  productNo: string
  name: string
  price: number
  imageUrl: string
  stockStatus: StockStatus
  stockMessage?: string
}

// SKU 信息类型
export interface SkuInfo {
  skuId: string
  productNo: string
  color: string
  size: string
  stock: number
  isAvailable: boolean
  limitQuantity?: number
}

// 商品详情（含 SKU 列表）
export interface ProductDetail {
  productNo: string
  name: string
  price: number
  imageUrl: string
  totalSales: number
  skus: SkuInfo[]
}

// 收藏夹商品
export interface CollectionItem {
  productNo: string
  name: string
  price: number
  imageUrl: string
  stockStatus: StockStatus
  addedTime?: string
}

// 收藏夹查询结果
export interface CollectionResult {
  items: CollectionItem[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

// 库存查询参数
export interface StockCheckParams {
  productNo: string
  config: UserConfig
}

// SKU 查询参数
export interface SkuQueryParams {
  productNo: string
  config: UserConfig
}

// 收藏夹查询参数
export interface CollectionQueryParams {
  page: number
  pageSize: number
  config: UserConfig
}

// 分页参数
export interface PaginationParams {
  page: number
  pageSize: number
}

// 配置验证结果
export interface ConfigValidation {
  isValid: boolean
  errors: Record<string, string>
}

// 加载状态
export interface LoadingState {
  isLoading: boolean
  error: string | null
}
